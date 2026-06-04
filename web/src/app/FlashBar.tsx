import { useEffect, useRef, useState } from "react";
import { useBuildStore } from "../state/build-store";
import { loadHalfName, saveHalfName } from "../state/device-storage";
import { onFlashStatus } from "../transport/flash";
import { flashHalf, usbHalves, type Role, type UsbHalf } from "../transport/usb";

// Slim bar under the header: the Corne halves currently connected over USB, each
// with a one-click Flash button that appears only when the latest build is green
// and that half's .uf2 exists. Flashing drives the half into DFU (1200-baud
// touch) and copies the matching firmware — no double-tap reset.

type FlashState = { role: Role; status: string } | null;

export function FlashBar() {
  const latest = useBuildStore((s) => s.runs[0] ?? null);
  const [halves, setHalves] = useState<UsbHalf[]>([]);
  const [flash, setFlash] = useState<FlashState>(null);
  const [done, setDone] = useState<{ role: Role; ok: boolean; msg: string } | null>(null);

  // Poll for connected halves (USB hotplug). Cheap; runs only in the native app.
  useEffect(() => {
    let alive = true;
    const tick = () => usbHalves().then((h) => alive && setHalves(h)).catch(() => {});
    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Surface DFU/copy progress while flashing.
  const flashRef = useRef<FlashState>(null);
  flashRef.current = flash;
  useEffect(() => {
    const un = onFlashStatus((msg) => {
      const cur = flashRef.current;
      if (cur) setFlash({ role: cur.role, status: msg });
    });
    return () => {
      void un.then((u) => u());
    };
  }, []);

  if (halves.length === 0) return null;

  const buildGreen = latest?.status === "success";
  const uf2For = (role: Role) =>
    role === "left" ? latest?.left_uf2 : role === "right" ? latest?.right_uf2 : null;

  async function doFlash(half: UsbHalf) {
    const uf2 = uf2For(half.role);
    if (!uf2) return;
    setDone(null);
    setFlash({ role: half.role, status: "Switching into DFU…" });
    try {
      const msg = await flashHalf(half.ports, uf2);
      setDone({ role: half.role, ok: true, msg });
    } catch (e) {
      setDone({ role: half.role, ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setFlash(null);
    }
  }

  return (
    <div className="flex items-center gap-3 px-5 py-2 border-b border-zmkay-edge bg-zmkay-panel/60 text-sm">
      <span className="text-xs text-zmkay-muted">Connected:</span>
      {halves.map((h) => {
        const uf2 = uf2For(h.role);
        const canFlash = buildGreen && !!uf2 && flash === null;
        const isFlashing = flash?.role === h.role;
        return (
          <div key={h.product || h.role} className="flex items-center gap-2">
            <HalfChip half={h} />
            {isFlashing ? (
              <span className="flex items-center gap-1.5 text-xs text-zmkay-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-zmkay-good animate-pulse" />
                {flash?.status}
              </span>
            ) : (
              <button
                type="button"
                disabled={!canFlash}
                onClick={() => void doFlash(h)}
                title={
                  !buildGreen
                    ? "Waiting for a green build"
                    : !uf2
                      ? "No firmware for this half yet"
                      : "Flash this half"
                }
                className="px-2.5 py-1 rounded-md text-xs bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-40"
              >
                Flash
              </button>
            )}
          </div>
        );
      })}
      {done && (
        <span
          className={`text-xs ${done.ok ? "text-zmkay-good" : "text-zmkay-bad"}`}
          title={done.msg}
        >
          {done.role}: {done.ok ? "flashed ✓" : "failed"}
        </span>
      )}
    </div>
  );
}

// A half's label: role-derived default, click to give it a nickname.
function HalfChip({ half }: { half: UsbHalf }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(() => loadHalfName(half.role));
  const label = name || (half.role === "unknown" ? half.product || "Corne half" : `${half.role} half`);

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={name}
        onBlur={(e) => {
          const v = e.target.value.trim();
          setName(v);
          saveHalfName(half.role, v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-28 px-2 py-0.5 rounded-md text-xs bg-zmkay-panel border border-zmkay-accent/50 text-zmkay-text"
      />
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-text capitalize"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-zmkay-good" />
      {label}
    </button>
  );
}
