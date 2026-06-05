import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { ComboForm } from "./ComboForm";
import { HoldTapForm } from "./HoldTapForm";
import { useStore } from "../state/store";
import { loadConfigDir } from "../state/device-storage";
import { readKeymap, writeKeymap } from "../transport/config";
import { parseKeymap } from "../keymap-model/parse";
import { addCombo, addHoldTap, serialize } from "../keymap-model/emit";
import type { KeymapDocument } from "../keymap-model/types";

type Kind = "combo" | "behavior";

// Author the source-channel constructs the live Studio channel can't touch —
// combos and custom hold-tap behaviors. One editor at a time (segmented toggle).
// Saving splices into corne.keymap and writes it back; the config-folder watcher
// then rebuilds both halves automatically.
export function BehaviorsDialog({ onClose }: { onClose: () => void }) {
  const cacheKey = useStore((s) => s.cacheKey);
  const configDir = loadConfigDir(cacheKey);
  const [doc, setDoc] = useState<KeymapDocument | null>(null);
  const [kind, setKind] = useState<Kind>("combo");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!configDir) return;
    readKeymap(configDir)
      .then((src) => setDoc(parseKeymap(src)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [configDir]);

  async function commit(next: KeymapDocument) {
    setError("");
    try {
      await writeKeymap(configDir, serialize(next));
      setDoc(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal
      title="Behaviors & combos"
      onClose={onClose}
      footer={<>Saving writes corne.keymap and kicks off a build automatically.</>}
    >
      {!configDir ? (
        <p className="text-sm text-zmkay-muted">
          Choose your <span className="font-mono">config</span> folder in the Firmware
          dialog first, then come back here.
        </p>
      ) : !doc ? (
        <p className="text-sm text-zmkay-muted">Loading corne.keymap…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md border border-zmkay-bad/40 bg-zmkay-bad/10 text-zmkay-bad px-3 py-2 text-xs font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded-md border border-zmkay-good/40 bg-zmkay-good/10 text-zmkay-good px-3 py-2 text-xs">
              Saved — building…
            </div>
          )}

          <Existing doc={doc} />

          <div className="flex gap-1 p-1 rounded-lg bg-zmkay-panel border border-zmkay-edge text-sm w-fit">
            <Seg label="Combo" active={kind === "combo"} onClick={() => setKind("combo")} />
            <Seg label="Behavior" active={kind === "behavior"} onClick={() => setKind("behavior")} />
          </div>

          {kind === "combo" ? (
            <ComboForm onAdd={(c) => commit(addCombo(doc, c))} />
          ) : (
            <HoldTapForm onAdd={(b) => commit(addHoldTap(doc, b))} />
          )}
        </div>
      )}
    </Modal>
  );
}

function Existing({ doc }: { doc: KeymapDocument }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="text-zmkay-muted">
        <span className="text-zmkay-text">Combos:</span>{" "}
        {doc.combos.length === 0
          ? "none"
          : doc.combos.map((c) => `${c.name} (${c.keyPositions.join("+")})`).join(", ")}
      </div>
      <div className="text-zmkay-muted">
        <span className="text-zmkay-text">Behaviors:</span>{" "}
        {doc.definedBehaviors.length === 0 ? "none" : doc.definedBehaviors.join(", ")}
      </div>
    </div>
  );
}

function Seg({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1 rounded-md transition-colors",
        active ? "bg-zmkay-keyhi text-zmkay-text" : "text-zmkay-muted hover:text-zmkay-text",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
