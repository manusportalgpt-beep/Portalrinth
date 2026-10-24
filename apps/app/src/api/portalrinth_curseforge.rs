//! Portalrinth's CurseForge commands.
//!
//! `curseforge_set_api_key` hands the backend the key the frontend was built
//! with. The key is a build-time constant of the frontend's — vite bakes it
//! into the bundle — so the frontend says at startup what it is, and whether
//! CurseForge is on, and the backend keeps it. Passing `null` is meaningful: a
//! build configured without a key says so, and CurseForge lookups quietly do
//! nothing rather than failing anything — unless the user brought a key of
//! their own, which the backend keeps and the frontend never reads back.
//!
//! The rest are the browse page's: searching CurseForge, a project's page,
//! installing into an instance, and the files an instance is waiting on
//! because their author keeps them off launchers.

use crate::api::Result;
use theseus::curseforge_blocked::PendingFile;
use theseus::curseforge_browse::{
    self, Category, InstallOutcome, Project, ProjectFile, ProjectVersion,
    SearchQuery, SearchResults,
};
use theseus::curseforge_metadata;
use theseus::curseforge_search::{self, CurseforgeFile, CurseforgeFilters};
use theseus::pack::manifest_preview::PackManifest;
use theseus::{Error as TheseusError, ErrorKind as TheseusErrorKind};

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-curseforge")
        .invoke_handler(tauri::generate_handler![
            curseforge_set_api_key,
            curseforge_is_available,
            curseforge_files,
            curseforge_download_urls,
            curseforge_install_mod,
            curseforge_filters,
            pack_manifest,
            curseforge_has_user_key,
            curseforge_set_user_key,
            curseforge_check_key,
            curseforge_set_options,
            curseforge_clear_cache,
            curseforge_search,
            curseforge_get_categories,
            curseforge_get_project,
            curseforge_get_description,
            curseforge_get_files,
            curseforge_get_version,
            curseforge_install_project,
            curseforge_pending_files,
            curseforge_check_pending_downloads,
            curseforge_dismiss_pending_file,
        ])
        .build()
}

#[tauri::command]
pub async fn curseforge_set_api_key(
    key: Option<String>,
    enabled: Option<bool>,
) -> Result<()> {
    // A caller that does not say whether CurseForge is on means it is.
    curseforge_metadata::set_api_key(key, enabled.unwrap_or(true));
    Ok(())
}

#[tauri::command]
pub async fn curseforge_has_user_key() -> Result<bool> {
    Ok(curseforge_metadata::has_user_key())
}

#[tauri::command]
pub async fn curseforge_set_user_key(key: Option<String>) -> Result<()> {
    Ok(curseforge_metadata::set_user_key(key).await?)
}

#[tauri::command]
pub async fn curseforge_check_key(key: Option<String>) -> Result<bool> {
    Ok(curseforge_metadata::check_key(key).await?)
}

#[tauri::command]
pub async fn curseforge_set_options(
    options: curseforge_metadata::CurseforgeOptions,
) -> Result<()> {
    curseforge_metadata::set_options(options);
    Ok(())
}

#[tauri::command]
pub async fn curseforge_clear_cache() -> Result<()> {
    curseforge_browse::clear_cache();
    Ok(())
}

#[tauri::command]
pub async fn curseforge_search(query: SearchQuery) -> Result<SearchResults> {
    Ok(curseforge_browse::search(query).await?)
}

#[tauri::command]
pub async fn curseforge_get_categories(
    project_type: String,
) -> Result<Vec<Category>> {
    Ok(curseforge_browse::get_categories(&project_type).await?)
}

#[tauri::command]
pub async fn curseforge_get_project(id: String) -> Result<Project> {
    Ok(curseforge_browse::get_project(&id).await?)
}

#[tauri::command]
pub async fn curseforge_get_description(id: String) -> Result<String> {
    Ok(curseforge_browse::get_description(&id).await?)
}

#[tauri::command]
pub async fn curseforge_get_files(
    id: String,
    game_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ProjectFile>> {
    Ok(curseforge_browse::get_files(&id, game_version, loader).await?)
}

#[tauri::command]
pub async fn curseforge_get_version(
    id: String,
    file_id: String,
) -> Result<ProjectVersion> {
    Ok(curseforge_browse::get_version(&id, &file_id).await?)
}

#[tauri::command]
pub async fn curseforge_install_project(
    instance_id: String,
    project_id: String,
    file_id: Option<String>,
) -> Result<InstallOutcome> {
    Ok(
        curseforge_browse::install_project(&instance_id, &project_id, file_id)
            .await?,
    )
}

#[tauri::command]
pub async fn curseforge_pending_files(
    instance_id: String,
) -> Result<Vec<PendingFile>> {
    Ok(curseforge_browse::pending_files(&instance_id).await?)
}

#[tauri::command]
pub async fn curseforge_check_pending_downloads(
    instance_id: String,
) -> Result<Vec<PendingFile>> {
    Ok(curseforge_browse::check_pending_downloads(&instance_id).await?)
}

#[tauri::command]
pub async fn curseforge_dismiss_pending_file(
    instance_id: String,
    file_id: String,
) -> Result<()> {
    Ok(curseforge_browse::dismiss_pending_file(&instance_id, &file_id).await?)
}

/// Whether this build can ask CurseForge anything at all.
#[tauri::command]
pub fn curseforge_is_available() -> bool {
    curseforge_metadata::is_available()
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
