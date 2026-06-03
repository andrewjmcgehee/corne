// USB flash by copying a .uf2 to the bootloader's mass-storage volume — the
// programmatic equivalent of drag-and-drop. ZMK has no USB software-reset, so
// the user enters the bootloader once (double-tap reset, or a &bootloader key);
// we then detect the mounted volume and copy the firmware. No DFU tooling needed.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

// Candidate roots where a UF2 bootloader volume shows up, per OS.
fn volume_roots() -> Vec<PathBuf> {
    if cfg!(target_os = "macos") {
        vec![PathBuf::from("/Volumes")]
    } else if cfg!(target_os = "windows") {
        ('D'..='Z').map(|c| PathBuf::from(format!("{c}:\\"))).collect()
    } else {
        let mut roots = vec![PathBuf::from("/media"), PathBuf::from("/run/media")];
        if let Ok(user) = std::env::var("USER") {
            roots.push(PathBuf::from(format!("/run/media/{user}")));
            roots.push(PathBuf::from(format!("/media/{user}")));
        }
        roots
    }
}

// A UF2 bootloader drive has an INFO_UF2.TXT at its root — the reliable marker.
fn find_bootloader_volume() -> Option<PathBuf> {
    for root in volume_roots() {
        if root.join("INFO_UF2.TXT").exists() {
            return Some(root); // Windows drive root case
        }
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.join("INFO_UF2.TXT").exists() {
                return Some(p);
            }
        }
    }
    None
}

#[tauri::command]
pub fn bootloader_present() -> bool {
    find_bootloader_volume().is_some()
}

// Wait for a bootloader volume (the user enters it via reset/&bootloader), then
// copy the .uf2 onto it. Emits `flash://status` updates for the UI.
#[tauri::command]
pub async fn flash_uf2(
    app: AppHandle,
    uf2_path: String,
    timeout_secs: u64,
) -> Result<String, String> {
    let src = PathBuf::from(&uf2_path);
    if !src.exists() {
        return Err(format!("Firmware file not found: {uf2_path}"));
    }

    let _ = app.emit("flash://status", "Waiting for bootloader…");
    let mut volume = None;
    for _ in 0..(timeout_secs * 2) {
        if let Some(v) = find_bootloader_volume() {
            volume = Some(v);
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    let volume = volume.ok_or_else(|| {
        "Timed out — put the half in bootloader mode (double-tap reset, or press a &bootloader key)"
            .to_string()
    })?;

    let _ = app.emit("flash://status", "Bootloader found — copying firmware…");
    let dest = volume.join("CURRENT.UF2");
    match fs::copy(&src, &dest) {
        Ok(_) => Ok("Firmware copied — the half is rebooting.".to_string()),
        Err(e) => {
            // The board commonly reboots mid-final-write, surfacing an IO error
            // even though the flash succeeded. If the volume is now gone, the
            // bootloader accepted the image and rebooted.
            if !volume.exists() {
                Ok("Firmware flashed — the half rebooted.".to_string())
            } else {
                Err(format!("Copy failed: {e}"))
            }
        }
    }
}
