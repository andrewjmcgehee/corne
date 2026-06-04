import { useEffect, useMemo, useState } from "react";
import type { BehaviorParameterValueDescription } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { useStore } from "../state/store";
import { isUnlocked } from "../rpc/client";
import {
  describeBinding,
  findBehaviorId,
  paramKind,
} from "../keymap-model/describe";
import { keyDefFromEvent } from "./event-keycodes";
import { KeycodePicker } from "./KeycodePicker";
import { BehaviorParamControl } from "./BehaviorParamControl";

// Editor for one selected key. Fast path: press a key (type-to-bind → &kp).
// Full path: pick any behavior and fill its parameters (keycode / layer / number)
// driven by the firmware's behavior metadata. Applies live via the store.
export function KeyEditor({
  keyPosition,
  onClose,
}: {
  keyPosition: number;
  onClose: () => void;
}) {
  const keymap = useStore((s) => s.keymap);
  const activeLayer = useStore((s) => s.activeLayer);
  const behaviors = useStore((s) => s.behaviors);
  const allBehaviorsLoaded = useStore((s) => s.allBehaviorsLoaded);
  const ensureAllBehaviors = useStore((s) => s.ensureAllBehaviors);
  const lockState = useStore((s) => s.lockState);
  const setBinding = useStore((s) => s.setBinding);

  const layer = keymap?.layers[activeLayer];
  const binding = layer?.bindings[keyPosition];

  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [behaviorId, setBehaviorId] = useState<number | undefined>(
    binding?.behaviorId,
  );
  const [p1, setP1] = useState(binding?.param1 ?? 0);
  const [p2, setP2] = useState(binding?.param2 ?? 0);

  const kpId = useMemo(() => findBehaviorId(behaviors, /key press/i), [behaviors]);
  const transId = useMemo(() => findBehaviorId(behaviors, /transparent/i), [behaviors]);
  const noneId = useMemo(() => findBehaviorId(behaviors, /^none$/i), [behaviors]);

  const locked = lockState !== null && !isUnlocked(lockState);

  // Pull the full behavior list once the editor opens.
  useEffect(() => {
    void ensureAllBehaviors();
  }, [ensureAllBehaviors]);

  // Reset the form to the key's current binding when the selected key changes.
  useEffect(() => {
    setBehaviorId(binding?.behaviorId);
    setP1(binding?.param1 ?? 0);
    setP2(binding?.param2 ?? 0);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyPosition]);

  const descs = useMemo(() => {
    const set =
      behaviorId !== undefined
        ? behaviors.get(behaviorId)?.metadata?.[0]
        : undefined;
    return { d1: set?.param1?.[0], d2: set?.param2?.[0] };
  }, [behaviorId, behaviors]);

  const sortedBehaviors = useMemo(
    () =>
      [...behaviors.entries()].sort((a, b) =>
        a[1].displayName.localeCompare(b[1].displayName),
      ),
    [behaviors],
  );

  if (!layer || !binding) return null;
  const current = describeBinding(binding, { behaviors, layers: keymap!.layers });

  async function apply(id: number, param1 = 0, param2 = 0) {
    if (!layer) return;
    setError(null);
    try {
      await setBinding(layer.id, keyPosition, {
        behaviorId: id,
        param1: param1 >>> 0,
        param2: param2 >>> 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Switching behavior: seed params from the current binding if it's the same
  // behavior, else from each parameter's default.
  function chooseBehavior(id: number) {
    setBehaviorId(id);
    const set = behaviors.get(id)?.metadata?.[0];
    if (id === binding!.behaviorId) {
      setP1(binding!.param1);
      setP2(binding!.param2);
    } else {
      setP1(defaultParam(set?.param1?.[0]));
      setP2(defaultParam(set?.param2?.[0]));
    }
  }

  // Type-to-bind: next key press becomes &kp.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const def = keyDefFromEvent(e);
      if (def && kpId !== undefined) void apply(kpId, def.usage, 0);
      setCapturing(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, kpId, layer, keyPosition]);

  return (
    <div className="w-full max-w-md mx-auto rounded-xl border border-zmkay-edge bg-zmkay-panel2 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-zmkay-muted">Key {keyPosition} · now </span>
          <span className="font-mono">{current.main}</span>
          {current.badge && <span className="text-zmkay-muted"> ({current.badge})</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close editor"
          className="text-zmkay-muted hover:text-zmkay-text px-1"
        >
          ×
        </button>
      </div>

      {locked && (
        <Note tone="warn">
          Keyboard is locked — press your &studio_unlock key to edit.
        </Note>
      )}
      {error && <Note tone="bad">{error}</Note>}

      <button
        type="button"
        onClick={() => setCapturing((c) => !c)}
        className={[
          "w-full px-3 py-2 rounded-lg text-sm border transition-colors",
          capturing
            ? "border-zmkay-accent bg-zmkay-accent/20 text-zmkay-text animate-pulse"
            : "border-zmkay-edge bg-zmkay-panel text-zmkay-text hover:bg-zmkay-keyhi",
        ].join(" ")}
      >
        {capturing ? "Press any key… (click to cancel)" : "⌨  Press a key to bind"}
      </button>

      {/* Behavior picker */}
      <div className="flex flex-col gap-2 border-t border-zmkay-edge pt-3">
        <label className="text-xs text-zmkay-muted">Behavior</label>
        <select
          value={behaviorId ?? ""}
          onChange={(e) => chooseBehavior(Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm bg-zmkay-panel border border-zmkay-edge focus:border-zmkay-accent outline-none"
        >
          {sortedBehaviors.map(([id, d]) => (
            <option key={id} value={id}>
              {d.displayName}
            </option>
          ))}
        </select>
        {!allBehaviorsLoaded && (
          <span className="text-xs text-zmkay-muted">loading more behaviors…</span>
        )}

        {descs.d1 && (
          <BehaviorParamControl
            desc={descs.d1}
            layers={keymap!.layers}
            value={p1}
            onChange={setP1}
          />
        )}
        {descs.d2 && (
          <BehaviorParamControl
            desc={descs.d2}
            layers={keymap!.layers}
            value={p2}
            onChange={setP2}
          />
        )}

        <button
          type="button"
          disabled={behaviorId === undefined}
          onClick={() => behaviorId !== undefined && void apply(behaviorId, p1, p2)}
          className="w-full px-3 py-2 rounded-lg text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-50"
        >
          Apply behavior
        </button>
      </div>

      {/* Quick keycode + transparent/none */}
      <div className="border-t border-zmkay-edge pt-3 flex flex-col gap-2">
        <label className="text-xs text-zmkay-muted">Quick keycode (&kp)</label>
        {kpId !== undefined && (
          <KeycodePicker onPick={(usage) => void apply(kpId, usage, 0)} />
        )}
        <div className="flex items-center gap-2 text-xs">
          {transId !== undefined && (
            <QuickButton label="▽ transparent" onClick={() => void apply(transId)} />
          )}
          {noneId !== undefined && (
            <QuickButton label="✗ none" onClick={() => void apply(noneId)} />
          )}
        </div>
      </div>
    </div>
  );
}

function defaultParam(desc: BehaviorParameterValueDescription | undefined): number {
  if (!desc) return 0;
  switch (paramKind(desc)) {
    case "const":
      return desc.constant ?? 0;
    case "range":
      return desc.range?.min ?? 0;
    default:
      return 0;
  }
}

function Note({
  tone,
  children,
}: {
  tone: "warn" | "bad";
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-zmkay-warn/40 bg-zmkay-warn/10 text-zmkay-warn"
      : "border-zmkay-bad/40 bg-zmkay-bad/10 text-zmkay-bad";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 text-xs ${cls}`}>
      {children}
    </div>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 rounded-md border border-zmkay-edge bg-zmkay-panel text-zmkay-text hover:bg-zmkay-keyhi"
    >
      {label}
    </button>
  );
}
