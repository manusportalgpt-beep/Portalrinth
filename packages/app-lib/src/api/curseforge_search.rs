//! Finding things on CurseForge, and knowing which file of a mod an instance
//! wants.
//!
//! Everything here needs the API key the frontend was built with. A build
//! without one is an ordinary way to be configured and answers with nothing
//! rather than an error — see `curseforge_metadata` for where the key comes
//! from and why it lives outside `State`.
//!
//! CurseForge ids are its own: a `238222` here and a `AANobbMI` on Modrinth are
//! the same mod and have nothing to do with each other. Nothing in this module
//! pretends otherwise; matching one project's name against another's is the
//! caller's business, and a decision it has to be able to undo.

use reqwest::Method;
use serde::Deserialize;
use serde::Serialize;

use crate::state::State;
use crate::util::fetch::fetch_advanced;

/// Minecraft: Java Edition. The launcher does not run Bedrock.
const GAME_ID_JAVA: i32 = 432;

/// CurseForge's own class for "a mod". Also datapacks and resourcepacks, which
/// are the same kind of thing to CurseForge and a different kind to us.
const CLASS_ID_MODS: i32 = 6;

/// CurseForge's own loader numbering. It is not ours and does not follow it.
const LOADER_FORGE: i32 = 1;
const LOADER_FABRIC: i32 = 4;
const LOADER_QUILT: i32 = 5;
const LOADER_NEOFORGE: i32 = 6;

/// What the launcher knows a loader as, to what CurseForge calls it.
pub fn loader_to_curseforge(loader: &str) -> Option<i32> {
    match loader {
        "forge" => Some(LOADER_FORGE),
        "fabric" => Some(LOADER_FABRIC),
        "quilt" => Some(LOADER_QUILT),
        "neoforge" => Some(LOADER_NEOFORGE),
        _ => None,
    }
}

/// A project as a search result draws it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct CurseforgeSearchHit {
    pub id: String,
    pub name: String,
    pub slug: Option<String>,
    pub summary: Option<String>,
    pub icon_url: Option<String>,
    pub author_name: Option<String>,
    pub download_count: u64,
    pub date_modified: Option<String>,
    /// The newest file for the version that was asked about, when the project
    /// has one. Without this a search result cannot be installed from, because
    /// CurseForge's ids for a project's files are not in the search answer.
    pub latest_file: Option<CurseforgeFile>,
}

/// One file of a project: one downloadable jar, for one game version.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct CurseforgeFile {
    pub id: String,
    pub mod_id: String,
    pub display_name: String,
    pub file_name: String,
    pub game_version: Option<String>,
    pub loader: Option<String>,
    pub file_date: Option<String>,
    pub sha1: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct CurseforgeSearchPage {
    pub hits: Vec<CurseforgeSearchHit>,
    pub index: usize,
    pub page_size: usize,
    pub result_count: usize,
    pub total_count: usize,
}

#[derive(Deserialize)]
struct SearchResponse {
    data: Vec<SearchMod>,
    pagination: Pagination,
}

#[derive(Deserialize)]
struct Pagination {
    #[serde(default)]
    index: usize,
    #[serde(default)]
    page_size: usize,
    #[serde(default)]
    result_count: usize,
    #[serde(default)]
    total_count: usize,
}

#[derive(Deserialize)]
struct SearchMod {
    id: i64,
    name: String,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    download_count: u64,
    #[serde(default)]
    date_modified: Option<String>,
    #[serde(default)]
    authors: Vec<SearchAuthor>,
    #[serde(default)]
    icon: Option<SearchIcon>,
    /// Only the newest file per game version, which is all a search needs.
    #[serde(default)]
    latest_files_indexes: Vec<SearchFileIndex>,
}

#[derive(Deserialize)]
struct SearchAuthor {
    name: String,
}

#[derive(Deserialize)]
struct SearchIcon {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    thumbnail_url: Option<String>,
}

#[derive(Deserialize, Clone)]
struct SearchFileIndex {
    id: i64,
    #[serde(default)]
    game_version: Option<String>,
    #[serde(default)]
    mod_loader: Option<i32>,
    #[serde(default)]
    file_name: Option<String>,
    #[serde(default)]
    release_type: Option<i32>,
}

#[derive(Deserialize)]
struct FilesResponse {
    data: Vec<FileMod>,
}

#[derive(Deserialize, Clone)]
struct FileMod {
    id: i64,
    mod_id: i64,
    file_name: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    file_date: Option<String>,
    #[serde(default)]
    download_url: Option<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<LoaderMod>,
    #[serde(default)]
    hashes: Vec<FileHash>,
    /// A release, as against a beta or an alpha. Only releases are offered,
    /// because a beta of somebody else's mod is almost never what was meant.
    #[serde(default)]
    release_type: i32,
}

#[derive(Deserialize, Clone)]
struct LoaderMod {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize, Clone)]
struct FileHash {
    value: String,
    algo: i32,
}

/// What to search for, narrowed to one game version and loader.
#[derive(Deserialize, Clone, Debug, Default)]
pub struct CurseforgeSearchQuery {
    #[serde(default)]
    pub search_filter: String,
    #[serde(default)]
    pub index: usize,
    #[serde(default = "default_page_size")]
    pub page_size: usize,
    /// CurseForge's own ordering, passed through rather than translated.
    #[serde(default)]
    pub sort_field: i32,
    #[serde(default = "default_sort_order")]
    pub sort_order: i32,
    /// The launcher names a loader; CurseForge does not know that name.
    pub loader: Option<String>,
    pub game_version: Option<String>,
}

fn default_page_size() -> usize {
    20
}

fn default_sort_order() -> i32 {
    2
}

/// A page of CurseForge projects, newest first unless asked otherwise.
///
/// Nothing when the build has no key: an unconfigured build is not a broken
/// one, and a search box that cannot search should look like it rather than
/// report a failure.
#[tracing::instrument(skip_all)]
pub async fn search(query: &CurseforgeSearchQuery) -> crate::Result<CurseforgeSearchPage> {
    let state = State::get().await?;
    search_with_state(query, &state).await
}

#[tracing::instrument(skip_all)]
pub async fn search_with_state(
    query: &CurseforgeSearchQuery,
    state: &State,
) -> crate::Result<CurseforgeSearchPage> {
    let Some(key) = crate::api::curseforge_metadata::api_key() else {
        return Ok(empty_page(query));
    };

    let loaders = query
        .loader
        .as_deref()
        .and_then(loader_to_curseforge)
        .map(|loader| vec![loader])
        .unwrap_or_default();

    let mut body = serde_json::json!({
        "gameId": GAME_ID_JAVA,
        "classId": CLASS_ID_MODS,
        "searchFilter": query.search_filter,
        "index": query.index,
        "pageSize": query.page_size,
        "sortField": query.sort_field,
        "sortOrder": query.sort_order,
        "allowMods": true,
        "allowClientMods": false,
    });
    if !loaders.is_empty() {
        body["loaderTypes"] = serde_json::json!(loaders);
    }
    if let Some(version) = &query.game_version {
        body["gameVersion"] = serde_json::json!(version);
    }

    let bytes = fetch_advanced(
        Method::POST,
        "https://api.curseforge.com/v1/mods/search",
        None,
        Some(body),
        Some(("x-api-key", &key)),
        None,
        None,
        None,
        &state.fetch_semaphore,
        &state.pool,
    )
    .await?;

    let response: SearchResponse = serde_json::from_slice(&bytes)?;
    let game_version = query.game_version.as_deref();

    let hits = response
        .data
        .into_iter()
        .map(|found| {
            let latest_file = pick_latest_file(&found.latest_files_indexes, game_version);
            CurseforgeSearchHit {
                id: found.id.to_string(),
                name: found.name,
                slug: found.slug,
                summary: found.summary,
                icon_url: found
                    .icon
                    .and_then(|icon| icon.thumbnail_url.or(icon.url)),
                author_name: found.authors.first().map(|author| author.name.clone()),
                download_count: found.download_count,
                date_modified: found.date_modified,
                latest_file: latest_file.map(|file| CurseforgeFile {
                    id: file.id.to_string(),
                    mod_id: found.id.to_string(),
                    display_name: found.name.clone(),
                    file_name: file.file_name.unwrap_or_default(),
                    game_version: file.game_version,
                    loader: file.mod_loader.and_then(loader_name),
                    file_date: None,
                    sha1: None,
                }),
            }
        })
        .collect();

    Ok(CurseforgeSearchPage {
        hits,
        index: response.pagination.index,
        page_size: response.pagination.page_size,
        result_count: response.pagination.result_count,
        total_count: response.pagination.total_count,
    })
}

/// A project's files, newest first, for one game version and loader.
#[tracing::instrument(skip_all)]
pub async fn files(
    mod_id: i64,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> crate::Result<Vec<CurseforgeFile>> {
    let state = State::get().await?;
    files_with_state(mod_id, game_version, loader, &state).await
}

#[tracing::instrument(skip_all)]
pub async fn files_with_state(
    mod_id: i64,
    game_version: Option<&str>,
    loader: Option<&str>,
    state: &State,
) -> crate::Result<Vec<CurseforgeFile>> {
    let Some(key) = crate::api::curseforge_metadata::api_key() else {
        return Ok(Vec::new());
    };

    let url = format!("https://api.curseforge.com/v1/mods/{mod_id}/files");
    let bytes = fetch_advanced(
        Method::GET,
        &url,
        None,
        None,
        Some(("x-api-key", &key)),
        None,
        None,
        None,
        &state.fetch_semaphore,
        &state.pool,
    )
    .await?;

    let response: FilesResponse = serde_json::from_slice(&bytes)?;
    let wanted_loader = loader.and_then(loader_to_curseforge);
    let mut listed: Vec<FileMod> = response
        .data
        .into_iter()
        .filter(|file| file.release_type == 1)
        .filter(|file| {
            game_section(game_version)
                .is_none_or(|wanted| file.game_versions.iter().any(|have| have == wanted))
        })
        .filter(|file| match wanted_loader {
            None => true,
            Some(loader) => file
                .loaders
                .iter()
                .any(|have| loader_name(have.name).is_some_and(|id| id == loader)),
        })
        .collect();

    listed.sort_by(|left, right| {
        right
            .file_date
            .cmp(&left.file_date)
            .then(left.display_name.cmp(&right.display_name))
    });

    Ok(listed
        .into_iter()
        .map(|file| CurseforgeFile {
            id: file.id.to_string(),
            mod_id: file.mod_id.to_string(),
            display_name: file
                .display_name
                .unwrap_or_else(|| file.file_name.clone()),
            sha1: file
                .hashes
                .iter()
                .find(|hash| hash.algo == 1)
                .map(|hash| hash.value.clone()),
            file_name: file.file_name,
            game_version: game_version.map(String::from),
            loader: loader.map(String::from),
            file_date: file.file_date,
        })
        .collect())
}

/// Whether this build can search CurseForge at all.
pub fn is_available() -> bool {
    crate::api::curseforge_metadata::api_key().is_some()
}

fn empty_page(query: &CurseforgeSearchQuery) -> CurseforgeSearchPage {
    CurseforgeSearchPage {
        hits: Vec::new(),
        index: query.index,
        page_size: query.page_size,
        result_count: 0,
        total_count: 0,
    }
}

fn game_section(game_version: Option<&str>) -> Option<&str> {
    game_version.filter(|version| !version.is_empty())
}

/// The newest file for the version asked about, or for any version when none
/// was: CurseForge answers with one entry per version it has, and the search
/// itself was already narrowed, so taking the last one is the newest.
fn pick_latest_file(
    indexes: &[SearchFileIndex],
    game_version: Option<&str>,
) -> Option<SearchFileIndex> {
    let wanted = game_section(game_version);
    let mut best: Option<&SearchFileIndex> = None;
    for index in indexes {
        let matches = match wanted {
            Some(version) => index.game_version.as_deref() == Some(version),
            None => true,
        };
        if matches && best.is_none_or(|best| index.id > best.id) {
            best = Some(index);
        }
    }
    best.cloned()
}

fn loader_name(id: i32) -> Option<&'static str> {
    match id {
        LOADER_FORGE => Some("forge"),
        LOADER_FABRIC => Some("fabric"),
        LOADER_QUILT => Some("quilt"),
        LOADER_NEOFORGE => Some("neoforge"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_the_loaders_we_know() {
        assert_eq!(loader_to_curseforge("fabric"), Some(LOADER_FABRIC));
        assert_eq!(loader_to_curseforge("neoforge"), Some(LOADER_NEOFORGE));
        assert_eq!(loader_to_curseforge("vanilla"), None);
        assert_eq!(loader_to_curseforge("optifine"), None);
    }

    #[test]
    fn takes_the_file_for_the_version_asked_about() {
        let indexes = vec![
            SearchFileIndex {
                id: 100,
                game_version: Some("1.19.2".into()),
                mod_loader: Some(LOADER_FABRIC),
                file_name: None,
                release_type: None,
            },
            SearchFileIndex {
                id: 300,
                game_version: Some("1.20.1".into()),
                mod_loader: Some(LOADER_FABRIC),
                file_name: None,
                release_type: None,
            },
            SearchFileIndex {
                id: 200,
                game_version: Some("1.20.1".into()),
                mod_loader: Some(LOADER_FABRIC),
                file_name: None,
                release_type: None,
            },
        ];

        let picked = pick_latest_file(&indexes, Some("1.20.1"));
        assert_eq!(picked.map(|file| file.id), Some(300));

        assert_eq!(pick_latest_file(&indexes, Some("1.18.2")), None);
        assert_eq!(
            pick_latest_file(&indexes, None).map(|file| file.id),
            Some(300)
        );
    }
}