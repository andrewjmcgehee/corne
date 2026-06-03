import { call_rpc, type RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type {
  Keymap,
  PhysicalLayouts,
  BehaviorBinding,
  SetLayerBindingResponse,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

// Thin, typed wrappers around call_rpc. Each unwraps the subsystem field from
// the RequestResponse; call_rpc already throws MetaError (e.g. UNLOCK_REQUIRED)
// and NoResponseError for us, so these only need to assert the field is present.
// call_rpc is internally mutex-serialized, so concurrent calls queue safely.

function unwrap<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Device returned no ${what} in response`);
  }
  return value;
}

// --- core -----------------------------------------------------------------

export async function getDeviceInfo(conn: RpcConnection): Promise<string> {
  const r = await call_rpc(conn, { core: { getDeviceInfo: true } });
  return unwrap(r.core?.getDeviceInfo, "device info").name;
}

export async function getLockState(conn: RpcConnection): Promise<LockState> {
  const r = await call_rpc(conn, { core: { getLockState: true } });
  return unwrap(r.core?.getLockState, "lock state");
}

export function isUnlocked(state: LockState): boolean {
  return state === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
}

export async function lock(conn: RpcConnection): Promise<void> {
  await call_rpc(conn, { core: { lock: true } });
}

export async function resetSettings(conn: RpcConnection): Promise<void> {
  await call_rpc(conn, { core: { resetSettings: true } });
}

// --- keymap ---------------------------------------------------------------

export async function getKeymap(conn: RpcConnection): Promise<Keymap> {
  const r = await call_rpc(conn, { keymap: { getKeymap: true } });
  return unwrap(r.keymap?.getKeymap, "keymap");
}

export async function getPhysicalLayouts(
  conn: RpcConnection,
): Promise<PhysicalLayouts> {
  const r = await call_rpc(conn, { keymap: { getPhysicalLayouts: true } });
  return unwrap(r.keymap?.getPhysicalLayouts, "physical layouts");
}

export async function setLayerBinding(
  conn: RpcConnection,
  layerId: number,
  keyPosition: number,
  binding: BehaviorBinding,
): Promise<SetLayerBindingResponse> {
  const r = await call_rpc(conn, {
    keymap: { setLayerBinding: { layerId, keyPosition, binding } },
  });
  return unwrap(r.keymap?.setLayerBinding, "set-layer-binding result");
}

export async function checkUnsavedChanges(
  conn: RpcConnection,
): Promise<boolean> {
  const r = await call_rpc(conn, { keymap: { checkUnsavedChanges: true } });
  return r.keymap?.checkUnsavedChanges ?? false;
}

export async function saveChanges(conn: RpcConnection): Promise<void> {
  const r = await call_rpc(conn, { keymap: { saveChanges: true } });
  const result = unwrap(r.keymap?.saveChanges, "save result");
  if (result.err) {
    throw new Error(`Save failed (code ${result.err})`);
  }
}

export async function discardChanges(conn: RpcConnection): Promise<void> {
  await call_rpc(conn, { keymap: { discardChanges: true } });
}

// --- behaviors ------------------------------------------------------------

export async function listAllBehaviors(
  conn: RpcConnection,
): Promise<number[]> {
  const r = await call_rpc(conn, { behaviors: { listAllBehaviors: true } });
  return unwrap(r.behaviors?.listAllBehaviors, "behavior list").behaviors;
}

export async function getBehaviorDetails(
  conn: RpcConnection,
  behaviorId: number,
): Promise<GetBehaviorDetailsResponse> {
  const r = await call_rpc(conn, {
    behaviors: { getBehaviorDetails: { behaviorId } },
  });
  return unwrap(r.behaviors?.getBehaviorDetails, "behavior details");
}

// Fetch metadata for a specific set of behavior ids, keyed by id. Each call is a
// serialized RPC round-trip, so callers should pass only the ids they need
// (e.g. those actually used in the keymap) to keep connect latency low.
export async function loadBehaviorDetails(
  conn: RpcConnection,
  ids: Iterable<number>,
): Promise<Map<number, GetBehaviorDetailsResponse>> {
  const map = new Map<number, GetBehaviorDetailsResponse>();
  for (const id of new Set(ids)) {
    map.set(id, await getBehaviorDetails(conn, id));
  }
  return map;
}

// Fetch metadata for every behavior the firmware exposes (used later by the
// editor's behavior picker; not needed just to render the current keymap).
export async function loadAllBehaviorDetails(
  conn: RpcConnection,
): Promise<Map<number, GetBehaviorDetailsResponse>> {
  return loadBehaviorDetails(conn, await listAllBehaviors(conn));
}
