// zmkay native shell. The React UI is identical to the web build; only the
// device transport differs — here BLE goes through Rust (see the ble module),
// bridged to JS as an RpcTransport.

mod ble;
mod flash;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ble::BleState::default())
        .invoke_handler(tauri::generate_handler![
            ble::ble_list,
            ble::ble_connect,
            ble::ble_send,
            ble::ble_disconnect,
            flash::bootloader_present,
            flash::flash_uf2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running zmkay");
}
