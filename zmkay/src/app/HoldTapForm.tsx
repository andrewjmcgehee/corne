import { useState } from "react";
import { Field, SubmitRow, inputCls } from "./form-bits";
import type { HoldTapFlavor, NewHoldTap } from "../keymap-model/emit";

const FLAVORS: HoldTapFlavor[] = [
  "tap-preferred",
  "balanced",
  "hold-preferred",
  "tap-unless-interrupted",
];

// Define a custom hold-tap behavior (the &hm / &lt_bal kind): a flavor, timings,
// and the two behaviors it wraps (hold vs tap).
export function HoldTapForm({ onAdd }: { onAdd: (b: NewHoldTap) => void }) {
  const [name, setName] = useState("");
  const [flavor, setFlavor] = useState<HoldTapFlavor>("balanced");
  const [term, setTerm] = useState("175");
  const [quick, setQuick] = useState("150");
  const [hold, setHold] = useState("mo");
  const [tap, setTap] = useState("kp");

  const valid = /^[a-z_][a-z0-9_]*$/i.test(name) && !!hold.trim() && !!tap.trim();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({
          name: name.trim(),
          flavor,
          tappingTermMs: Number(term) || 175,
          quickTapMs: Number(quick) || 150,
          bindings: [hold.trim().replace(/^&/, ""), tap.trim().replace(/^&/, "")],
        });
        setName("");
      }}
    >
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
