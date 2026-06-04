import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Local ZMK firmware build via the app-owned Zephyr toolchain. See
// src-tauri/src/build.rs. Pairs with the USB flash in ./flash.ts.

export type ToolchainStatus = {
  provisioned: boolean;
  root: string;
  west: boolean;
  workspace: boolean;
  sdk: boolean;
};

export type BuildResult = { left: string; right: string };

export function toolchainStatus(): Promise<ToolchainStatus> {
  return invoke<ToolchainStatus>("toolchain_status");
}

// First-run provisioning: venv + west + workspace clone + Zephyr SDK (~2-3 GB).
export function bootstrapToolchain(): Promise<string> {
  return invoke<string>("bootstrap_toolchain");
}

// Build both halves from the repo's config dir; returns the two .uf2 paths.
export function buildFirmware(configDir: string): Promise<BuildResult> {
  return invoke<BuildResult>("build_firmware", { configDir });
}

// Stage headers ("Building left half…", "Downloading Zephyr SDK…").
export function onBuildStatus(cb: (msg: string) => void): Promise<UnlistenFn> {
  return listen<string>("build://status", (e) => cb(e.payload));
}

// Raw toolchain output lines, for the live log pane.
export function onBuildLog(cb: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>("build://log", (e) => cb(e.payload));
}

// ── managed auto-build pipeline (cancelable, debounced, 3-run history) ────────

export type RunStatus = "building" | "success" | "error" | "canceled";

// One build run as the UI sees it (matches build.rs RunRecord). Logs are kept
// per half for debugging; the .uf2 paths feed the flash step.
export type RunRecord = {
  id: number;
  started_ms: number;
  status: RunStatus;
  left_log: string[];
  right_log: string[];
  left_uf2: string | null;
  right_uf2: string | null;
  error: string | null;
};

// Fire-and-forget build of both halves; cancels any in-flight build. Returns
// the new run id. Progress arrives via onBuildRun / onBuildLog.
export function startBuild(configDir: string): Promise<number> {
  return invoke<number>("start_build", { configDir });
}

export function cancelBuild(): Promise<void> {
  return invoke("cancel_build");
}

// The last 3 runs (newest first), each with status + per-half logs.
export function buildHistory(): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("build_history");
}

// Watch the config folder; ~800ms after the last change, a build auto-starts.
export function watchConfig(configDir: string): Promise<void> {
  return invoke("watch_config", { configDir });
}

export function unwatchConfig(): Promise<void> {
  return invoke("unwatch_config");
}

// Run lifecycle: { id, status }. id 0 is a bare "canceled" ping.
export function onBuildRun(
  cb: (e: { id: number; status: RunStatus }) => void,
): Promise<UnlistenFn> {
  return listen<{ id: number; status: RunStatus }>("build://run", (e) => cb(e.payload));
}
