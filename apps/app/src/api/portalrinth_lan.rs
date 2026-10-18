//! Worlds opened to the local network, and the address they are published at.
//!
//! See `theseus::api::lan` for the relay protocol and for how the port a world
//! was opened on is found.

use crate::api::Result;
use theseus::lan::{self, LanRelayInfo};
use uuid::Uuid;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-lan")
        .invoke_handler(tauri::generate_handler![
            lan_list,
            lan_start,
            lan_stop,
        ])
        .build()
}

/// Every copy of an instance that is running, and where its world can be
/// reached. A world that is not open to the network is reported without an
/// address rather than left out, so that running something is enough to see it
/// here.
#[tauri::command]
pub async fn lan_list() -> Result<Vec<LanRelayInfo>> {
    Ok(lan::list().await?)
}

/// Publishes the world one running copy of an instance has open.
#[tauri::command]
pub async fn lan_start(process_uuid: Uuid) -> Result<LanRelayInfo> {
    Ok(lan::start(process_uuid).await?)
}

/// Takes a published world back down.
#[tauri::command]
pub async fn lan_stop(process_uuid: Uuid) -> Result<()> {
    Ok(lan::stop(process_uuid).await?)
}