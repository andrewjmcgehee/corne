import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Native USB flash: copy a .uf2 onto the bootloader volume once the user enters
// the bootloader. See src-tauri/src/flash.rs.

export function onFlashStatus(cb: (msg: string) => void): Promise<UnlistenFn> {
  return listen<string>("flash://status", (e) => cb(e.payload));
}

export async function flashUf2(uf2Path: string, timeoutSecs = 120): Promise<string> {
  return invoke<string>("flash_uf2", { uf2Path, timeoutSecs });
}
