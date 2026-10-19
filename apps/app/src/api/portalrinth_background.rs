//! A picture behind the launcher, chosen in Settings → Appearance.
//!
//! The idea is Celestial Launcher's (github.com/Wemsur/Celestial-Launcher).
//! The picture is copied next to the app database rather than remembered by
//! path, so it survives the original being moved or deleted, and it is handed
//! to the interface as raw bytes: the webview cannot read files on disk.

use crate::api::Result;
use tauri::ipc::Response;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-background")
        .invoke_handler(tauri::generate_handler![
            background_set,
            background_get,
            background_kind,
            background_clear,
        ])
        .build()
}

/// Big enough for any wallpaper, small enough not to stall the window.
const MAX_BYTES: u64 = 32 * 1024 * 1024;

async fn stored_path() -> Result<std::path::PathBuf> {
    let state = theseus::State::get().await?;
    let dir = state.directories.settings_dir.clone();
    let plain = dir.join("background");
    if plain.exists() {
        return Ok(plain);
    }
    // The extension is kept with the file, so a video can be told from a
    // picture without guessing at the bytes. Only one is kept, so the first
    // one found is the one.
    if let Ok(mut entries) = tokio::fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("background.") {
                return Ok(entry.path());
            }
        }
    }
    Ok(plain)
}

/// Removes every background but the one that is being kept.
async fn remove_others(keep: &std::path::Path) {
    let Some(dir) = keep.parent() else { return };
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path == keep {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == "background" || name.starts_with("background.") {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
}

/// Makes the picture at `path` the background.
#[tauri::command]
pub async fn background_set(path: String) -> Result<()> {
    let size = tokio::fs::metadata(&path)
        .await
        .map_err(|error| {
            theseus::ErrorKind::OtherError(error.to_string()).as_error()
        })?
        .len();
    if size > MAX_BYTES {
        return Err(theseus::ErrorKind::OtherError(format!(
            "The picture is {} MB; the background takes up to {} MB",
            size / 1024 / 1024,
            MAX_BYTES / 1024 / 1024
        ))
        .as_error()
        .into());
    }

    // The extension travels with the file: a background may be a picture or a
    // video, and the interface has to know which before it draws it.
    let extension = std::path::Path::new(&path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let state = theseus::State::get().await?;
    let target = state
        .directories
        .settings_dir
        .join(format!("background.{extension}"));
    tokio::fs::copy(&path, &target)
        .await
        .map_err(|error| {
            theseus::ErrorKind::OtherError(error.to_string()).as_error()
        })?;
    remove_others(&target).await;
    Ok(())
}

/// What kind of background it is: the extension it was stored with.
///
/// Empty when there is no background at all.
#[tauri::command]
pub async fn background_kind() -> Result<String> {
    let path = stored_path().await?;
    Ok(path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_lowercase())
}

/// The background's bytes, or none when there is no background.
#[tauri::command]
pub async fn background_get() -> Result<Response> {
    match tokio::fs::read(stored_path().await?).await {
        Ok(bytes) => Ok(Response::new(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(Response::new(Vec::new()))
        }
        Err(error) => Err(theseus::ErrorKind::OtherError(error.to_string())
            .as_error()
            .into()),
    }
}

#[tauri::command]
pub async fn background_clear() -> Result<()> {
    match tokio::fs::remove_file(stored_path().await?).await {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(theseus::ErrorKind::OtherError(error.to_string())
                .as_error()
                .into())
        }
        _ => Ok(()),
    }
}
