// Feature detection for the browser APIs zmkay relies on. None of these can be
// polyfilled — they gate which transports / sync modes are available, so the UI
// surfaces them honestly rather than failing mid-flow (see BrowserGuard).

export interface Capabilities {
  webBluetooth: boolean;
  webSerial: boolean;
  fileSystemAccess: boolean;
}

export function detectCapabilities(): Capabilities {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    webBluetooth: !!nav && "bluetooth" in nav,
    webSerial: !!nav && "serial" in nav,
    fileSystemAccess:
      typeof window !== "undefined" && "showDirectoryPicker" in window,
  };
}

// True for Chromium-family browsers, where Web Bluetooth / Web Serial live.
// Used only for messaging; actual gating is on the capability flags above.
export function isLikelyChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg|OPR/.test(ua) && !/Firefox/.test(ua);
}
