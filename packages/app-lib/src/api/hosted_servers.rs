//! Minecraft servers the launcher runs itself, on this machine.
//!
//! Each server is a folder with a `server.jar` in it and a Java process started
//! from there. Its console is kept in memory, what it prints is read for the
//! players who come and go, and a server asked to be public is published
//! through the same relay a world opened to LAN is (see `theseus::api::lan`).

use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, LazyLock};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::{Mutex, Notify};

use crate::api::lan::{self, PortRelay};

/// The port Minecraft clients try first; left free for a world opened to LAN.
const RESERVED_PORT: u16 = 25565;
const FIRST_PORT: u16 = 25566;
const LAST_PORT: u16 = 26000;
const MAX_LOG_LINES: usize = 2000;
const MIN_JAR_BYTES: u64 = 500_000;
const USER_AGENT: &str = "Portalrinth";
const STOP_GRACE: std::time::Duration = std::time::Duration::from_secs(20);

/// The server software that can be installed, in the order it is offered.
pub const SOFTWARE: [&str; 6] =
    ["paper", "purpur", "vanilla", "fabric", "quilt", "folia"];

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(default)]
pub struct HostedServer {
    pub id: String,
    pub name: String,
    pub software: String,
    pub game_version: String,
    pub port: u16,
    pub memory_mb: u32,
    pub motd: String,
    pub max_players: u32,
    pub gamemode: String,
    pub difficulty: String,
    pub view_distance: u32,
    pub level_name: String,
    pub online_mode: bool,
    pub pvp: bool,
    pub white_list: bool,
    pub allow_flight: bool,
    pub command_blocks: bool,
    pub hardcore: bool,
    /// Whether the server is published through the relay once it is up.
    pub public_relay: bool,
    pub eula_accepted: bool,
    /// A Java to start the server with instead of the one picked for it.
    pub java_path: String,
    pub jvm_args: String,
    pub created_at: i64,
}

impl Default for HostedServer {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: "Мой сервер".to_string(),
            software: "paper".to_string(),
            game_version: "1.21.4".to_string(),
            port: FIRST_PORT,
            memory_mb: 2048,
            motd: "A Portalrinth server".to_string(),
            max_players: 20,
            gamemode: "survival".to_string(),
            difficulty: "normal".to_string(),
            view_distance: 10,
            level_name: "world".to_string(),
            online_mode: false,
            pvp: true,
            white_list: false,
            allow_flight: false,
            command_blocks: false,
            hardcore: false,
            public_relay: true,
            eula_accepted: false,
            java_path: String::new(),
            jvm_args: String::new(),
            created_at: 0,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum HostedStatus {
    #[default]
    Stopped,
    Installing,
    Starting,
    Running,
    Stopping,
    /// The process ended on its own, or never started.
    Crashed,
}

/// A server together with how it is doing right now.
#[derive(Serialize, Debug, Clone)]
pub struct HostedServerView {
    #[serde(flatten)]
    pub server: HostedServer,
    pub status: HostedStatus,
    pub error: Option<String>,
    pub relay_error: Option<String>,
    pub public_host: Option<String>,
    pub public_port: Option<u16>,
    pub players: Vec<String>,
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub started_at: Option<i64>,
    pub core_ready: bool,
    pub java_need: u32,
    pub dir: String,
    /// Why the last start failed, as a short code the app explains.
    pub crash_reason: Option<String>,
    /// The console line that gave the failure away.
    pub crash_line: Option<String>,
    /// 1 core, 2 Java, 3 world, 4 done; 0 while it is not starting.
    pub boot_step: u8,
    pub boot_progress: Option<u8>,
}

#[derive(Serialize, Debug, Clone)]
pub struct HostedPlugin {
    pub name: String,
    pub enabled: bool,
    pub size: u64,
}

#[derive(Serialize, Debug, Clone)]
pub struct HostedFile {
    pub name: String,
    pub dir: bool,
    pub size: u64,
}

#[derive(Default)]
struct Runtime {
    status: HostedStatus,
    error: Option<String>,
    relay_error: Option<String>,
    logs: VecDeque<String>,
    players: Vec<String>,
    cpu_percent: f32,
    ram_used_mb: u64,
    started_at: Option<i64>,
    crash_reason: Option<String>,
    crash_line: Option<String>,
    boot_step: u8,
    boot_progress: Option<u8>,
    pid: Option<u32>,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    kill: Option<Arc<Notify>>,
    relay: Option<PortRelay>,
}

static RUNTIME: LazyLock<DashMap<String, Runtime>> =
    LazyLock::new(DashMap::new);

/// Held while `servers.json` is read and written back.
static STORE: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// Servers whose core refused `--nogui`; they are started without it.
static NO_NOGUI: LazyLock<DashMap<String, ()>> = LazyLock::new(DashMap::new);

fn input_error(message: impl Into<String>) -> crate::Error {
    crate::Error::from(crate::ErrorKind::InputError(message.into()))
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn root_dir() -> crate::Result<PathBuf> {
    let state = crate::State::get().await?;
    Ok(state.directories.config_dir.join("hosted_servers"))
}

async fn server_dir(id: &str) -> crate::Result<PathBuf> {
    if id.is_empty()
        || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(input_error("unknown server"));
    }
    Ok(root_dir().await?.join(id))
}

async fn load_all() -> crate::Result<Vec<HostedServer>> {
    let file = root_dir().await?.join("servers.json");
    match tokio::fs::read(&file).await {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(Vec::new())
        }
        Err(error) => Err(error.into()),
    }
}

async fn save_all(list: &[HostedServer]) -> crate::Result<()> {
    let root = root_dir().await?;
    tokio::fs::create_dir_all(&root).await?;
    let temp = root.join("servers.json.tmp");
    tokio::fs::write(&temp, serde_json::to_vec_pretty(list)?).await?;
    tokio::fs::rename(&temp, root.join("servers.json")).await?;
    Ok(())
}

async fn find(id: &str) -> crate::Result<HostedServer> {
    load_all()
        .await?
        .into_iter()
        .find(|server| server.id == id)
        .ok_or_else(|| input_error("server not found"))
}

fn sanitize(server: &mut HostedServer) {
    server.name = server.name.trim().chars().take(48).collect();
    if server.name.is_empty() {
        server.name = HostedServer::default().name;
    }
    if !SOFTWARE.contains(&server.software.as_str()) {
        server.software = "paper".to_string();
    }
    server.memory_mb = server.memory_mb.clamp(512, 65536);
    server.max_players = server.max_players.clamp(1, 1000);
    server.view_distance = server.view_distance.clamp(2, 32);
    server.motd = server.motd.replace(['\r', '\n'], " ");
    if !["survival", "creative", "adventure", "spectator"]
        .contains(&server.gamemode.as_str())
    {
        server.gamemode = "survival".to_string();
    }
    if !["peaceful", "easy", "normal", "hard"]
        .contains(&server.difficulty.as_str())
    {
        server.difficulty = "normal".to_string();
    }
    server.level_name = server
        .level_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
        .take(32)
        .collect();
    if server.level_name.is_empty() {
        server.level_name = "world".to_string();
    }
}

fn next_free_port(list: &[HostedServer]) -> u16 {
    (FIRST_PORT..=LAST_PORT)
        .find(|port| list.iter().all(|server| server.port != *port))
        .unwrap_or(FIRST_PORT)
}

/// The Java major a Minecraft version's server needs at least.
pub fn java_major_for(version: &str) -> u32 {
    let parts: Vec<u32> = version
        .split(['.', '-'])
        .take(3)
        .map(|part| part.parse().unwrap_or(0))
        .collect();
    let major = parts.first().copied().unwrap_or(1);
    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);
    if major > 1 {
        25
    } else if minor >= 21 || (minor == 20 && patch >= 5) {
        21
    } else if minor >= 18 {
        17
    } else if minor == 17 {
        16
    } else {
        8
    }
}

async fn core_ready(dir: &Path) -> bool {
    tokio::fs::metadata(dir.join("server.jar"))
        .await
        .is_ok_and(|meta| meta.len() > MIN_JAR_BYTES)
}

async fn view_of(server: HostedServer) -> crate::Result<HostedServerView> {
    let dir = server_dir(&server.id).await?;
    let core_ready = core_ready(&dir).await;
    let java_need = java_major_for(&server.game_version);
    let mut view = HostedServerView {
        status: HostedStatus::Stopped,
        error: None,
        relay_error: None,
        public_host: None,
        public_port: None,
        players: Vec::new(),
        cpu_percent: 0.0,
        ram_used_mb: 0,
        started_at: None,
        core_ready,
        java_need,
        dir: dir.to_string_lossy().to_string(),
        crash_reason: None,
        crash_line: None,
        boot_step: 0,
        boot_progress: None,
        server,
    };
    if let Some(run) = RUNTIME.get(&view.server.id) {
        view.status = run.status;
        view.error.clone_from(&run.error);
        view.relay_error.clone_from(&run.relay_error);
        view.players.clone_from(&run.players);
        view.cpu_percent = run.cpu_percent;
        view.ram_used_mb = run.ram_used_mb;
        view.started_at = run.started_at;
        view.crash_reason.clone_from(&run.crash_reason);
        view.crash_line.clone_from(&run.crash_line);
        view.boot_step = run.boot_step;
        view.boot_progress = run.boot_progress;
        if let Some(relay) = &run.relay {
            if relay.is_up() {
                view.public_host = Some(relay.public_host.clone());
                view.public_port = Some(relay.public_port);
            } else {
                view.relay_error = relay.reason();
            }
        }
    }
    Ok(view)
}

fn push_log(id: &str, line: impl Into<String>) {
    let mut run = RUNTIME.entry(id.to_string()).or_default();
    if run.logs.len() >= MAX_LOG_LINES {
        run.logs.pop_front();
    }
    run.logs.push_back(line.into());
}

fn set_status(id: &str, status: HostedStatus, error: Option<String>) {
    let mut run = RUNTIME.entry(id.to_string()).or_default();
    run.status = status;
    run.error = error;
    match status {
        HostedStatus::Installing => run.boot_step = 1,
        HostedStatus::Starting => run.boot_step = run.boot_step.max(1),
        HostedStatus::Running => {
            run.boot_step = 4;
            run.boot_progress = None;
        }
        _ => {
            run.boot_step = 0;
            run.boot_progress = None;
        }
    }
}

/// Whether the core is Bukkit's, whose option parser rejected `--nogui`
/// before 1.14.
fn takes_nogui(server: &HostedServer) -> bool {
    if NO_NOGUI.contains_key(&server.id) {
        return false;
    }
    if !matches!(server.software.as_str(), "paper" | "purpur" | "folia") {
        return true;
    }
    let mut parts = server.game_version.split(['.', '-']);
    let major: u32 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(1);
    let minor: u32 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    major > 1 || minor >= 14
}

/// The console java next to a `javaw`, which has no console of its own.
fn console_java(path: PathBuf) -> PathBuf {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return path;
    };
    if !name.eq_ignore_ascii_case("javaw.exe") {
        return path;
    }
    let java = path.with_file_name("java.exe");
    if java.exists() { java } else { path }
}

/// What a dead server's console says went wrong: a code and the line.
fn diagnose(logs: &VecDeque<String>) -> (String, Option<String>) {
    const RULES: [(&str, &[&str]); 9] = [
        ("bad_option", &["is not a recognized option"]),
        (
            "java_version",
            &[
                "UnsupportedClassVersionError",
                "compiled by a more recent version",
                "Unsupported class file major version",
                "requires Java",
            ],
        ),
        (
            "memory",
            &[
                "OutOfMemoryError",
                "Could not reserve enough space",
                "Invalid maximum heap size",
                "Invalid initial heap size",
            ],
        ),
        (
            "port_in_use",
            &["FAILED TO BIND TO PORT", "Address already in use", "BindException"],
        ),
        ("eula", &["You need to agree to the EULA"]),
        (
            "mods",
            &[
                "Incompatible mod set",
                "Mod resolution failed",
                "Missing or unsupported mandatory dependencies",
                "requires any version of",
            ],
        ),
        ("plugin", &["Could not load 'plugins", "Error occurred while enabling"]),
        ("world", &["Failed to load level", "Exception reading"]),
        (
            "jvm",
            &["Could not create the Java Virtual Machine", "Unrecognized option"],
        ),
    ];
    for (code, needles) in RULES {
        if let Some(line) = logs
            .iter()
            .find(|line| needles.iter().any(|needle| line.contains(needle)))
        {
            return (code.to_string(), Some(line.trim().to_string()));
        }
    }
    let line = logs
        .iter()
        .rev()
        .find(|line| {
            ["ERROR", "SEVERE", "FATAL", "Exception", "Error:"]
                .iter()
                .any(|needle| line.contains(needle))
        })
        .map(|line| line.trim().to_string());
    ("unknown".to_string(), line)
}

fn is_active(id: &str) -> bool {
    RUNTIME.get(id).is_some_and(|run| {
        matches!(
            run.status,
            HostedStatus::Installing
                | HostedStatus::Starting
                | HostedStatus::Running
                | HostedStatus::Stopping
        )
    })
}

pub async fn list() -> crate::Result<Vec<HostedServerView>> {
    let mut views = Vec::new();
    for server in load_all().await? {
        views.push(view_of(server).await?);
    }
    Ok(views)
}

pub async fn get(id: &str) -> crate::Result<HostedServerView> {
    view_of(find(id).await?).await
}

pub async fn create(
    name: String,
    software: String,
    game_version: String,
) -> crate::Result<HostedServerView> {
    let _lock = STORE.lock().await;
    let mut list = load_all().await?;
    let mut server = HostedServer {
        id: uuid::Uuid::new_v4().simple().to_string()[..12].to_string(),
        name,
        software,
        game_version: game_version.trim().to_string(),
        port: next_free_port(&list),
        created_at: now_ms(),
        ..HostedServer::default()
    };
    if server.game_version.is_empty() {
        return Err(input_error("pick a game version"));
    }
    sanitize(&mut server);
    tokio::fs::create_dir_all(server_dir(&server.id).await?).await?;
    list.insert(0, server.clone());
    save_all(&list).await?;
    view_of(server).await
}

pub async fn update(
    id: &str,
    mut patch: HostedServer,
) -> crate::Result<HostedServerView> {
    let _lock = STORE.lock().await;
    let mut list = load_all().await?;
    let index = list
        .iter()
        .position(|server| server.id == id)
        .ok_or_else(|| input_error("server not found"))?;
    if patch.port == RESERVED_PORT {
        return Err(input_error(
            "port 25565 is kept free for worlds opened to LAN",
        ));
    }
    if patch.port < 1024 {
        return Err(input_error("pick a port from 1024 to 65535"));
    }
    if list
        .iter()
        .any(|server| server.id != id && server.port == patch.port)
    {
        return Err(input_error("another of your servers uses this port"));
    }
    let previous = &list[index];
    let core_changed = previous.software != patch.software
        || previous.game_version != patch.game_version;
    if core_changed && is_active(id) {
        return Err(input_error(
            "stop the server before changing its software or version",
        ));
    }
    patch.id = previous.id.clone();
    patch.created_at = previous.created_at;
    sanitize(&mut patch);
    if core_changed {
        let _ =
            tokio::fs::remove_file(server_dir(id).await?.join("server.jar"))
                .await;
    }
    list[index] = patch.clone();
    save_all(&list).await?;
    view_of(patch).await
}

pub async fn remove(id: &str) -> crate::Result<()> {
    if is_active(id) {
        kill(id);
        for _ in 0..50 {
            if !is_active(id) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
    let _lock = STORE.lock().await;
    let mut list = load_all().await?;
    list.retain(|server| server.id != id);
    save_all(&list).await?;
    RUNTIME.remove(id);
    lan::release_reservation(id).await;
    let dir = server_dir(id).await?;
    if tokio::fs::try_exists(&dir).await.unwrap_or(false) {
        tokio::fs::remove_dir_all(&dir).await?;
    }
    Ok(())
}

pub fn log(id: &str) -> Vec<String> {
    RUNTIME
        .get(id)
        .map(|run| run.logs.iter().cloned().collect())
        .unwrap_or_default()
}

async fn get_json(url: &str) -> crate::Result<serde_json::Value> {
    let response = crate::util::fetch::REQWEST_CLIENT
        .get(url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!(format!(
            "{url} answered HTTP {}",
            response.status()
        )));
    }
    Ok(response.json().await?)
}

fn strings(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn stable_game_versions(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|rows| {
            rows.iter()
                .filter(|row| row["stable"].as_bool() != Some(false))
                .filter_map(|row| row["version"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

const FILL_API: &str = "https://fill.papermc.io/v3/projects";
const MOJANG_MANIFEST: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/// The game versions a server software can be installed for, newest first.
pub async fn versions(software: &str) -> crate::Result<Vec<String>> {
    let mut versions = match software {
        "paper" | "folia" => {
            let data = get_json(&format!("{FILL_API}/{software}")).await?;
            let mut out: Vec<String> = Vec::new();
            if let Some(groups) = data["versions"].as_object() {
                for list in groups.values() {
                    for version in strings(list) {
                        if !out.contains(&version) {
                            out.push(version);
                        }
                    }
                }
            } else {
                out = strings(&data["versions"]);
            }
            out
        }
        "purpur" => {
            let data = get_json("https://api.purpurmc.org/v2/purpur").await?;
            let mut out = strings(&data["versions"]);
            out.reverse();
            out
        }
        "fabric" => stable_game_versions(
            &get_json("https://meta.fabricmc.net/v2/versions/game").await?,
        ),
        "quilt" => stable_game_versions(
            &get_json("https://meta.quiltmc.org/v3/versions/game").await?,
        ),
        _ => {
            let data = get_json(MOJANG_MANIFEST).await?;
            data["versions"]
                .as_array()
                .map(|rows| {
                    rows.iter()
                        .filter(|row| row["type"].as_str() == Some("release"))
                        .filter_map(|row| row["id"].as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default()
        }
    };
    versions.retain(|version| !version.is_empty());
    versions.truncate(60);
    Ok(versions)
}

fn first_stable_version(value: &serde_json::Value) -> Option<String> {
    let rows = value.as_array()?;
    rows.iter()
        .find(|row| row["stable"].as_bool() != Some(false))
        .or_else(|| rows.first())
        .and_then(|row| row["version"].as_str().map(String::from))
}

async fn jar_url(server: &HostedServer) -> crate::Result<String> {
    let version = urlencoding::encode(&server.game_version).to_string();
    match server.software.as_str() {
        "paper" | "folia" => {
            let data = get_json(&format!(
                "{FILL_API}/{}/versions/{version}/builds",
                server.software
            ))
            .await?;
            let builds = data.as_array().cloned().unwrap_or_default();
            builds
                .iter()
                .find(|build| {
                    build["channel"].as_str().is_some_and(|channel| {
                        channel.eq_ignore_ascii_case("stable")
                    })
                })
                .or_else(|| builds.first())
                .and_then(|build| {
                    build["downloads"]["server:default"]["url"]
                        .as_str()
                        .map(String::from)
                })
                .ok_or_else(|| {
                    input_error(format!(
                        "{} has no build for {}",
                        server.software, server.game_version
                    ))
                })
        }
        "purpur" => Ok(format!(
            "https://api.purpurmc.org/v2/purpur/{version}/latest/download"
        )),
        "fabric" => {
            let loader = first_stable_version(
                &get_json("https://meta.fabricmc.net/v2/versions/loader")
                    .await?,
            );
            let installer = first_stable_version(
                &get_json("https://meta.fabricmc.net/v2/versions/installer")
                    .await?,
            );
            match (loader, installer) {
                (Some(loader), Some(installer)) => Ok(format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{version}/{loader}/{installer}/server/jar"
                )),
                _ => Err(input_error("Fabric did not list its versions")),
            }
        }
        "quilt" => {
            let loader = first_stable_version(
                &get_json("https://meta.quiltmc.org/v3/versions/loader")
                    .await?,
            )
            .ok_or_else(|| input_error("Quilt did not list its versions"))?;
            Ok(format!(
                "https://meta.quiltmc.org/v3/versions/loader/{version}/{loader}/server/jar"
            ))
        }
        _ => {
            let manifest = get_json(MOJANG_MANIFEST).await?;
            let url = manifest["versions"]
                .as_array()
                .and_then(|rows| {
                    rows.iter().find(|row| {
                        row["id"].as_str() == Some(server.game_version.as_str())
                    })
                })
                .and_then(|row| row["url"].as_str().map(String::from))
                .ok_or_else(|| {
                    input_error("Mojang does not list this version")
                })?;
            get_json(&url).await?["downloads"]["server"]["url"]
                .as_str()
                .map(String::from)
                .ok_or_else(|| input_error("this version has no server"))
        }
    }
}

/// Downloads the server software into the server's folder.
pub async fn install_core(id: &str) -> crate::Result<HostedServerView> {
    if is_active(id) {
        return Err(input_error("stop the server first"));
    }
    let server = find(id).await?;
    set_status(id, HostedStatus::Installing, None);
    let result = download_core(&server).await;
    match &result {
        Ok(()) => {
            push_log(id, "Server software is ready.");
            set_status(id, HostedStatus::Stopped, None);
        }
        Err(error) => {
            push_log(id, error.to_string());
            set_status(id, HostedStatus::Crashed, Some(error.to_string()));
        }
    }
    result?;
    view_of(server).await
}

async fn download_core(server: &HostedServer) -> crate::Result<()> {
    let dir = server_dir(&server.id).await?;
    tokio::fs::create_dir_all(&dir).await?;
    push_log(
        &server.id,
        format!(
            "Downloading {} {}…",
            server.software, server.game_version
        ),
    );
    let url = jar_url(server).await?;
    let mut response = crate::util::fetch::REQWEST_CLIENT
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!(format!(
            "the download answered HTTP {}",
            response.status()
        )));
    }
    let total = response.content_length().unwrap_or(0);
    let part = dir.join("server.jar.part");
    let mut file = tokio::fs::File::create(&part).await?;
    let mut loaded: u64 = 0;
    let mut last_report = std::time::Instant::now();
    while let Some(chunk) = response.chunk().await? {
        file.write_all(&chunk).await?;
        loaded += chunk.len() as u64;
        if last_report.elapsed() > std::time::Duration::from_millis(1500) {
            last_report = std::time::Instant::now();
            let mb = |bytes: u64| bytes as f64 / 1_048_576.0;
            push_log(
                &server.id,
                if total > 0 {
                    format!("{:.1} / {:.1} MB", mb(loaded), mb(total))
                } else {
                    format!("{:.1} MB", mb(loaded))
                },
            );
        }
    }
    file.flush().await?;
    drop(file);
    if loaded < MIN_JAR_BYTES {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(input_error("the server software did not download whole"));
    }
    tokio::fs::rename(&part, dir.join("server.jar")).await?;
    Ok(())
}

async fn write_properties(
    server: &HostedServer,
    dir: &Path,
) -> crate::Result<()> {
    let file = dir.join("server.properties");
    let patch: Vec<(&str, String)> = vec![
        ("server-port", server.port.to_string()),
        ("motd", server.motd.clone()),
        ("max-players", server.max_players.to_string()),
        ("gamemode", server.gamemode.clone()),
        ("difficulty", server.difficulty.clone()),
        ("view-distance", server.view_distance.to_string()),
        ("level-name", server.level_name.clone()),
        ("online-mode", server.online_mode.to_string()),
        ("pvp", server.pvp.to_string()),
        ("white-list", server.white_list.to_string()),
        ("allow-flight", server.allow_flight.to_string()),
        ("enable-command-block", server.command_blocks.to_string()),
        ("hardcore", server.hardcore.to_string()),
    ];
    let text = tokio::fs::read_to_string(&file).await.unwrap_or_default();
    let mut seen = Vec::new();
    let mut lines: Vec<String> = text
        .lines()
        .map(|line| {
            let Some((key, _)) = line.split_once('=') else {
                return line.to_string();
            };
            let key = key.trim();
            if line.starts_with('#') {
                return line.to_string();
            }
            match patch.iter().find(|(name, _)| *name == key) {
                Some((name, value)) => {
                    seen.push(*name);
                    format!("{name}={value}")
                }
                None => line.to_string(),
            }
        })
        .collect();
    for (name, value) in &patch {
        if !seen.contains(name) {
            lines.push(format!("{name}={value}"));
        }
    }
    tokio::fs::write(&file, format!("{}\n", lines.join("\n"))).await?;
    Ok(())
}

async fn resolve_java(server: &HostedServer) -> crate::Result<PathBuf> {
    let pinned = server.java_path.trim();
    if !pinned.is_empty() {
        let path = PathBuf::from(pinned);
        if tokio::fs::try_exists(&path).await.unwrap_or(false) {
            return Ok(path);
        }
        return Err(input_error(format!("no Java at {pinned}")));
    }
    let need = java_major_for(&server.game_version);
    let state = crate::State::get().await?;
    if let Some(java) =
        crate::state::JavaVersion::get(need, &state.pool).await?
    {
        let path = PathBuf::from(&java.path);
        if tokio::fs::try_exists(&path).await.unwrap_or(false) {
            return Ok(path);
        }
    }
    crate::api::jre::auto_install_java(need).await
}

fn split_args(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for c in text.chars() {
        match c {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

pub async fn start(id: &str) -> crate::Result<HostedServerView> {
    if is_active(id) {
        return get(id).await;
    }
    let result = launch(id).await;
    if let Err(error) = &result {
        push_log(id, error.to_string());
        set_status(id, HostedStatus::Crashed, Some(error.to_string()));
        let mut run = RUNTIME.entry(id.to_string()).or_default();
        run.crash_reason = Some("launch".to_string());
        run.crash_line = Some(error.to_string());
    }
    result?;
    get(id).await
}

async fn launch(id: &str) -> crate::Result<()> {
    let server = find(id).await?;
    if !server.eula_accepted {
        return Err(input_error(
            "accept the Minecraft EULA in the server's settings first",
        ));
    }
    let dir = server_dir(id).await?;
    {
        let mut run = RUNTIME.entry(id.to_string()).or_default();
        run.status = HostedStatus::Starting;
        run.error = None;
        run.relay_error = None;
        run.crash_reason = None;
        run.crash_line = None;
        run.boot_step = 1;
        run.boot_progress = None;
        run.players.clear();
        run.logs.clear();
    }
    tokio::fs::create_dir_all(&dir).await?;
    if !core_ready(&dir).await {
        set_status(id, HostedStatus::Installing, None);
        download_core(&server).await?;
        set_status(id, HostedStatus::Starting, None);
    }
    write_properties(&server, &dir).await?;
    tokio::fs::write(dir.join("eula.txt"), "eula=true\n").await?;

    let java = console_java(resolve_java(&server).await?);
    push_log(id, format!("Java: {}", java.display()));

    let mut child = spawn_server(id, &server, &dir, &java)?;
    let id = id.to_string();
    tokio::spawn(async move {
        loop {
            let Some(kill) = RUNTIME.get(&id).and_then(|run| run.kill.clone())
            else {
                break;
            };
            let exited = tokio::select! {
                status = child.wait() => Some(status.ok()),
                () = kill.notified() => None,
            };
            let status = match exited {
                Some(status) => status,
                None => {
                    let _ = child.kill().await;
                    child.wait().await.ok()
                }
            };
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            if !on_exit(&id, status).await {
                break;
            }
            match spawn_server(&id, &server, &dir, &java) {
                Ok(next) => child = next,
                Err(error) => {
                    push_log(&id, error.to_string());
                    set_status(&id, HostedStatus::Crashed, Some(error.to_string()));
                    break;
                }
            }
        }
    });
    Ok(())
}

/// Starts the server's Java and wires its console up.
fn spawn_server(
    id: &str,
    server: &HostedServer,
    dir: &Path,
    java: &Path,
) -> crate::Result<tokio::process::Child> {
    let mut args = vec![
        format!("-Xms{}M", server.memory_mb.min(1024)),
        format!("-Xmx{}M", server.memory_mb),
    ];
    args.extend(split_args(&server.jvm_args).into_iter().filter(|arg| {
        !arg.starts_with("-Xms") && !arg.starts_with("-Xmx")
    }));
    args.push("-Dfile.encoding=UTF-8".to_string());
    args.extend(["-jar", "server.jar"].map(String::from));
    if takes_nogui(server) {
        args.push("--nogui".to_string());
    }

    let mut command = tokio::process::Command::new(java);
    command
        .args(&args)
        .current_dir(dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);

    let mut child = command.spawn()?;
    let stdin = child.stdin.take().map(|stdin| Arc::new(Mutex::new(stdin)));
    let pid = child.id();
    {
        let mut run = RUNTIME.entry(id.to_string()).or_default();
        run.stdin = stdin;
        run.kill = Some(Arc::new(Notify::new()));
        run.pid = pid;
        run.started_at = Some(now_ms());
        run.boot_step = run.boot_step.max(2);
    }

    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(read_output(id.to_string(), server.clone(), stdout));
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(read_output(id.to_string(), server.clone(), stderr));
    }
    if let Some(pid) = pid {
        tokio::spawn(sample_usage(id.to_string(), pid, server.port));
    }
    Ok(child)
}

/// Settles a server whose process ended; `true` when it should be started again.
async fn on_exit(id: &str, status: Option<std::process::ExitStatus>) -> bool {
    let mut retry = false;
    let relay = {
        let mut run = RUNTIME.entry(id.to_string()).or_default();
        let asked = run.status == HostedStatus::Stopping;
        let was_up = run.boot_step >= 4;
        let clean = status.is_some_and(|status| status.success());
        let (reason, line) = diagnose(&run.logs);
        if !asked
            && reason == "bad_option"
            && line.as_deref().is_some_and(|line| line.contains("nogui"))
            && !NO_NOGUI.contains_key(id)
        {
            NO_NOGUI.insert(id.to_string(), ());
            retry = true;
        }
        if retry {
            run.status = HostedStatus::Starting;
            run.error = None;
        } else if asked || (clean && was_up) {
            run.status = HostedStatus::Stopped;
            run.error = None;
        } else {
            run.status = HostedStatus::Crashed;
            run.error = Some(match status.and_then(|status| status.code()) {
                Some(code) => format!("the server exited with code {code}"),
                None => "the server stopped unexpectedly".to_string(),
            });
            run.crash_reason = Some(reason);
            run.crash_line = line;
        }
        run.boot_step = 0;
        run.boot_progress = None;
        run.stdin = None;
        run.kill = None;
        run.pid = None;
        run.players.clear();
        run.cpu_percent = 0.0;
        run.ram_used_mb = 0;
        run.started_at = None;
        run.relay.take()
    };
    push_log(id, "Server stopped.");
    if let Some(relay) = relay {
        lan::close_port(relay).await;
    }
    if retry {
        let mut run = RUNTIME.entry(id.to_string()).or_default();
        run.logs.clear();
        run.boot_step = 2;
        drop(run);
        push_log(id, "Starting again without --nogui…");
    }
    retry
}

static SPAWN_PROGRESS: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"Preparing spawn area: (\d{1,3})%").expect("valid regex")
});

static ANSI_CODES: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]").expect("valid regex")
});

/// A player whose connection dropped; Paper and Fabric say so before, or
/// instead of, the usual "left the game".
static LOST_CONNECTION: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\]: (?:\[[^\]]*\] )?([A-Za-z0-9_.]{1,32}) lost connection:")
        .expect("valid regex")
});

static JOIN_LEAVE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\]: (?:\[[^\]]*\] )?([A-Za-z0-9_.]{1,32}) (joined|left) the game")
        .expect("valid regex")
});

async fn read_output(
    id: String,
    server: HostedServer,
    output: impl tokio::io::AsyncRead + Unpin,
) {
    let mut lines = BufReader::new(output).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        if line.contains("Preparing level")
            || line.contains("Preparing start region")
            || line.contains("Loading dimension")
        {
            let mut run = RUNTIME.entry(id.clone()).or_default();
            run.boot_step = run.boot_step.max(3);
        }
        if let Some(found) = SPAWN_PROGRESS.captures(&line) {
            let mut run = RUNTIME.entry(id.clone()).or_default();
            run.boot_step = run.boot_step.max(3);
            run.boot_progress = found[1].parse::<u8>().ok().map(|p| p.min(100));
        }
        if line.contains("Done (") && line.contains(')') {
            let starting = RUNTIME
                .get(&id)
                .is_some_and(|run| run.status == HostedStatus::Starting);
            if starting {
                set_status(&id, HostedStatus::Running, None);
                if server.public_relay {
                    tokio::spawn(open_relay(id.clone(), server.port));
                }
            }
        }
        if line.contains("You need to agree to the EULA") {
            set_status(
                &id,
                HostedStatus::Crashed,
                Some("the Minecraft EULA has not been accepted".to_string()),
            );
        }
        let plain = ANSI_CODES.replace_all(&line, "");
        if let Some(found) = JOIN_LEAVE.captures(&plain) {
            let name = found[1].to_string();
            let mut run = RUNTIME.entry(id.clone()).or_default();
            run.players.retain(|player| *player != name);
            if &found[2] == "joined" {
                run.players.push(name);
            }
        } else if let Some(found) = LOST_CONNECTION.captures(&plain) {
            let name = found[1].to_string();
            RUNTIME
                .entry(id.clone())
                .or_default()
                .players
                .retain(|player| *player != name);
        }
        push_log(&id, line);
    }
}

async fn open_relay(id: String, port: u16) {
    match lan::publish_port(port, &id).await {
        Ok(relay) => {
            let address = format!("{}:{}", relay.public_host, relay.public_port);
            let mut stale = None;
            {
                let mut run = RUNTIME.entry(id.clone()).or_default();
                if run.status == HostedStatus::Running {
                    run.relay_error = None;
                    run.relay = Some(relay);
                } else {
                    stale = Some(relay);
                }
            }
            match stale {
                Some(relay) => lan::close_port(relay).await,
                None => push_log(&id, format!("Public address: {address}")),
            }
        }
        Err(error) => {
            push_log(&id, format!("Public address unavailable: {error}"));
            RUNTIME.entry(id).or_default().relay_error =
                Some(error.to_string());
        }
    }
}

/// Publishes a running server again, after its relay dropped or was off.
pub async fn republish(id: &str) -> crate::Result<HostedServerView> {
    let server = find(id).await?;
    let previous = {
        let mut run = RUNTIME.entry(id.to_string()).or_default();
        if run.status != HostedStatus::Running {
            return Err(input_error("start the server first"));
        }
        run.relay_error = None;
        run.relay.take()
    };
    if let Some(relay) = previous {
        lan::close_port(relay).await;
    }
    open_relay(id.to_string(), server.port).await;
    get(id).await
}

/// Asks the server itself how many players it has, so that a leave line the
/// log never printed (a crash of the client, a dropped tunnel) cannot leave a
/// player counted forever.
async fn reconcile_players(id: &str, port: u16) {
    let Ok(Ok(connection)) = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        async_minecraft_ping::ConnectionConfig::build("127.0.0.1")
            .with_port(port)
            .with_timeout(std::time::Duration::from_secs(2))
            .connect(),
    )
    .await
    else {
        return;
    };
    let Ok(Ok(status)) = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        connection.status(),
    )
    .await
    else {
        return;
    };
    let online = status.status.players.online.max(0) as usize;
    let named: Vec<String> = status
        .status
        .players
        .sample
        .as_ref()
        .map(|sample| {
            sample
                .iter()
                .map(|player| player.name.clone())
                .filter(|name| {
                    !name.is_empty()
                        && name.chars().all(|c| {
                            c.is_ascii_alphanumeric() || c == '_' || c == '.'
                        })
                })
                .collect()
        })
        .unwrap_or_default();
    let Some(mut run) = RUNTIME.get_mut(id) else {
        return;
    };
    if run.status != HostedStatus::Running {
        return;
    }
    if online == 0 {
        run.players.clear();
    } else if named.len() == online {
        run.players = named;
    } else if run.players.len() > online {
        let extra = run.players.len() - online;
        run.players.drain(..extra);
    }
}

async fn sample_usage(id: String, pid: u32, port: u16) {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let cores = std::thread::available_parallelism()
        .map(|cores| cores.get())
        .unwrap_or(1) as f32;
    let target = Pid::from_u32(pid);
    let mut system = System::new();
    let mut tick: u32 = 0;
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        if RUNTIME.get(&id).and_then(|run| run.pid) != Some(pid) {
            return;
        }
        tick = tick.wrapping_add(1);
        if tick % 5 == 0 {
            reconcile_players(&id, port).await;
        }
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[target]),
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        let Some(process) = system.process(target) else {
            continue;
        };
        let cpu = (process.cpu_usage() / cores).clamp(0.0, 100.0);
        let ram = process.memory() / 1_048_576;
        if let Some(mut run) = RUNTIME.get_mut(&id) {
            run.cpu_percent = cpu;
            run.ram_used_mb = ram;
        }
    }
}

pub async fn command(id: &str, text: &str) -> crate::Result<()> {
    let text = text.replace(['\r', '\n'], " ");
    let text = text.trim();
    if text.is_empty() {
        return Ok(());
    }
    let stdin = RUNTIME
        .get(id)
        .and_then(|run| run.stdin.clone())
        .ok_or_else(|| input_error("the server is not running"))?;
    stdin
        .lock()
        .await
        .write_all(format!("{text}\n").as_bytes())
        .await?;
    push_log(id, format!("> {text}"));
    Ok(())
}

fn kill(id: &str) {
    let handle = {
        let Some(mut run) = RUNTIME.get_mut(id) else {
            return;
        };
        run.status = if run.kill.is_some() {
            HostedStatus::Stopping
        } else {
            HostedStatus::Stopped
        };
        run.kill.clone()
    };
    if let Some(handle) = handle {
        handle.notify_one();
    }
}

pub async fn stop(id: &str) -> crate::Result<HostedServerView> {
    let handles = RUNTIME.get_mut(id).and_then(|mut run| {
        run.kill.clone().map(|kill| {
            run.status = HostedStatus::Stopping;
            (run.stdin.clone(), kill)
        })
    });
    let Some((stdin, kill_handle)) = handles else {
        return get(id).await;
    };
    push_log(id, "Stopping…");
    let said_stop = match stdin {
        Some(stdin) => stdin.lock().await.write_all(b"stop\n").await.is_ok(),
        None => false,
    };
    if said_stop {
        let handle = Arc::clone(&kill_handle);
        tokio::spawn(async move {
            tokio::time::sleep(STOP_GRACE).await;
            handle.notify_one();
        });
    } else {
        kill_handle.notify_one();
    }
    get(id).await
}

pub async fn restart(id: &str) -> crate::Result<HostedServerView> {
    stop(id).await?;
    let deadline = std::time::Instant::now() + STOP_GRACE
        + std::time::Duration::from_secs(5);
    while is_active(id) && std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    start(id).await
}

fn content_folder(server: &HostedServer) -> PathBuf {
    match server.software.as_str() {
        "fabric" | "quilt" => PathBuf::from("mods"),
        "vanilla" => PathBuf::from(&server.level_name).join("datapacks"),
        _ => PathBuf::from("plugins"),
    }
}

async fn content_dir(id: &str) -> crate::Result<PathBuf> {
    let server = find(id).await?;
    let dir = server_dir(id).await?.join(content_folder(&server));
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir)
}

fn plain_name(name: &str) -> crate::Result<&str> {
    let ok = !name.is_empty()
        && Path::new(name).components().count() == 1
        && matches!(Path::new(name).components().next(), Some(Component::Normal(_)));
    if ok {
        Ok(name)
    } else {
        Err(input_error("invalid file name"))
    }
}

pub async fn plugins(id: &str) -> crate::Result<Vec<HostedPlugin>> {
    let dir = content_dir(id).await?;
    let mut out = Vec::new();
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        let enabled = !lower.ends_with(".disabled");
        let base = lower.trim_end_matches(".disabled");
        if !(base.ends_with(".jar") || base.ends_with(".zip")) {
            continue;
        }
        let size = entry.metadata().await.map(|meta| meta.len()).unwrap_or(0);
        out.push(HostedPlugin {
            name: if enabled {
                name
            } else {
                name[..name.len() - ".disabled".len()].to_string()
            },
            enabled,
            size,
        });
    }
    out.sort_by_key(|plugin| plugin.name.to_lowercase());
    Ok(out)
}

pub async fn plugin_toggle(
    id: &str,
    name: &str,
) -> crate::Result<Vec<HostedPlugin>> {
    let name = plain_name(name)?;
    let dir = content_dir(id).await?;
    let enabled = dir.join(name);
    let disabled = dir.join(format!("{name}.disabled"));
    if tokio::fs::try_exists(&enabled).await.unwrap_or(false) {
        tokio::fs::rename(&enabled, &disabled).await?;
    } else if tokio::fs::try_exists(&disabled).await.unwrap_or(false) {
        tokio::fs::rename(&disabled, &enabled).await?;
    }
    plugins(id).await
}

pub async fn plugin_remove(
    id: &str,
    name: &str,
) -> crate::Result<Vec<HostedPlugin>> {
    let name = plain_name(name)?;
    let dir = content_dir(id).await?;
    let _ = tokio::fs::remove_file(dir.join(name)).await;
    let _ = tokio::fs::remove_file(dir.join(format!("{name}.disabled"))).await;
    plugins(id).await
}

pub async fn plugin_import(
    id: &str,
    paths: Vec<PathBuf>,
) -> crate::Result<Vec<HostedPlugin>> {
    let dir = content_dir(id).await?;
    for path in paths {
        let Some(name) = path.file_name() else {
            continue;
        };
        let lower = name.to_string_lossy().to_lowercase();
        if lower.ends_with(".jar") || lower.ends_with(".zip") {
            tokio::fs::copy(&path, dir.join(name)).await?;
        }
    }
    plugins(id).await
}

/// Fetches a file published on Modrinth straight into the server's content
/// folder. Only Modrinth's CDN is trusted, so the launcher never writes
/// whatever a page happened to link to.
pub async fn plugin_download(
    id: &str,
    url: &str,
    name: &str,
) -> crate::Result<Vec<HostedPlugin>> {
    let name = plain_name(name)?;
    let lower = name.to_lowercase();
    if !(lower.ends_with(".jar") || lower.ends_with(".zip")) {
        return Err(input_error("only .jar and .zip files can be installed"));
    }
    let trusted = url::Url::parse(url)
        .ok()
        .filter(|parsed| parsed.scheme() == "https")
        .and_then(|parsed| parsed.host_str().map(str::to_owned))
        .is_some_and(|host| {
            host == "cdn.modrinth.com" || host.ends_with(".modrinth.com")
        });
    if !trusted {
        return Err(input_error("the file is not hosted on Modrinth"));
    }
    let dir = content_dir(id).await?;
    let response = crate::util::fetch::REQWEST_CLIENT
        .get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!(format!(
            "the download answered HTTP {}",
            response.status()
        )));
    }
    let bytes = response.bytes().await?;
    let part = dir.join(format!("{name}.part"));
    tokio::fs::write(&part, &bytes).await?;
    let _ = tokio::fs::remove_file(dir.join(format!("{name}.disabled"))).await;
    tokio::fs::rename(&part, dir.join(name)).await?;
    push_log(id, format!("Installed {name}"));
    plugins(id).await
}

async fn safe_child(id: &str, rel: &str) -> crate::Result<PathBuf> {
    let root = server_dir(id).await?;
    let rel = Path::new(rel);
    if rel
        .components()
        .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err(input_error("invalid path"));
    }
    Ok(root.join(rel))
}

pub async fn files(id: &str, rel: &str) -> crate::Result<Vec<HostedFile>> {
    let dir = safe_child(id, rel).await?;
    tokio::fs::create_dir_all(server_dir(id).await?).await?;
    let mut out = Vec::new();
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let meta = entry.metadata().await?;
        out.push(HostedFile {
            name: entry.file_name().to_string_lossy().to_string(),
            dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
        });
    }
    out.sort_by(|left, right| {
        right
            .dir
            .cmp(&left.dir)
            .then(left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(out)
}

pub async fn file_delete(id: &str, rel: &str) -> crate::Result<()> {
    if rel.trim().is_empty() {
        return Err(input_error("the server's own folder cannot be deleted"));
    }
    let target = safe_child(id, rel).await?;
    let meta = tokio::fs::metadata(&target).await?;
    if meta.is_dir() {
        tokio::fs::remove_dir_all(&target).await?;
    } else {
        tokio::fs::remove_file(&target).await?;
    }
    Ok(())
}

pub async fn file_import(
    id: &str,
    rel: &str,
    paths: Vec<PathBuf>,
) -> crate::Result<()> {
    let dir = safe_child(id, rel).await?;
    tokio::fs::create_dir_all(&dir).await?;
    for path in paths {
        if let Some(name) = path.file_name() {
            tokio::fs::copy(&path, dir.join(name)).await?;
        }
    }
    Ok(())
}
