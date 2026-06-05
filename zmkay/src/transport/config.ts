import { invoke } from "@tauri-apps/api/core";

// Read/write the source-of-truth corne.keymap (see src-tauri/src/config.rs).
// Writing it triggers the config-folder watcher → an auto-build.

export function readKeymap(configDir: string): Promise<string> {
  return invoke<string>("read_keymap", { configDir });
}

export function writeKeymap(configDir: string, content: string): Promise<void> {
  return invoke("write_keymap", { configDir, content });
}

// Write the device-derived keymap to candidate.keymap; returns its path.
export function writeCandidate(configDir: string, content: string): Promise<string> {
  return invoke<string>("write_candidate", { configDir, content });
}
