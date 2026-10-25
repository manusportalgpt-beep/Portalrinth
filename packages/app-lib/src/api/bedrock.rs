//! Portalrinth's own: Minecraft: Bedrock Edition, as a core of its own.
//!
//! Bedrock is nothing like the Java instances the rest of the launcher looks
//! after, and none of that machinery is used here or touched by it:
//!
//!   * The game is a Microsoft Store app. It is started through its `minecraft:`
//!     link, and when it is missing the Store page is handed back instead.
//!   * There is no instance folder. Every pack and world lives in the game's own
//!     `com.mojang`, which since 1.21.120 (the move to GDK) is split in two:
//!     packs in `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang`,
//!     worlds and settings in `Users\<account id>\games\com.mojang`. Older
//!     installs keep everything in the UWP package's `LocalState`.
//!   * Content comes only from CurseForge's Minecraft Bedrock game (78022), as
//!     `.mcpack`, `.mcaddon`, `.mcworld` and `.mctemplate` files. Those are zip
//!     files holding one or more packs, each recognised by its `manifest.json`,
//!     and each copied into the folder its own module type belongs in.
//!
//! A Bedrock "build" is the launcher's own record — a name, an icon and the
//! list of what was installed through it, with the folders each file became —
//! kept in `bedrock_profiles.json` next to the launcher's other settings, so it
//! is still there after the launcher is closed.

use std::collections::HashSet;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::State;

/// CurseForge's id for Minecraft: Bedrock Edition.
pub const GAME_ID_BEDROCK: u64 = 78022;
/// The game's Microsoft Store product.
pub const STORE_PRODUCT_ID: &str = "9NBLGGH2JHXJ";
const STORE_APP_URL: &str = "ms-windows-store://pdp/?ProductId=9NBLGGH2JHXJ";
const STORE_WEB_URL: &str =
    "https://www.microsoft.com/store/productId/9NBLGGH2JHXJ";
const UWP_PACKAGE: &str = "Microsoft.MinecraftUWP_8wekyb3d8bbwe";
const PROFILES_FILE: &str = "bedrock_profiles.json";
const API: &str = "https://api.curseforge.com/v1";

// ---- Types --------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockStatus {
    /// Bedrock only runs on Windows here.
    pub supported: bool,
    pub installed: bool,
    /// Where packs go.
    pub packs_dir: Option<PathBuf>,
    /// Where worlds go.
    pub worlds_dir: Option<PathBuf>,
    pub store_url: String,
    pub store_web_url: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BedrockPackKind {
    Resource,
    Behavior,
    Skin,
    World,
    WorldTemplate,
}

impl BedrockPackKind {
    fn folder(self) -> &'static str {
        match self {
            Self::Resource => "resource_packs",
            Self::Behavior => "behavior_packs",
            Self::Skin => "skin_packs",
            Self::World => "minecraftWorlds",
            Self::WorldTemplate => "world_templates",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockInstalledPack {
    pub kind: BedrockPackKind,
    pub name: String,
    pub path: PathBuf,
    #[serde(default)]
    pub uuid: Option<String>,
    #[serde(default)]
    pub version: Option<[u64; 3]>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockContent {
    pub project_id: u64,
    pub file_id: u64,
    pub name: String,
    pub file_name: String,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub class_id: Option<u64>,
    pub installed_at: DateTime<Utc>,
    #[serde(default)]
    pub packs: Vec<BedrockInstalledPack>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon_path: Option<String>,
    pub created: DateTime<Utc>,
    #[serde(default)]
    pub last_played: Option<DateTime<Utc>>,
    #[serde(default)]
    pub content: Vec<BedrockContent>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct ProfilesFile {
    #[serde(default)]
    profiles: Vec<BedrockProfile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockClass {
    pub id: u64,
    pub name: String,
    pub slug: String,
    pub icon_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockCategory {
    pub id: u64,
    pub class_id: Option<u64>,
    pub name: String,
    pub slug: String,
    pub icon_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockProject {
    pub id: u64,
    pub name: String,
    pub slug: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub author: Option<String>,
    pub downloads: u64,
    pub class_id: Option<u64>,
    pub website_url: Option<String>,
    pub date_modified: Option<String>,
    pub categories: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockSearchPage {
    pub hits: Vec<BedrockProject>,
    pub total: u64,
    pub index: u64,
    pub page_size: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BedrockFile {
    pub id: u64,
    pub display_name: String,
    pub file_name: String,
    pub file_date: Option<String>,
    pub game_versions: Vec<String>,
    pub downloads: u64,
}

// ---- Folders --------------------------------------------------------------

fn roaming_root() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|appdata| appdata.join("Minecraft Bedrock"))
}

fn uwp_com_mojang() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|local| {
        PathBuf::from(local)
            .join("Packages")
            .join(UWP_PACKAGE)
            .join("LocalState")
            .join("games")
            .join("com.mojang")
    })
}

/// The shared `com.mojang`, where packs go.
fn packs_root() -> Option<PathBuf> {
    if let Some(root) = roaming_root() {
        let shared = root
            .join("Users")
            .join("Shared")
            .join("games")
            .join("com.mojang");
        if shared.exists() || root.exists() {
            return Some(shared);
        }
    }
    uwp_com_mojang().filter(|path| path.exists())
}

/// Every account's own `com.mojang`, the most recently used first.
fn account_roots() -> Vec<PathBuf> {
    let mut found: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    if let Some(users) = roaming_root().map(|root| root.join("Users"))
        && let Ok(entries) = std::fs::read_dir(&users)
    {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.eq_ignore_ascii_case("shared") {
                continue;
            }
            let com_mojang = entry.path().join("games").join("com.mojang");
            if com_mojang.is_dir() {
                let modified = std::fs::metadata(&com_mojang)
                    .and_then(|meta| meta.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                found.push((modified, com_mojang));
            }
        }
    }
    found.sort_by(|a, b| b.0.cmp(&a.0));
    let mut roots: Vec<PathBuf> =
        found.into_iter().map(|(_, path)| path).collect();
    if roots.is_empty()
        && let Some(uwp) = uwp_com_mojang().filter(|path| path.exists())
    {
        roots.push(uwp);
    }
    roots
}

/// Where worlds go: the account that played last, or the shared folder when
/// the game has not been started under an account yet.
fn worlds_root() -> Option<PathBuf> {
    account_roots().into_iter().next().or_else(packs_root)
}

fn target_dir(kind: BedrockPackKind) -> crate::Result<PathBuf> {
    let root = match kind {
        BedrockPackKind::World => worlds_root(),
        _ => packs_root(),
    };
    let root = root.ok_or_else(|| {
        crate::ErrorKind::InputError(
            "Minecraft: Bedrock Edition's com.mojang folder was not found. Start the game once, then try again."
                .to_string(),
        )
    })?;
    Ok(root.join(kind.folder()))
}

#[cfg(windows)]
fn hidden_command(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut command = std::process::Command::new(program);
    command.creation_flags(0x0800_0000);
    command
}

#[cfg(windows)]
fn store_app_installed() -> bool {
    let output = hidden_command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-AppxPackage -Name Microsoft.MinecraftUWP).InstallLocation",
        ])
        .output();
    if let Ok(output) = output
        && !String::from_utf8_lossy(&output.stdout).trim().is_empty()
    {
        return true;
    }
    // GDK builds installed through the Xbox app land here unless moved.
    Path::new(r"C:\XboxGames\Minecraft for Windows").exists()
}

#[cfg(not(windows))]
fn store_app_installed() -> bool {
    false
}

pub async fn status() -> crate::Result<BedrockStatus> {
    let supported = cfg!(windows);
    let installed = if supported {
        tokio::task::spawn_blocking(store_app_installed)
            .await
            .unwrap_or(false)
    } else {
        false
    };
    Ok(BedrockStatus {
        supported,
        installed,
        packs_dir: packs_root(),
        worlds_dir: worlds_root(),
        store_url: STORE_APP_URL.to_string(),
        store_web_url: STORE_WEB_URL.to_string(),
    })
}

// ---- Builds -------------------------------------------------------------

async fn profiles_path() -> crate::Result<PathBuf> {
    let state = State::get().await?;
    Ok(state.directories.settings_dir.join(PROFILES_FILE))
}

async fn read_profiles() -> crate::Result<ProfilesFile> {
    let path = profiles_path().await?;
    match tokio::fs::read(&path).await {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(ProfilesFile::default())
        }
        Err(error) => Err(crate::ErrorKind::IOError(
            crate::util::io::IOError::with_path(error, &path),
        )
        .into()),
    }
}

async fn write_profiles(file: &ProfilesFile) -> crate::Result<()> {
    let path = profiles_path().await?;
    let bytes = serde_json::to_vec_pretty(file)?;
    let temporary = path.with_extension("json.tmp");
    tokio::fs::write(&temporary, bytes).await.map_err(|error| {
        crate::ErrorKind::IOError(crate::util::io::IOError::with_path(
            error, &temporary,
        ))
    })?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| {
            crate::ErrorKind::IOError(crate::util::io::IOError::with_path(
                error, &path,
            ))
        })?;
    Ok(())
}

fn not_found(id: &str) -> crate::Error {
    crate::ErrorKind::InputError(format!("no Bedrock build {id}")).into()
}

pub async fn list() -> crate::Result<Vec<BedrockProfile>> {
    Ok(read_profiles().await?.profiles)
}

pub async fn get(id: &str) -> crate::Result<BedrockProfile> {
    read_profiles()
        .await?
        .profiles
        .into_iter()
        .find(|profile| profile.id == id)
        .ok_or_else(|| not_found(id))
}

/// Keeps a copy of the picture with the launcher's other icons, so the build
/// keeps its icon even if the original file is moved or deleted.
async fn keep_icon(id: &str, source: &Path) -> crate::Result<String> {
    let state = State::get().await?;
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| {
            ["png", "jpg", "jpeg", "webp", "gif"].contains(&extension.as_str())
        })
        .ok_or_else(|| {
            crate::ErrorKind::InputError(
                "a Bedrock build icon has to be a PNG, JPEG, WebP or GIF picture"
                    .to_string(),
            )
        })?;
    let dir = state.directories.caches_dir().join("icons");
    tokio::fs::create_dir_all(&dir).await.map_err(|error| {
        crate::ErrorKind::IOError(crate::util::io::IOError::with_path(
            error, &dir,
        ))
    })?;
    let target = dir.join(format!(
        "bedrock-{id}-{}.{extension}",
        Utc::now().timestamp_millis()
    ));
    tokio::fs::copy(source, &target).await.map_err(|error| {
        crate::ErrorKind::IOError(crate::util::io::IOError::with_path(
            error, source,
        ))
    })?;
    Ok(target.to_string_lossy().to_string())
}

pub async fn create(
    name: String,
    icon_path: Option<PathBuf>,
) -> crate::Result<BedrockProfile> {
    let id = uuid::Uuid::new_v4().to_string();
    let icon_path = match icon_path {
        Some(path) => Some(keep_icon(&id, &path).await?),
        None => None,
    };
    let name = name.trim();
    let profile = BedrockProfile {
        id,
        name: if name.is_empty() {
            "Minecraft Bedrock".to_string()
        } else {
            name.to_string()
        },
        icon_path,
        created: Utc::now(),
        last_played: None,
        content: Vec::new(),
    };
    let mut file = read_profiles().await?;
    file.profiles.push(profile.clone());
    write_profiles(&file).await?;
    Ok(profile)
}

pub async fn rename(id: &str, name: String) -> crate::Result<BedrockProfile> {
    let mut file = read_profiles().await?;
    let profile = file
        .profiles
        .iter_mut()
        .find(|profile| profile.id == id)
        .ok_or_else(|| not_found(id))?;
    let name = name.trim();
    if !name.is_empty() {
        profile.name = name.to_string();
    }
    let updated = profile.clone();
    write_profiles(&file).await?;
    Ok(updated)
}

pub async fn set_icon(
    id: &str,
    icon_path: Option<PathBuf>,
) -> crate::Result<BedrockProfile> {
    let kept = match icon_path {
        Some(path) => Some(keep_icon(id, &path).await?),
        None => None,
    };
    let mut file = read_profiles().await?;
    let profile = file
        .profiles
        .iter_mut()
        .find(|profile| profile.id == id)
        .ok_or_else(|| not_found(id))?;
    profile.icon_path = kept;
    let updated = profile.clone();
    write_profiles(&file).await?;
    Ok(updated)
}

/// Forgets a build. With `remove_content`, the packs and worlds installed
/// through it are deleted from the game as well.
pub async fn remove(id: &str, remove_content: bool) -> crate::Result<()> {
    let mut file = read_profiles().await?;
    let Some(position) =
        file.profiles.iter().position(|profile| profile.id == id)
    else {
        return Ok(());
    };
    let profile = file.profiles.remove(position);
    if remove_content {
        for content in &profile.content {
            delete_packs(&content.packs).await;
        }
    }
    write_profiles(&file).await
}

pub async fn launch(id: &str) -> crate::Result<()> {
    if !cfg!(windows) {
        return Err(crate::ErrorKind::InputError(
            "Minecraft: Bedrock Edition can only be started on Windows"
                .to_string(),
        )
        .into());
    }
    #[cfg(windows)]
    {
        hidden_command("explorer.exe")
            .arg("minecraft:")
            .spawn()
            .map_err(|error| {
                crate::ErrorKind::LauncherError(format!(
                    "could not start Minecraft: Bedrock Edition: {error}"
                ))
            })?;
    }
    let mut file = read_profiles().await?;
    if let Some(profile) =
        file.profiles.iter_mut().find(|profile| profile.id == id)
    {
        profile.last_played = Some(Utc::now());
        write_profiles(&file).await?;
    }
    Ok(())
}

// ---- CurseForge ---------------------------------------------------------

fn key() -> crate::Result<String> {
    crate::api::curseforge_metadata::api_key().ok_or_else(|| {
        crate::ErrorKind::InputError(
            "add a CurseForge API key in settings to browse Bedrock content"
                .to_string(),
        )
        .into()
    })
}

async fn cf_get(
    path: &str,
    query: &[(&str, String)],
) -> crate::Result<serde_json::Value> {
    let key = key()?;
    let http =
        crate::util::fetch::api_client_builder()
            .build()
            .map_err(|error| {
                anyhow::anyhow!("could not build a CurseForge client: {error}")
            })?;
    let response = http
        .get(format!("{API}{path}"))
        .query(query)
        .header("x-api-key", key)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|error| {
            crate::Error::from(crate::ErrorKind::FetchError(error))
        })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        crate::Error::from(crate::ErrorKind::FetchError(error))
    })?;
    if !status.is_success() {
        let preview: String =
            body.chars().filter(|c| !c.is_control()).take(200).collect();
        return Err(anyhow::anyhow!(
            "CurseForge answered HTTP {status}: {preview}"
        )
        .into());
    }
    Ok(serde_json::from_str(&body)?)
}

pub fn is_available() -> bool {
    crate::api::curseforge_metadata::api_key().is_some()
}

pub async fn classes() -> crate::Result<Vec<BedrockClass>> {
    let body = cf_get(
        "/categories",
        &[
            ("gameId", GAME_ID_BEDROCK.to_string()),
            ("classesOnly", "true".to_string()),
        ],
    )
    .await?;
    let mut classes: Vec<BedrockClass> = body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|class| {
            Some(BedrockClass {
                id: class["id"].as_u64()?,
                name: class["name"].as_str()?.to_string(),
                slug: class["slug"].as_str().unwrap_or_default().to_string(),
                icon_url: class["iconUrl"].as_str().map(str::to_string),
            })
        })
        .collect();
    classes.sort_by_key(|class| {
        let order = ["addons", "maps", "texture-packs", "scripts", "skins"];
        order
            .iter()
            .position(|slug| *slug == class.slug)
            .unwrap_or(order.len())
    });
    Ok(classes)
}

pub async fn categories(class_id: u64) -> crate::Result<Vec<BedrockCategory>> {
    let body = cf_get(
        "/categories",
        &[
            ("gameId", GAME_ID_BEDROCK.to_string()),
            ("classId", class_id.to_string()),
        ],
    )
    .await?;
    let mut categories: Vec<BedrockCategory> = body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|category| category["isClass"].as_bool() != Some(true))
        .filter_map(|category| {
            Some(BedrockCategory {
                id: category["id"].as_u64()?,
                class_id: category["classId"].as_u64(),
                name: category["name"].as_str()?.to_string(),
                slug: category["slug"].as_str().unwrap_or_default().to_string(),
                icon_url: category["iconUrl"].as_str().map(str::to_string),
            })
        })
        .collect();
    categories.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(categories)
}

fn to_project(value: &serde_json::Value) -> Option<BedrockProject> {
    Some(BedrockProject {
        id: value["id"].as_u64()?,
        name: value["name"].as_str()?.to_string(),
        slug: value["slug"].as_str().unwrap_or_default().to_string(),
        summary: value["summary"].as_str().unwrap_or_default().to_string(),
        icon_url: value["logo"]["thumbnailUrl"]
            .as_str()
            .or_else(|| value["logo"]["url"].as_str())
            .map(str::to_string),
        author: value["authors"][0]["name"].as_str().map(str::to_string),
        downloads: value["downloadCount"]
            .as_f64()
            .map(|count| count as u64)
            .unwrap_or_default(),
        class_id: value["classId"].as_u64(),
        website_url: value["links"]["websiteUrl"].as_str().map(str::to_string),
        date_modified: value["dateModified"].as_str().map(str::to_string),
        categories: value["categories"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|category| {
                category["name"].as_str().map(str::to_string)
            })
            .collect(),
    })
}

pub async fn search(
    class_id: Option<u64>,
    category_id: Option<u64>,
    query: String,
    sort_field: u32,
    index: u64,
    page_size: u64,
) -> crate::Result<BedrockSearchPage> {
    let page_size = page_size.clamp(1, 50);
    let mut params = vec![
        ("gameId", GAME_ID_BEDROCK.to_string()),
        ("pageSize", page_size.to_string()),
        ("index", index.min(9_950).to_string()),
        ("searchFilter", query),
        ("sortField", sort_field.max(1).to_string()),
        ("sortOrder", "desc".to_string()),
    ];
    if let Some(class_id) = class_id {
        params.push(("classId", class_id.to_string()));
    }
    if let Some(category_id) = category_id {
        params.push(("categoryId", category_id.to_string()));
    }
    let body = cf_get("/mods/search", &params).await?;
    let hits = body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(to_project)
        .collect();
    Ok(BedrockSearchPage {
        hits,
        total: body["pagination"]["totalCount"]
            .as_u64()
            .unwrap_or_default(),
        index,
        page_size,
    })
}

pub async fn project(project_id: u64) -> crate::Result<BedrockProject> {
    let body = cf_get(&format!("/mods/{project_id}"), &[]).await?;
    to_project(&body["data"]).ok_or_else(|| {
        anyhow::anyhow!("CurseForge has no project {project_id}").into()
    })
}

pub async fn description(project_id: u64) -> crate::Result<String> {
    let body = cf_get(&format!("/mods/{project_id}/description"), &[]).await?;
    Ok(body["data"].as_str().unwrap_or_default().to_string())
}

pub async fn files(project_id: u64) -> crate::Result<Vec<BedrockFile>> {
    let body = cf_get(
        &format!("/mods/{project_id}/files"),
        &[("pageSize", "50".to_string())],
    )
    .await?;
    let mut files: Vec<BedrockFile> = body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|file| file["isAvailable"].as_bool() != Some(false))
        .filter_map(|file| {
            Some(BedrockFile {
                id: file["id"].as_u64()?,
                display_name: file["displayName"]
                    .as_str()
                    .or_else(|| file["fileName"].as_str())?
                    .to_string(),
                file_name: file["fileName"].as_str()?.to_string(),
                file_date: file["fileDate"].as_str().map(str::to_string),
                game_versions: file["gameVersions"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|version| version.as_str().map(str::to_string))
                    .collect(),
                downloads: file["downloadCount"].as_u64().unwrap_or_default(),
            })
        })
        .collect();
    files.sort_by(|a, b| b.file_date.cmp(&a.file_date));
    Ok(files)
}

// ---- Installing ---------------------------------------------------------

async fn download(
    project_id: u64,
    file_id: u64,
) -> crate::Result<bytes::Bytes> {
    let urls =
        crate::api::curseforge_search::download_urls(project_id, file_id)
            .await?;
    let http =
        crate::util::fetch::api_client_builder()
            .build()
            .map_err(|error| {
                anyhow::anyhow!("could not build a download client: {error}")
            })?;
    let mut last_error = None;
    for url in urls {
        match http.get(&url).send().await {
            Ok(response) if response.status().is_success() => {
                return response.bytes().await.map_err(|error| {
                    crate::ErrorKind::FetchError(error).into()
                });
            }
            Ok(response) => {
                last_error =
                    Some(format!("HTTP {} from {url}", response.status()));
            }
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    Err(anyhow::anyhow!(
        "could not download the Bedrock file: {}",
        last_error.unwrap_or_else(|| "no download address".to_string())
    )
    .into())
}

/// One pack found inside a file: where it sits in the archive and what it is.
struct FoundPack {
    prefix: String,
    kind: BedrockPackKind,
    name: String,
    uuid: Option<String>,
    version: Option<[u64; 3]>,
}

fn strip_bom(bytes: &[u8]) -> &[u8] {
    bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes)
}

/// `manifest.json` files are hand-written and often carry comments or a
/// trailing comma, which the game forgives. So does this.
fn lenient_json(bytes: &[u8]) -> Option<serde_json::Value> {
    let text = String::from_utf8_lossy(strip_bom(bytes)).to_string();
    if let Ok(value) = serde_json::from_str(&text) {
        return Some(value);
    }
    let mut cleaned = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    while let Some(c) = chars.next() {
        if in_string {
            cleaned.push(c);
            if c == '\\' {
                if let Some(next) = chars.next() {
                    cleaned.push(next);
                }
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => {
                in_string = true;
                cleaned.push(c);
            }
            '/' if chars.peek() == Some(&'/') => {
                for next in chars.by_ref() {
                    if next == '\n' {
                        cleaned.push('\n');
                        break;
                    }
                }
            }
            '/' if chars.peek() == Some(&'*') => {
                chars.next();
                let mut previous = ' ';
                for next in chars.by_ref() {
                    if previous == '*' && next == '/' {
                        break;
                    }
                    previous = next;
                }
            }
            _ => cleaned.push(c),
        }
    }
    let mut without_trailing = String::with_capacity(cleaned.len());
    let characters: Vec<char> = cleaned.chars().collect();
    for (index, c) in characters.iter().enumerate() {
        if *c == ',' {
            let next =
                characters[index + 1..].iter().find(|c| !c.is_whitespace());
            if matches!(next, Some('}') | Some(']')) {
                continue;
            }
        }
        without_trailing.push(*c);
    }
    serde_json::from_str(&without_trailing).ok()
}

fn version_of(value: &serde_json::Value) -> Option<[u64; 3]> {
    if let Some(parts) = value.as_array() {
        let mut version = [0u64; 3];
        for (index, part) in parts.iter().take(3).enumerate() {
            version[index] = part.as_u64()?;
        }
        return Some(version);
    }
    let text = value.as_str()?;
    let mut version = [0u64; 3];
    for (index, part) in text.split(['.', '-']).take(3).enumerate() {
        version[index] = part.parse().ok()?;
    }
    Some(version)
}

fn kind_from_manifest(manifest: &serde_json::Value) -> Option<BedrockPackKind> {
    let modules = manifest["modules"].as_array()?;
    let types: Vec<&str> = modules
        .iter()
        .filter_map(|module| module["type"].as_str())
        .collect();
    if types.contains(&"world_template") {
        Some(BedrockPackKind::WorldTemplate)
    } else if types.contains(&"skin_pack") {
        Some(BedrockPackKind::Skin)
    } else if types.iter().any(|kind| {
        matches!(*kind, "data" | "script" | "javascript" | "client_data")
    }) {
        Some(BedrockPackKind::Behavior)
    } else if types.contains(&"resources") {
        Some(BedrockPackKind::Resource)
    } else {
        None
    }
}

fn parent_prefix(path: &str, file: &str) -> String {
    path.strip_suffix(file).unwrap_or_default().to_string()
}

fn safe_folder_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    let short: String = trimmed.chars().take(60).collect();
    if short.is_empty() {
        "pack".to_string()
    } else {
        short
    }
}

/// Strips Minecraft's `§` formatting codes from a pack's name.
fn plain_name(name: &str) -> String {
    let mut plain = String::with_capacity(name.len());
    let mut chars = name.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            plain.push(c);
        }
    }
    plain.trim().to_string()
}

fn is_nested_archive(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [".mcpack", ".mcaddon", ".mcworld", ".mctemplate", ".zip"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

fn zip_error(error: zip::result::ZipError) -> crate::Error {
    anyhow::anyhow!("the Bedrock file is not a readable archive: {error}")
        .into()
}

/// Every pack in one archive, and every archive inside it.
fn find_packs(
    bytes: &[u8],
    file_name: &str,
    depth: u32,
    out: &mut Vec<(Vec<u8>, FoundPack)>,
) -> crate::Result<()> {
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(zip_error)?;
    let names: Vec<String> = archive.file_names().map(str::to_string).collect();
    let mut packs_here: Vec<FoundPack> = Vec::new();
    let mut nested: Vec<(String, Vec<u8>)> = Vec::new();

    for name in &names {
        let normalized = name.replace('\\', "/");
        if normalized.ends_with('/') {
            continue;
        }
        let file = normalized.rsplit('/').next().unwrap_or_default();
        if file.eq_ignore_ascii_case("manifest.json") {
            let mut contents = Vec::new();
            if let Ok(mut entry) = archive.by_name(name) {
                let _ = entry.read_to_end(&mut contents);
            }
            let Some(manifest) = lenient_json(&contents) else {
                continue;
            };
            let Some(kind) = kind_from_manifest(&manifest) else {
                continue;
            };
            let prefix = parent_prefix(&normalized, file);
            // A pack inside a pack's own folder (subpacks) belongs to that pack.
            if packs_here.iter().any(|pack| {
                prefix.starts_with(&pack.prefix) && pack.prefix != prefix
            }) {
                continue;
            }
            packs_here.retain(|pack| {
                !pack.prefix.starts_with(&prefix) || pack.prefix == prefix
            });
            let header = &manifest["header"];
            packs_here.push(FoundPack {
                prefix,
                kind,
                name: plain_name(header["name"].as_str().unwrap_or(file_name)),
                uuid: header["uuid"].as_str().map(str::to_string),
                version: version_of(&header["version"]),
            });
        } else if depth < 3 && is_nested_archive(file) {
            let mut contents = Vec::new();
            if let Ok(mut entry) = archive.by_name(name) {
                let _ = entry.read_to_end(&mut contents);
            }
            nested.push((file.to_string(), contents));
        }
    }

    // A world is recognised by its level.dat rather than by a manifest.
    let world_prefixes: Vec<String> = names
        .iter()
        .map(|name| name.replace('\\', "/"))
        .filter(|name| name.rsplit('/').next() == Some("level.dat"))
        .map(|name| parent_prefix(&name, "level.dat"))
        .collect();
    let template_here = packs_here
        .iter()
        .any(|pack| pack.kind == BedrockPackKind::WorldTemplate);
    if !template_here {
        for prefix in world_prefixes {
            if packs_here.iter().any(|pack| {
                prefix.starts_with(&pack.prefix) && !pack.prefix.is_empty()
            }) {
                continue;
            }
            let level_name = {
                let mut text = String::new();
                if let Ok(mut entry) =
                    archive.by_name(&format!("{prefix}levelname.txt"))
                {
                    let _ = entry.read_to_string(&mut text);
                }
                text.trim().to_string()
            };
            // The packs a world carries inside it stay inside it.
            packs_here.retain(|pack| !pack.prefix.starts_with(&prefix));
            packs_here.push(FoundPack {
                prefix,
                kind: BedrockPackKind::World,
                name: if level_name.is_empty() {
                    file_name
                        .rsplit_once('.')
                        .map_or(file_name, |(stem, _)| stem)
                        .to_string()
                } else {
                    level_name
                },
                uuid: None,
                version: None,
            });
        }
    }

    for pack in packs_here {
        out.push((bytes.to_vec(), pack));
    }
    for (name, contents) in nested {
        find_packs(&contents, &name, depth + 1, out)?;
    }
    Ok(())
}

fn io_error(error: std::io::Error, path: &Path) -> crate::Error {
    crate::ErrorKind::IOError(crate::util::io::IOError::with_path(error, path))
        .into()
}

/// Copies one pack out of its archive into the game's folder for its kind.
fn extract_pack(
    bytes: &[u8],
    pack: &FoundPack,
) -> crate::Result<BedrockInstalledPack> {
    let parent = target_dir(pack.kind)?;
    std::fs::create_dir_all(&parent)
        .map_err(|error| io_error(error, &parent))?;

    let base = match (&pack.kind, &pack.uuid) {
        (BedrockPackKind::World, _) => format!(
            "{}-{}",
            safe_folder_name(&pack.name),
            &uuid::Uuid::new_v4().simple().to_string()[..8]
        ),
        (_, Some(uuid)) => format!(
            "{}-{}",
            safe_folder_name(&pack.name),
            &uuid
                .chars()
                .filter(|c| c.is_ascii_hexdigit())
                .take(8)
                .collect::<String>()
        ),
        _ => safe_folder_name(&pack.name),
    };
    let target = parent.join(&base);
    if target.exists() {
        // The same pack again: an update replaces it rather than sitting beside it.
        std::fs::remove_dir_all(&target)
            .map_err(|error| io_error(error, &target))?;
    }
    std::fs::create_dir_all(&target)
        .map_err(|error| io_error(error, &target))?;

    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(zip_error)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(zip_error)?;
        let name = entry.name().replace('\\', "/");
        let Some(relative) = name.strip_prefix(&pack.prefix) else {
            continue;
        };
        if relative.is_empty() {
            continue;
        }
        // Never let an entry climb out of the pack's own folder.
        let Some(safe) = entry.enclosed_name() else {
            continue;
        };
        let _ = safe;
        if relative.split('/').any(|part| part == "..") {
            continue;
        }
        let out_path = target.join(relative);
        if name.ends_with('/') {
            std::fs::create_dir_all(&out_path)
                .map_err(|error| io_error(error, &out_path))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| io_error(error, parent))?;
        }
        let mut out = std::fs::File::create(&out_path)
            .map_err(|error| io_error(error, &out_path))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|error| io_error(error, &out_path))?;
    }

    Ok(BedrockInstalledPack {
        kind: pack.kind,
        name: pack.name.clone(),
        path: target,
        uuid: pack.uuid.clone(),
        version: pack.version,
    })
}

/// Resource packs are switched on in the game's global resources, so that
/// one installed here is in use the next time the game starts.
fn global_resource_files() -> Vec<PathBuf> {
    account_roots()
        .into_iter()
        .chain(packs_root())
        .map(|root| root.join("minecraftpe").join("global_resource_packs.json"))
        .filter(|path| path.parent().is_some_and(Path::exists))
        .collect()
}

fn update_global_resources(add: &[&BedrockInstalledPack], remove: &[String]) {
    for path in global_resource_files() {
        let mut list: Vec<serde_json::Value> = std::fs::read(&path)
            .ok()
            .and_then(|bytes| lenient_json(&bytes))
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default();
        list.retain(|entry| {
            entry["pack_id"].as_str().is_none_or(|id| {
                !remove
                    .iter()
                    .any(|removed| removed.eq_ignore_ascii_case(id))
            })
        });
        for pack in add {
            let Some(uuid) = &pack.uuid else { continue };
            if list
                .iter()
                .any(|entry| entry["pack_id"].as_str() == Some(uuid.as_str()))
            {
                continue;
            }
            list.insert(
                0,
                serde_json::json!({
                    "pack_id": uuid,
                    "version": pack.version.unwrap_or([1, 0, 0]),
                }),
            );
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(&list) {
            let _ = std::fs::write(&path, bytes);
        }
    }
}

async fn delete_packs(packs: &[BedrockInstalledPack]) {
    let resource_ids: Vec<String> = packs
        .iter()
        .filter(|pack| pack.kind == BedrockPackKind::Resource)
        .filter_map(|pack| pack.uuid.clone())
        .collect();
    for pack in packs {
        let path = pack.path.clone();
        // Only folders this module made inside com.mojang are ever deleted.
        let inside_game = [packs_root(), worlds_root()]
            .into_iter()
            .flatten()
            .chain(account_roots())
            .any(|root| path.starts_with(&root));
        if inside_game
            && path.exists()
            && let Err(error) = tokio::fs::remove_dir_all(&path).await
        {
            tracing::warn!(
                "could not delete Bedrock pack {}: {error}",
                path.display()
            );
        }
    }
    if !resource_ids.is_empty() {
        let _ = tokio::task::spawn_blocking(move || {
            update_global_resources(&[], &resource_ids)
        })
        .await;
    }
}

/// Downloads one CurseForge file and puts every pack in it where the game
/// looks for it.
pub async fn install(
    profile_id: &str,
    project_id: u64,
    file_id: u64,
) -> crate::Result<BedrockProfile> {
    // Fail before downloading anything if the build is gone.
    get(profile_id).await?;

    let project = project(project_id).await?;
    let file_meta =
        cf_get(&format!("/mods/{project_id}/files/{file_id}"), &[]).await?;
    let file_name = file_meta["data"]["fileName"]
        .as_str()
        .unwrap_or("content.mcpack")
        .to_string();
    let bytes = download(project_id, file_id).await?;

    let archive_name = file_name.clone();
    let packs = tokio::task::spawn_blocking(
        move || -> crate::Result<Vec<BedrockInstalledPack>> {
            let mut found = Vec::new();
            find_packs(&bytes, &archive_name, 0, &mut found)?;
            if found.is_empty() {
                return Err(crate::ErrorKind::InputError(format!(
                    "{archive_name} has no Bedrock pack or world in it"
                ))
                .into());
            }
            let mut seen = HashSet::new();
            let mut installed = Vec::new();
            for (archive, pack) in found {
                let key = (
                    pack.kind.folder(),
                    pack.uuid.clone(),
                    pack.prefix.clone(),
                    pack.name.clone(),
                );
                if !seen.insert(key) {
                    continue;
                }
                installed.push(extract_pack(&archive, &pack)?);
            }
            let resources: Vec<&BedrockInstalledPack> = installed
                .iter()
                .filter(|pack| pack.kind == BedrockPackKind::Resource)
                .collect();
            update_global_resources(&resources, &[]);
            Ok(installed)
        },
    )
    .await
    .map_err(|error| {
        anyhow::anyhow!("the Bedrock install stopped: {error}")
    })??;

    let mut file = read_profiles().await?;
    let profile = file
        .profiles
        .iter_mut()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| not_found(profile_id))?;
    let replaced: Vec<BedrockContent> = profile
        .content
        .iter()
        .filter(|content| content.project_id == project_id)
        .cloned()
        .collect();
    profile
        .content
        .retain(|content| content.project_id != project_id);
    // Folders an older version left that this one did not reuse.
    let kept: HashSet<PathBuf> =
        packs.iter().map(|pack| pack.path.clone()).collect();
    let stale: Vec<BedrockInstalledPack> = replaced
        .into_iter()
        .flat_map(|content| content.packs)
        .filter(|pack| !kept.contains(&pack.path))
        .collect();
    profile.content.push(BedrockContent {
        project_id,
        file_id,
        name: project.name,
        file_name,
        icon_url: project.icon_url,
        author: project.author,
        class_id: project.class_id,
        installed_at: Utc::now(),
        packs,
    });
    let updated = profile.clone();
    write_profiles(&file).await?;
    delete_packs(&stale).await;
    Ok(updated)
}

pub async fn uninstall(
    profile_id: &str,
    project_id: u64,
) -> crate::Result<BedrockProfile> {
    let mut file = read_profiles().await?;
    let profile = file
        .profiles
        .iter_mut()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| not_found(profile_id))?;
    let removed: Vec<BedrockInstalledPack> = profile
        .content
        .iter()
        .filter(|content| content.project_id == project_id)
        .flat_map(|content| content.packs.clone())
        .collect();
    profile
        .content
        .retain(|content| content.project_id != project_id);
    let updated = profile.clone();
    write_profiles(&file).await?;
    delete_packs(&removed).await;
    Ok(updated)
}

/// Opens the folder a kind of content goes into.
pub fn folder_for(kind: BedrockPackKind) -> Option<PathBuf> {
    target_dir(kind).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn archive(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buffer = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buffer);
            let options = zip::write::SimpleFileOptions::default();
            for (name, contents) in files {
                writer.start_file(*name, options).unwrap();
                writer.write_all(contents).unwrap();
            }
            writer.finish().unwrap();
        }
        buffer.into_inner()
    }

    const RP: &[u8] = br#"{ "header": { "name": "\u00a7aCool RP", "uuid": "aaaaaaaa-1111", "version": [1,2,3] },
        "modules": [ { "type": "resources" } ], }"#;
    const BP: &[u8] = br#"{
        // a comment the game allows
        "header": { "name": "Cool BP", "uuid": "bbbbbbbb-2222", "version": "1.0.0" },
        "modules": [ { "type": "data" }, { "type": "script" } ]
    }"#;

    #[test]
    fn finds_both_packs_of_an_addon() {
        let rp = archive(&[("manifest.json", RP), ("pack_icon.png", b"x")]);
        let addon = archive(&[
            ("Cool RP.mcpack", &rp),
            ("BP/manifest.json", BP),
            ("BP/scripts/main.js", b""),
        ]);
        let mut found = Vec::new();
        find_packs(&addon, "cool.mcaddon", 0, &mut found).unwrap();
        let kinds: Vec<BedrockPackKind> =
            found.iter().map(|(_, pack)| pack.kind).collect();
        assert!(kinds.contains(&BedrockPackKind::Resource));
        assert!(kinds.contains(&BedrockPackKind::Behavior));
        let rp_pack = found
            .iter()
            .find(|(_, pack)| pack.kind == BedrockPackKind::Resource)
            .unwrap();
        assert_eq!(rp_pack.1.name, "Cool RP");
        assert_eq!(rp_pack.1.version, Some([1, 2, 3]));
        let bp_pack = found
            .iter()
            .find(|(_, pack)| pack.kind == BedrockPackKind::Behavior)
            .unwrap();
        assert_eq!(bp_pack.1.prefix, "BP/");
    }

    #[test]
    fn recognises_a_world() {
        let world = archive(&[
            ("level.dat", b"\0"),
            ("levelname.txt", b"My World\n"),
            ("db/CURRENT", b""),
            ("resource_packs/rp/manifest.json", RP),
        ]);
        let mut found = Vec::new();
        find_packs(&world, "my.mcworld", 0, &mut found).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].1.kind, BedrockPackKind::World);
        assert_eq!(found[0].1.name, "My World");
    }
}
