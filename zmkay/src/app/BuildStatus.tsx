import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useBuildStore } from "../state/build-store";
import type { RunRecord, RunStatus } from "../transport/build";

// Header chip reflecting the auto-build pipeline, plus a drawer to view the last
// three runs' logs (left/right) for debugging. The build itself is driven by the
// config-folder watcher in build.rs; this is the window into it.
export function BuildStatus() {
  const status = useBuildStore((s) => s.status);
  const runs = useBuildStore((s) => s.runs);
  const cancel = useBuildStore((s) => s.cancel);
  const init = useBuildStore((s) => s.init);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === "idle" && runs.length === 0) return null;

  const meta = STATUS_META[status === "idle" ? "canceled" : status];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text"
        title="Build history"
      >
        <span
          className={`w-2 h-2 rounded-full ${meta.dot} ${status === "building" ? "animate-pulse" : ""}`}
        />
        {meta.label}
      </button>
      {open && (
        <BuildDrawer onClose={() => setOpen(false)} runs={runs} onCancel={cancel} live={status === "building"} />
      )}
    </>
  );
}

const STATUS_META: Record<RunStatus, { label: string; dot: string }> = {
  building: { label: "Building…", dot: "bg-zmkay-warn" },
  success: { label: "Build ready", dot: "bg-zmkay-good" },
  error: { label: "Build failed", dot: "bg-zmkay-bad" },
  canceled: { label: "No build", dot: "bg-zmkay-edge" },
};

function BuildDrawer({
  onClose,
  runs,
  onCancel,
  live,
}: {
  onClose: () => void;
  runs: RunRecord[];
  onCancel: () => Promise<void>;
  live: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(runs[0]?.id ?? null);
  const [half, setHalf] = useState<"left" | "right">("left");
  const run = runs.find((r) => r.id === selectedId) ?? runs[0] ?? null;
  const log = run ? (half === "left" ? run.left_log : run.right_log) : [];

  return (
    <Modal
      title="Build history"
      onClose={onClose}
      footer={<>The latest three builds, with each half's log for debugging.</>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={[
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border",
                r.id === run?.id
                  ? "border-zmkay-accent/60 bg-zmkay-accent/15 text-zmkay-text"
                  : "border-zmkay-edge text-zmkay-muted hover:text-zmkay-text",
              ].join(" ")}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[r.status].dot}`} />
              #{r.id}
              <span className="text-zmkay-muted">{relTime(r.started_ms)}</span>
            </button>
          ))}
          {live && (
            <button
              type="button"
              onClick={() => void onCancel()}
              className="ml-auto px-2 py-1 rounded-md text-xs bg-zmkay-bad/15 border border-zmkay-bad/40 text-zmkay-bad hover:bg-zmkay-bad/25"
            >
              Cancel build
            </button>
          )}
        </div>

        {run?.error && (
          <div className="rounded-md border border-zmkay-bad/40 bg-zmkay-bad/10 text-zmkay-bad px-3 py-2 text-xs font-mono whitespace-pre-wrap max-h-28 overflow-auto">
            {run.error}
          </div>
        )}

        <div className="flex gap-1 p-1 rounded-lg bg-zmkay-panel border border-zmkay-edge text-xs w-fit">
          {(["left", "right"] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHalf(h)}
              className={[
                "px-3 py-1 rounded-md capitalize",
                half === h ? "bg-zmkay-keyhi text-zmkay-text" : "text-zmkay-muted hover:text-zmkay-text",
              ].join(" ")}
            >
              {h}
            </button>
          ))}
        </div>

        <div className="h-72 overflow-auto rounded-md bg-black/40 border border-zmkay-edge p-2 font-mono text-[11px] leading-relaxed text-zmkay-muted whitespace-pre-wrap">
          {log.length === 0 ? (
            <span className="text-zmkay-muted/60">no output</span>
          ) : (
            log.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </div>
    </Modal>
  );
}

function relTime(ms: number): string {
  if (!ms) return "";
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
