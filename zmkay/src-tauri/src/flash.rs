// USB flash by copying a .uf2 to the bootloader's mass-storage volume — the
// programmatic equivalent of drag-and-drop. ZMK has no USB software-reset, so
// the user enters the bootloader once (double-tap reset, or a &bootloader key);
// we then detect the mounted volume and copy the firmware. No DFU tooling needed.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

// Candidate roots where a UF2 bootloader volume shows up, per OS.
fn volume_roots() -> Vec<PathBuf> {
    if cfg!(target_os = "macos") {
        vec![PathBuf::from("/Volumes")]
    } else if cfg!(target_os = "windows") {
        ('D'..='Z').map(|c| PathBuf::from(format!("{c}:\\"))).collect()
    } else {
        let mut roots = vec![PathBuf::from("/media"), PathBuf::from("/run/media")];
        if let Ok(user) = std::env::var("USER") {
            roots.push(PathBuf::from(format!("/run/media/{user}")));
            roots.push(PathBuf::from(format!("/media/{user}")));
        }
        roots
    }
}

// A UF2 bootloader drive has an INFO_UF2.TXT at its root — the reliable marker.
fn find_bootloader_volume() -> Option<PathBuf> {
    for root in volume_roots() {
        if root.join("INFO_UF2.TXT").exists() {
            return Some(root); // Windows drive root case
        }
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.join("INFO_UF2.TXT").exists() {
                return Some(p);
            }
        }
    }
    None
}

#[tauri::command]
pub fn bootloader_present() -> bool {
    find_bootloader_volume().is_some()
}

// Wait for a bootloader volume (the user enters it via reset/&bootloader), then
// copy the .uf2 onto it. Emits `flash://status` updates for the UI.
#[tauri::command]
pub async fn flash_uf2(
    app: AppHandle,
    uf2_path: String,
    timeout_secs: u64,
) -> Result<String, String> {
    let src = PathBuf::from(&uf2_path);
    if !src.exists() {
        return Err(format!("Firmware file not found: {uf2_path}"));
    }
    wait_and_copy(&app, &src, timeout_secs).await
}

// Poll for the bootloader volume, then byte-copy the .uf2 onto it. Shared by the
// manual flash command and the one-click flash_half (which first 1200-touches the
// half into DFU). Emits `flash://status` for the UI.
pub async fn wait_and_copy(
    app: &AppHandle,
    src: &Path,
    timeout_secs: u64,
) -> Result<String, String> {
    let _ = app.emit("flash://status", "Waiting for bootloader…");
    eprintln!("[flash] polling for bootloader volume (timeout {timeout_secs}s)…");
    let mut volume = None;
    for _ in 0..(timeout_secs * 2) {
        if let Some(v) = find_bootloader_volume() {
            eprintln!("[flash] bootloader volume found: {}", v.display());
            volume = Some(v);
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    let volume = volume.ok_or_else(|| {
        eprintln!("[flash] timed out waiting for bootloader volume");
        "Timed out — put the half in bootloader mode (double-tap reset, or press a &bootloader key)"
            .to_string()
    })?;

    let _ = app.emit("flash://status", "Bootloader found — copying firmware…");
    let dest = volume.join("CURRENT.UF2");
    eprintln!("[flash] copying {} -> {}", src.display(), dest.display());
    let copy = copy_bytes(src, &dest);
    eprintln!("[flash] copy result: {copy:?}; waiting for unmount…");

    // The UF2 bootloader reboots the instant it has the image — usually mid-write
    // — so the final write/flush often errors (ENOATTR, EIO, …) even though the
    // firmware landed. The definitive success signal is the volume UNMOUNTING.
    // Always wait for that before returning: it confirms the flash took, and it
    // stops a follow-on flash of the other half from reusing this half's
    // still-mounted (indistinguishable) bootloader volume.
    let _ = app.emit("flash://status", "Verifying…");
    for _ in 0..30 {
        if !volume.exists() {
            return Ok("Firmware flashed — the half rebooted.".to_string());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    match copy {
        Ok(_) => Ok("Firmware copied — the half is rebooting.".to_string()),
        Err(e) => Err(format!("Copy failed: {e}")),
    }
}

// Plain byte copy — NOT std::fs::copy. On macOS fs::copy uses fcopyfile with
// COPYFILE_ALL, which after writing the data tries to copy extended attributes
// and fails with ENOATTR (os error 93) on the bootloader's FAT volume, even
// though the firmware itself wrote fine. Copying just the bytes avoids that.
fn copy_bytes(src: &Path, dest: &Path) -> std::io::Result<()> {
    let mut reader = fs::File::open(src)?;
    let mut writer = fs::File::create(dest)?;
    std::io::copy(&mut reader, &mut writer)?;
    writer.flush()?;
    Ok(())
}
