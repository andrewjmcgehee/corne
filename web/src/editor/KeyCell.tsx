import type { PlacedKey } from "./geometry";
import { GAP_PX } from "./geometry";
import type { BindingLabel } from "../keymap-model/describe";

interface KeyCellProps {
  placed: PlacedKey;
  label: BindingLabel;
  selected: boolean;
  onSelect: (index: number) => void;
}

// A single physical key, absolutely positioned within the board. Read-only for
// now (selection only); QuickBind wires editing in the next milestone.
export function KeyCell({ placed, label, selected, onSelect }: KeyCellProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(placed.index)}
      title={label.title}
      className={[
        "absolute flex flex-col items-center justify-center rounded-md border text-center select-none transition-colors",
        selected
          ? "border-zmkay-accent bg-zmkay-keyhi ring-1 ring-zmkay-accent"
          : "border-zmkay-edge bg-zmkay-key hover:bg-zmkay-keyhi",
      ].join(" ")}
      style={{
        left: placed.left + GAP_PX / 2,
        top: placed.top + GAP_PX / 2,
        width: placed.width - GAP_PX,
        height: placed.height - GAP_PX,
        transform: placed.rotation
          ? `rotate(${placed.rotation}deg)`
          : undefined,
        transformOrigin: placed.rotation
          ? `${placed.originX}px ${placed.originY}px`
          : undefined,
      }}
    >
      {label.badge && (
        <span className="text-[9px] leading-none text-zmkay-muted mb-0.5">
          {label.badge}
        </span>
      )}
      <span className="text-sm leading-none text-zmkay-text">{label.main}</span>
    </button>
  );
}
