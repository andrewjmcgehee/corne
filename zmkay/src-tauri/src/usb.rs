// USB half detection + the one-click DFU flash. A running ZMK half shows up as
// a USB CDC serial port; we identify left vs right from the product string baked
// in at build time (ZMK's serial number is static, so it can't tell units apart).
// flash_half drives a half into DFU with a 1200-baud touch (see the usb-dfu-reset
// firmware module), then reuses flash::wait_and_copy to write the .uf2.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

// ZMK's USB vendor id — used to filter the port list down to our keyboard.
const ZMK_VID: u16 = 0x1d50;

#[derive(serde::Serialize, Clone)]
pub struct UsbHalf {
    pub role: String, // "left" | "right" | "unknown"
    pub product: String,
    pub ports: Vec<String>, // CDC ports of this half (the left exposes two)
}

// Connected Corne halves, grouped by product string. The central half exposes
// two CDC ports (studio RPC + our DFU port) under one product, so we group them.
#[tauri::command]
pub fn usb_halves() -> Vec<UsbHalf> {
    let ports = serialport::available_ports().unwrap_or_default();
    let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for p in ports {
        if let serialport::SerialPortType::UsbPort(info) = &p.port_type {
            let product = info.product.clone().unwrap_or_default();
            let is_ours = info.vid == ZMK_VID || product.to_lowercase().contains("corne");
            if is_ours {
                groups.entry(product).or_default().push(p.port_name);
            }
        }
    }
    groups
        .into_iter()
        .map(|(product, ports)| {
            let pl = product.to_lowercase();
            let role = if pl.contains("left") {
                "left"
            } else if pl.contains("right") {
                "right"
            } else {
                "unknown"
            };
            UsbHalf { role: role.into(), product, ports }
        })
        .collect()
}

// Drive a half into DFU (1200-baud touch every CDC port it exposes — only the
// one with the watcher reboots, the rest are harmless no-ops), then wait for the
// bootloader volume and copy the matching .uf2.
#[tauri::command]
pub async fn flash_half(
    app: AppHandle,
    ports: Vec<String>,
    uf2_path: String,
    timeout_secs: u64,
) -> Result<String, String> {
    eprintln!("[flash] flash_half ports={ports:?} uf2={uf2_path}");
    let src = PathBuf::from(&uf2_path);
    if !src.exists() {
        return Err(format!("Firmware file not found: {uf2_path}"));
    }

    let _ = app.emit("flash://status", "Switching the half into DFU…");
    let ports2 = ports.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        for port in &ports2 {
            eprintln!("[flash] 1200-baud touch on {port}");
            match touch_1200(port) {
                Ok(()) => eprintln!("[flash] touched {port} ok"),
                Err(e) => eprintln!("[flash] touch {port} failed: {e}"),
            }
        }
    })
    .await;

    eprintln!("[flash] waiting for bootloader volume…");
    let r = crate::flash::wait_and_copy(&app, &src, timeout_secs).await;
    eprintln!("[flash] wait_and_copy -> {r:?}");
    r
}

// The "1200bps touch": open the port at 1200 baud (issuing SET_LINE_CODING) and
// close it. The firmware watcher sees the baud change and reboots into DFU.
fn touch_1200(port: &str) -> Result<(), String> {
    let handle = serialport::new(port, 1200)
        .open()
        .map_err(|e| e.to_string())?;
    std::thread::sleep(Duration::from_millis(300));
    drop(handle);
    Ok(())
}
