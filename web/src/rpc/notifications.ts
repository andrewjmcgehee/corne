import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

export interface NotificationHandlers {
  onLockStateChanged?: (state: LockState) => void;
  onUnsavedChangesChanged?: (hasUnsaved: boolean) => void;
}

// Continuously drain the connection's notification stream and dispatch to
// handlers. Runs until the stream closes (device disconnect aborts it). Fire
// and forget from the store; errors after disconnect are expected and ignored.
export async function listenForNotifications(
  conn: RpcConnection,
  handlers: NotificationHandlers,
): Promise<void> {
  const reader = conn.notification_readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.core?.lockStateChanged !== undefined) {
        handlers.onLockStateChanged?.(value.core.lockStateChanged);
      }
      if (value.keymap?.unsavedChangesStatusChanged !== undefined) {
        handlers.onUnsavedChangesChanged?.(
          value.keymap.unsavedChangesStatusChanged,
        );
      }
    }
  } catch {
    // Stream aborted on disconnect — nothing to do.
  } finally {
    reader.releaseLock();
  }
}
