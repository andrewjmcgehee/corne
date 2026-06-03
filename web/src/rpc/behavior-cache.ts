import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap, PhysicalLayouts } from "@zmkfirmware/zmk-studio-ts-client/keymap";

// Per-device cache in localStorage. ZMK fragments large RPC responses into many
// tiny confirmed BLE indications, so the keymap and physical-layout payloads are
// the dominant connect cost. We cache the static physical layout (skip it on
// reconnect) and the last keymap (render instantly, then refresh live). Behavior
// metadata is also static. All are plain JSON.

const behaviorsKey = (k: string) => `zmkay.behaviors.${k}`;
const layoutsKey = (k: string) => `zmkay.layouts.${k}`;
const keymapKey = (k: string) => `zmkay.keymap.${k}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function loadCachedLayouts(deviceKey: string): PhysicalLayouts | null {
  return readJson<PhysicalLayouts>(layoutsKey(deviceKey));
}
export function saveCachedLayouts(deviceKey: string, layouts: PhysicalLayouts): void {
  writeJson(layoutsKey(deviceKey), layouts);
}

export function loadCachedKeymap(deviceKey: string): Keymap | null {
  return readJson<Keymap>(keymapKey(deviceKey));
}
export function saveCachedKeymap(deviceKey: string, keymap: Keymap): void {
  writeJson(keymapKey(deviceKey), keymap);
}

const keyFor = (deviceKey: string) => behaviorsKey(deviceKey);

export function loadCachedBehaviors(
  deviceKey: string,
): Map<number, GetBehaviorDetailsResponse> {
  try {
    const raw = localStorage.getItem(keyFor(deviceKey));
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, GetBehaviorDetailsResponse>;
    return new Map(Object.entries(obj).map(([id, v]) => [Number(id), v]));
  } catch {
    return new Map();
  }
}

export function saveCachedBehaviors(
  deviceKey: string,
  behaviors: Map<number, GetBehaviorDetailsResponse>,
): void {
  try {
    const obj: Record<number, GetBehaviorDetailsResponse> = {};
    for (const [id, v] of behaviors) obj[id] = v;
    localStorage.setItem(keyFor(deviceKey), JSON.stringify(obj));
  } catch {
    // localStorage unavailable/full — caching is best-effort.
  }
}
