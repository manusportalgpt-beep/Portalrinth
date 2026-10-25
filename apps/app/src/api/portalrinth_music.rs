//! Music for the launcher, chosen in Settings → Sound.
//!
//! A track is copied into a folder of its own next to the app database rather
//! than remembered by path, so a playlist survives the original being moved or
//! deleted. The folder holds up to 3 GB; what is in it is handed to the
//! interface as raw bytes, as the background is, because the webview cannot
//! read files on disk.

use crate::api::Result;
use serde::Serialize;
use tauri::ipc::Response;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-music")
        .invoke_handler(tauri::generate_handler![
            music_add,
            music_get,
            music_remove,
            music_usage,
            music_list,
        ])
        .build()
}

/// How much the music folder may hold, all tracks together.
const MAX_TOTAL_BYTES: u64 = 3 * 1024 * 1024 * 1024;

/// What can be played.
const EXTENSIONS: &[&str] = &[
    "mp3", "ogg", "oga", "opus", "wav", "flac", "m4a", "aac", "webm",
];

#[derive(Serialize)]
pub struct MusicFile {
    pub id: String,
    pub extension: String,
    pub size: u64,
    pub name: String,
}

#[derive(Serialize)]
pub struct MusicUsage {
    pub used: u64,
    pub limit: u64,
}

fn error(message: impl ToString) -> crate::api::CommandError {
    anyhow::anyhow!(message.to_string()).into()
}

async fn music_dir() -> Result<std::path::PathBuf> {
    let state = theseus::State::get().await?;
    let dir = state.directories.settings_dir.join("music");
    tokio::fs::create_dir_all(&dir).await.map_err(error)?;
    Ok(dir)
}

/// An id is what the folder names a track by; nothing else may reach the disk.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

async fn find(id: &str) -> Result<Option<std::path::PathBuf>> {
    if !valid_id(id) {
        return Err(error("Invalid track id"));
    }
    let dir = music_dir().await?;
    let mut entries = tokio::fs::read_dir(&dir).await.map_err(error)?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.file_stem().and_then(|stem| stem.to_str()) == Some(id) {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

async fn used_bytes() -> Result<u64> {
    let dir = music_dir().await?;
    let mut total = 0;
    let mut entries = tokio::fs::read_dir(&dir).await.map_err(error)?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Ok(metadata) = entry.metadata().await
            && metadata.is_file()
        {
            total += metadata.len();
        }
    }
    Ok(total)
}

/// Copies the track at `path` into the music folder.
#[tauri::command]
pub async fn music_add(path: String) -> Result<MusicFile> {
    let source = std::path::Path::new(&path);
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !EXTENSIONS.contains(&extension.as_str()) {
        return Err(error(format!("Cannot play .{extension} files")));
    }
    let size = tokio::fs::metadata(source).await.map_err(error)?.len();
    let used = used_bytes().await?;
    if used + size > MAX_TOTAL_BYTES {
        return Err(error(format!(
            "The music folder holds up to {} GB; {} MB are left",
            MAX_TOTAL_BYTES / 1024 / 1024 / 1024,
            MAX_TOTAL_BYTES.saturating_sub(used) / 1024 / 1024
        )));
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    let target = music_dir().await?.join(format!("{id}.{extension}"));
    tokio::fs::copy(source, &target).await.map_err(error)?;
    let name = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .to_string();
    Ok(MusicFile {
        id,
        extension,
        size,
        name,
    })
}

/// The track's bytes, or none when it is not in the folder.
#[tauri::command]
pub async fn music_get(id: String) -> Result<Response> {
    match find(&id).await? {
        Some(path) => {
            Ok(Response::new(tokio::fs::read(path).await.map_err(error)?))
        }
        None => Ok(Response::new(Vec::new())),
    }
}

#[tauri::command]
pub async fn music_remove(id: String) -> Result<()> {
    if let Some(path) = find(&id).await? {
        tokio::fs::remove_file(path).await.map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn music_usage() -> Result<MusicUsage> {
    Ok(MusicUsage {
        used: used_bytes().await?,
        limit: MAX_TOTAL_BYTES,
    })
}

/// The ids of every track in the folder.
#[tauri::command]
pub async fn music_list() -> Result<Vec<String>> {
    let dir = music_dir().await?;
    let mut ids = Vec::new();
    let mut entries = tokio::fs::read_dir(&dir).await.map_err(error)?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Some(stem) =
            entry.path().file_stem().and_then(|stem| stem.to_str())
        {
            ids.push(stem.to_string());
        }
    }
    Ok(ids)
}
