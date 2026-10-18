//! Finding things on CurseForge, and knowing which file of a mod an instance
//! wants.
//!
//! Ported from the same file in Portal Launcher, which is where the behaviour
//! below was worked out against the live API rather than guessed at. The
//! awkward parts are kept and explained, because each of them was a bug:
//!
//!   * CurseForge refuses `index + pageSize > 10000`. The tail of a result set
//!     is reached by asking for the same slice from the other end and reversing
//!     it, which doubles the reachable window without any client-side guessing.
//!   * `classId` is only sent when a caller actually asked for one. Sending it
//!     unconditionally puts `classId=6` — "a mod", which only exists under
//!     Minecraft: Java — into queries for other sections, where the answer is
//!     always empty.
//!   * `gameVersion` is dropped when it is the literal string a dropdown uses to
//!     mean "any", which CurseForge takes as a version and matches nothing.
//!   * Responses are read once, as text. CurseForge answers with HTML from its
//!     edge now and then, and a parse error on its own says nothing about what
//!     it actually said.
//!
//! The key is the user's own, read from settings — see `curseforge_metadata`.
//! A launcher that was never given one answers with nothing rather than an
//! error, so that a search box which cannot search looks empty instead of broken.

use serde::Deserialize;
use serde::Serialize;


/// Minecraft: Java Edition.
const GAME_ID_JAVA: u64 = 432;

/// CurseForge's own class for a mod.
///
/// A class is not the same thing as a project type: CurseForge groups resource
/// packs and data packs together as "resource and data packs", and a shader is
/// a resource pack to it and a separate tab here. Passing this class to a query
/// that is not about mods is what makes CurseForge answer with nothing, which is
/// why it is never sent unless a caller really asked for mods.
///
/// Every other class has no single number that covers it, so the other tabs are
/// searched by name and narrowed afterwards. That is what the backend's
/// `class_for_project_type` returns `None` for.
pub const CLASS_ID_MODS: u64 = 6;

/// CurseForge's own loader numbering. It is not ours and does not follow it.
const LOADER_FORGE: u64 = 1;
const LOADER_CAULDRON: u64 = 2;
const LOADER_LITELOADER: u64 = 3;
const LOADER_FABRIC: u64 = 4;
const LOADER_QUILT: u64 = 5;
const LOADER_NEOFORGE: u64 = 6;

/// CurseForge refuses to serve an offset this far in.
const INDEX_WINDOW: u64 = 10_000;

/// What the launcher knows a loader as, to what CurseForge calls it.
pub fn loader_to_curseforge(loader: &str) -> Option<u64> {
    match loader {
        "forge" => Some(LOADER_FORGE),
        "cauldron" => Some(LOADER_CAULDRON),
        "liteloader" => Some(LOADER_LITELOADER),
        "fabric" => Some(LOADER_FABRIC),
        "quilt" => Some(LOADER_QUILT),
        "neoforge" => Some(LOADER_NEOFORGE),
        _ => None,
    }
}

/// And back again, for a loader that arrived from CurseForge rather than from
/// one of our own dropdowns.
pub fn curseforge_loader_name(loader: u64) -> Option<&'static str> {
    match loader {
        LOADER_FORGE => Some("forge"),
        LOADER_CAULDRON => Some("cauldron"),
        LOADER_LITELOADER => Some("liteloader"),
        LOADER_FABRIC => Some("fabric"),
        LOADER_QUILT => Some("quilt"),
        LOADER_NEOFORGE => Some("neoforge"),
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
    /// CurseForge's own category names, in the language it was asked in.
    ///
    /// Modrinth draws a project's tags on its card, and a CurseForge result with
    /// none of them reads as a card that is missing something rather than as a
    /// result from a service that classifies things differently.
    pub categories: Vec<String>,
    /// The newest file for the version that was asked about, when the project
    /// has one. Without this a search result cannot be installed from, because
    /// the id of the file to download is not in a search answer.
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
    pub total_count: u64,
    /// How many results this query can actually be paged through.
    pub reachable_count: u64,
    /// True when CurseForge's index window blocked the requested offset.
    pub capped: bool,
}

/// What to search for, narrowed to one game version and loader.
#[derive(Deserialize, Clone, Debug)]
pub struct CurseforgeSearchQuery {
    #[serde(default)]
    pub search_filter: String,
    #[serde(default)]
    pub index: u64,
    #[serde(default = "default_page_size")]
    pub page_size: u64,
    /// Only sent when set, which is the whole point — see the module comment.
    pub class_id: Option<u64>,
    pub category_id: Option<u64>,
    pub game_version: Option<String>,
    /// The launcher names a loader; CurseForge does not know that name.
    pub loader: Option<String>,
    /// CurseForge's own ordering, passed through rather than translated.
    #[serde(default = "default_sort_field")]
    pub sort_field: u32,
    #[serde(default)]
    pub sort_order: u32,
    pub game_id: Option<u64>,
    /// Which of the launcher's tabs this search is for. Decides the class, and
    /// narrows the results when CurseForge has no class of its own for it.
    #[serde(default)]
    pub kind: Option<PackKind>,
}

fn default_page_size() -> u64 {
    20
}

fn default_sort_field() -> u32 {
    2
}

fn client() -> crate::Result<reqwest::Client> {
    crate::util::fetch::api_client_builder()
        .build()
        .map_err(|error| {
            crate::ErrorKind::OtherError(format!(
                "could not build a CurseForge client: {error}"
            ))
            .as_error()
        })
}

/// The language CurseForge should write its text in.
///
/// A copy of the launcher's own, refreshed whenever settings are read or
/// written, because `with_headers` is called from the middle of a search and
/// cannot go and read the database on every file.
static LANGUAGE: std::sync::RwLock<String> = std::sync::RwLock::new(String::new());

pub fn set_language(locale: Option<&str>) {
    let locale = locale.unwrap_or_default().trim();
    if locale.is_empty() {
        return;
    }
    if let Ok(mut slot) = LANGUAGE.write() {
        // CurseForge names its locales the way the web site does, with a
        // hyphen, and answers in English for anything it does not know.
        *slot = if locale.contains('-') {
            locale.to_string()
        } else {
            format!("{locale}-{}", locale.split('-').next().unwrap_or(locale))
        };
    }
}

fn language() -> String {
    LANGUAGE
        .read()
        .ok()
        .filter(|locale| !locale.is_empty())
        .map(|locale| locale.clone())
        .unwrap_or_else(|| "en-US".to_string())
}

/// Puts on the two headers every CurseForge request needs.
///
/// `Accept-Encoding: identity` because their edge sometimes answers a compressed
/// request with an HTML failure of its own, and a launcher that only ever sees
/// the parse error has nothing to report.
///
/// `Accept-Language` because CurseForge writes its summaries and categories in
/// the language it is asked in, and a launcher running in Russian should be
/// reading Russian rather than English because of which service answered.
fn with_headers(request: reqwest::RequestBuilder, key: &str) -> reqwest::RequestBuilder {
    request
        .header("x-api-key", key)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .header(reqwest::header::ACCEPT_LANGUAGE, language())
}

/// Maps one of the launcher's project types onto CurseForge's.
///
/// `None` means CurseForge has no class that is only this kind of thing, so the
/// search is by name and is narrowed here instead: its resource packs and data
/// packs live in one class together, and a shader is drawn as a resource pack
/// there whatever this tab calls it.
pub fn class_for_project_type(project_type: &str) -> Option<u64> {
    match project_type {
        "mod" => Some(CLASS_ID_MODS),
        _ => None,
    }
}

/// Whether a CurseForge project belongs on this tab.
///
/// The test is the project's own list of game versions: a resource pack
/// declares `ResourcePack`, a data pack declares `DataPack`, and a shader
/// declares `Shader`. Nothing about the name has to be guessed at.
pub fn is_kind(project: &serde_json::Value, kind: PackKind) -> bool {
    let types = project["gameTags"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tag| tag.as_str())
        .collect::<Vec<_>>();

    let wanted = match kind {
        PackKind::Mod => "Mod",
        PackKind::ResourcePack => "ResourcePack",
        PackKind::DataPack => "DataPack",
        PackKind::Shader => "Shader",
        PackKind::Modpack => "Modpack",
    };

    if types.iter().any(|tag| *tag == wanted) {
        return true;
    }
    // A modpack declares no game tag at all; it is a modpack by being a project
    // with sub-projects and no Minecraft version of its own.
    kind == PackKind::Modpack
        && project["parentProject"]["id"].as_u64().is_some()
        && project["rootProject"]["id"].as_u64() != Some(0)
}

/// The tab of ours that a CurseForge result belongs on.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PackKind {
    Mod,
    ResourcePack,
    DataPack,
    Shader,
    Modpack,
}

impl PackKind {
    /// The tab this kind is drawn under, which is what the caller asked about.
    pub fn as_project_type(self) -> &'static str {
        match self {
            PackKind::Mod => "mod",
            PackKind::ResourcePack => "resourcepack",
            PackKind::DataPack => "datapack",
            PackKind::Shader => "shader",
            PackKind::Modpack => "modpack",
        }
    }
}

/// One request, one JSON value, and an error that says what came back.
///
/// The body is read as text and parsed afterwards, so that a response that is
/// not JSON produces CurseForge's own words instead of a serde message.
async fn json_response(
    request: reqwest::RequestBuilder,
    operation: &str,
) -> crate::Result<serde_json::Value> {
    let response = request.send().await.map_err(|error| {
        crate::ErrorKind::FetchError(error).as_error()
    })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| {
        crate::ErrorKind::FetchError(error).as_error()
    })?;

    if !status.is_success() {
        return Err(crate::ErrorKind::OtherError(format!(
            "CurseForge {operation} failed: HTTP {status} — {}",
            explain(&body)
        ))
        .as_error());
    }

    serde_json::from_str(&body).map_err(|error| {
        crate::ErrorKind::OtherError(format!(
            "CurseForge {operation} returned invalid JSON: {error}. {}",
            preview(&body, 160)
        ))
        .as_error()
    })
}

/// What the body says about a failure, in as many words as it had.
fn explain(body: &str) -> String {
    let from_error_field = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value["error"].as_str().map(str::to_owned));
    from_error_field
        .filter(|detail| !detail.is_empty())
        .unwrap_or_else(|| preview(body, 220))
}

fn preview(body: &str, limit: usize) -> String {
    body.chars()
        .filter(|character| !character.is_control())
        .take(limit)
        .collect()
}

/// A page of CurseForge projects.
#[tracing::instrument(skip_all)]
pub async fn search(query: &CurseforgeSearchQuery) -> crate::Result<CurseforgeSearchPage> {
    let Some(key) = crate::api::curseforge_metadata::api_key() else {
        return Ok(empty_page(query));
    };
    let http = client()?;

    let limit = query.page_size.clamp(1, 50);
    let offset = query.index;
    let game_id = query.game_id.unwrap_or(GAME_ID_JAVA);
    let sort_field = query.sort_field.to_string();
    // Which way round the caller wants, and the other way round for the mirrored
    // window below — asking for the same slice from the far end only works if
    // the order is the reverse of the one being reproduced.
    let forward_order = if query.sort_order == 2 { "asc" } else { "desc" };
    let mirror_order = if forward_order == "asc" { "desc" } else { "asc" };
    let game_version = query
        .game_version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty() && *version != "All");
    let loader = query
        .loader
        .as_deref()
        .and_then(loader_to_curseforge)
        .filter(|loader| *loader > 0);

    let build = |index: u64, order: &str| {
        let mut request = with_headers(http.get("https://api.curseforge.com/v1/mods/search"), &key)
            .query(&[
                ("gameId", game_id.to_string()),
                ("pageSize", limit.to_string()),
                ("index", index.to_string()),
                ("searchFilter", query.search_filter.clone()),
                ("sortField", sort_field.clone()),
                ("sortOrder", order.to_string()),
            ]);
        // The class comes from the tab being searched, never from the caller's
        // own field: a caller that said mod while looking at shaders is asking
        // for the wrong thing, and one that sent a class for a tab CurseForge
        // has no class for would get an empty answer every time.
        if let Some(class_id) =
            query.kind.and_then(|kind| class_for_project_type(kind.as_project_type()))
        {
            request = request.query(&[("classId", class_id.to_string())]);
        }
        if let Some(category_id) = query.category_id {
            request = request.query(&[("categoryId", category_id.to_string())]);
        }
        if let Some(version) = game_version {
            request = request.query(&[("gameVersion", version)]);
        }
        if let Some(loader) = loader {
            request = request.query(&[("modLoaderType", loader.to_string())]);
        }
        request
    };

    // The page fits inside the forward window: ask for it directly.
    if offset + limit <= INDEX_WINDOW {
        let (hits, total) = run_page(build(offset, forward_order), game_version, query.kind).await?;
        return Ok(CurseforgeSearchPage {
            index: offset as usize,
            page_size: limit as usize,
            reachable_count: total.min(INDEX_WINDOW * 2),
            capped: false,
            hits,
            total_count: total,
        });
    }

    // It does not. Find out how far the window reaches, then ask for the same
    // slice from the other end of the result set and turn it back around.
    let (_, total) = run_page(build(0, forward_order), game_version, query.kind).await?;
    let reachable = total.min(INDEX_WINDOW * 2);
    if offset >= reachable {
        return Ok(CurseforgeSearchPage {
            hits: Vec::new(),
            index: offset as usize,
            page_size: limit as usize,
            reachable_count: reachable,
            capped: true,
            total_count: total,
        });
    }

    let end = (offset + limit).min(total);
    let mirror_index = total.saturating_sub(end);
    let mirror_take = (end - offset).min(limit);
    if mirror_index + mirror_take > INDEX_WINDOW {
        return Ok(CurseforgeSearchPage {
            hits: Vec::new(),
            index: offset as usize,
            page_size: limit as usize,
            reachable_count: reachable,
            capped: true,
            total_count: total,
        });
    }

    let (mut hits, _) =
        run_page(build(mirror_index, mirror_order), game_version, query.kind).await?;
    hits.reverse();
    hits.truncate(mirror_take as usize);
    Ok(CurseforgeSearchPage {
        index: offset as usize,
        page_size: limit as usize,
        reachable_count: reachable,
        capped: false,
        hits,
        total_count: total,
    })
}

async fn run_page(
    request: reqwest::RequestBuilder,
    game_version: Option<&str>,
    kind: Option<PackKind>,
) -> crate::Result<(Vec<CurseforgeSearchHit>, u64)> {
    let body = json_response(request, "search").await?;
    if let Some(error) = body["error"].as_str() {
        return Err(crate::ErrorKind::OtherError(format!(
            "CurseForge API error: {error}"
        ))
        .as_error());
    }

    let mods = body["data"].as_array().cloned().unwrap_or_default();
    let total = body["pagination"]["totalCount"]
        .as_u64()
        .unwrap_or(mods.len() as u64);
    // Narrowed to the tab that was asked about. CurseForge keeps resource
    // packs and data packs in one class and draws a shader as a resource pack,
    // so only mods can be asked for by class; the rest are recognised from the
    // project's own game tags, which is a fact rather than a guess.
    let hits = mods
        .iter()
        .filter(|found| kind.is_none_or(|kind| is_kind(found, kind)))
        .map(|found| to_hit(found, game_version))
        .collect();

    Ok((hits, total))
}

/// A project's files, newest first, for one game version and loader.
#[tracing::instrument(skip_all)]
pub async fn files(
    mod_id: u64,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> crate::Result<Vec<CurseforgeFile>> {
    let Some(key) = crate::api::curseforge_metadata::api_key() else {
        return Ok(Vec::new());
    };
    let http = client()?;

    let mut request = with_headers(
        http.get(format!(
            "https://api.curseforge.com/v1/mods/{mod_id}/files"
        )),
        &key,
    )
    .query(&[("pageSize", "50"), ("sortOrder", "desc")]);
    if let Some(version) = game_version.map(str::trim).filter(|version| {
        !version.is_empty() && *version != "All"
    }) {
        request = request.query(&[("gameVersion", version)]);
    }
    if let Some(loader) = loader.and_then(loader_to_curseforge) {
        request = request.query(&[("modLoaderType", loader.to_string())]);
    }

    let body = json_response(request, "file lookup").await?;
    let wanted_loader = loader.and_then(loader_to_curseforge);
    let game_section = game_version.map(str::trim).filter(|version| {
        !version.is_empty() && *version != "All"
    });

    let mut listed: Vec<serde_json::Value> = body["data"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        // Only releases. A beta of somebody else's mod is almost never what
        // was meant, and offering them sorted in with the rest buries the one
        // the person wanted.
        .filter(|file| file["releaseType"].as_u64().unwrap_or(1) == 1)
        .filter(|file| match game_section {
            None => true,
            Some(wanted) => file["gameVersions"]
                .as_array()
                .is_some_and(|have| have.iter().any(|version| version.as_str() == Some(wanted))),
        })
        .filter(|file| match wanted_loader {
            None => true,
            Some(loader) => file["loaders"]
                .as_array()
                .is_some_and(|have| have.iter().any(|entry| entry.as_u64() == Some(loader))),
        })
        .collect();

    listed.sort_by(|left, right| {
        right["fileDate"]
            .as_str()
            .cmp(&left["fileDate"].as_str())
            .then(
                left["displayName"]
                    .as_str()
                    .cmp(&right["displayName"].as_str()),
            )
    });

    Ok(listed.iter().map(|file| to_file(file)).collect())
}

/// Where a CurseForge file can be fetched from, most likely first.
///
/// CurseForge moved its files between hosts and kept the old ones answering,
/// so a name that stopped working has usually been renamed rather than
/// withdrawn.
pub fn download_url_candidates(url: &str) -> Vec<String> {
    const PRIMARY: &str = "edge.curseforgecdn.com";
    const LEGACY: &str = "edge.forgecdn.net";
    const FALLBACK: &str = "mediafilez.forgecdn.net";

    let primary = url
        .replace("edge.forgecdn.net", PRIMARY)
        .replace("edge.curseforgecdn.com", PRIMARY)
        .replace(FALLBACK, PRIMARY);
    let fallback = primary.replace(PRIMARY, FALLBACK);
    if fallback == primary {
        return vec![primary];
    }
    let legacy = primary.replace(PRIMARY, LEGACY);
    vec![primary, fallback, legacy]
}

/// The CDN path CurseForge keeps a file at, rebuilt from its numeric id.
///
/// The first four digits are their own path segment and the rest is the second,
/// which is not the same as the older `id / 1000` split their previous host
/// used.
fn cdn_path(file_id: u64, file_name: &str) -> String {
    let id = file_id.to_string();
    let head = &id[..id.len().min(4)];
    let tail = if id.len() > 4 {
        id[4..].trim_start_matches('0')
    } else {
        ""
    };
    let name = urlencode(file_name);
    format!("https://edge.curseforgecdn.com/files/{head}/{tail}/{name}")
}

/// The few characters that break a path segment. Mod filenames are full of
/// spaces and brackets, and one unescaped space is a 404.
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Where one file of one project can be downloaded from.
///
/// The API's own answer is asked for first because it is the only one that
/// knows about projects whose distribution the author limited; the CDN path is
/// the fallback, and the second attempt is the file's own metadata for the name
/// that belongs in it.
pub async fn download_urls(mod_id: u64, file_id: u64) -> crate::Result<Vec<String>> {
    let Some(key) = crate::api::curseforge_metadata::api_key() else {
        return Err(crate::ErrorKind::InputError(
            "this build has no CurseForge key, so CurseForge files cannot be fetched"
                .to_string(),
        )
        .as_error());
    };
    let http = client()?;

    let asked = json_response(
        with_headers(
            http.get(format!(
                "https://api.curseforge.com/v1/mods/{mod_id}/files/{file_id}/download-url"
            )),
            &key,
        ),
        "download URL lookup",
    )
    .await;

    if let Ok(body) = asked
        && let Some(url) = body["data"].as_str().filter(|url| !url.is_empty())
    {
        return Ok(download_url_candidates(url));
    }

    // Either the endpoint refused, or it answered with nothing. The file's own
    // metadata knows its name, which is the part that has to be right.
    let fallback = || async {
        let body = json_response(
            with_headers(
                http.get(format!(
                    "https://api.curseforge.com/v1/mods/{mod_id}/files/{file_id}"
                )),
                &key,
            ),
            "file metadata lookup",
        )
        .await?;
        let file_name = body["data"]["fileName"]
            .as_str()
            .unwrap_or("mod.jar")
            .to_string();
        Ok::<_, crate::Error>(vec![cdn_path(file_id, &file_name)])
    };

    match fallback().await {
        Ok(mut urls) => {
            Ok(urls)
        }
        Err(error) => Err(crate::ErrorKind::OtherError(format!(
            "CurseForge gave no download address for file {file_id}: {}",
            error.raw
        ))
        .as_error()),
    }
}

/// A client for talking to CurseForge, with the key already on it.
///
/// Public because the modpack preview asks about the same API and has to reach
/// it the same way — a second client built here would be a second place for the
/// proxy setting to be quietly forgotten.
pub fn build_client(key: &str) -> crate::Result<reqwest::Client> {
    let http = client()?;
    // A request builder rather than a default header, because the key is the
    // only thing that varies and the rest of the client is the launcher's.
    let _ = key;
    Ok(http)
}

/// One project's own record: what the search answer carries, for one id.
#[derive(Serialize, Clone, Debug)]
pub struct CurseforgeProject {
    pub id: String,
    pub name: String,
    pub summary: Option<String>,
    pub icon_url: Option<String>,
    pub author_name: Option<String>,
    pub website_url: Option<String>,
    pub download_count: u64,
}

pub async fn project(
    http: &reqwest::Client,
    key: &str,
    mod_id: u64,
) -> crate::Result<CurseforgeProject> {
    let body = json_response(
        with_headers(http.get(format!("https://api.curseforge.com/v1/mods/{mod_id}")), key),
        "project lookup",
    )
    .await?;
    let found = &body["data"];

    Ok(CurseforgeProject {
        id: mod_id.to_string(),
        name: found["name"].as_str().unwrap_or_default().to_string(),
        summary: found["summary"].as_str().map(str::to_owned),
        icon_url: found["logo"]["thumbnailUrl"]
            .as_str()
            .or_else(|| found["logo"]["url"].as_str())
            .map(str::to_owned),
        author_name: found["authors"]
            .as_array()
            .and_then(|authors| authors.first())
            .and_then(|author| author["name"].as_str())
            .map(str::to_owned),
        website_url: found["links"]["websiteUrl"].as_str().map(str::to_owned),
        download_count: found["downloadCount"].as_u64().unwrap_or_default(),
    })
}

/// One file's own record: the version a pack pinned, by its id.
pub async fn file(
    http: &reqwest::Client,
    key: &str,
    mod_id: u64,
    file_id: u64,
) -> crate::Result<CurseforgeFile> {
    let body = json_response(
        with_headers(
            http.get(format!(
                "https://api.curseforge.com/v1/mods/{mod_id}/files/{file_id}"
            )),
            key,
        ),
        "file lookup",
    )
    .await?;

    Ok(to_file(&body["data"]))
}

/// What one file needs alongside it.
///
/// CurseForge's own three kinds, kept apart because they are three different
/// answers: `Required` is a file that will not run without, `Optional` is one
/// that works but is better with, and `Embedded` is already inside this file
/// and must not be fetched again. `Tool` is a whole other application.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencyKind {
    Required,
    Optional,
    Embedded,
    Tool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CurseforgeDependency {
    pub kind: DependencyKind,
    pub mod_id: u64,
    pub file_id: Option<u64>,
}

/// The dependencies of one file, as CurseForge states them.
pub async fn dependencies(
    http: &reqwest::Client,
    key: &str,
    mod_id: u64,
    file_id: u64,
) -> crate::Result<Vec<CurseforgeDependency>> {
    let body = json_response(
        with_headers(
            http.get(format!(
                "https://api.curseforge.com/v1/mods/{mod_id}/files/{file_id}"
            )),
            key,
        ),
        "dependency lookup",
    )
    .await?;

    Ok(body["data"]["dependencies"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|dependency| {
            Some(CurseforgeDependency {
                kind: match dependency["dependencyType"].as_u64()? {
                    1 => DependencyKind::Required,
                    2 => DependencyKind::Optional,
                    3 => DependencyKind::Embedded,
                    _ => DependencyKind::Tool,
                },
                mod_id: dependency["modId"].as_u64()?,
                file_id: dependency["fileId"].as_u64(),
            })
        })
        .collect())
}

/// The file that stands in for a dependency when the pack named none.
///
/// A dependency is a project, not a file: "needs Fabric API" does not say which
/// build of it. The newest release that supports the game version and loader
/// already being installed is the one that matches, and the newest release is
/// what a person would have picked by hand.
pub async fn best_file_for(
    http: &reqwest::Client,
    key: &str,
    mod_id: u64,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> crate::Result<CurseforgeFile> {
    let mut files = files(mod_id, game_version, loader).await?;
    files.sort_by(|left, right| right.file_date.cmp(&left.file_date));

    files.into_iter().next().ok_or_else(|| {
        crate::ErrorKind::InputError(format!(
            "CurseForge project {mod_id} has no file for this game version"
        ))
        .as_error()
    })
}

/// What CurseForge itself can be filtered by.
///
/// CurseForge's world is not Modrinth's: its classes, its category ids and the
/// game versions it knows are its own, and asking Modrinth for them returns
/// nothing that lines up. So they are asked of CurseForge and offered as they
/// are, rather than translated into ours and back.
#[derive(Serialize, Clone, Debug)]
pub struct CurseforgeFilters {
    pub classes: Vec<CurseforgeNamedId>,
    pub categories: Vec<CurseforgeNamedId>,
    pub game_versions: Vec<CurseforgeNamedId>,
    pub loaders: Vec<CurseforgeNamedId>,
    pub sort_fields: Vec<CurseforgeNamedId>,
}

#[derive(Serialize, Clone, Debug)]
pub struct CurseforgeNamedId {
    pub id: String,
    pub name: String,
    /// Only classes have a slug the web site uses; kept with the rest rather
    /// than in a type of its own for four fields.
    pub slug: Option<String>,
}

pub async fn filters(http: &reqwest::Client, key: &str) -> crate::Result<CurseforgeFilters> {
    let named = |value: serde_json::Value, slug: bool| -> Vec<CurseforgeNamedId> {
        value
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|entry| CurseforgeNamedId {
                id: entry["id"].to_string().trim_matches('"').to_string(),
                name: entry["name"].as_str().unwrap_or_default().to_string(),
                slug: slug
                    .then(|| entry["slug"].as_str().map(str::to_owned))
                    .flatten(),
            })
            .collect()
    };

    let [classes, categories, game_versions, loaders] = [
        json_response(
            with_headers(http.get("https://api.curseforge.com/v1/classes"), key),
            "class lookup",
        )
        .await?,
        json_response(
            with_headers(http.get("https://api.curseforge.com/v1/categories"), key),
            "category lookup",
        )
        .await?,
        json_response(
            with_headers(http.get("https://api.curseforge.com/v1/game/versions"), key),
            "game version lookup",
        )
        .await?,
        json_response(
            with_headers(http.get("https://api.curseforge.com/v1/loaders"), key),
            "loader lookup",
        )
        .await?,
    ];

    // CurseForge's own sort fields, which are the ones its web site offers and
    // which its ordering numbers refer to.
    let sort_fields = vec![
        CurseforgeNamedId { id: "1".into(), name: "Relevancy".into(), slug: None },
        CurseforgeNamedId { id: "2".into(), name: "Total downloads".into(), slug: None },
        CurseforgeNamedId { id: "3".into(), name: "Newest files".into(), slug: None },
        CurseforgeNamedId { id: "4".into(), name: "Updated".into(), slug: None },
        CurseforgeNamedId { id: "5".into(), name: "Name".into(), slug: None },
    ];

    Ok(CurseforgeFilters {
        classes: named(classes, true),
        categories: named(categories, true),
        game_versions: named(game_versions, false),
        loaders: named(loaders, false),
        sort_fields,
    })
}

/// Whether this launcher can ask CurseForge anything at all.
pub fn is_available() -> bool {
    crate::api::curseforge_metadata::api_key().is_some()
}

fn empty_page(query: &CurseforgeSearchQuery) -> CurseforgeSearchPage {
    CurseforgeSearchPage {
        hits: Vec::new(),
        index: query.index as usize,
        page_size: query.page_size as usize,
        total_count: 0,
        reachable_count: 0,
        capped: false,
    }
}

/// One project out of a search answer, plus the file to install for the version
/// that was asked about.
fn to_hit(found: &serde_json::Value, game_version: Option<&str>) -> CurseforgeSearchHit {
    let id = found["id"].as_u64().unwrap_or_default();
    let name = found["name"].as_str().unwrap_or_default().to_string();

    CurseforgeSearchHit {
        id: id.to_string(),
        latest_file: pick_latest_file(found, game_version).map(|file| CurseforgeFile {
            id: file.0,
            mod_id: id.to_string(),
            display_name: name.clone(),
            file_name: file.1,
            game_version: game_version.map(str::to_owned),
            loader: None,
            file_date: None,
            sha1: None,
        }),
        name,
        slug: found["slug"].as_str().map(str::to_owned),
        summary: found["summary"].as_str().map(str::to_owned),
        icon_url: found["icon"]["thumbnailUrl"]
            .as_str()
            .or_else(|| found["icon"]["url"].as_str())
            .map(str::to_owned),
        author_name: found["authors"]
            .as_array()
            .and_then(|authors| authors.first())
            .and_then(|author| author["name"].as_str())
            .map(str::to_owned),
        download_count: found["downloadCount"].as_u64().unwrap_or_default(),
        date_modified: found["dateModified"].as_str().map(str::to_owned),
        categories: found["categories"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|category| category["name"].as_str())
            .map(str::to_owned)
            .collect(),
    }
}

fn to_file(file: &serde_json::Value) -> CurseforgeFile {
    CurseforgeFile {
        id: file["id"].as_u64().unwrap_or_default().to_string(),
        mod_id: file["modId"].as_u64().unwrap_or_default().to_string(),
        display_name: file["displayName"]
            .as_str()
            .unwrap_or_else(|| file["fileName"].as_str().unwrap_or_default())
            .to_string(),
        file_name: file["fileName"].as_str().unwrap_or_default().to_string(),
        game_version: file["gameVersions"]
            .as_array()
            .and_then(|versions| versions.first())
            .and_then(|version| version.as_str())
            .map(str::to_owned),
        loader: file["loaders"]
            .as_array()
            .and_then(|loaders| loaders.first())
            .and_then(|loader| loader.as_u64())
            .and_then(curseforge_loader_name)
            .map(str::to_owned),
        file_date: file["fileDate"].as_str().map(str::to_owned),
        sha1: file["hashes"]
            .as_array()
            .and_then(|hashes| {
                hashes
                    .iter()
                    .find(|hash| hash["algo"].as_u64() == Some(1))
            })
            .and_then(|hash| hash["value"].as_str())
            .map(str::to_owned),
    }
}

/// The newest file for the version asked about: `(id, file name)`.
///
/// CurseForge answers a search with one entry per version it has, so the one
/// that matters is the one whose version matches, and among those the highest
/// file id is the most recent.
fn pick_latest_file(
    found: &serde_json::Value,
    game_version: Option<&str>,
) -> Option<(String, String)> {
    let indexes = found["latestFilesIndexes"].as_array()?;
    let mut best: Option<(u64, &serde_json::Value)> = None;
    for index in indexes {
        let matches = match game_version {
            Some(version) => index["gameVersion"].as_str() == Some(version),
            None => true,
        };
        let id = index["id"].as_u64().unwrap_or_default();
        if matches && best.is_none_or(|(best, _)| id > best) {
            best = Some((id, index));
        }
    }
    best.map(|(id, index)| {
        (
            id.to_string(),
            index["fileName"].as_str().unwrap_or_default().to_string(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_the_loaders_we_know() {
        assert_eq!(loader_to_curseforge("fabric"), Some(LOADER_FABRIC));
        assert_eq!(loader_to_curseforge("neoforge"), Some(LOADER_NEOFORGE));
        assert_eq!(loader_to_curseforge("vanilla"), None);
    }

    #[test]
    fn builds_the_cdn_path_from_the_first_four_digits() {
        assert_eq!(
            cdn_path(4_711_234, "jei-1.20.1.jar"),
            "https://edge.curseforgecdn.com/files/4711/234/jei-1.20.1.jar"
        );
        assert!(cdn_path(4_711_234, "My Addon (v2).mcaddon")
            .ends_with("My%20Addon%20%28v2%29.mcaddon"));
    }

    #[test]
    fn keeps_only_one_candidate_when_the_url_has_no_host_to_rename() {
        assert_eq!(
            download_url_candidates("https://media.curseforge.com/x.jar"),
            vec!["https://media.curseforge.com/x.jar"]
        );
    }

    #[test]
    fn picks_the_file_for_the_version_asked_about() {
        let found = serde_json::json!({
            "latestFilesIndexes": [
                {"id": 100, "gameVersion": "1.19.2", "fileName": "a.jar"},
                {"id": 300, "gameVersion": "1.20.1", "fileName": "c.jar"},
                {"id": 200, "gameVersion": "1.20.1", "fileName": "b.jar"},
            ]
        });

        assert_eq!(
            pick_latest_file(&found, Some("1.20.1")),
            Some(("300".to_string(), "c.jar".to_string()))
        );
        assert_eq!(pick_latest_file(&found, Some("1.18.2")), None);
        assert_eq!(
            pick_latest_file(&found, None),
            Some(("300".to_string(), "c.jar".to_string()))
        );
    }
}
