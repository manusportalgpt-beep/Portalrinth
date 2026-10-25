//! Minecraft: Bedrock Edition builds: the game installed from the Microsoft
//! Store, and the CurseForge content dropped into its `com.mojang` folders.
//!
//! See `theseus::api::bedrock`. None of this touches Java instances.

use std::path::PathBuf;

use crate::api::Result;
use theseus::bedrock::{
    self, BedrockCategory, BedrockClass, BedrockFile, BedrockProfile,
    BedrockProject, BedrockSearchPage, BedrockStatus,
};

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-bedrock")
        .invoke_handler(tauri::generate_handler![
            bedrock_status,
            bedrock_list,
            bedrock_get,
            bedrock_create,
            bedrock_rename,
            bedrock_set_icon,
            bedrock_remove,
            bedrock_launch,
            bedrock_available,
            bedrock_classes,
            bedrock_categories,
            bedrock_search,
            bedrock_project,
            bedrock_description,
            bedrock_files,
            bedrock_install,
            bedrock_uninstall,
        ])
        .build()
}

#[tauri::command]
pub async fn bedrock_status() -> Result<BedrockStatus> {
    Ok(bedrock::status().await?)
}

#[tauri::command]
pub async fn bedrock_list() -> Result<Vec<BedrockProfile>> {
    Ok(bedrock::list().await?)
}

#[tauri::command]
pub async fn bedrock_get(id: String) -> Result<BedrockProfile> {
    Ok(bedrock::get(&id).await?)
}

#[tauri::command]
pub async fn bedrock_create(
    name: String,
    icon_path: Option<PathBuf>,
) -> Result<BedrockProfile> {
    Ok(bedrock::create(name, icon_path).await?)
}

#[tauri::command]
pub async fn bedrock_rename(
    id: String,
    name: String,
) -> Result<BedrockProfile> {
    Ok(bedrock::rename(&id, name).await?)
}

#[tauri::command]
pub async fn bedrock_set_icon(
    id: String,
    icon_path: Option<PathBuf>,
) -> Result<BedrockProfile> {
    Ok(bedrock::set_icon(&id, icon_path).await?)
}

#[tauri::command]
pub async fn bedrock_remove(id: String, remove_content: bool) -> Result<()> {
    Ok(bedrock::remove(&id, remove_content).await?)
}

#[tauri::command]
pub async fn bedrock_launch(id: String) -> Result<()> {
    Ok(bedrock::launch(&id).await?)
}

/// Whether a CurseForge key is set, without which nothing can be browsed.
#[tauri::command]
pub async fn bedrock_available() -> Result<bool> {
    Ok(bedrock::is_available())
}

#[tauri::command]
pub async fn bedrock_classes() -> Result<Vec<BedrockClass>> {
    Ok(bedrock::classes().await?)
}

#[tauri::command]
pub async fn bedrock_categories(class_id: u64) -> Result<Vec<BedrockCategory>> {
    Ok(bedrock::categories(class_id).await?)
}

#[tauri::command]
pub async fn bedrock_search(
    class_id: Option<u64>,
    category_id: Option<u64>,
    query: String,
    sort_field: u32,
    index: u64,
    page_size: u64,
) -> Result<BedrockSearchPage> {
    Ok(bedrock::search(
        class_id,
        category_id,
        query,
        sort_field,
        index,
        page_size,
    )
    .await?)
}

#[tauri::command]
pub async fn bedrock_project(project_id: u64) -> Result<BedrockProject> {
    Ok(bedrock::project(project_id).await?)
}

#[tauri::command]
pub async fn bedrock_description(project_id: u64) -> Result<String> {
    Ok(bedrock::description(project_id).await?)
}

#[tauri::command]
pub async fn bedrock_files(project_id: u64) -> Result<Vec<BedrockFile>> {
    Ok(bedrock::files(project_id).await?)
}

#[tauri::command]
pub async fn bedrock_install(
    profile_id: String,
    project_id: u64,
    file_id: u64,
) -> Result<BedrockProfile> {
    Ok(bedrock::install(&profile_id, project_id, file_id).await?)
}

#[tauri::command]
pub async fn bedrock_uninstall(
    profile_id: String,
    project_id: u64,
) -> Result<BedrockProfile> {
    Ok(bedrock::uninstall(&profile_id, project_id).await?)
}
