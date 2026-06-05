// zmkay native shell. The React UI is identical to the web build; only the
// device transport differs — here BLE goes through Rust (see the ble module),
// bridged to JS as an RpcTransport.

mod ble;
mod build;
mod config;
mod flash;
mod usb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ble::BleState::default())
        .manage(std::sync::Arc::new(build::BuildManager::default()))
        .manage(build::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            ble::ble_list,
            ble::ble_connect,
            ble::ble_send,
            ble::ble_disconnect,
            flash::bootloader_present,
            flash::flash_uf2,
            build::toolchain_status,
            build::bootstrap_toolchain,
            build::build_firmware,
            build::start_build,
            build::cancel_build,
            build::build_history,
            build::watch_config,
            build::unwatch_config,
            usb::usb_halves,
            usb::flash_half,
            config::read_keymap,
            config::write_keymap,
            config::write_candidate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running zmkay");
}
