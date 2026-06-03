import { useMemo, useState } from "react";
import { searchKeys, keyByUsage, type KeyDef } from "../keymap-model/keycodes";
import { usageLabel } from "../keymap-model/keycodes";

// Search-driven keycode chooser. Used for &kp and for any behavior parameter
// that takes a HID usage. Calls onPick with the chosen keycode's full usage.
export function KeycodePicker({
  value,
  onPick,
  autoFocus,
  placeholder = "search a keycode (esc, bspc, f5, *)",
}: {
  value?: number;
  onPick: (usage: number) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const results = useMemo(
    () => (query.trim() ? searchKeys(query).slice(0, 8) : []),
    [query],
  );

  const pick = (def: KeyDef) => {
    onPick(def.usage);
    setQuery("");
  };

  return (
    <div>
      {value !== undefined && !query && (
        <div className="text-xs text-zmkay-muted mb-1">
          current:{" "}
          <span className="font-mono text-zmkay-text">{usageLabel(value)}</span>
          {keyByUsage(value) && ` (${keyByUsage(value)!.name})`}
        </div>
      )}
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[highlight]);
          }
        }}
        className="w-full px-3 py-2 rounded-lg text-sm bg-zmkay-panel border border-zmkay-edge focus:border-zmkay-accent outline-none"
      />
      {results.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 max-h-48 overflow-auto">
          {results.map((def, i) => (
            <li key={def.name}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(def)}
                className={[
                  "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm text-left",
                  i === highlight ? "bg-zmkay-keyhi" : "hover:bg-zmkay-panel",
                ].join(" ")}
              >
                <span className="font-mono">{def.label}</span>
                <span className="text-xs text-zmkay-muted">{def.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
