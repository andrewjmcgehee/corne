import { useState } from "react";
import { BrowserGuard } from "./BrowserGuard";
import { ConnectionBar } from "./ConnectionBar";
import { FlashDialog } from "./FlashDialog";
import { BoardView } from "../editor/BoardView";
import { useStore } from "../state/store";
import { isTauri } from "../transport/tauri-ble";

// Top-level shell. Header carries the connection controls; the main area shows
// the live board once connected, or a hint to connect otherwise.
export function App() {
  const status = useStore((s) => s.status);
  const [flashOpen, setFlashOpen] = useState(false);

  return (
    <BrowserGuard>
      <div className="min-h-full flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-zmkay-edge bg-zmkay-panel">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">zmkay</span>
            <span className="text-xs text-zmkay-muted">ZMK keymap studio</span>
          </div>
          <div className="flex items-center gap-2">
            {isTauri() && (
              <button
                type="button"
                onClick={() => setFlashOpen(true)}
                className="px-2.5 py-1.5 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text"
              >
                Firmware
              </button>
            )}
            <ConnectionBar />
          </div>
        </header>
        {flashOpen && <FlashDialog onClose={() => setFlashOpen(false)} />}

        <main className="flex-1 p-8 overflow-auto">
          {status === "connected" ? <BoardView /> : <Welcome />}
        </main>
      </div>
    </BrowserGuard>
  );
}

function Welcome() {
  return (
    <div className="grid place-items-center h-full">
      <div className="max-w-md text-center">
        <h1 className="text-base font-medium mb-2">Connect your keyboard</h1>
        <p className="text-sm text-zmkay-muted">
          Use the button up top to connect over Bluetooth (or USB). zmkay reads
          your current layout live from the keyboard — no firmware build
          required.
        </p>
      </div>
    </div>
  );
}
