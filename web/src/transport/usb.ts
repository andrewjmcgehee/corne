import { invoke } from "@tauri-apps/api/core";

// USB half detection + one-click DFU flash (see src-tauri/src/usb.rs). A running
// ZMK half appears as a CDC serial port; flashHalf 1200-touches it into DFU and
// copies the matching .uf2.

export type Role = "left" | "right" | "unknown";

export type UsbHalf = {
  role: Role;
  product: string;
  ports: string[];
};

export function usbHalves(): Promise<UsbHalf[]> {
  return invoke<UsbHalf[]>("usb_halves");
}

// Drive the half into DFU and flash it. Progress arrives on flash://status
// (see transport/flash.ts onFlashStatus).
export function flashHalf(
  ports: string[],
  uf2Path: string,
  timeoutSecs = 180,
): Promise<string> {
  return invoke<string>("flash_half", { ports, uf2Path, timeoutSecs });
}
