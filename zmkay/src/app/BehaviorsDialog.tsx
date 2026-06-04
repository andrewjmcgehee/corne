import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useStore } from "../state/store";
import { loadConfigDir } from "../state/device-storage";
import { readKeymap, writeKeymap } from "../transport/config";
import { parseKeymap } from "../keymap-model/parse";
import {
  addCombo,
  addHoldTap,
  serialize,
  type HoldTapFlavor,
  type NewCombo,
  type NewHoldTap,
} from "../keymap-model/emit";
import type { KeymapDocument } from "../keymap-model/types";

// Author the source-channel constructs the live Studio channel can't touch —
// combos and custom hold-tap behaviors. Edits splice into corne.keymap and write
// it back; the config-folder watcher then rebuilds both halves automatically.
export function BehaviorsDialog({ onClose }: { onClose: () => void }) {
  const cacheKey = useStore((s) => s.cacheKey);
  const configDir = loadConfigDir(cacheKey);
  const [doc, setDoc] = useState<KeymapDocument | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!configDir) return;
    try {
      setDoc(parseKeymap(await readKeymap(configDir)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="flex flex-col gap-5">
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
          <ComboForm onAdd={(c) => commit(addCombo(doc, c))} />
          <HoldTapForm onAdd={(b) => commit(addHoldTap(doc, b))} />
        </div>
      )}
    </Modal>
  );
}

function Existing({ doc }: { doc: KeymapDocument }) {
  return (
    <div className="flex flex-col gap-2">
      <Heading>Existing</Heading>
      <div className="text-xs text-zmkay-muted">
        <span className="text-zmkay-text">Combos:</span>{" "}
        {doc.combos.length === 0
          ? "none"
          : doc.combos.map((c) => `${c.name} (${c.keyPositions.join("+")})`).join(", ")}
      </div>
      <div className="text-xs text-zmkay-muted">
        <span className="text-zmkay-text">Behaviors:</span>{" "}
        {doc.definedBehaviors.length === 0 ? "none" : doc.definedBehaviors.join(", ")}
      </div>
    </div>
  );
}

function ComboForm({ onAdd }: { onAdd: (c: NewCombo) => void }) {
  const [name, setName] = useState("");
  const [positions, setPositions] = useState("");
  const [binding, setBinding] = useState("&kp ");

  const pos = positions.trim().split(/\s+/).filter(Boolean).map(Number);
  const valid =
    /^[a-z_][a-z0-9_]*$/i.test(name) && pos.length >= 2 && pos.every((n) => Number.isInteger(n)) && binding.trim().startsWith("&");

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) {
          onAdd({ name: name.trim(), keyPositions: pos, binding: binding.trim() });
          setName("");
          setPositions("");
          setBinding("&kp ");
        }
      }}
    >
      <Heading>Add a combo</Heading>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="esc_combo" />
      </Field>
      <Field label="Key positions">
        <input
          className={inputCls}
          value={positions}
          onChange={(e) => setPositions(e.target.value)}
          placeholder="24 35  (two or more, space-separated)"
        />
      </Field>
      <Field label="Binding">
        <input className={inputCls} value={binding} onChange={(e) => setBinding(e.target.value)} placeholder="&kp ESC" />
      </Field>
      <SubmitRow disabled={!valid} label="Add combo" />
    </form>
  );
}

const FLAVORS: HoldTapFlavor[] = ["tap-preferred", "balanced", "hold-preferred", "tap-unless-interrupted"];

function HoldTapForm({ onAdd }: { onAdd: (b: NewHoldTap) => void }) {
  const [name, setName] = useState("");
  const [flavor, setFlavor] = useState<HoldTapFlavor>("balanced");
  const [term, setTerm] = useState("175");
  const [quick, setQuick] = useState("150");
  const [hold, setHold] = useState("mo");
  const [tap, setTap] = useState("kp");

  const valid = /^[a-z_][a-z0-9_]*$/i.test(name) && !!hold.trim() && !!tap.trim();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) {
          onAdd({
            name: name.trim(),
            flavor,
            tappingTermMs: Number(term) || 175,
            quickTapMs: Number(quick) || 150,
            bindings: [hold.trim().replace(/^&/, ""), tap.trim().replace(/^&/, "")],
          });
          setName("");
        }
      }}
    >
      <Heading>Add a hold-tap behavior</Heading>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="my_ht" />
      </Field>
      <Field label="Flavor">
        <select className={inputCls} value={flavor} onChange={(e) => setFlavor(e.target.value as HoldTapFlavor)}>
          {FLAVORS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tapping term (ms)">
          <input className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Quick tap (ms)">
          <input className={inputCls} value={quick} onChange={(e) => setQuick(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Hold behavior">
          <input className={inputCls} value={hold} onChange={(e) => setHold(e.target.value)} placeholder="mo" />
        </Field>
        <Field label="Tap behavior">
          <input className={inputCls} value={tap} onChange={(e) => setTap(e.target.value)} placeholder="kp" />
        </Field>
      </div>
      <SubmitRow disabled={!valid} label="Add behavior" />
    </form>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md text-sm bg-zmkay-panel border border-zmkay-edge text-zmkay-text font-mono focus:outline-none focus:border-zmkay-accent/60";

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wide text-zmkay-muted">{children}</h3>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zmkay-muted">{label}</span>
      {children}
    </label>
  );
}

function SubmitRow({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="self-start mt-1 px-3 py-1.5 rounded-md text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
