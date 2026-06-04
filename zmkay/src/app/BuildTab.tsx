import { useEffect, useState } from "react";
import { useBuildStore } from "../state/build-store";
import type { RunRecord, RunStatus } from "../transport/build";

// The Build tab: split log view (left half | right half) with a right-hand
// sidebar of recent builds. Mirrors the BuildManager history in build.rs.
export function BuildTab() {
  const runs = useBuildStore((s) => s.runs);
  const cancel = useBuildStore((s) => s.cancel);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Follow the newest run unless the user has pinned an older one that still exists.
  useEffect(() => {
    setSelectedId((cur) => (cur != null && runs.some((r) => r.id === cur) ? cur : (runs[0]?.id ?? null)));
  }, [runs]);

  const run = runs.find((r) => r.id === selectedId) ?? runs[0] ?? null;

  if (runs.length === 0) {
    return (
      <div className="grid place-items-center h-full text-sm text-zmkay-muted">
        No builds yet — edit your config and a build kicks off automatically.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* logs */}
      <div className="flex-1 flex flex-col min-w-0 gap-3">
        <RunHeader run={run} onCancel={cancel} />
        <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
          <LogPane title="Left half" lines={run?.left_log ?? []} />
          <LogPane title="Right half" lines={run?.right_log ?? []} />
        </div>
      </div>

      {/* history sidebar */}
      <aside className="w-56 shrink-0 flex flex-col gap-1.5 border-l border-zmkay-edge pl-4 overflow-auto">
        <span className="text-xs text-zmkay-muted mb-1">Recent builds</span>
        {runs.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelectedId(r.id)}
            className={[
              "flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs border",
              r.id === run?.id
                ? "border-zmkay-accent/60 bg-zmkay-accent/15 text-zmkay-text"
                : "border-zmkay-edge text-zmkay-muted hover:text-zmkay-text",
            ].join(" ")}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[r.status]} ${r.status === "building" ? "animate-pulse" : ""}`} />
            <span className="flex flex-col min-w-0">
              <span className="truncate">Build #{r.id}</span>
              <span className="text-zmkay-muted/70">{LABEL[r.status]} · {relTime(r.started_ms)}</span>
            </span>
          </button>
        ))}
      </aside>
    </div>
  );
}

function RunHeader({ run, onCancel }: { run: RunRecord | null; onCancel: () => Promise<void> }) {
  if (!run) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-sm">
        <span className={`w-2.5 h-2.5 rounded-full ${DOT[run.status]} ${run.status === "building" ? "animate-pulse" : ""}`} />
        Build #{run.id}
        <span className="text-zmkay-muted text-xs">{LABEL[run.status]}</span>
      </span>
      {run.status === "building" && (
        <button
          type="button"
          onClick={() => void onCancel()}
          className="ml-auto px-2.5 py-1 rounded-md text-xs bg-zmkay-bad/15 border border-zmkay-bad/40 text-zmkay-bad hover:bg-zmkay-bad/25"
        >
          Cancel build
        </button>
      )}
      {run.error && (
        <span className="ml-auto truncate text-xs text-zmkay-bad" title={run.error}>
          {firstLine(run.error)}
        </span>
      )}
    </div>
  );
}

function LogPane({ title, lines }: { title: string; lines: string[] }) {
  // Pin to the bottom as new lines arrive.
  const ref = (el: HTMLDivElement | null) => {
    if (el) el.scrollTop = el.scrollHeight;
  };
  return (
    <div className="flex flex-col min-h-0 rounded-md border border-zmkay-edge overflow-hidden">
      <div className="px-3 py-1.5 text-xs text-zmkay-muted border-b border-zmkay-edge bg-zmkay-panel">
        {title}
      </div>
      <div
        ref={ref}
        className="flex-1 overflow-auto bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-zmkay-muted whitespace-pre-wrap"
      >
        {lines.length === 0 ? (
          <span className="text-zmkay-muted/50">no output</span>
        ) : (
          lines.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </div>
  );
}

const DOT: Record<RunStatus, string> = {
  building: "bg-zmkay-warn",
  success: "bg-zmkay-good",
  error: "bg-zmkay-bad",
  canceled: "bg-zmkay-edge",
};
const LABEL: Record<RunStatus, string> = {
  building: "building…",
  success: "built",
  error: "failed",
  canceled: "canceled",
};

function firstLine(s: string): string {
  return s.split("\n")[0];
}

function relTime(ms: number): string {
  if (!ms) return "";
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
