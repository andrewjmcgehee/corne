import { useEffect, useMemo, useState } from "react";
import {
  searchKeys,
  keyByUsage,
  splitUsage,
  usageLabel,
  type KeyDef,
} from "../keymap-model/keycodes";

// Modifier chips — same bit layout as the rest of the app (top byte of a ZMK
// keycode) and as QuickBind's chord folding. Left-side mods; ZMK collapses
// L/R for implicit modifiers anyway (e.g. LA() vs RA() both AltGr a keycode).
const MOD_CHIPS: Array<[string, number, string]> = [
  ["⌃", 0x01, "Ctrl"],
  ["⇧", 0x02, "Shift"],
  ["⌥", 0x04, "Alt"],
  ["⌘", 0x08, "Cmd"],
];

// Search-driven keycode chooser with modifier toggles. Used for &kp and for any
// behavior parameter that takes a HID usage. The picked base plus the toggled
// modifiers fold into one usage (e.g. Alt + BSPC -> LA(BSPC)), so modified
// keycodes are reachable here, not just in QuickBind.
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
  // The chosen base usage (page+id, no mods) and the active modifier byte. Seeded
  // from `value` and kept in sync if the parent changes it.
  const [base, setBase] = useState(() => (value !== undefined ? splitUsage(value).base : 0));
  const [mods, setMods] = useState(() => (value !== undefined ? splitUsage(value).mods : 0));

  useEffect(() => {
    if (value !== undefined) {
      const s = splitUsage(value);
      setBase(s.base);
      setMods(s.mods);
    }
  }, [value]);

  const results = useMemo(
    () => (query.trim() ? searchKeys(query).slice(0, 8) : []),
    [query],
  );

  const emit = (b: number, m: number) => onPick(((b & 0x00ffffff) | ((m & 0xff) << 24)) >>> 0);

  const pick = (def: KeyDef) => {
    const s = splitUsage(def.usage);
    // Keep any modifiers the user already toggled, and add the def's own (e.g. a
    // shifted symbol like * carries Shift).
    const m = mods | s.mods;
    setBase(s.base);
    setMods(m);
    emit(s.base, m);
    setQuery("");
  };

  const toggleMod = (bit: number) => {
    const m = mods ^ bit;
    setMods(m);
    if (base !== 0) emit(base, m); // only meaningful once a base key is chosen
  };

  const combined = ((base & 0x00ffffff) | ((mods & 0xff) << 24)) >>> 0;

  return (
    <div>
      {base !== 0 && (
        <div className="text-xs text-zmkay-muted mb-1">
          current:{" "}
          <span className="font-mono text-zmkay-text">{usageLabel(combined)}</span>
          {keyByUsage(combined) && ` (${keyByUsage(combined)!.name})`}
        </div>
      )}

      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs text-zmkay-muted mr-1">mods</span>
        {MOD_CHIPS.map(([glyph, bit, title]) => {
          const on = (mods & bit) !== 0;
          return (
            <button
              key={bit}
              type="button"
              title={title}
              onClick={() => toggleMod(bit)}
              className={[
                "w-7 h-7 rounded-md border text-sm",
                on
                  ? "border-zmkay-accent bg-zmkay-accent/25 text-zmkay-text"
                  : "border-zmkay-edge bg-zmkay-panel text-zmkay-muted hover:text-zmkay-text",
              ].join(" ")}
            >
              {glyph}
            </button>
          );
        })}
      </div>

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
