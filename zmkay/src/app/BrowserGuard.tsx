import { type ReactNode } from "react";
import { detectCapabilities, isLikelyChromium } from "./capabilities";
import { isTauri } from "../transport/tauri-ble";

// Live hotswap needs at least one device transport (Web Bluetooth or Web Serial).
// On unsupported browsers we don't hard-block the whole app — source-channel
// editing (.keymap parsing, git sync) still works — but we make the limitation
// loud so the user isn't surprised when "Connect" is missing.
export function BrowserGuard({ children }: { children: ReactNode }) {
  const caps = detectCapabilities();
  // In the native shell, device access goes through Rust (no Web Bluetooth/Serial
  // in WKWebView), so the browser-capability nag doesn't apply.
  const canConnect = isTauri() || caps.webBluetooth || caps.webSerial;

  if (canConnect) return <>{children}</>;

  return (
    <div className="min-h-full flex flex-col">
      <div className="bg-zmkay-warn/15 border-b border-zmkay-warn/30 px-4 py-2 text-sm text-zmkay-warn">
        {isLikelyChromium() ? (
          <>
            Your browser exposes neither Web Bluetooth nor Web Serial. Serve over{" "}
            <span className="font-mono">https</span> or{" "}
            <span className="font-mono">localhost</span> and enable the relevant
            flags to use live hotswap.
          </>
        ) : (
          <>
            Live hotswap needs a Chromium-based browser (Chrome, Edge, Brave,
            Arc) for Web Bluetooth / Web Serial. You can still edit and git-sync
            your <span className="font-mono">.keymap</span> here — open in
            Chromium to push changes to the keyboard live.
          </>
        )}
      </div>
      {children}
    </div>
  );
}
