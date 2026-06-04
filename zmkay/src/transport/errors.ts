// Raised when the user dismisses the browser's device chooser. Callers treat
// this as a no-op (not an error to surface), matching how the official app
// swallows the underlying NotFoundError.
export class ConnectCancelled extends Error {
  constructor() {
    super("Device selection cancelled");
    this.name = "ConnectCancelled";
  }
}
