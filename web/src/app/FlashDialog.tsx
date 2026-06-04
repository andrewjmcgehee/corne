import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import { useStore } from "../state/store";
import { useBuildStore } from "../state/build-store";
import { loadConfigDir, saveConfigDir } from "../state/device-storage";
import { flashUf2, onFlashStatus } from "../transport/flash";
import {
  bootstrapToolchain,
  buildFirmware,
  onBuildLog,
  onBuildStatus,
  toolchainStatus,
} from "../transport/build";

// One-click firmware update: build both Corne halves locally (app-owned Zephyr
// toolchain, provisioned on first run), then guide the user through flashing
// left then right over USB. No GitHub Actions, no manual west, no drag-and-drop.

type Phase =
  | "idle"
  | "provisioning"
  | "building"
  | "flash-left"
  | "flash-right"
  | "done"
  | "error";

export function FlashDialog({ onClose }: { onClose: () => void }) {
  const cacheKey = useStore((s) => s.cacheKey);
  const [phase, setPhase] = useState<Phase>("idle");
  const [configDir, setConfigDir] = useState(() => loadConfigDir(cacheKey));
  const [status, setStatus] = useState("");
  const [flashStatus, setFlashStatus] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const logBox = useRef<HTMLDivElement>(null);
  const unlisten = useRef<Array<() => void>>([]);

  useEffect(() => {
    onBuildStatus(setStatus).then((u) => unlisten.current.push(u));
    onBuildLog((line) =>
      setLog((prev) => [...prev.slice(-300), line]),
    ).then((u) => unlisten.current.push(u));
    onFlashStatus(setFlashStatus).then((u) => unlisten.current.push(u));
    return () => unlisten.current.forEach((u) => u());
  }, []);

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [log]);

  async function chooseFolder() {
    const sel = await open({ directory: true, title: "Select your config/ folder" });
    if (typeof sel === "string") {
      setConfigDir(sel);
      saveConfigDir(cacheKey, sel);
      // Auto-build on changes to this folder from now on.
      void useBuildStore.getState().watch(sel);
    }
  }

  // The whole pipeline. Each step advances `phase`; flashUf2 polls for the
  // bootloader volume, so the user just plugs in + double-taps reset when asked.
  async function run() {
    if (!configDir) return;
    setError("");
    setLog([]);
    try {
      const tc = await toolchainStatus();
      if (!tc.provisioned) {
        setPhase("provisioning");
        await bootstrapToolchain();
      }

      setPhase("building");
      const built = await buildFirmware(configDir);

      setPhase("flash-left");
      setFlashStatus("");
      await flashUf2(built.left, 180);

      setPhase("flash-right");
      setFlashStatus("");
      await flashUf2(built.right, 180);

      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  const busy =
    phase === "provisioning" ||
    phase === "building" ||
    phase === "flash-left" ||
    phase === "flash-right";

  return (
    <Modal title="Update firmware" onClose={busy ? () => {} : onClose} footer={<Footer phase={phase} />}>
      <div className="flex flex-col gap-3">
        <Steps phase={phase} />

        {(phase === "idle" || phase === "error" || phase === "done") && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void chooseFolder()}
              className="shrink-0 px-3 py-2 rounded-lg text-sm bg-zmkay-panel border border-zmkay-edge text-zmkay-text hover:bg-zmkay-keyhi"
            >
              {configDir ? "Change config…" : "Choose config folder…"}
            </button>
            <span className="text-xs text-zmkay-muted font-mono truncate" title={configDir}>
              {configDir || "no config folder selected"}
            </span>
          </div>
        )}

        {status && busy && phase !== "flash-left" && phase !== "flash-right" && (
          <div className="flex items-center gap-2 text-sm text-zmkay-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-zmkay-good animate-pulse" />
            {status}
          </div>
        )}

        {(phase === "provisioning" || phase === "building") && log.length > 0 && (
          <div
            ref={logBox}
            className="h-40 overflow-auto rounded-md bg-black/40 border border-zmkay-edge p-2 font-mono text-[11px] leading-relaxed text-zmkay-muted whitespace-pre-wrap"
          >
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}

        {(phase === "flash-left" || phase === "flash-right") && (
          <FlashStep
            half={phase === "flash-left" ? "left" : "right"}
            flashStatus={flashStatus}
          />
        )}

        {phase === "done" && (
          <div className="rounded-md border border-zmkay-good/40 bg-zmkay-good/10 text-zmkay-good px-3 py-2 text-sm">
            Both halves flashed. Your Corne is running the new firmware.
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-md border border-zmkay-bad/40 bg-zmkay-bad/10 text-zmkay-bad px-3 py-2 text-sm whitespace-pre-wrap max-h-40 overflow-auto font-mono text-xs">
            {error}
          </div>
        )}

        {(phase === "idle" || phase === "error") && (
          <button
            type="button"
            disabled={!configDir}
            onClick={() => void run()}
            className="w-full px-3 py-2 rounded-lg text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-50"
          >
            {phase === "error" ? "Try again" : "Build & flash both halves"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function FlashStep({
  half,
  flashStatus,
}: {
  half: "left" | "right";
  flashStatus: string;
}) {
  return (
    <div className="rounded-lg border border-zmkay-accent/40 bg-zmkay-accent/5 p-3 flex flex-col gap-2">
      <div className="text-sm font-medium text-zmkay-text">
        Flashing the {half} half
      </div>
      <ol className="text-sm text-zmkay-muted list-decimal pl-5 space-y-0.5">
        <li>Plug the <b>{half}</b> half into USB.</li>
        <li>Double-tap the reset button (the disk appears).</li>
      </ol>
      <div className="flex items-center gap-2 text-sm text-zmkay-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-zmkay-good animate-pulse" />
        {flashStatus || "Waiting for the bootloader…"}
      </div>
    </div>
  );
}

const STEPS: Array<{ key: Phase; label: string }> = [
  { key: "building", label: "Build" },
  { key: "flash-left", label: "Flash left" },
  { key: "flash-right", label: "Flash right" },
  { key: "done", label: "Done" },
];

function Steps({ phase }: { phase: Phase }) {
  // Provisioning folds under "Build" visually (it only happens once).
  const order: Phase[] = ["building", "flash-left", "flash-right", "done"];
  const activeIdx =
    phase === "provisioning" ? 0 : order.indexOf(phase === "idle" ? "building" : phase);
  return (
    <div className="flex items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const done = activeIdx > i && phase !== "idle";
        const active = activeIdx === i && phase !== "idle";
        return (
          <div key={s.key} className="flex items-center gap-1">
            <span
              className={[
                "px-2 py-0.5 rounded-full border",
                done
                  ? "border-zmkay-good/50 text-zmkay-good bg-zmkay-good/10"
                  : active
                    ? "border-zmkay-accent/60 text-zmkay-text bg-zmkay-accent/15"
                    : "border-zmkay-edge text-zmkay-muted",
              ].join(" ")}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-zmkay-edge">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function Footer({ phase }: { phase: Phase }) {
  switch (phase) {
    case "provisioning":
      return <>First-time setup: downloading the build toolchain (~2-3 GB). This happens once.</>;
    case "building":
      return <>Compiling both halves locally — a minute or two.</>;
    case "flash-left":
    case "flash-right":
      return <>The firmware copies automatically once the bootloader disk appears.</>;
    case "done":
      return <>You can unplug the keyboard.</>;
    default:
      return <>Builds your current keymap into fresh firmware and flashes both halves over USB.</>;
  }
}
