import { useState } from "react";
import { useStore } from "../state/store";
import { isUnlocked } from "../rpc/client";
import { ConnectDialog } from "./ConnectDialog";

// Header control. When disconnected, a single Connect button opens the connect
// modal. When connected, shows device + lock + save/discard/disconnect inline.
export function ConnectionBar() {
  const status = useStore((s) => s.status);
  const lockState = useStore((s) => s.lockState);
  const deviceName = useStore((s) => s.deviceName);
  const hasUnsaved = useStore((s) => s.hasUnsaved);
  const disconnect = useStore((s) => s.disconnect);
  const save = useStore((s) => s.save);
  const discard = useStore((s) => s.discard);
  const restoreStock = useStore((s) => s.restoreStock);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmStock, setConfirmStock] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const connected = status === "connected";
  // null = not yet known (e.g. rendering from cache before the live refresh).
  const lockKnown = lockState !== null;
  const unlocked = lockKnown && isUnlocked(lockState);

  async function onSave() {
    setSaveState("saving");
    try {
      await save();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  if (!connected) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="px-3 py-1.5 rounded-md text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30"
        >
          {status === "connecting" ? "Connecting…" : "Connect"}
        </button>
        {dialogOpen && <ConnectDialog onClose={() => setDialogOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-zmkay-good" />
        {deviceName || "connected"}
      </span>
      {lockKnown && <LockBadge unlocked={unlocked} />}
      {hasUnsaved ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={saveState === "saving"}
            onClick={() => void onSave()}
            className="px-2.5 py-1 rounded-md text-xs bg-zmkay-good/20 border border-zmkay-good/50 text-zmkay-text hover:bg-zmkay-good/30 disabled:opacity-50"
          >
            {saveState === "saving" ? "Saving…" : "Save to keyboard"}
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            className="px-2.5 py-1 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text"
          >
            Discard
          </button>
          {saveState === "error" && (
            <span className="text-xs text-zmkay-bad">save failed</span>
          )}
        </div>
      ) : (
        saveState === "saved" && (
          <span className="text-xs text-zmkay-good">Saved ✓</span>
        )
      )}
      {confirmStock ? (
        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-zmkay-muted">Reset to flashed keymap?</span>
          <button
            type="button"
            onClick={() => {
              setConfirmStock(false);
              // On failure the store drops the stale link → bar shows Connect again.
              void restoreStock().catch(() => {});
            }}
            className="px-2 py-0.5 rounded bg-zmkay-warn/20 border border-zmkay-warn/50 text-zmkay-warn hover:bg-zmkay-warn/30"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirmStock(false)}
            className="px-2 py-0.5 rounded text-zmkay-muted hover:text-zmkay-text"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmStock(true)}
          title="Clear the keyboard's saved Studio settings so the flashed firmware's keymap takes effect"
          className="px-2.5 py-1 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text"
        >
          Restore stock
        </button>
      )}
      <button
        type="button"
        onClick={disconnect}
        className="px-2.5 py-1 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text"
      >
        Disconnect
      </button>
    </div>
  );
}

function LockBadge({ unlocked }: { unlocked: boolean }) {
  if (unlocked)
    return <span className="text-xs text-zmkay-good">unlocked</span>;
  return (
    <span
      className="text-xs text-zmkay-warn"
      title="Press your &studio_unlock key on the keyboard to enable editing"
    >
      locked — press &studio_unlock
    </span>
  );
}
