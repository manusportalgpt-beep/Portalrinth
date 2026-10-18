//! Handing the backend the CurseForge key the frontend was built with, and
//! asking CurseForge things with it.
//!
//! The key is a build-time constant of the frontend's вЂ” vite bakes it into the
//! bundle вЂ” and until now it only ever travelled as an argument on a modpack
//! install. Naming what a CurseForge file is needs it too, from deep inside the
//! content listing where no such argument reaches, so the frontend says once at
//! startup what the key is and the backend keeps it.
//!
//! Passing `null` is meaningful: a build configured without a key says so, and
//! CurseForge lookups quietly do nothing rather than failing anything. Search
//! answers with nothing in that case, so a launcher that cannot search CurseForge
//! looks like one with nothing to find rather than one that is broken.

use crate::api::Result;
use theseus::{Error as TheseusError, ErrorKind as TheseusErrorKind};
use theseus::curseforge_metadata;
use theseus::pack::manifest_preview::PackManifest;
use theseus::curseforge_search::{
    CurseforgeFilters,
    self, CurseforgeFile, CurseforgeSearchPage, CurseforgeSearchQuery,
};

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-curseforge")
        .invoke_handler(tauri::generate_handler![
            curseforge_set_api_key,
            curseforge_is_available,
            curseforge_search,
            curseforge_files,
            curseforge_download_urls,
            curseforge_install_mod,
            curseforge_filters,
            pack_manifest,
        ])
        .build()
}

#[tauri::command]
pub async fn curseforge_set_api_key(key: Option<String>) -> Result<()> {
    curseforge_metadata::set_api_key(key);
    Ok(())
}

/// Whether this build can ask CurseForge anything at all.
#[tauri::command]
pub fn curseforge_is_available() -> bool {
    curseforge_search::is_available()
}

/// A page of CurseForge projects.
#[tauri::command]
pub async fn curseforge_search(query: CurseforgeSearchQuery) -> Result<CurseforgeSearchPage> {
    Ok(curseforge_search::search(&query).await?)
}

/// One project's files, newest first, for one game version and loader.
#[tauri::command]
pub async fn curseforge_files(
    mod_id: u64,
    game_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<CurseforgeFile>> {
    Ok(curseforge_search::files(mod_id, game_version.as_deref(), loader.as_deref()).await?)
}

/// What CurseForge itself can be filtered by, in CurseForge's own words.
#[tauri::command]
pub async fn curseforge_filters() -> Result<CurseforgeFilters> {
    let key = curseforge_metadata::api_key().ok_or_else(|| {
        TheseusError::from(TheseusErrorKind::InputError(
            "no CurseForge key is configured".to_string(),
        ))
    })?;
    let http = theseus::curseforge_search::build_client(&key)?;
    Ok(theseus::curseforge_search::filters(&http, &key).await?)
}

/// What is inside a modpack file, read before anything is installed.
#[tauri::command]
pub async fn pack_manifest(path: String) -> Result<PackManifest> {
    let state = theseus::State::get().await?;
    let manifest = theseus::pack::manifest_preview::read_pack_manifest(std::path::Path::new(&path)).await?;
    Ok(theseus::pack::manifest_preview::resolve_pack_entries(manifest, &state).await)
}

/// Where one file can be fetched from, most likely first.
#[tauri::command]
pub async fn curseforge_download_urls(
    mod_id: u64,
    file_id: u64,
) -> Result<Vec<String>> {
    Ok(curseforge_search::download_urls(mod_id, file_id).await?)
}

/// Puts one CurseForge mod into an instance, by project and file id.
#[tauri::command]
pub async fn curseforge_install_mod(
    instance_id: String,
    mod_id: u64,
    file_id: u64,
) -> Result<String> {
    let state = theseus::State::get().await?;
    Ok(
        theseus::pack::install_curseforge::install_curseforge_mod(
            &instance_id, mod_id, file_id, &state,
        )
        .await?,
    )
}