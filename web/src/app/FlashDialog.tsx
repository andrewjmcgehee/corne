import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { flashUf2, onFlashStatus } from "../transport/flash";

// Minimal firmware-flash UI: point at a .uf2, enter the bootloader on the half,
// and it auto-copies. (A file picker + build integration replace the path field
// in the next pass.)
export function FlashDialog({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState("");
  const [flashing, setFlashing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const unlisten = useRef<(() => void) | null>(null);

  useEffect(() => {
    onFlashStatus((m) => setStatus(m)).then((u) => (unlisten.current = u));
    return () => unlisten.current?.();
  }, []);

  async function flash() {
    if (!path.trim()) return;
    setFlashing(true);
    setResult(null);
    setStatus(null);
    try {
      const msg = await flashUf2(path.trim());
      setResult({ ok: true, msg });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setFlashing(false);
      setStatus(null);
    }
  }

  return (
    <Modal
      title="Flash firmware"
      onClose={onClose}
      footer={
        <>
          Enter the bootloader on the half (double-tap reset, or press a
          &bootloader key) — it copies automatically once detected.
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/path/to/corne_left-nice_nano_v2.uf2"
          className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-zmkay-panel border border-zmkay-edge focus:border-zmkay-accent outline-none"
        />
        <button
          type="button"
          disabled={flashing || !path.trim()}
          onClick={() => void flash()}
          className="w-full px-3 py-2 rounded-lg text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-50"
        >
          {flashing ? "Flashing…" : "Flash this .uf2"}
        </button>

        {flashing && status && (
          <div className="flex items-center gap-2 text-sm text-zmkay-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-zmkay-good animate-pulse" />
            {status}
          </div>
        )}
        {result && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              result.ok
                ? "border-zmkay-good/40 bg-zmkay-good/10 text-zmkay-good"
                : "border-zmkay-bad/40 bg-zmkay-bad/10 text-zmkay-bad"
            }`}
          >
            {result.msg}
          </div>
        )}
      </div>
    </Modal>
  );
}
