import { useState } from "react";
import { KeyPositionPicker } from "../editor/KeyPositionPicker";
import { Field, SubmitRow, inputCls } from "./form-bits";
import type { NewCombo } from "../keymap-model/emit";

// Define a combo: click the keys on the board (or type positions), give it a
// binding. The ordered click selection becomes key-positions.
export function ComboForm({ onAdd }: { onAdd: (c: NewCombo) => void }) {
  const [name, setName] = useState("");
  const [positions, setPositions] = useState<number[]>([]);
  const [binding, setBinding] = useState("&kp ");

  const valid =
    /^[a-z_][a-z0-9_]*$/i.test(name) && positions.length >= 2 && binding.trim().startsWith("&");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({ name: name.trim(), keyPositions: positions, binding: binding.trim() });
        setName("");
        setPositions([]);
        setBinding("&kp ");
      }}
    >
      <Field label="Key positions — click the keys to combo">
        <KeyPositionPicker selected={positions} onChange={setPositions} />
      </Field>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-zmkay-muted">Selected:</span>
        <span className="font-mono text-zmkay-text">
          {positions.length ? positions.join(" + ") : "none"}
        </span>
        {positions.length > 0 && (
          <button
            type="button"
            onClick={() => setPositions([])}
            className="ml-auto text-zmkay-muted hover:text-zmkay-text"
          >
            clear
          </button>
        )}
      </div>

      {/* Manual fallback / fine-tuning, kept in sync with the visual picker. */}
      <Field label="…or type positions (space-separated)">
        <input
          className={inputCls}
          value={positions.join(" ")}
          onChange={(e) =>
            setPositions(
              e.target.value.trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n)),
            )
          }
          placeholder="24 35"
        />
      </Field>

      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="esc_combo" />
      </Field>
      <Field label="Binding">
        <input className={inputCls} value={binding} onChange={(e) => setBinding(e.target.value)} placeholder="&kp ESC" />
      </Field>
      <SubmitRow disabled={!valid} label="Add combo" />
    </form>
  );
}
