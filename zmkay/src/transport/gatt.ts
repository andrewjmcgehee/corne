import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { ConnectCancelled } from "./errors";

// ZMK Studio's custom GATT service. Not on Chrome's Web Bluetooth blocklist
// (unlike the HID service), so a browser may open it even on a keyboard.
const SERVICE_UUID = "00000000-0196-6107-c967-c5cfb1c2482a";
const RPC_CHRC_UUID = "00000001-0196-6107-c967-c5cfb1c2482a";

export class NoStudioServiceError extends Error {
  constructor() {
    super(
      "That device doesn't expose the ZMK Studio service. Make sure CONFIG_ZMK_STUDIO=y and that you selected the keyboard.",
    );
    this.name = "NoStudioServiceError";
  }
}

export interface GattConnectOptions {
  // When true, the chooser lists every nearby BLE device (pick yours by name)
  // instead of only devices that ADVERTISE the Studio service UUID. This is the
  // workaround for firmware that exposes the service in its GATT table but not
  // in its advertisement — the case that leaves the filtered picker empty.
  showAllDevices?: boolean;
}

// Our own GATT transport. Mirrors the official client's stream setup, but gives
// us control over device discovery (the stock connect() hard-filters on the
// advertised service, which can hide otherwise-usable keyboards).
export async function connectGatt(
  opts: GattConnectOptions = {},
): Promise<RpcTransport> {
  const requestOptions: RequestDeviceOptions = opts.showAllDevices
    ? { acceptAllDevices: true, optionalServices: [SERVICE_UUID] }
    : { filters: [{ services: [SERVICE_UUID] }], optionalServices: [SERVICE_UUID] };

  let dev: BluetoothDevice;
  try {
    dev = await navigator.bluetooth.requestDevice(requestOptions);
  } catch (e) {
    // Dismissing the chooser rejects with NotFoundError.
    if (e instanceof DOMException && e.name === "NotFoundError") {
      throw new ConnectCancelled();
    }
    throw e;
  }

  if (!dev.gatt) throw new NoStudioServiceError();
  const abortController = new AbortController();
  const label = dev.name || "Unknown";

  if (!dev.gatt.connected) await dev.gatt.connect();

  let svc: BluetoothRemoteGATTService;
  try {
    svc = await dev.gatt.getPrimaryService(SERVICE_UUID);
  } catch {
    dev.gatt.disconnect();
    throw new NoStudioServiceError();
  }
  const char = await svc.getCharacteristic(RPC_CHRC_UUID);

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A reconnect to the same device loses notifications unless we stop first.
      await char.stopNotifications().catch(() => {});
      await char.startNotifications();
      const onValue = (ev: Event) => {
        const buf = (ev.target as BluetoothRemoteGATTCharacteristic).value
          ?.buffer;
        if (buf) controller.enqueue(new Uint8Array(buf));
      };
      char.addEventListener("characteristicvaluechanged", onValue);
      const onDisconnect = () => {
        char.removeEventListener("characteristicvaluechanged", onValue);
        dev.removeEventListener("gattserverdisconnected", onDisconnect);
        controller.close();
      };
      dev.addEventListener("gattserverdisconnected", onDisconnect);
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      return char.writeValueWithoutResponse(chunk as unknown as BufferSource);
    },
  });

  abortController.signal.addEventListener("abort", () => dev.gatt?.disconnect(), {
    once: true,
  });

  return { label, abortController, readable, writable };
}
