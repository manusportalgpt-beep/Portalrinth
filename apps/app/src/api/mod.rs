use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use theseus::error_code;

/// Every WebView2 environment in the process must be created with the same
/// browser arguments, or the second one dies with HRESULT 0x8007139F
/// (ERROR_INVALID_STATE). The main window pins its own set through
/// tauri.conf.json, so every extra window (sign-in, built-in browser, Ely
/// skin uploads) repeats exactly the same line here.
pub const WEBVIEW_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,MediaSessionService";

pub mod auth;
pub mod ely_auth;
pub mod import;
pub mod install;
pub mod instance;
pub mod jre;
pub mod logs;
pub mod metadata;
pub mod minecraft_skins;
pub mod mr_auth;
pub mod portalrinth_background;
pub mod portalrinth_clipboard;
pub mod portalrinth_crash;
pub mod portalrinth_curseforge;
pub mod portalrinth_bedrock;
pub mod portalrinth_dns;
pub mod portalrinth_lan;
pub mod portalrinth_music;
pub mod portalrinth_offline_auth;
pub mod portalrinth_archive;
pub mod portalrinth_bridge;
pub mod portalrinth_recovery;
pub mod onboarding_checklist;
pub mod process;
pub mod reports;
pub mod settings;
pub mod shortcuts;
pub mod tags;
mod thumbnails;
pub mod users;
pub mod utils;
pub mod window_icon;

pub mod ads;
#[cfg(target_os = "macos")]
mod ads_occlusion_macos;
#[cfg(windows)]
mod ads_occlusion_windows;
pub mod cache;
pub mod files;
pub mod friends;
pub mod worlds;

mod oauth_utils;

pub type Result<T> = std::result::Result<T, CommandError>;

#[derive(Debug)]
pub struct CommandError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for CommandError {
    fn from(error: E) -> Self {
        Self(error.into())
    }
}

impl Serialize for CommandError {
    fn serialize<S>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        tracing::warn!("{:?}", self.0);

        let mut state = serializer.serialize_struct("CommandError", 2)?;
        state.serialize_field("message", &format!("{:#}", self.0))?;
        state.serialize_field("code", error_code(&self.0))?;
        state.end()
    }
}
