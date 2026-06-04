// Per-keyboard state in localStorage all lives under `zmkay.<namespace>.<key>`,
// where <key> is the connection cacheKey (e.g. `ble-<id>`). The RPC caches
// (behaviors/layouts/keymap) follow this shape too (see rpc/behavior-cache.ts).
//
// This module owns the cross-cutting concerns: a tiny name registry so we can
// list saved keyboards, the per-keyboard firmware-build config folder (with a
// global fallback for when nothing is connected), and forgetDevice — which wipes
// every trace of a keyboard in a single sweep (cache + config + registry + any
// namespace added later), so "Forget this keyboard" leaves nothing behind.

const PREFIX = "zmkay.";
const namePrefix = "zmkay.device.";
const nameKey = (k: string) => `${namePrefix}${k}`;
const configKey = (k: string) => `zmkay.configDir.${k}`;
const GLOBAL_CONFIG = "zmkay.configDir";

export type KnownDevice = { key: string; name: string };

// Record that we've connected to this keyboard, so it shows up in the saved list
// even when it isn't currently advertising. Only called with a real name.
export function rememberDevice(key: string, name: string): void {
  try {
    if (name) localStorage.setItem(nameKey(key), name);
  } catch {
    // best-effort
  }
}

export function listKnownDevices(): KnownDevice[] {
  const out: KnownDevice[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(namePrefix)) {
        out.push({ key: k.slice(namePrefix.length), name: localStorage.getItem(k) || "" });
      }
    }
  } catch {
    // best-effort
  }
  return out.sort((a, b) => (a.name || a.key).localeCompare(b.name || b.key));
}

// The firmware-build config folder for a keyboard. Falls back to the last folder
// chosen anywhere, so the flash dialog is usable before connecting.
export function loadConfigDir(key: string | null): string {
  try {
    if (key) {
      const v = localStorage.getItem(configKey(key));
      if (v) return v;
    }
    return localStorage.getItem(GLOBAL_CONFIG) ?? "";
  } catch {
    return "";
  }
}

export function saveConfigDir(key: string | null, path: string): void {
  try {
    localStorage.setItem(GLOBAL_CONFIG, path);
    if (key) localStorage.setItem(configKey(key), path);
  } catch {
    // best-effort
  }
}

// Optional nickname for a USB half, keyed by role (left/right) — ZMK's USB
// serial is static across units, so role is the stable identity. Independent of
// the per-keyboard cache above.
const halfNameKey = (role: string) => `zmkay.halfName.${role}`;

export function loadHalfName(role: string): string {
  try {
    return localStorage.getItem(halfNameKey(role)) ?? "";
  } catch {
    return "";
  }
}

export function saveHalfName(role: string, name: string): void {
  try {
    if (name) localStorage.setItem(halfNameKey(role), name);
    else localStorage.removeItem(halfNameKey(role));
  } catch {
    // best-effort
  }
}

// Remove every localStorage entry scoped to this keyboard. The leading dot in
// the suffix keeps `ble-abc` from also matching `ble-abcd`.
export function forgetDevice(key: string): void {
  try {
    const victims: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k.endsWith(`.${key}`)) victims.push(k);
    }
    victims.forEach((k) => localStorage.removeItem(k));
  } catch {
    // best-effort
  }
}
