import { useEffect } from "react";
import { useBuildStore } from "../state/build-store";
import type { RunStatus } from "../transport/build";

// Prominent build-status pill in the header. Clicking it jumps to the Build tab
// (logs + history). The actual build is driven by the config-folder watcher.
export function BuildStatus({ onOpen }: { onOpen: () => void }) {
  const status = useBuildStore((s) => s.status);
  const runs = useBuildStore((s) => s.runs);
  const init = useBuildStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === "idle" && runs.length === 0) return null;

  const meta = STATUS_META[status === "idle" ? "canceled" : status];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border ${meta.cls}`}
      title="Open the Build tab"
    >
      <span
        className={`w-2 h-2 rounded-full ${meta.dot} ${status === "building" ? "animate-pulse" : ""}`}
      />
      {meta.label}
    </button>
  );
}

const STATUS_META: Record<RunStatus, { label: string; dot: string; cls: string }> = {
  building: {
    label: "Building…",
    dot: "bg-zmkay-warn",
    cls: "bg-zmkay-warn/15 border-zmkay-warn/40 text-zmkay-warn",
  },
  success: {
    label: "Built",
    dot: "bg-zmkay-good",
    cls: "bg-zmkay-good/15 border-zmkay-good/40 text-zmkay-good",
  },
  error: {
    label: "Build failed",
    dot: "bg-zmkay-bad",
    cls: "bg-zmkay-bad/15 border-zmkay-bad/40 text-zmkay-bad",
  },
  canceled: {
    label: "Build canceled",
    dot: "bg-zmkay-edge",
    cls: "bg-zmkay-panel2 border-zmkay-edge text-zmkay-muted",
  },
};
