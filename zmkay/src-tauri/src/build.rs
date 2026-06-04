// Local ZMK firmware build, no Docker. The app owns a private toolchain under
// the OS data dir (~/Library/Application Support/zmkay on macOS): a Python venv
// with west+cmake+ninja, a west workspace (zmk + zephyr + modules pinned to the
// repo's config/west.yml), and the Zephyr SDK (arm-zephyr-eabi + host tools).
//
// bootstrap_toolchain() provisions all of that once (first run, ~2-3 GB). After
// that build_firmware() runs `west build` for both Corne halves into a tmp dir
// and returns the two .uf2 paths for the guided USB flash (see flash.rs).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

// ── toolchain versions (proven against zmk v0.3 / Zephyr 3.5) ────────────────
// SDK_VERSION is confirmed empirically from zephyr/SDK_VERSION after west update.
const SDK_VERSION: &str = "0.16.8";

// The west manifest for the app workspace — identical to the repo's
// config/west.yml so the workspace tracks the same pinned zmk + zephyr.
const WORKSPACE_MANIFEST: &str = "manifest:\n  remotes:\n    - name: zmkfirmware\n      url-base: https://github.com/zmkfirmware\n  projects:\n    - name: zmk\n      remote: zmkfirmware\n      revision: v0.3\n      import: app/west.yml\n  self:\n    path: config\n";

// ── layout of the app-owned toolchain ────────────────────────────────────────
// IMPORTANT: this path must contain NO spaces. Zephyr's devicetree preprocessor
// passes the workspace path to gcc as `-I`, and a space splits it into two bad
// include dirs (the macOS "Library/Application Support" default breaks the
// build). So we use ~/.zmkay on Unix and %LOCALAPPDATA%\zmkay on Windows.
fn toolchain_root() -> PathBuf {
    if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("APPDATA"))
            .map(PathBuf::from)
            .unwrap_or_else(home)
            .join("zmkay")
    } else {
        home().join(".zmkay")
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn venv_bin() -> PathBuf {
    let bin = if cfg!(target_os = "windows") { "Scripts" } else { "bin" };
    toolchain_root().join("venv").join(bin)
}

fn west_bin() -> PathBuf {
    let exe = if cfg!(target_os = "windows") { "west.exe" } else { "west" };
    venv_bin().join(exe)
}

fn workspace_dir() -> PathBuf {
    toolchain_root().join("workspace")
}

fn sdk_dir() -> PathBuf {
    toolchain_root()
        .join("toolchain")
        .join(format!("zephyr-sdk-{SDK_VERSION}"))
}

// ── status ───────────────────────────────────────────────────────────────────
#[derive(serde::Serialize)]
pub struct ToolchainStatus {
    pub provisioned: bool,
    pub root: String,
    pub west: bool,
    pub workspace: bool,
    pub sdk: bool,
}

#[tauri::command]
pub fn toolchain_status() -> ToolchainStatus {
    let west = west_bin().exists();
    let workspace = workspace_dir().join("zmk").join("app").exists();
    let sdk = sdk_dir().exists();
    ToolchainStatus {
        provisioned: west && workspace && sdk,
        root: toolchain_root().display().to_string(),
        west,
        workspace,
        sdk,
    }
}

// ── helpers: run a command, streaming its output to the UI ───────────────────
fn status(app: &AppHandle, msg: &str) {
    let _ = app.emit("build://status", msg);
}

fn logline(app: &AppHandle, line: &str) {
    let _ = app.emit("build://log", line);
}

// Build the PATH the toolchain commands need: venv bin (west/cmake/ninja) and
// the SDK host tools, ahead of the inherited PATH.
fn tool_path() -> std::ffi::OsString {
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let mut parts = vec![venv_bin().display().to_string()];
    let hosttools = sdk_dir().join("hosttools");
    if hosttools.exists() {
        parts.push(hosttools.display().to_string());
    }
    if let Some(existing) = std::env::var_os("PATH") {
        parts.push(existing.to_string_lossy().to_string());
    }
    std::ffi::OsString::from(parts.join(sep))
}

fn run_step(
    app: &AppHandle,
    cwd: &Path,
    program: &Path,
    args: &[&str],
    extra_env: &[(&str, String)],
) -> Result<(), String> {
    run_step_tagged(app, cwd, program, args, extra_env, "", None)
}

// Run a command, streaming stdout+stderr lines as build://log (and into the
// active run record when `ctx` is set). `tag` prefixes each line ("left"/"right")
// so parallel builds stay readable. With `ctx`, the child is put in its own
// process group and registered so a cancel can SIGKILL the whole west/cmake/ninja
// tree, not just the west wrapper.
fn run_step_tagged(
    app: &AppHandle,
    cwd: &Path,
    program: &Path,
    args: &[&str],
    extra_env: &[(&str, String)],
    tag: &str,
    ctx: Option<&BuildCtx>,
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};

    let prefix = if tag.is_empty() { String::new() } else { format!("[{tag}] ") };
    let emit = |line: &str| {
        logline(app, &format!("{prefix}{line}"));
        if let Some(c) = ctx {
            c.manager.push_log(c.id, tag, line);
        }
    };

    emit(&format!("$ {} {}", program.display(), args.join(" ")));
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(cwd)
        .env("PATH", tool_path())
        .env("ZEPHYR_SDK_INSTALL_DIR", sdk_dir())
        .env("ZEPHYR_TOOLCHAIN_VARIANT", "zephyr")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    #[cfg(unix)]
    if ctx.is_some() {
        // New process group (pgid == child pid) so cancel can kill the group.
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to start {}: {e}", program.display()))?;
    if let Some(c) = ctx {
        c.manager.register_pid(c.id, child.id());
    }

    let mut tail: Vec<String> = Vec::new();
    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            emit(&line);
            push_tail(&mut tail, line);
        }
    }
    if let Some(err) = child.stderr.take() {
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            emit(&line);
            push_tail(&mut tail, line);
        }
    }

    let st = child.wait().map_err(|e| e.to_string())?;
    if st.success() {
        Ok(())
    } else {
        Err(format!(
            "{} exited with {}\n{}",
            program.display(),
            st.code().unwrap_or(-1),
            tail.join("\n")
        ))
    }
}

fn push_tail(tail: &mut Vec<String>, line: String) {
    tail.push(line);
    if tail.len() > 30 {
        tail.remove(0);
    }
}

// ── bootstrap ─────────────────────────────────────────────────────────────────
#[tauri::command]
pub async fn bootstrap_toolchain(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || bootstrap_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn bootstrap_blocking(app: &AppHandle) -> Result<String, String> {
    let root = toolchain_root();
    let ws = workspace_dir();
    std::fs::create_dir_all(ws.join("config")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("toolchain")).map_err(|e| e.to_string())?;
    std::fs::write(ws.join("config").join("west.yml"), WORKSPACE_MANIFEST)
        .map_err(|e| e.to_string())?;

    let python = python3();

    if !venv_bin().join("west").exists() && !west_bin().exists() {
        status(app, "Creating Python environment…");
        run_step(app, &root, &python, &["-m", "venv", "venv"], &[])?;
        status(app, "Installing west, cmake, ninja…");
        let pip = venv_bin().join(if cfg!(windows) { "pip.exe" } else { "pip" });
        run_step(app, &root, &pip, &["install", "--upgrade", "pip"], &[])?;
        // cmake<4: CMake 4 dropped support for `cmake_minimum_required` < 3.5,
        // which several Zephyr 3.5 modules still declare, breaking the build.
        run_step(app, &root, &pip, &["install", "west", "cmake<4", "ninja"], &[])?;
    }

    if !ws.join("zmk").join("app").exists() {
        status(app, "Initializing west workspace…");
        if !ws.join(".west").exists() {
            run_step(app, &ws, &west_bin(), &["init", "-l", "config"], &[])?;
        }
        status(app, "Cloning ZMK + Zephyr (this is the big one, a few GB)…");
        run_step(app, &ws, &west_bin(), &["update"], &[])?;
        run_step(app, &ws, &west_bin(), &["zephyr-export"], &[])?;
        status(app, "Installing Zephyr Python requirements…");
        let pip = venv_bin().join(if cfg!(windows) { "pip.exe" } else { "pip" });
        let reqs = ws.join("zephyr/scripts/requirements.txt");
        if reqs.exists() {
            run_step(app, &ws, &pip, &["install", "-r", &reqs.display().to_string()], &[])?;
        }
        // nanopb's protoc generator (pulled in by the Studio snippet) imports the
        // legacy pkg_resources, which setuptools 81+ dropped — pin it back.
        run_step(app, &ws, &pip, &["install", "setuptools<81"], &[])?;
    }

    if !sdk_dir().exists() {
        install_sdk(app)?;
    }

    status(app, "Toolchain ready.");
    Ok("Toolchain provisioned.".to_string())
}

fn python3() -> PathBuf {
    // Prefer an explicit python3; fall back to PATH lookup.
    for cand in ["/opt/homebrew/bin/python3", "/usr/bin/python3", "/usr/local/bin/python3"] {
        if Path::new(cand).exists() {
            return PathBuf::from(cand);
        }
    }
    PathBuf::from(if cfg!(windows) { "python" } else { "python3" })
}

// Download + install the Zephyr SDK (arm-zephyr-eabi toolchain + host tools).
// Shells out to curl + tar so we avoid a heavy HTTP/decompress Rust dependency.
fn install_sdk(app: &AppHandle) -> Result<(), String> {
    let tc = toolchain_root().join("toolchain");
    let (os, arch) = sdk_platform();
    let bundle = format!("zephyr-sdk-{SDK_VERSION}_{os}-{arch}_minimal.tar.xz");
    let url = format!(
        "https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v{SDK_VERSION}/{bundle}"
    );
    let archive = tc.join(&bundle);

    status(app, "Downloading Zephyr SDK (~1 GB)…");
    run_step(
        app,
        &tc,
        Path::new("curl"),
        &["-L", "--fail", "-o", &archive.display().to_string(), &url],
        &[],
    )?;

    status(app, "Extracting SDK…");
    run_step(
        app,
        &tc,
        Path::new("tar"),
        &["xf", &archive.display().to_string()],
        &[],
    )?;
    let _ = std::fs::remove_file(&archive);

    status(app, "Installing arm-zephyr-eabi toolchain + host tools…");
    let setup = sdk_dir().join("setup.sh");
    run_step(
        app,
        &sdk_dir(),
        Path::new("sh"),
        &[&setup.display().to_string(), "-t", "arm-zephyr-eabi", "-h", "-c"],
        &[],
    )?;
    Ok(())
}

fn sdk_platform() -> (&'static str, &'static str) {
    let os = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
    (os, arch)
}

// ── build manager: cancelable, parallel builds + a run history ───────────────
// How many recent build runs to keep (with their logs). Bump freely.
const HISTORY_CAP: usize = 10;

// A build run as the UI sees it: status + per-half logs (for debugging) + the
// produced .uf2 paths. Clonable so build_history() can hand back a snapshot.
#[derive(Clone, serde::Serialize)]
pub struct RunRecord {
    pub id: u64,
    pub started_ms: u64,
    pub status: String, // "building" | "success" | "error" | "canceled"
    pub left_log: Vec<String>,
    pub right_log: Vec<String>,
    pub left_uf2: Option<String>,
    pub right_uf2: Option<String>,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct BuildManager {
    gen: AtomicU64,
    state: Mutex<ManagerState>,
}

#[derive(Default)]
struct ManagerState {
    current: Option<ActiveBuild>,
    history: VecDeque<RunRecord>, // newest at front, capped at HISTORY_CAP
}

struct ActiveBuild {
    id: u64,
    pids: Vec<u32>, // group-leader pids of the in-flight west processes
}

// Passed down to run_step_tagged so each child registers its pid (for cancel)
// and its output lands in the run record.
struct BuildCtx {
    manager: Arc<BuildManager>,
    app: AppHandle,
    id: u64,
}

#[derive(serde::Serialize)]
pub struct BuildResult {
    pub left: String,
    pub right: String,
}

#[derive(Clone, serde::Serialize)]
struct RunEvent {
    id: u64,
    status: String,
}

impl BuildManager {
    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    // Start a new run: cancel any in-flight build, push a fresh "building" record
    // to the front of the history, and return the new run id.
    fn begin(&self) -> u64 {
        let id = self.gen.fetch_add(1, Ordering::SeqCst) + 1;
        let mut st = self.state.lock().unwrap();
        if let Some(active) = st.current.take() {
            kill_pids(&active.pids);
            mark(&mut st.history, active.id, "canceled");
        }
        st.current = Some(ActiveBuild { id, pids: Vec::new() });
        st.history.push_front(RunRecord {
            id,
            started_ms: Self::now_ms(),
            status: "building".into(),
            left_log: Vec::new(),
            right_log: Vec::new(),
            left_uf2: None,
            right_uf2: None,
            error: None,
        });
        while st.history.len() > HISTORY_CAP {
            st.history.pop_back();
        }
        id
    }

    fn is_current(&self, id: u64) -> bool {
        self.state.lock().unwrap().current.as_ref().is_some_and(|a| a.id == id)
    }

    fn register_pid(&self, id: u64, pid: u32) {
        let mut st = self.state.lock().unwrap();
        if let Some(a) = st.current.as_mut() {
            if a.id == id {
                a.pids.push(pid);
            }
        }
    }

    fn push_log(&self, id: u64, tag: &str, line: &str) {
        let mut st = self.state.lock().unwrap();
        if let Some(rec) = st.history.iter_mut().find(|r| r.id == id) {
            let log = if tag == "right" { &mut rec.right_log } else { &mut rec.left_log };
            log.push(line.to_string());
            if log.len() > 5000 {
                let drop = log.len() - 5000;
                log.drain(0..drop);
            }
        }
    }

    // Finalize a run, but only if it's still the current one (a newer build may
    // have superseded it, in which case its record was already marked canceled).
    fn finish(&self, id: u64, result: &Result<(String, String), String>) {
        let mut st = self.state.lock().unwrap();
        if !st.current.as_ref().is_some_and(|a| a.id == id) {
            return;
        }
        st.current = None;
        if let Some(rec) = st.history.iter_mut().find(|r| r.id == id) {
            match result {
                Ok((left, right)) => {
                    rec.status = "success".into();
                    rec.left_uf2 = Some(left.clone());
                    rec.right_uf2 = Some(right.clone());
                }
                Err(e) => {
                    rec.status = "error".into();
                    rec.error = Some(e.clone());
                }
            }
        }
    }

    fn cancel(&self) {
        let mut st = self.state.lock().unwrap();
        if let Some(active) = st.current.take() {
            kill_pids(&active.pids);
            mark(&mut st.history, active.id, "canceled");
        }
    }

    fn history(&self) -> Vec<RunRecord> {
        self.state.lock().unwrap().history.iter().cloned().collect()
    }
}

fn mark(history: &mut VecDeque<RunRecord>, id: u64, status: &str) {
    if let Some(rec) = history.iter_mut().find(|r| r.id == id) {
        if rec.status == "building" {
            rec.status = status.into();
        }
    }
}

#[cfg(unix)]
fn kill_pids(pids: &[u32]) {
    for &pid in pids {
        // Negative pid → signal the whole process group (we spawned each west in
        // its own group), taking cmake/ninja/compilers down with it.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
}
#[cfg(not(unix))]
fn kill_pids(_pids: &[u32]) {}

// ── build orchestration ──────────────────────────────────────────────────────
// Kick off a managed build of both halves; emits build://run on start/finish.
// Cancels any in-flight build first (begin()). Returns the new run id.
fn trigger_build(app: &AppHandle, manager: &Arc<BuildManager>, config_dir: &str) -> u64 {
    let id = manager.begin();
    let _ = app.emit("build://run", RunEvent { id, status: "building".into() });
    let app = app.clone();
    let manager = manager.clone();
    let config_dir = config_dir.to_string();
    std::thread::spawn(move || {
        let res = managed_build(&manager, &app, id, &config_dir);
        let still = manager.is_current(id);
        let status = if res.is_ok() { "success" } else { "error" };
        manager.finish(id, &res);
        if still {
            let _ = app.emit("build://run", RunEvent { id, status: status.into() });
        }
    });
    id
}

#[tauri::command]
pub fn start_build(
    app: AppHandle,
    manager: State<Arc<BuildManager>>,
    config_dir: String,
) -> u64 {
    trigger_build(&app, manager.inner(), &config_dir)
}

#[tauri::command]
pub fn cancel_build(app: AppHandle, manager: State<Arc<BuildManager>>) {
    manager.cancel();
    let _ = app.emit("build://run", RunEvent { id: 0, status: "canceled".into() });
}

#[tauri::command]
pub fn build_history(manager: State<Arc<BuildManager>>) -> Vec<RunRecord> {
    manager.history()
}

// Kept for the existing flash dialog: run a build and await its .uf2 paths. Goes
// through the same manager (so it supersedes any auto-build in flight).
#[tauri::command]
pub async fn build_firmware(
    app: AppHandle,
    manager: State<'_, Arc<BuildManager>>,
    config_dir: String,
) -> Result<BuildResult, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let id = manager.begin();
        let _ = app.emit("build://run", RunEvent { id, status: "building".into() });
        let res = managed_build(&manager, &app, id, &config_dir);
        let still = manager.is_current(id);
        manager.finish(id, &res);
        if still {
            let status = if res.is_ok() { "success" } else { "error" };
            let _ = app.emit("build://run", RunEvent { id, status: status.into() });
        }
        res.map(|(left, right)| BuildResult { left, right })
    })
    .await
    .map_err(|e| e.to_string())?
}

// Build both halves into the workspace build dir. Mirrors build.yaml plus the
// usb-dfu-reset module/snippet on both halves; studio-rpc-usb-uart on the left.
fn managed_build(
    manager: &Arc<BuildManager>,
    app: &AppHandle,
    id: u64,
    config_dir: &str,
) -> Result<(String, String), String> {
    if !toolchain_status().provisioned {
        return Err("Toolchain not provisioned — run setup first.".to_string());
    }
    let config = PathBuf::from(config_dir);
    if !config.join("corne.keymap").exists() {
        return Err(format!("No corne.keymap under {config_dir}"));
    }

    let ws = workspace_dir();
    let out = ws.join("build");
    let src = ws.join("zmk").join("app");
    let zmk_config = format!("-DZMK_CONFIG={}", config.display());
    let left_dir = out.join("left");
    let right_dir = out.join("right");
    let ctx = BuildCtx { manager: manager.clone(), app: app.clone(), id };

    // Scoped threads so both halves share &ctx (it's Send+Sync). Each west build
    // already fans out across cores; running both overlaps their config phases.
    let (left_res, right_res) = std::thread::scope(|s| {
        let l = s.spawn(|| {
            build_half(&ctx, &ws, &src, &left_dir, "corne_left nice_view_adapter nice_view",
                       &["studio-rpc-usb-uart", "usb-dfu-reset"], &zmk_config, "left", "zmkay Corne Left")
        });
        let r = s.spawn(|| {
            build_half(&ctx, &ws, &src, &right_dir, "corne_right nice_view_adapter nice_view",
                       &["usb-dfu-reset"], &zmk_config, "right", "zmkay Corne Right")
        });
        (l.join(), r.join())
    });
    let left_res = left_res.map_err(|_| "left build thread panicked".to_string())?;
    let right_res = right_res.map_err(|_| "right build thread panicked".to_string())?;
    match (left_res, right_res) {
        (Ok(()), Ok(())) => {}
        (Err(l), Err(r)) => return Err(format!("left: {l}\nright: {r}")),
        (Err(l), _) => return Err(format!("left: {l}")),
        (_, Err(r)) => return Err(format!("right: {r}")),
    }

    let left = left_dir.join("zephyr/zmk.uf2");
    let right = right_dir.join("zephyr/zmk.uf2");
    if !left.exists() || !right.exists() {
        return Err("Build finished but a .uf2 is missing.".to_string());
    }
    Ok((left.display().to_string(), right.display().to_string()))
}

#[allow(clippy::too_many_arguments)]
fn build_half(
    ctx: &BuildCtx,
    ws: &Path,
    src: &Path,
    build_dir: &Path,
    shield: &str,
    snippets: &[&str],
    zmk_config: &str,
    tag: &str,
    usb_product: &str,
) -> Result<(), String> {
    // Start from a clean build dir: a stale CMakeCache (e.g. from a moved
    // toolchain) makes west's `-p` pristine step fail, so we wipe it ourselves.
    let _ = std::fs::remove_dir_all(build_dir);

    let src_s = src.display().to_string();
    let build_s = build_dir.display().to_string();
    let shield_arg = format!("-DSHIELD={shield}");
    let module_arg = format!("-DZMK_EXTRA_MODULES={}", dfu_module_dir(ws).display());
    // Bake the half's identity into the USB product string so the app can tell
    // left from right on connect (ZMK's serial number is static across units).
    let product_arg = format!("-DCONFIG_USB_DEVICE_PRODUCT=\"{usb_product}\"");
    let mut args: Vec<&str> = vec![
        "build", "-s", &src_s, "-d", &build_s, "-b", "nice_nano_v2",
    ];
    for s in snippets {
        args.push("-S");
        args.push(s);
    }
    args.push("--");
    args.push(&shield_arg);
    args.push(zmk_config);
    args.push(&module_arg);
    args.push(&product_arg);
    run_step_tagged(&ctx.app, ws, &west_bin(), &args, &[], tag, Some(ctx))
}

// Where the usb-dfu-reset ZMK module lives. For now it ships next to the app's
// source; resolved relative to the workspace's parent isn't reliable, so we look
// it up via env (set by the app at startup) with a dev fallback.
fn dfu_module_dir(_ws: &Path) -> PathBuf {
    if let Some(p) = std::env::var_os("ZMKAY_DFU_MODULE") {
        return PathBuf::from(p);
    }
    PathBuf::from("/Users/amcg/Workspaces/corne/firmware/usb-dfu-reset")
}

// ── config-folder watcher: debounced auto-build on source changes ────────────
// Holds the live debouncer so it keeps running; replacing it stops the old one.
#[derive(Default)]
pub struct WatcherState(Mutex<Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>);

// Watch the config/ folder; ~800ms after the last change, kick off a build
// (which cancels any in-flight one). Live Studio binding edits are instant over
// BLE and never touch these files, so only real source changes rebuild.
#[tauri::command]
pub fn watch_config(
    app: AppHandle,
    manager: State<Arc<BuildManager>>,
    watcher: State<WatcherState>,
    config_dir: String,
) -> Result<(), String> {
    use notify::RecursiveMode;
    use notify_debouncer_mini::{new_debouncer, DebounceEventResult};

    let dir = PathBuf::from(&config_dir);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {config_dir}"));
    }
    let app_cb = app.clone();
    let mgr_cb = manager.inner().clone();
    let cfg_cb = config_dir.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(800),
        move |res: DebounceEventResult| {
            if res.is_ok() {
                trigger_build(&app_cb, &mgr_cb, &cfg_cb);
            }
        },
    )
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *watcher.0.lock().unwrap() = Some(debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch_config(watcher: State<WatcherState>) {
    *watcher.0.lock().unwrap() = None;
}
