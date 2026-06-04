import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { keyDefFromEvent } from "./event-keycodes";
import { findBehaviorId } from "../keymap-model/describe";
import type { KeyDef } from "../keymap-model/keycodes";

// Modifier bit (top byte of a ZMK keycode) for a modifier KeyDef; 0 otherwise.
function modBit(def: KeyDef): number {
  if (def.group !== "mods") return 0;
  if (def.name.includes("SHFT")) return 0x02;
  if (def.name.includes("CTRL")) return 0x01;
  if (def.name.includes("ALT")) return 0x04;
  if (def.name.includes("CMD")) return 0x08;
  return 0;
}

// QuickBind mode: highlight the current key, capture the key(s) the user holds,
// and on full release bind &kp (with any modifiers folded in) and advance to the
// next key. Runs as long as it's mounted (BoardView mounts it while active).
export function QuickBind() {
  const keymap = useStore((s) => s.keymap);
  const activeLayer = useStore((s) => s.activeLayer);
  const behaviors = useStore((s) => s.behaviors);
  const position = useStore((s) => s.qbPosition);
  const setBinding = useStore((s) => s.setBinding);
  const setQbPosition = useStore((s) => s.setQbPosition);
  const stop = useStore((s) => s.stopQuickBind);

  const layer = keymap?.layers[activeLayer];
  const count = layer?.bindings.length ?? 0;

  // Latest values for the stable global listener.
  const stateRef = useRef({
    position,
    count,
    layerId: layer?.id,
    kpId: findBehaviorId(behaviors, /key press/i),
  });
  stateRef.current = {
    position,
    count,
    layerId: layer?.id,
    kpId: findBehaviorId(behaviors, /key press/i),
  };

  // Keys currently held, and the full combo accumulated during this press.
  const held = useRef<Map<string, KeyDef>>(new Map());
  const combo = useRef<Map<string, KeyDef>>(new Map());
  // Pending lone-Escape bind, so a quick second Escape can exit instead.
  const escTimer = useRef<number | null>(null);
  const DOUBLE_TAP_MS = 200;

  useEffect(() => {
    function bind(usage: number) {
      const { kpId, layerId, position, count } = stateRef.current;
      if (kpId === undefined || layerId === undefined) return;
      void setBinding(layerId, position, {
        behaviorId: kpId,
        param1: usage,
        param2: 0,
      });
      setQbPosition(count ? (position + 1) % count : position);
    }

    function commit() {
      const keys = [...combo.current.values()];
      combo.current = new Map();
      if (keys.length === 0) return;

      const mains = keys.filter((d) => d.group !== "mods");
      const modBits = keys.reduce((m, d) => m | modBit(d), 0);
      // A modifier+key chord folds the mods into the keycode; modifier-only
      // presses bind that modifier as the key.
      const usage = mains.length
        ? (mains[mains.length - 1].usage | (modBits << 24)) >>> 0
        : keys[keys.length - 1].usage;

      // A lone Escape might be the first of a double-tap (= exit), so defer its
      // bind; a second Escape within the window cancels it and exits.
      if (keys.length === 1 && keys[0].name === "ESC") {
        if (escTimer.current !== null) {
          clearTimeout(escTimer.current);
          escTimer.current = null;
          stop();
          return;
        }
        escTimer.current = window.setTimeout(() => {
          escTimer.current = null;
          bind(usage);
        }, DOUBLE_TAP_MS);
        return;
      }
      bind(usage);
    }

    const onDown = (e: KeyboardEvent) => {
      // No key is special here — Escape must be bindable too. Exit is the button.
      e.preventDefault();
      e.stopPropagation();
      const def = keyDefFromEvent(e);
      if (def) {
        held.current.set(e.code, def);
        combo.current.set(e.code, def);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      held.current.delete(e.code);
      if (held.current.size === 0 && combo.current.size > 0) commit();
    };

    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      held.current.clear();
      combo.current.clear();
      if (escTimer.current !== null) clearTimeout(escTimer.current);
    };
  }, [setBinding, setQbPosition, stop]);

  return (
    <div className="w-full max-w-md mx-auto rounded-xl border border-zmkay-accent/50 bg-zmkay-accent/10 px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-sm">
        <span className="font-medium text-zmkay-text">QuickBind</span>
        <span className="text-zmkay-muted">
          {" "}
          — press the key(s) for{" "}
          <span className="font-mono text-zmkay-text">
            {layer?.name ?? "?"} · key {position}
          </span>
          , release to bind. Hold modifiers for a chord; double-tap Esc to exit.
        </span>
      </div>
      <button
        type="button"
        onClick={stop}
        className="shrink-0 px-2.5 py-1 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-text hover:bg-zmkay-keyhi"
      >
        Exit
      </button>
    </div>
  );
}
