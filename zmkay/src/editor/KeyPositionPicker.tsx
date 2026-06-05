import { useMemo } from "react";
import { useStore } from "../state/store";
import { layoutGeometry, GAP_PX } from "./geometry";

// Pick key positions by clicking the physical board (used for combos). Reuses
// the live physical layout from the connected keyboard; clicking toggles a key
// in/out of the ordered selection. Falls back to a hint when not connected.
export function KeyPositionPicker({
  selected,
  onChange,
  scale = 0.62,
}: {
  selected: number[];
  onChange: (positions: number[]) => void;
  scale?: number;
}) {
  const layouts = useStore((s) => s.layouts);
  const layout = layouts?.layouts[layouts.activeLayoutIndex];
  const geometry = useMemo(() => (layout ? layoutGeometry(layout.keys) : null), [layout]);

  if (!geometry || !layout) {
    return (
      <div className="rounded-md border border-zmkay-edge bg-zmkay-panel2 px-3 py-2 text-xs text-zmkay-muted">
        Connect your keyboard to pick positions visually — or type them below.
      </div>
    );
  }

  const toggle = (index: number) => {
    onChange(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]);
  };

  return (
    <div
      className="relative mx-auto"
      style={{ width: geometry.width * scale, height: geometry.height * scale }}
    >
      <div
        className="relative"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: geometry.width, height: geometry.height }}
      >
        {geometry.keys.map((k) => {
          const on = selected.includes(k.index);
          const order = selected.indexOf(k.index) + 1;
          return (
            <button
              key={k.index}
              type="button"
              onClick={() => toggle(k.index)}
              className={[
                "absolute flex items-center justify-center rounded-md border text-xs select-none transition-colors",
                on
                  ? "border-zmkay-accent bg-zmkay-accent/30 text-zmkay-text ring-1 ring-zmkay-accent"
                  : "border-zmkay-edge bg-zmkay-key text-zmkay-muted hover:bg-zmkay-keyhi",
              ].join(" ")}
              style={{
                left: k.left + GAP_PX / 2,
                top: k.top + GAP_PX / 2,
                width: k.width - GAP_PX,
                height: k.height - GAP_PX,
                transform: k.rotation ? `rotate(${k.rotation}deg)` : undefined,
                transformOrigin: k.rotation ? `${k.originX}px ${k.originY}px` : undefined,
              }}
            >
              {on ? <span className="font-semibold text-sm">{order}</span> : k.index}
            </button>
          );
        })}
      </div>
    </div>
  );
}
