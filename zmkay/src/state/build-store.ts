import { create } from "zustand";
import {
  buildHistory,
  cancelBuild,
  onBuildRun,
  startBuild,
  unwatchConfig,
  watchConfig,
  type RunRecord,
  type RunStatus,
} from "../transport/build";

// Tracks the managed auto-build pipeline: the last 3 runs (with per-half logs)
// and a derived current status for the header chip. Backed by build.rs, which
// owns the actual build/cancel/history; this store mirrors it for the UI.

type BuildState = {
  runs: RunRecord[];
  status: RunStatus | "idle";
  watching: string | null; // configDir currently watched
  initialized: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  build: (configDir: string) => Promise<void>;
  cancel: () => Promise<void>;
  watch: (configDir: string) => Promise<void>;
  unwatch: () => Promise<void>;
};

export const useBuildStore = create<BuildState>((set, get) => ({
  runs: [],
  status: "idle",
  watching: null,
  initialized: false,

  // Listen for run lifecycle events and pull the full history (incl. logs) on
  // each, so the drawer always reflects the latest. Called once at startup.
  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    await onBuildRun(() => void get().refresh());
    await get().refresh();
  },

  refresh: async () => {
    try {
      const runs = await buildHistory();
      set({ runs, status: runs[0]?.status ?? "idle" });
    } catch {
      // best-effort; build backend only exists in the native app
    }
  },

  build: async (configDir) => {
    await startBuild(configDir);
    await get().refresh();
  },

  cancel: async () => {
    await cancelBuild();
    await get().refresh();
  },

  watch: async (configDir) => {
    if (get().watching === configDir) return;
    await watchConfig(configDir);
    set({ watching: configDir });
  },

  unwatch: async () => {
    await unwatchConfig();
    set({ watching: null });
  },
}));
