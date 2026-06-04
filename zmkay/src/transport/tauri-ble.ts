import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

// Native BLE transport, available only inside the Tauri shell. Mirrors the
// RpcTransport shape the web transports use, but reads/writes go through the
// Rust ble commands (see src-tauri/src/ble.rs) instead of Web Bluetooth — which
// is how we reach the keyboard's encrypted Studio GATT service that browsers
// can't (works across macOS, Linux, and Windows via the OS Bluetooth stack).

export interface NativeDevice {
  id: string;
  name: string;
  has_studio_adv: boolean;
}

// True when running in the Tauri webview (vs a plain browser tab).
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Keyboards currently connected to this computer that we can reach over their
// existing bond (no scanning/advertising involved).
export async function listDevices(): Promise<NativeDevice[]> {
  return invoke<NativeDevice[]>("ble_list");
}

export async function connectTauriBle(deviceId: string): Promise<RpcTransport> {
  const dev = await invoke<NativeDevice>("ble_connect", { id: deviceId });
  // eslint-disable-next-line no-console
  console.log("[zmkay] ble_connect resolved:", dev);

  const abortController = new AbortController();
  let unlistenRx: UnlistenFn | null = null;
  let unlistenDisc: UnlistenFn | null = null;
  const cleanup = () => {
    unlistenRx?.();
    unlistenDisc?.();
    unlistenRx = unlistenDisc = null;
  };

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Rust emits each GATT notification's bytes as a number[] payload.
      unlistenRx = await listen<number[]>("ble://rx", (ev) => {
        controller.enqueue(new Uint8Array(ev.payload));
      });
      unlistenDisc = await listen("ble://disconnected", () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
        abortController.abort();
      });
    },
    cancel() {
      cleanup();
    },
  });

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      await invoke("ble_send", { data: Array.from(chunk) });
    },
  });

  abortController.signal.addEventListener(
    "abort",
    () => {
      cleanup();
      void invoke("ble_disconnect");
    },
    { once: true },
  );

  return {
    label: dev.name || "ZMK keyboard",
    abortController,
    readable,
    writable,
  };
}
