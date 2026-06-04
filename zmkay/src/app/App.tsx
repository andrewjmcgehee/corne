import { useEffect, useState } from "react";
import { BrowserGuard } from "./BrowserGuard";
import { ConnectionBar } from "./ConnectionBar";
import { FlashDialog } from "./FlashDialog";
import { FlashBar } from "./FlashBar";
import { BuildStatus } from "./BuildStatus";
import { BuildTab } from "./BuildTab";
import { BehaviorsDialog } from "./BehaviorsDialog";
import { BoardView } from "../editor/BoardView";
import { useStore } from "../state/store";
import { useBuildStore } from "../state/build-store";
import { loadConfigDir } from "../state/device-storage";
import { isTauri } from "../transport/tauri-ble";

type Tab = "layout" | "build";

// Top-level shell. Header carries connection + build controls; a tab bar switches
// between the live layout editor and the build logs.
export function App() {
  const status = useStore((s) => s.status);
  const [tab, setTab] = useState<Tab>("layout");
  const [flashOpen, setFlashOpen] = useState(false);
  const [behaviorsOpen, setBehaviorsOpen] = useState(false);
  const native = isTauri();

  // In the native app, watch the last-used config folder so edits there kick off
  // a debounced rebuild of both halves automatically.
  useEffect(() => {
    if (!native) return;
    const dir = loadConfigDir(null);
    if (dir) void useBuildStore.getState().watch(dir);
  }, [native]);

  return (
    <BrowserGuard>
      <div className="h-screen flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-zmkay-edge bg-zmkay-panel">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold tracking-tight">zmkay</span>
            {native && (
              <nav className="flex items-center gap-1 text-sm">
                <TabButton label="Layout" active={tab === "layout"} onClick={() => setTab("layout")} />
                <TabButton label="Build" active={tab === "build"} onClick={() => setTab("build")} />
              </nav>
            )}
          </div>
          <div className="flex items-center gap-2">
            {native && <BuildStatus onOpen={() => setTab("build")} />}
            {native && (
              <button
                type="button"
                onClick={() => setBehaviorsOpen(true)}
                className="px-2.5 py-1.5 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-muted hover:text-zmkay-text"
              >
                Behaviors
              </button>
            )}
            {native && (
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
        {behaviorsOpen && <BehaviorsDialog onClose={() => setBehaviorsOpen(false)} />}
        {native && <FlashBar />}

        <main className="flex-1 min-h-0">
          {tab === "build" ? (
            <div className="h-full p-6">
              <BuildTab />
            </div>
          ) : (
            <div className="h-full overflow-auto p-8">
              {status === "connected" ? <BoardView /> : <Welcome />}
            </div>
          )}
        </main>
      </div>
    </BrowserGuard>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1 rounded-md transition-colors",
        active ? "bg-zmkay-keyhi text-zmkay-text" : "text-zmkay-muted hover:text-zmkay-text",
      ].join(" ")}
    >
      {label}
    </button>
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
