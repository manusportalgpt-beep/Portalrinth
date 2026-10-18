//! What is inside a modpack, read before anything is installed.
//!
//! A modpack arrives as an archive: a CurseForge `manifest.json` listing project
//! and file ids, or a Modrinth `modrinth.index.json` listing version ids and the
//! paths they install to. Neither says much about itself — no name, no author,
//! no icon, nothing about which of the entries are a shader rather than a mod.
//! All of that is elsewhere, and this is the code that goes and asks for it.
//!
//! The point is to know before installing. Somebody handed a pack file wants to
//! see what is in it — what it is called, who made each part, which version it
//! pinned — and to be able to say no to some of it. Finding out afterwards means
//! uninstalling afterwards.
//!
//! Nothing here writes. It reads an archive and answers; choosing what to leave
//! out is the caller's business, and the installer still takes the whole list.

use std::collections::HashMap;
use std::path::Path;

use async_zip::base::read::seek::ZipFileReader;
use serde::{Deserialize, Serialize};

use crate::state::State;
use crate::util::io;

/// The four things a pack is made of, which is also how they are shown.
///
/// Anything the pack carries that is none of these — a config, a script, an
/// options file — is `Other`, because it is not something to be picked a version
/// of or turned off.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PackEntryKind {
    Mod,
    ResourcePack,
    DataPack,
    Shader,
    Other,
}

/// One thing in the pack, with whatever is known about it.
#[derive(Serialize, Clone, Debug)]
pub struct PackManifestEntry {
    /// Where the pack says this comes from: `curseforge`, `modrinth` or `file`.
    pub source: String,
    /// The CurseForge project id, or the Modrinth version id. Empty for a file
    /// the pack carries on its own.
    pub id: String,
    /// The CurseForge file id, when there is one. This is the pair that makes
    /// an installed file traceable back to where it came from.
    pub file_id: Option<String>,
    /// The path inside the archive for a Modrinth pack, or the file name for a
    /// CurseForge one. Kept because it is the only name an unresolved entry has.
    pub path: String,
    pub kind: PackEntryKind,
    pub title: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub icon_url: Option<String>,
    pub description: Option<String>,
    pub download_count: Option<u64>,
    pub website_url: Option<String>,
}

/// Everything read out of a pack file.
#[derive(Serialize, Clone, Debug)]
pub struct PackManifest {
    /// Which format the archive turned out to be.
    pub format: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub summary: Option<String>,
    pub game_version: Option<String>,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub entries: Vec<PackManifestEntry>,
}

#[derive(Deserialize)]
struct CurseforgeManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    minecraft: CurseforgeMinecraft,
    #[serde(default)]
    files: Vec<CurseforgeManifestFile>,
}

#[derive(Deserialize, Default)]
struct CurseforgeMinecraft {
    #[serde(default)]
    version: String,
    #[serde(default)]
    modLoaders: Vec<CurseforgeModLoader>,
}

#[derive(Deserialize)]
struct CurseforgeModLoader {
    id: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Deserialize, Default)]
struct CurseforgeManifestFile {
    #[serde(rename = "projectID")]
    project_id: Option<i64>,
    #[serde(rename = "fileID")]
    file_id: Option<i64>,
    #[serde(default)]
    required: bool,
}

#[derive(Deserialize)]
struct ModrinthIndex {
    #[serde(default)]
    name: String,
    #[serde(default)]
    versionId: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    files: Vec<ModrinthIndexFile>,
    #[serde(default)]
    dependencies: HashMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct ModrinthIndexFile {
    #[serde(default)]
    path: String,
    #[serde(default)]
    hashes: HashMap<String, String>,
}

/// Reads whichever manifest an archive carries.
///
/// The two are told apart by what is inside rather than by the file's name,
/// because a `.zip` is as likely to be one as a `.mrpack`, and a person renaming
/// a file should not change what the launcher does with it.
#[tracing::instrument(skip_all)]
pub async fn read_pack_manifest(path: &Path) -> crate::Result<PackManifest> {
    let bytes = bytes::Bytes::from(io::read(path).await?);
    let entries = zip_manifest(&bytes).await?;

    if let Some(manifest) = entry_bytes(&entries, "manifest.json") {
        return curseforge_manifest(manifest);
    }
    if let Some(index) = entry_bytes(&entries, "modrinth.index.json") {
        return modrinth_manifest(index);
    }

    Err(crate::ErrorKind::InputError(
        "This archive carries no modpack manifest: it has neither \
         `manifest.json` nor `modrinth.index.json`."
            .to_string(),
    )
    .as_error())
}

/// Reads the one manifest out of the archive, whichever of the two it is.
///
/// Only that entry is pulled out. A pack of three hundred megabytes should not
/// be read in order to be listed.
async fn zip_manifest(pack: &bytes::Bytes) -> crate::Result<Vec<(String, bytes::Bytes)>> {
    use std::io::Cursor;

    let mut reader = ZipFileReader::with_tokio(Cursor::new(pack)).await.map_err(|error| {
        crate::ErrorKind::InputError(format!(
            "This file could not be opened as an archive: {error}"
        ))
        .as_error()
    })?;

    let wanted: Vec<usize> = reader
        .file()
        .entries()
        .iter()
        .enumerate()
        .filter(|(_, entry)| {
            matches!(entry.filename().as_str(), Ok(name)
                if name == "manifest.json"
                    || name == "modrinth.index.json"
                    || name.ends_with("/manifest.json")
                    || name.ends_with("/modrinth.index.json"))
        })
        .map(|(index, _)| index)
        .collect();

    let mut found = Vec::new();
    for index in wanted {
        let mut text = String::new();
        {
            let mut entry = reader.reader_with_entry(index).await?;
            entry.read_to_string_checked(&mut text).await?;
        }
        let name = reader
            .file()
            .entries()
            .get(index)
            .map(|entry| entry.filename().to_string())
            .unwrap_or_default();
        found.push((name, bytes::Bytes::from(text.into_bytes())));
    }
    Ok(found)
}

fn entry_bytes<'a>(
    entries: &'a [(String, bytes::Bytes)],
    name: &'a str,
) -> Option<&'a [u8]> {
    entries
        .iter()
        .find(|(entry, _)| entry == name || entry.ends_with(&format!("/{name}")))
        .map(|(_, bytes)| &bytes[..])
}

fn curseforge_manifest(bytes: &[u8]) -> crate::Result<PackManifest> {
    let manifest: CurseforgeManifest = serde_json::from_slice(bytes)?;
    let loader = manifest
        .minecraft
        .modLoaders
        .iter()
        .find(|loader| loader.primary)
        .or_else(|| manifest.minecraft.modLoaders.first())
        .map(|loader| loader.id.clone());

    let entries = manifest
        .files
        .iter()
        .filter(|file| file.required)
        .map(|file| PackManifestEntry {
            source: "curseforge".to_string(),
            id: file.project_id.map(|id| id.to_string()).unwrap_or_default(),
            file_id: file.file_id.map(|id| id.to_string()),
            path: String::new(),
            kind: PackEntryKind::Mod,
            title: String::new(),
            version: None,
            author: None,
            icon_url: None,
            description: None,
            download_count: None,
            website_url: None,
        })
        .collect();

    Ok(PackManifest {
        format: "curseforge".to_string(),
        name: Some(manifest.name),
        version: manifest.version,
        summary: None,
        game_version: Some(manifest.minecraft.version),
        loader,
        loader_version: None,
        entries,
    })
}

fn modrinth_manifest(bytes: &[u8]) -> crate::Result<PackManifest> {
    let index: ModrinthIndex = serde_json::from_slice(bytes)?;
    let game_version = index
        .dependencies
        .get("minecraft")
        .and_then(|versions| versions.first())
        .cloned();
    let loader = index
        .dependencies
        .get("fabric-loader")
        .or_else(|| index.dependencies.get("quilt-loader"))
        .or_else(|| index.dependencies.get("forge"))
        .or_else(|| index.dependencies.get("neoforge"))
        .and_then(|versions| versions.first())
        .cloned();
    let loader_version = index
        .dependencies
        .get("fabric-loader")
        .or_else(|| index.dependencies.get("quilt-loader"))
        .and_then(|versions| versions.first())
        .cloned();

    let entries = index
        .files
        .iter()
        .map(|file| PackManifestEntry {
            source: "modrinth".to_string(),
            id: file
                .hashes
                .get("sha512")
                .cloned()
                .unwrap_or_default(),
            file_id: None,
            path: file.path.clone(),
            kind: kind_from_path(&file.path),
            title: file_name_of(&file.path),
            version: None,
            author: None,
            icon_url: None,
            description: None,
            download_count: None,
            website_url: None,
        })
        .collect();

    Ok(PackManifest {
        format: "modrinth".to_string(),
        name: Some(index.name),
        version: index.versionId,
        summary: index.summary,
        game_version,
        loader: loader.map(|loader| {
            if loader.contains('-') {
                loader.split('-').next().unwrap_or("forge").to_string()
            } else {
                loader
            }
        }),
        loader_version,
        entries,
    })
}

/// What kind of thing a path inside a pack is.
///
/// A pack names its files after the mod, which names them after what they are,
/// so the folder they were left in is the most reliable thing available. It is
/// a guess, and is written down as one: a file that is none of these becomes
/// `Other` rather than being forced into a class it may not belong to.
pub fn kind_from_path(path: &str) -> PackEntryKind {
    let lowered = path.to_lowercase().replace('\\', "/");

    if lowered.contains("shaders/") || lowered.contains("shader/") {
        return PackEntryKind::Shader;
    }
    if lowered.contains("resourcepacks/") || lowered.contains("resourcepack/") {
        return PackEntryKind::ResourcePack;
    }
    if lowered.contains("datapacks/") || lowered.contains("datapack/") {
        return PackEntryKind::DataPack;
    }
    if lowered.ends_with(".jar") {
        return PackEntryKind::Mod;
    }
    PackEntryKind::Other
}

fn file_name_of(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

/// Fills in what the manifest did not say, by asking the services it names.
///
/// Only asked about once the person has the list in front of them: a pack of
/// three hundred mods is three hundred lookups, and asking for all of them
/// before the list is even on screen is a slow way to say nothing.
#[tracing::instrument(skip_all)]
pub async fn resolve_pack_entries(
    manifest: PackManifest,
    state: &State,
) -> PackManifest {
    let Some(key) = crate::api::curseforge_metadata::api_key() else {
        return manifest;
    };
    let http = match crate::api::curseforge_search::build_client(&key) {
        Ok(http) => http,
        Err(_) => return manifest,
    };

    let mut resolved = manifest;
    for entry in &mut resolved.entries {
        if entry.source != "curseforge" || entry.id.is_empty() {
            continue;
        }

        let Ok(project) = crate::api::curseforge_search::project(
            &http,
            &key,
            entry.id.parse().unwrap_or_default(),
        )
        .await
        else {
            continue;
        };

        entry.title = project.name.clone();
        entry.icon_url = project.icon_url.clone();
        entry.author = project.author_name.clone();
        entry.description = project.summary.clone();
        entry.download_count = Some(project.download_count);

        // The version the pack pinned is the file it named, not the newest one:
        // asking for the newest would quietly change what is being installed.
        let pinned = entry.file_id.as_deref().and_then(|id| id.parse().ok());
        if let Some(id) = pinned
            && let Ok(file) = crate::api::curseforge_search::file(
                &http,
                &key,
                entry.id.parse().unwrap_or_default(),
                id,
            )
            .await
        {
            entry.version = file.display_name.clone();
            if entry.path.is_empty() {
                entry.path = file.file_name.clone();
            }
        }
    }

    let _ = state;
    resolved
}