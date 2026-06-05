// Read/write the user's source-of-truth .keymap so the app can author combos and
// behaviors the live (Studio) channel can't touch. Writing it triggers the
// config-folder watcher → an auto-build (see build.rs).

use std::path::PathBuf;

fn keymap_path(config_dir: &str) -> PathBuf {
    PathBuf::from(config_dir).join("corne.keymap")
}

#[tauri::command]
pub fn read_keymap(config_dir: String) -> Result<String, String> {
    let path = keymap_path(&config_dir);
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
pub fn write_keymap(config_dir: String, content: String) -> Result<(), String> {
    let path = keymap_path(&config_dir);
    std::fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display()))
}

// Write the device-derived keymap to candidate.keymap (kept separate from
// corne.keymap to avoid clobbering the source while reconciliation is WIP).
#[tauri::command]
pub fn write_candidate(config_dir: String, content: String) -> Result<String, String> {
    let path = PathBuf::from(&config_dir).join("candidate.keymap");
    std::fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(path.display().to_string())
}
