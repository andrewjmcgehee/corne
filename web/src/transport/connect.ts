import { create_rpc_connection, type RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { connect as serialConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { connectGatt, type GattConnectOptions } from "./gatt";
import { ConnectCancelled } from "./errors";

export type TransportKind = "ble" | "serial";

export type { GattConnectOptions } from "./gatt";
export { ConnectCancelled } from "./errors";

// Open a transport and wrap it in the RPC connection the rest of the app uses.
// BLE goes through our own connectGatt (controllable discovery); serial uses the
// stock client. Disconnecting means aborting the transport's AbortController.
export async function openConnection(
  kind: TransportKind,
  gattOptions: GattConnectOptions = {},
): Promise<RpcConnection> {
  try {
    const transport =
      kind === "ble"
        ? await connectGatt(gattOptions)
        : await serialConnect();
    return create_rpc_connection(transport, {
      signal: transport.abortController.signal,
    });
  } catch (err) {
    // Normalize the serial transport's cancel error to ours.
    if (err instanceof UserCancelledError) throw new ConnectCancelled();
    throw err;
  }
}
