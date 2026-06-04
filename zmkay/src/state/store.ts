import { create } from "zustand";
import {
  create_rpc_connection,
  type RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type {
  Keymap,
  PhysicalLayouts,
  BehaviorBinding,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { openConnection, ConnectCancelled, type TransportKind } from "../transport/connect";
import {
  connectTauriBle,
  listDevices,
  type NativeDevice,
} from "../transport/tauri-ble";
import { listenForNotifications } from "../rpc/notifications";
import * as rpc from "../rpc/client";
import {
  loadCachedBehaviors,
  saveCachedBehaviors,
  loadCachedLayouts,
  saveCachedLayouts,
  loadCachedKeymap,
  saveCachedKeymap,
} from "../rpc/behavior-cache";
import { rememberDevice } from "./device-storage";

export type ConnStatus = "idle" | "connecting" | "connected" | "error";

interface ZmkayState {
  conn: RpcConnection | null;
  transport: TransportKind | null;
  status: ConnStatus;
  error: string | null;

  // Native (Tauri) BLE device discovery.
  nativeDevices: NativeDevice[];
  scanning: boolean;

  deviceName: string;
  lockState: LockState | null;
  keymap: Keymap | null;
  layouts: PhysicalLayouts | null;
  behaviors: Map<number, GetBehaviorDetailsResponse>;
  hasUnsaved: boolean;
  activeLayer: number;

  // QuickBind: a sequential capture mode that walks key-by-key.
  quickBind: boolean;
  qbPosition: number;

  // Behavior metadata: we load only used behaviors on connect; the editor's
  // behavior picker pulls the full set on demand.
  cacheKey: string | null;
  allBehaviorsLoaded: boolean;
  ensureAllBehaviors: () => Promise<void>;

  connect: (kind: TransportKind, showAllDevices?: boolean) => Promise<void>;
  refreshDevices: () => Promise<void>;
  connectNative: (deviceId: string) => Promise<void>;
  disconnect: () => void;
  setActiveLayer: (index: number) => void;
  /** Enter QuickBind; from a pre-selected key, or null to start at layer 0 key 0. */
  startQuickBind: (from: number | null) => void;
  stopQuickBind: () => void;
  setQbPosition: (index: number) => void;
  /** Optimistically apply a binding live, then reflect it locally. */
  setBinding: (
    layerId: number,
    keyPosition: number,
    binding: BehaviorBinding,
  ) => Promise<void>;
  save: () => Promise<void>;
  discard: () => Promise<void>;
}

export const useStore = create<ZmkayState>((set, get) => {
  // Ensure metadata for every behavior the keymap references, starting from a
  // base map (cache) and fetching only the missing ids; persists the result.
  async function ensureBehaviors(
    conn: RpcConnection,
    cacheKey: string,
    keymap: Keymap,
    base: Map<number, GetBehaviorDetailsResponse>,
  ) {
    const usedIds = new Set(
      keymap.layers.flatMap((l) => l.bindings.map((b) => b.behaviorId)),
    );
    const behaviors = base;
    const missing = [...usedIds].filter((id) => !behaviors.has(id));
    if (missing.length) {
      for (const [id, v] of await rpc.loadBehaviorDetails(conn, missing)) {
        behaviors.set(id, v);
      }
      saveCachedBehaviors(cacheKey, behaviors);
    }
    return behaviors;
  }

  // Re-read the live data after a cache-render and apply it if still connected.
  // The big keymap payload is fetched here, off the critical render path.
  async function refreshLive(conn: RpcConnection, cacheKey: string) {
    try {
      const [deviceName, lockState, keymap, hasUnsaved] = await Promise.all([
        rpc.getDeviceInfo(conn),
        rpc.getLockState(conn),
        rpc.getKeymap(conn),
        rpc.checkUnsavedChanges(conn),
      ]);
      const behaviors = await ensureBehaviors(
        conn,
        cacheKey,
        keymap,
        get().behaviors,
      );
      if (get().conn !== conn) return; // disconnected/replaced meanwhile
      set({ deviceName, lockState, keymap, behaviors, hasUnsaved });
      rememberDevice(cacheKey, deviceName);
      saveCachedKeymap(cacheKey, keymap);
    } catch {
      // Keep the cached view; a failed background refresh isn't fatal.
    }
  }

  // Shared post-connection bootstrap. If we have a cached snapshot for this
  // device, render it instantly and refresh live data in the background;
  // otherwise fetch everything (cold path), render, and cache.
  async function finishConnect(conn: RpcConnection, cacheKey: string) {
    void listenForNotifications(conn, {
      onLockStateChanged: (lockState) => set({ lockState }),
      onUnsavedChangesChanged: (hasUnsaved) => set({ hasUnsaved }),
    });
    set({ cacheKey, allBehaviorsLoaded: false });

    const cachedLayouts = loadCachedLayouts(cacheKey);
    const cachedKeymap = loadCachedKeymap(cacheKey);
    if (cachedLayouts && cachedKeymap) {
      const behaviors = loadCachedBehaviors(cacheKey);
      const usedIds = new Set(
        cachedKeymap.layers.flatMap((l) => l.bindings.map((b) => b.behaviorId)),
      );
      if ([...usedIds].every((id) => behaviors.has(id))) {
        set({
          conn,
          status: "connected",
          layouts: cachedLayouts,
          keymap: cachedKeymap,
          behaviors,
          activeLayer: 0,
          lockState: null,
          deviceName: "",
          hasUnsaved: false,
        });
        void refreshLive(conn, cacheKey);
        return;
      }
    }

    // Cold path: nothing usable cached. Fetch everything (with a hang guard).
    try {
      const [deviceName, lockState, layouts, keymap, hasUnsaved] =
        await withTimeout(
          Promise.all([
            rpc.getDeviceInfo(conn),
            rpc.getLockState(conn),
            rpc.getPhysicalLayouts(conn),
            rpc.getKeymap(conn),
            rpc.checkUnsavedChanges(conn),
          ]),
          15_000,
          "Connected, but the keyboard didn't respond. The Studio characteristic needs an encrypted link — make sure the keyboard is paired and connected to this computer.",
        );
      const behaviors = await ensureBehaviors(
        conn,
        cacheKey,
        keymap,
        loadCachedBehaviors(cacheKey),
      );
      set({
        conn,
        status: "connected",
        deviceName,
        lockState,
        layouts,
        behaviors,
        keymap,
        hasUnsaved,
        activeLayer: 0,
      });
      rememberDevice(cacheKey, deviceName);
      saveCachedLayouts(cacheKey, layouts);
      saveCachedKeymap(cacheKey, keymap);
    } catch (err) {
      set({ status: "error", error: describeError(err) });
    }
  }

  return {
    conn: null,
    transport: null,
    status: "idle",
    error: null,
    nativeDevices: [],
    scanning: false,
    deviceName: "",
    lockState: null,
    keymap: null,
    layouts: null,
    behaviors: new Map(),
    hasUnsaved: false,
    activeLayer: 0,
    quickBind: false,
    qbPosition: 0,
    cacheKey: null,
    allBehaviorsLoaded: false,

    ensureAllBehaviors: async () => {
      const { conn, allBehaviorsLoaded, cacheKey } = get();
      if (!conn || allBehaviorsLoaded) return;
      try {
        const ids = await rpc.listAllBehaviors(conn);
        const behaviors = new Map(get().behaviors);
        for (const id of ids) {
          if (!behaviors.has(id)) {
            behaviors.set(id, await rpc.getBehaviorDetails(conn, id));
          }
        }
        set({ behaviors, allBehaviorsLoaded: true });
        if (cacheKey) saveCachedBehaviors(cacheKey, behaviors);
      } catch {
        // Leave the used-behavior subset in place if the full load fails.
      }
    },

    connect: async (kind, showAllDevices = false) => {
      if (get().status === "connecting") return;
      set({ status: "connecting", error: null, transport: kind });
      try {
        const conn = await openConnection(kind, { showAllDevices });
        await finishConnect(conn, conn.label || `web-${kind}`);
      } catch (err) {
        if (err instanceof ConnectCancelled) {
          set({ status: "idle", transport: null });
          return;
        }
        set({ status: "error", error: describeError(err), transport: null });
      }
    },

    refreshDevices: async () => {
      // Skip if a refresh is already running or we're mid-connect (both use the
      // BLE adapter).
      if (get().scanning || get().status === "connecting") return;
      set({ scanning: true, error: null });
      try {
        const found = await listDevices();
        // Merge into the existing list keyed by id, so entries are deduped and
        // the list stays stable across refreshes instead of flickering.
        const byId = new Map(get().nativeDevices.map((d) => [d.id, d]));
        for (const d of found) {
          const prev = byId.get(d.id);
          byId.set(d.id, {
            ...d,
            name: d.name || prev?.name || "",
            has_studio_adv: d.has_studio_adv || (prev?.has_studio_adv ?? false),
          });
        }
        const merged = [...byId.values()].sort(
          (a, b) => Number(b.has_studio_adv) - Number(a.has_studio_adv),
        );
        set({ nativeDevices: merged });
      } catch (err) {
        set({ error: describeError(err) });
      } finally {
        set({ scanning: false });
      }
    },

    connectNative: async (deviceId) => {
      if (get().status === "connecting") return;
      set({ status: "connecting", error: null, transport: "ble" });
      try {
        const tC = performance.now();
        const transport = await connectTauriBle(deviceId);
        // eslint-disable-next-line no-console
        console.log(
          `[zmkay] ble connect+subscribe handshake: ${Math.round(performance.now() - tC)}ms`,
        );
        const conn = create_rpc_connection(transport, {
          signal: transport.abortController.signal,
        });
        await finishConnect(conn, `ble-${deviceId}`);
      } catch (err) {
        set({ status: "error", error: describeError(err), transport: null });
      }
    },

    disconnect: () => {
      const { conn } = get();
      conn?.request_response_readable.cancel().catch(() => {});
      set({
        conn: null,
        transport: null,
        status: "idle",
        error: null,
        deviceName: "",
        lockState: null,
        keymap: null,
        layouts: null,
        behaviors: new Map(),
        hasUnsaved: false,
        activeLayer: 0,
        quickBind: false,
        qbPosition: 0,
        cacheKey: null,
        allBehaviorsLoaded: false,
      });
    },

    setActiveLayer: (index) => set({ activeLayer: index }),

    startQuickBind: (from) =>
      set(
        from === null
          ? { quickBind: true, qbPosition: 0, activeLayer: 0 }
          : { quickBind: true, qbPosition: from },
      ),
    stopQuickBind: () => set({ quickBind: false }),
    setQbPosition: (index) => set({ qbPosition: index }),

    setBinding: async (layerId, keyPosition, binding) => {
      const { conn, keymap } = get();
      if (!conn || !keymap) return;
      await rpc.setLayerBinding(conn, layerId, keyPosition, binding);
      const layers = keymap.layers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              bindings: layer.bindings.map((b, i) =>
                i === keyPosition ? binding : b,
              ),
            }
          : layer,
      );
      set({ keymap: { ...keymap, layers }, hasUnsaved: true });
    },

    save: async () => {
      const { conn } = get();
      if (!conn) return;
      await rpc.saveChanges(conn);
      set({ hasUnsaved: false });
    },

    discard: async () => {
      const { conn } = get();
      if (!conn) return;
      await rpc.discardChanges(conn);
      const keymap = await rpc.getKeymap(conn);
      set({ keymap, hasUnsaved: false });
    },
  };
});

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// Reject with `message` if `promise` doesn't settle within `ms`.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
