import { useEffect } from "react";
import { useStore } from "../state/store";
import { detectCapabilities } from "./capabilities";
import { isTauri } from "../transport/tauri-ble";
import { Modal } from "./Modal";

// The connection flow, in a modal. Native (Tauri) shows a BLE scan + device
// list; the browser shows the Web Bluetooth / Web Serial choosers. Closes
// itself once a connection is established.
export function ConnectDialog({ onClose }: { onClose: () => void }) {
  const status = useStore((s) => s.status);

  useEffect(() => {
    if (status === "connected") onClose();
  }, [status, onClose]);

  return (
    <Modal
      title="Connect your keyboard"
      onClose={onClose}
      footer={
        isTauri() ? (
          <>Reaches your keyboard over its existing Bluetooth pairing with this computer.</>
        ) : (
          <>Bluetooth here needs Chrome; the native app talks to your paired keyboard.</>
        )
      }
    >
      {status === "connecting" ? (
        <Connecting />
      ) : isTauri() ? (
        <NativeConnect />
      ) : (
        <WebConnect />
      )}
    </Modal>
  );
}

function Spinner() {
  return (
    <div className="w-7 h-7 rounded-full border-2 border-zmkay-edge border-t-zmkay-accent animate-spin" />
  );
}

function Connecting() {
  const deviceName = useStore((s) => s.deviceName);
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Spinner />
      <div>
        <p className="text-sm text-zmkay-text">
          Connecting{deviceName ? ` to ${deviceName}` : "…"}
        </p>
        <p className="text-xs text-zmkay-muted mt-1.5 max-w-[18rem]">
          The first connection to a keyboard reads and caches its layout, so it
          can take a few seconds. Reconnects are quick.
        </p>
      </div>
    </div>
  );
}

function NativeConnect() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const devices = useStore((s) => s.nativeDevices);
  const refreshDevices = useStore((s) => s.refreshDevices);
  const connectNative = useStore((s) => s.connectNative);
  const connecting = status === "connecting";

  // Refresh the connected-device list on open and every 10s while the dialog is
  // mounted (so it picks up a keyboard that reconnects), deduped by the store.
  useEffect(() => {
    void refreshDevices();
    const id = setInterval(() => void refreshDevices(), 10_000);
    return () => clearInterval(id);
  }, [refreshDevices]);

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorNote>{error}</ErrorNote>}

      {devices.length === 0 ? (
        <p className="text-sm text-zmkay-muted">
          Looking for your keyboard… Make sure it's connected to this computer
          over Bluetooth (on its paired profile).
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-64 overflow-auto">
          {devices.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                disabled={connecting}
                onClick={() => void connectNative(d.id)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-zmkay-edge bg-zmkay-panel2 hover:bg-zmkay-keyhi text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      d.has_studio_adv ? "bg-zmkay-good" : "bg-zmkay-edge"
                    }`}
                  />
                  <span className="truncate text-sm">
                    {d.name || "Unknown device"}
                  </span>
                </span>
                <span className="text-xs text-zmkay-muted shrink-0">
                  {connecting ? "…" : "Connect"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5 text-xs text-zmkay-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-zmkay-good animate-pulse" />
        Looking for connected keyboards
      </div>
    </div>
  );
}

function WebConnect() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const caps = detectCapabilities();
  const connecting = status === "connecting";

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorNote>{error}</ErrorNote>}

      {caps.webBluetooth && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={connecting}
            onClick={() => connect("ble")}
            className="w-full px-3 py-2 rounded-lg text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Connect over Bluetooth"}
          </button>
          <button
            type="button"
            disabled={connecting}
            onClick={() => connect("ble", true)}
            className="w-full px-3 py-1.5 rounded-lg text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text disabled:opacity-50"
          >
            Show all devices — if your keyboard isn't listed
          </button>
        </div>
      )}

      {caps.webSerial && (
        <button
          type="button"
          disabled={connecting}
          onClick={() => connect("serial")}
          className="w-full px-3 py-2 rounded-lg text-sm bg-zmkay-panel2 border border-zmkay-edge text-zmkay-text hover:bg-zmkay-keyhi disabled:opacity-50"
        >
          Connect over USB
        </button>
      )}

      {!caps.webBluetooth && !caps.webSerial && (
        <p className="text-sm text-zmkay-muted">
          This browser exposes no device transport. Open zmkay in Chrome/Edge,
          or use the native app for Bluetooth.
        </p>
      )}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zmkay-bad/40 bg-zmkay-bad/10 px-3 py-2 text-xs text-zmkay-bad">
      {children}
    </div>
  );
}
