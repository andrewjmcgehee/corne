import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { layoutGeometry } from "./geometry";
import { KeyCell } from "./KeyCell";
import { KeyEditor } from "./KeyEditor";
import { QuickBind } from "./QuickBind";
import { describeBinding } from "../keymap-model/describe";

// Renders the active physical layout for the active layer, with layer tabs and
// the QuickBind mode toggle. Reads everything from the store.
export function BoardView() {
  const keymap = useStore((s) => s.keymap);
  const layouts = useStore((s) => s.layouts);
  const behaviors = useStore((s) => s.behaviors);
  const activeLayer = useStore((s) => s.activeLayer);
  const setActiveLayer = useStore((s) => s.setActiveLayer);
  const quickBind = useStore((s) => s.quickBind);
  const qbPosition = useStore((s) => s.qbPosition);
  const startQuickBind = useStore((s) => s.startQuickBind);
  const setQbPosition = useStore((s) => s.setQbPosition);

  const [selected, setSelected] = useState<number | null>(null);

  const layout = layouts?.layouts[layouts.activeLayoutIndex];
  const geometry = useMemo(
    () => (layout ? layoutGeometry(layout.keys) : null),
    [layout],
  );

  if (!keymap || !geometry || !layout) {
    return <div className="text-sm text-zmkay-muted">No keymap loaded.</div>;
  }

  const layer = keymap.layers[activeLayer];
  // In QuickBind the highlighted key is the cursor; otherwise it's the clicked key.
  const highlighted = quickBind ? qbPosition : selected;

  const onKey = (index: number) => {
    if (quickBind) setQbPosition(index); // click to jump the cursor
    else setSelected(index);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {keymap.layers.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setActiveLayer(i)}
            className={[
              "px-3 py-1 rounded-md text-sm border transition-colors",
              i === activeLayer
                ? "border-zmkay-accent bg-zmkay-keyhi text-zmkay-text"
                : "border-zmkay-edge bg-zmkay-panel2 text-zmkay-muted hover:text-zmkay-text",
            ].join(" ")}
          >
            {l.name || `layer ${i}`}
          </button>
        ))}
        <div className="flex-1" />
        {!quickBind && (
          <button
            type="button"
            onClick={() => startQuickBind(selected)}
            title="Walk key-by-key: press the key(s) you want, release to bind, auto-advance"
            className="px-3 py-1 rounded-md text-sm border border-zmkay-accent/50 bg-zmkay-accent/20 text-zmkay-text hover:bg-zmkay-accent/30"
          >
            QuickBind
          </button>
        )}
      </div>

      <div
        className="relative mx-auto"
        style={{ width: geometry.width, height: geometry.height }}
      >
        {geometry.keys.map((placed) => {
          const binding = layer.bindings[placed.index];
          const label = binding
            ? describeBinding(binding, { behaviors, layers: keymap.layers })
            : { main: "", title: "empty" };
          return (
            <KeyCell
              key={placed.index}
              placed={placed}
              label={label}
              selected={highlighted === placed.index}
              onSelect={onKey}
            />
          );
        })}
      </div>

      <p className="text-center text-xs text-zmkay-muted mt-6 pt-2">
        {layout.name} · {layer.bindings.length} keys · layer “{layer.name}”
        {!quickBind && selected === null && " · click a key to edit"}
      </p>

      {quickBind ? (
        <QuickBind />
      ) : (
        selected !== null && (
          <KeyEditor keyPosition={selected} onClose={() => setSelected(null)} />
        )
      )}
    </div>
  );
}
