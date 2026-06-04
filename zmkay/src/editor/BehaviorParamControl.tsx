import type { BehaviorParameterValueDescription } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { paramKind } from "../keymap-model/describe";
import { KeycodePicker } from "./KeycodePicker";

// One behavior parameter, rendered per its metadata value-type: a keycode picker
// (hid_usage), a layer dropdown (layer_id), a number (range), or nothing
// (nil/constant). Calls onChange with the numeric param value.
export function BehaviorParamControl({
  desc,
  layers,
  value,
  onChange,
}: {
  desc: BehaviorParameterValueDescription;
  layers: Layer[];
  value: number;
  onChange: (n: number) => void;
}) {
  const kind = paramKind(desc);
  const label = desc.name || kindLabel(kind);

  if (kind === "nil") return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zmkay-muted">{label}</span>
      {kind === "hid" && <KeycodePicker value={value} onPick={onChange} />}

      {kind === "layer" && (
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm bg-zmkay-panel border border-zmkay-edge focus:border-zmkay-accent outline-none"
        >
          {layers.map((l, i) => (
            <option key={l.id} value={i}>
              {i} · {l.name || `layer ${i}`}
            </option>
          ))}
        </select>
      )}

      {(kind === "range" || kind === "unknown") && (
        <input
          type="number"
          value={value}
          min={desc.range?.min}
          max={desc.range?.max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm bg-zmkay-panel border border-zmkay-edge focus:border-zmkay-accent outline-none"
        />
      )}

      {kind === "const" && (
        <span className="text-sm font-mono text-zmkay-muted">= {value}</span>
      )}
    </div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "hid":
      return "keycode";
    case "layer":
      return "layer";
    case "range":
      return "value";
    default:
      return "param";
  }
}
