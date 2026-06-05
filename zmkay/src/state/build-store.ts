import { create } from "zustand";
import {
  buildHistory,
  cancelBuild,
  onBuildLog,
  onBuildRun,
  startBuild,
  unwatchConfig,
  watchConfig,
  type RunRecord,
  type RunStatus,
} from "../transport/build";

// Tracks the managed auto-build pipeline: recent runs (with per-half logs) and a
// derived current status for the header pill. Backed by build.rs, which owns the
// actual build/cancel/history. Run lifecycle (build://run) reconciles the whole
// history; individual log lines (build://log) stream in live between those.

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

  // Pull the full history on each run lifecycle event (start/finish/cancel) and
  // stream individual log lines into the current run in between, so logs appear
  // as they're produced rather than all at once. Called once at startup.
  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    await onBuildRun(() => void get().refresh());
    await onBuildLog((line) => {
      // Route by the "[left] "/"[right] " prefix into the building run's log.
      let half: "left_log" | "right_log";
      let text: string;
      if (line.startsWith("[left] ")) {
        half = "left_log";
        text = line.slice("[left] ".length);
      } else if (line.startsWith("[right] ")) {
        half = "right_log";
        text = line.slice("[right] ".length);
      } else {
        return; // untagged (e.g. toolchain bootstrap) — not a per-half build line
      }
      set((s) => {
        const cur = s.runs[0];
        if (!cur || cur.status !== "building") return {};
        const updated = { ...cur, [half]: [...cur[half], text] };
        return { runs: [updated, ...s.runs.slice(1)] };
      });
    });
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
