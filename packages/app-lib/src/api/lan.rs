//! Worlds opened to the local network, and giving them an address.
//!
//! A world opened to LAN listens on one port on this machine. That is enough to
//! play on the same Wi-Fi and useless to anybody else, so the world is also
//! handed to a relay that puts it on a port anyone can reach, and every player
//! who connects there is carried through to the world.
//!
//! The relay is a plain TCP tunnel spoken one line at a time. The launcher
//! holds the control connection, the relay asks it for a connection whenever
//! somebody wants to join, and the launcher opens a second connection, says
//! which player it is for, and copies bytes in both directions until one of
//! them closes.
//!
//! One relay per running copy of an instance, keyed by the process rather than
//! by the instance. An instance can be running twice, on two accounts, with two
//! worlds open on two ports, and a registry that could only remember one of them
//! would publish whichever happened to be started last.

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use tokio::io::{
    AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, AsyncWriteExt, BufReader,
};
use tokio::net::TcpStream;
use tokio::task::JoinHandle;
use uuid::Uuid;

/// Where worlds opened to the network are published.
const RELAY_BASE: &str = "https://uprojects.site";

/// How the relay is asked to identify itself, which is the name the service
/// that runs it expects.
///
/// Not the launcher's own: the relay serves more than one client and decides
/// what to answer from this, so sending something it does not recognise is
/// answered with a refusal rather than with a session.
const RELAY_USER_AGENT: &str = "Undefined-Client";

/// How much of a log to read when the launcher has to catch up on what a running
/// game said before it was watching. The line that matters is among the last,
/// and a Minecraft log runs to tens of megabytes over a long session.
const MAX_LOG_TAIL: u64 = 256 * 1024;

/// How a world's public address is doing.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LanRelayState {
    /// The game is running and no world of it is open to the network.
    Closed,
    /// A world is open and its port is known. Nothing is published yet.
    Ready,
    /// Published, and reachable at `public_host`:`public_port`.
    Live,
    /// It was published and is not any more — the tunnel dropped, or the world
    /// was closed to the network while it was.
    Lost,
}

/// One running copy of an instance, and the address its world is published at.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LanRelayInfo {
    /// Which copy this is. The same instance running twice has one of these
    /// each, and nothing else tells them apart.
    pub process_uuid: String,
    pub instance_id: String,
    pub instance_name: String,
    pub account_name: String,
    pub started_at: DateTime<Utc>,
    pub state: LanRelayState,
    /// The port Minecraft is serving this world on, when a world is open.
    pub local_port: Option<u16>,
    pub public_host: Option<String>,
    pub public_port: Option<u16>,
    /// Why it is not published, in words meant to be shown to somebody.
    pub error: Option<String>,
    /// Who is in the world right now, as the game has said.
    pub players: Vec<String>,
    /// The game mode of each player in `players` whose mode the log has
    /// shown being set with `/gamemode`: `survival`, `creative`,
    /// `adventure` or `spectator`.
    pub player_modes: std::collections::HashMap<String, String>,
    /// The mode of the world that is open, for players nobody has changed:
    /// one of the above, or `hardcore`.
    pub world_mode: Option<String>,
}

struct ActiveRelay {
    session_id: String,
    /// The token the session was opened with, kept so that closing it does not
    /// have to work out again which account that was.
    bearer: String,
    public_host: String,
    public_port: u16,
    local_port: u16,
    task: JoinHandle<()>,
    /// Cleared by the tunnel itself the moment it stops carrying players, which
    /// is the only way anybody finds out that an address has stopped working.
    tunnel_up: Arc<AtomicBool>,
    /// Why the tunnel stopped, set by the tunnel as it gives up.
    reason: Arc<std::sync::Mutex<Option<String>>>,
}

static RELAYS: LazyLock<DashMap<Uuid, ActiveRelay>> =
    LazyLock::new(DashMap::new);

/// Where publishing a world has got to, one step after another.
///
/// Publishing takes a few round trips, and each of them can be the one that
/// fails. The steps are said out loud so that the launcher can show them as
/// they happen, and say which one it was when one of them does not work.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LanPublishStep {
    /// Finding the port the world is open on in the game.
    World,
    /// Choosing the account and trading its token for the relay's.
    Account,
    /// Asking the relay for a public address.
    Session,
    /// Opening the tunnel the players are carried through.
    Tunnel,
    /// Published.
    Done,
}

/// How far the last attempt to publish one copy's world got.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LanPublishProgress {
    pub step: LanPublishStep,
    /// Whether `step` is the one that failed, rather than the one under way.
    pub failed: bool,
    /// Why it failed, in the words the step gave.
    pub error: Option<String>,
    /// The service the world is published through.
    pub relay_host: String,
}

static PROGRESS: LazyLock<DashMap<Uuid, LanPublishProgress>> =
    LazyLock::new(DashMap::new);

fn set_step(process_uuid: Uuid, step: LanPublishStep) {
    PROGRESS.insert(
        process_uuid,
        LanPublishProgress {
            step,
            failed: false,
            error: None,
            relay_host: RELAY_BASE.trim_start_matches("https://").to_string(),
        },
    );
}

/// How far publishing a copy's world has got, or nothing when it was never
/// tried since the launcher started.
pub fn publish_progress(process_uuid: Uuid) -> Option<LanPublishProgress> {
    PROGRESS.get(&process_uuid).map(|progress| progress.clone())
}

/// The words an error was made with, without the kind it was filed under.
fn plain_message(error: &crate::Error) -> String {
    match error.downcast_ref::<crate::ErrorKind>() {
        Some(crate::ErrorKind::InputError(message)) => message.clone(),
        _ => error.to_string(),
    }
}

/// Every copy of an instance that is running right now, and where its world can
/// be reached.
#[tracing::instrument]
pub async fn list() -> crate::Result<Vec<LanRelayInfo>> {
    let state = crate::State::get().await?;
    let mut running = Vec::new();

    for process in state.process_manager.get_all() {
        running.push(describe(&state, &process).await);
    }

    running.sort_by(|left, right| {
        left.started_at.cmp(&right.started_at).then(
            left.instance_name
                .cmp(&right.instance_name)
                .then(left.process_uuid.cmp(&right.process_uuid)),
        )
    });
    Ok(running)
}

/// A running copy, and where its world can be reached.
async fn describe(
    state: &crate::State,
    process: &crate::state::ProcessMetadata,
) -> LanRelayInfo {
    let process_uuid = process.uuid;
    let mut info = LanRelayInfo {
        process_uuid: process_uuid.to_string(),
        instance_id: process.instance_id.clone(),
        instance_name: process.instance_name.clone(),
        account_name: process.account_name.clone(),
        started_at: process.start_time,
        state: LanRelayState::Closed,
        local_port: None,
        public_host: None,
        public_port: None,
        error: None,
        players: Vec::new(),
        player_modes: std::collections::HashMap::new(),
        world_mode: None,
    };

    let published = RELAYS.get(&process_uuid).map(|relay| {
        (
            relay.tunnel_up.load(Ordering::Relaxed),
            relay.local_port,
            relay.public_host.clone(),
            relay.public_port,
            relay.reason.lock().ok().and_then(|reason| reason.clone()),
        )
    });
    if let Some((up, local_port, public_host, public_port, reason)) = published
    {
        if up && is_serving(local_port).await {
            info.state = LanRelayState::Live;
            info.local_port = Some(local_port);
            info.public_host = Some(public_host);
            info.public_port = Some(public_port);
            fill_players(state, &process.instance_path, &mut info).await;
            return info;
        }
        info.state = LanRelayState::Lost;
        info.error = Some(if up {
            // The tunnel is fine and the world behind it is gone: it was
            // closed to the network in the game.
            crate::state::lan::forget_process(&process_uuid.to_string());
            "The world was closed to the network in the game".to_string()
        } else {
            reason.unwrap_or_else(|| {
                "The relay stopped carrying players".to_string()
            })
        });
    }

    // The tunnel is down and the entry has served its purpose; drop it so the
    // world can be published again.
    if info.state == LanRelayState::Lost {
        detach_process(process_uuid);
    }

    fill_players(state, &process.instance_path, &mut info).await;
    info.local_port = local_port(state, process).await;
    if info.local_port.is_some() && info.state == LanRelayState::Closed {
        info.state = LanRelayState::Ready;
    }
    info
}

/// The port a running game is serving a world on, if one of its worlds is open
/// to the network.
///
/// What the game said as it ran is remembered, so the usual answer costs
/// nothing. Only a launcher that missed those lines — restarted while the game
/// was left open — goes back to the log, and even then the port it finds there
/// is only believed once something is listening on it.
async fn local_port(
    state: &crate::State,
    process: &crate::state::ProcessMetadata,
) -> Option<u16> {
    let process_uuid = process.uuid.to_string();

    if let Some(port) = crate::state::lan::port_for_process(&process_uuid) {
        // The game does not always say that a world was closed - leaving it
        // for the title screen can go unsaid - so a remembered port is only
        // kept for as long as something still answers on it.
        if is_serving(port).await {
            return Some(port);
        }
        crate::state::lan::forget_process(&process_uuid);
    }

    // Both logs are read, and neither is skipped because the other was read
    // before: the line may be in either, and which one it is in is not a
    // thing to guess at. The game's own log is only read again when it has
    // grown, because that is the one that is being written to.
    if let Some(port) = port_from_log_tail(state, &process.instance_path).await
    {
        if is_serving(port).await {
            crate::state::lan::note_opened_port(&process_uuid, port);
            return Some(port);
        }
    }

    None
}

/// Who is in the world right now, and in which game mode, read out of the
/// game's own log and the open world's `level.dat`.
async fn fill_players(
    state: &crate::State,
    instance_path: &str,
    info: &mut LanRelayInfo,
) {
    let Some(tail) = game_log_tail(state, instance_path).await else {
        return;
    };
    info.players = crate::state::lan::players_in_lines(tail.lines());
    let modes = crate::state::lan::player_modes_in_lines(tail.lines());
    info.player_modes = info
        .players
        .iter()
        .filter_map(|player| {
            modes
                .get(player)
                .map(|mode| (player.clone(), (*mode).to_string()))
        })
        .collect();
    if !info.players.is_empty() {
        info.world_mode = open_world_mode(state, instance_path).await;
    }
}

/// The end of the game's own log, read a little at a time from the end.
///
/// Read as bytes and decoded leniently: the place it starts from is a byte
/// count, and in a log with Russian in it that is as likely as not the middle
/// of a letter - read as text, the whole tail was thrown away for it, and
/// nobody was ever seen coming in.
async fn game_log_tail(
    state: &crate::State,
    instance_path: &str,
) -> Option<String> {
    let length = log_length(state, instance_path).await?;
    let mut file = tokio::fs::File::open(game_log(state, instance_path))
        .await
        .ok()?;
    file.seek(std::io::SeekFrom::Start(
        length.saturating_sub(MAX_LOG_TAIL),
    ))
    .await
    .ok()?;
    let mut tail = Vec::new();
    file.read_to_end(&mut tail).await.ok()?;
    Some(String::from_utf8_lossy(&tail).into_owned())
}

/// The game mode of the world open right now: the one whose `session.lock`
/// was touched last, which the game does as it opens a world.
async fn open_world_mode(
    state: &crate::State,
    instance_path: &str,
) -> Option<String> {
    let saves = state
        .directories
        .instances_dir()
        .join(instance_path)
        .join("saves");
    let mut entries = tokio::fs::read_dir(&saves).await.ok()?;
    let mut newest: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(modified) =
            tokio::fs::metadata(entry.path().join("session.lock"))
                .await
                .and_then(|meta| meta.modified())
        else {
            continue;
        };
        if newest.as_ref().is_none_or(|(at, _)| modified > *at) {
            newest = Some((modified, entry.path()));
        }
    }
    let (_, world) = newest?;
    let raw = tokio::fs::read(world.join("level.dat")).await.ok()?;
    let (root, _) = quartz_nbt::io::read_nbt(
        &mut std::io::Cursor::new(raw),
        quartz_nbt::io::Flavor::GzCompressed,
    )
    .ok()?;
    let data = root.get::<_, &quartz_nbt::NbtCompound>("Data").ok()?;
    let hardcore = data
        .get::<_, &quartz_nbt::NbtCompound>("difficulty_settings")
        .and_then(|settings| settings.get::<_, i8>("hardcore"))
        .or_else(|_| data.get::<_, i8>("hardcore"))
        .unwrap_or(0)
        != 0;
    if hardcore {
        return Some("hardcore".to_string());
    }
    Some(
        match data.get::<_, i32>("GameType").unwrap_or(0) {
            1 => "creative",
            2 => "adventure",
            3 => "spectator",
            _ => "survival",
        }
        .to_string(),
    )
}

async fn is_serving(port: u16) -> bool {
    // The game may be listening on IPv4 or on IPv6 only, depending on the
    // Java it runs on and how the system is set up, so both are asked.
    for host in ["127.0.0.1", "::1"] {
        let connected = tokio::time::timeout(
            std::time::Duration::from_millis(1500),
            TcpStream::connect((host, port)),
        )
        .await
        .is_ok_and(|connected| connected.is_ok());
        if connected {
            return true;
        }
    }
    false
}

/// How much of the game's own log there is, which is nothing at all until the
/// game has written to it.
async fn log_length(state: &crate::State, instance_path: &str) -> Option<u64> {
    tokio::fs::metadata(game_log(state, instance_path))
        .await
        .ok()
        .map(|metadata| metadata.len())
}

fn game_log(state: &crate::State, instance_path: &str) -> std::path::PathBuf {
    state
        .directories
        .instance_logs_dir(instance_path)
        .join("latest.log")
}

/// The log the launcher keeps of the game's own output.
///
/// The game writes its own log, and the launcher keeps a second copy of
/// everything the game printed. Which of them has the line saying the world
/// was opened depends on the game and the version, so both are read rather
/// than one of them being guessed at.
fn launcher_log(
    state: &crate::State,
    instance_path: &str,
) -> std::path::PathBuf {
    state
        .directories
        .instance_logs_dir(instance_path)
        .join("launcher_log.txt")
}

/// The last world a running game opened to the network, read back out of its own
/// log.
///
/// The launcher has not always seen every line a running game wrote — it was
/// restarted while the game was left open, say — and the log is where the rest
/// of those lines went.
async fn port_from_log_tail(
    state: &crate::State,
    instance_path: &str,
) -> Option<u16> {
    // The game's own log first, then the launcher's copy of what the game
    // printed. One of them has the line, and which one is not a thing to
    // guess at.
    for path in [
        game_log(state, instance_path),
        launcher_log(state, instance_path),
    ] {
        if let Some(port) = port_in_file(&path).await {
            return Some(port);
        }
    }
    None
}

/// The port said in the last of a file's lines.
async fn port_in_file(path: &std::path::Path) -> Option<u16> {
    let mut file = tokio::fs::File::open(path).await.ok()?;
    let length = tokio::fs::metadata(path).await.ok()?.len();
    file.seek(std::io::SeekFrom::Start(
        length.saturating_sub(MAX_LOG_TAIL),
    ))
    .await
    .ok()?;

    let mut tail = String::new();
    file.read_to_string(&mut tail).await.ok()?;
    tail.lines().rev().find_map(crate::state::lan::port_in_line)
}

/// Publishes the world a running copy of an instance has open.
#[tracing::instrument]
pub async fn start(process_uuid: Uuid) -> crate::Result<LanRelayInfo> {
    set_step(process_uuid, LanPublishStep::World);
    let result = publish(process_uuid).await;
    match &result {
        Ok(_) => set_step(process_uuid, LanPublishStep::Done),
        Err(error) => {
            if let Some(mut progress) = PROGRESS.get_mut(&process_uuid) {
                progress.failed = true;
                progress.error = Some(plain_message(error));
            }
        }
    }
    result
}

/// Publishing itself, telling [`PROGRESS`] about each step as it begins.
async fn publish(process_uuid: Uuid) -> crate::Result<LanRelayInfo> {
    let state = crate::State::get().await?;
    let process = state.process_manager.get(process_uuid).ok_or_else(|| {
        crate::ErrorKind::InputError(
            "that instance is no longer running".to_string(),
        )
    })?;

    let Some(local_port) = local_port(&state, &process).await else {
        return Err(crate::Error::from(crate::ErrorKind::InputError(
            "this world is not open to the network, open it to LAN in Minecraft first"
                .to_string(),
        )));
    };

    // Whatever was published for this copy before is taken down first, so that
    // starting twice leaves one address behind rather than two.
    stop(process_uuid).await?;

    set_step(process_uuid, LanPublishStep::Account);
    let identity = resolve_identity(&state, &process.account_name).await?;
    let bearer = relay_bearer(&state, &identity).await?;

    set_step(process_uuid, LanPublishStep::Session);
    let session = relay_request(
        &state,
        reqwest::Method::POST,
        "/sessions",
        &bearer,
        Some(serde_json::json!({ "localPort": local_port })),
    )
    .await?;

    let field = |name: &str| -> crate::Result<String> {
        session[name].as_str().map(String::from).ok_or_else(|| {
            anyhow::anyhow!(format!("the relay did not return {name}"))
        })
    };

    let session_id = field("sessionId")?;
    let tunnel_token = field("tunnelToken")?;
    let public_port = session["publicPort"].as_u64().ok_or_else(|| {
        anyhow::anyhow!(
            "the relay did not return a usable public port".to_string(),
        )
    })? as u16;
    // The host the tunnel is carried over is the one a player is given; the
    // relay names it `tunnelHost` and only sometimes repeats it as
    // `publicHost`, so it is taken from whichever is there.
    let public_host = session["publicHost"]
        .as_str()
        .or(session["tunnelHost"].as_str())
        .map(String::from)
        .unwrap_or_else(|| {
            RELAY_BASE.trim_start_matches("https://").to_string()
        });
    let tunnel_host = session["tunnelHost"]
        .as_str()
        .unwrap_or(public_host.as_str())
        .to_string();
    let tunnel_port = session["tunnelPort"].as_u64().unwrap_or(25570) as u16;

    // The control connection is opened here rather than in the background, so
    // that a relay which will not take the session is said to be one instead
    // of the world being reported as published when nobody can reach it.
    set_step(process_uuid, LanPublishStep::Tunnel);
    let control = match open_control(
        &session_id,
        &tunnel_token,
        &tunnel_host,
        tunnel_port,
    )
    .await
    {
        Ok(control) => control,
        Err(error) => {
            close_session(&state, &session_id, &bearer).await;
            return Err(crate::Error::from(crate::ErrorKind::InputError(
                error.to_string(),
            )));
        }
    };

    let tunnel_up = Arc::new(AtomicBool::new(true));
    let reason = Arc::new(std::sync::Mutex::new(None));
    let task = tokio::spawn(run_tunnel(
        control,
        Tunnel {
            session_id: session_id.clone(),
            token: tunnel_token,
            host: tunnel_host,
            port: tunnel_port,
            local_port,
        },
        Arc::clone(&tunnel_up),
        Arc::clone(&reason),
    ));

    RELAYS.insert(
        process_uuid,
        ActiveRelay {
            session_id,
            bearer,
            public_host: public_host.clone(),
            public_port,
            local_port,
            task,
            tunnel_up,
            reason,
        },
    );

    Ok(LanRelayInfo {
        process_uuid: process_uuid.to_string(),
        instance_id: process.instance_id.clone(),
        instance_name: process.instance_name.clone(),
        account_name: process.account_name.clone(),
        started_at: process.start_time,
        state: LanRelayState::Live,
        local_port: Some(local_port),
        public_host: Some(public_host),
        public_port: Some(public_port),
        error: None,
        // The world is being published, and the game is still the one that
        // says who is in it.
        players: Vec::new(),
        player_modes: std::collections::HashMap::new(),
        world_mode: None,
    })
}

/// Stops publishing the world of a running copy.
#[tracing::instrument]
pub async fn stop(process_uuid: Uuid) -> crate::Result<()> {
    let Some((_, tunnel)) = RELAYS.remove(&process_uuid) else {
        return Ok(());
    };
    tunnel.task.abort();

    // The tunnel is already gone. The relay is told so that it stops handing the
    // address out; one that never hears is cleaned up by itself.
    if let Ok(state) = crate::State::get().await {
        close_session(&state, &tunnel.session_id, &tunnel.bearer).await;
    }

    Ok(())
}

/// Drops a relay the moment a game closes, without waiting for anything.
///
/// Called from the process manager, which cannot wait and which has already torn
/// the world down — there is nothing left to publish either way.
pub fn detach_process(process_uuid: Uuid) {
    PROGRESS.remove(&process_uuid);

    let Some((_, tunnel)) = RELAYS.remove(&process_uuid) else {
        return;
    };
    tunnel.task.abort();

    tokio::spawn(async move {
        if let Ok(state) = crate::State::get().await {
            close_session(&state, &tunnel.session_id, &tunnel.bearer).await;
        }
    });
}

async fn close_session(state: &crate::State, session_id: &str, bearer: &str) {
    let _ = relay_request(
        state,
        reqwest::Method::DELETE,
        &format!("/sessions/{session_id}"),
        bearer,
        None,
    )
    .await;
}

/// Who the relay is publishing this world as.
enum RelayIdentity {
    /// An account the relay can ask about, holding a token it accepts.
    Online {
        provider: &'static str,
        username: String,
        access_token: String,
        uuid: Uuid,
    },
    /// An account that is only a name. The relay takes such an identity at its
    /// word, which is the whole of what a world opened to LAN ever needed.
    Nickname { username: String, uuid: Uuid },
}

impl RelayIdentity {
    fn matches(&self, username: &str) -> bool {
        match self {
            Self::Online { username: own, .. }
            | Self::Nickname { username: own, .. } => own == username,
        }
    }
}

/// Finds the account a running copy was started as.
///
/// Three account systems can be signed in at once, one copy of an instance can
/// be running as a different one than another, and the name the game was
/// started under is all that tells them apart — so that name is matched first,
/// and only a launcher that does not know what name it started under falls back
/// to whichever account there is.
async fn resolve_identity(
    state: &crate::State,
    account_name: &str,
) -> crate::Result<RelayIdentity> {
    let mut identities = identities(state).await?;

    if !account_name.is_empty() {
        if let Some(at) = identities.iter().position(|identity| {
            identity.matches(account_name)
                && matches!(identity, RelayIdentity::Online { .. })
        }) {
            return Ok(identities.swap_remove(at));
        }
    }

    // The relay only takes an account it knows. A game started under a bare
    // nickname is published through whichever real account is signed in, and
    // only when there is none is the nickname kept, to be refused with a reason.
    if let Some(at) = identities
        .iter()
        .position(|identity| matches!(identity, RelayIdentity::Online { .. }))
    {
        return Ok(identities.swap_remove(at));
    }

    identities.into_iter().next().ok_or_else(|| {
        crate::Error::from(crate::ErrorKind::InputError(
            "sign in to an account first".to_string(),
        ))
    })
}

/// Every account the launcher holds, most specific first.
async fn identities(state: &crate::State) -> crate::Result<Vec<RelayIdentity>> {
    let mut found = Vec::new();

    for credentials in
        crate::state::OfflineCredentials::get_all(&state.pool).await?
    {
        found.push(RelayIdentity::Nickname {
            username: credentials.username,
            uuid: credentials.uuid,
        });
    }

    for credentials in
        crate::state::ElyCredentials::get_all(&state.pool).await?
    {
        // Ely.by neither expires nor rotates a refresh token, so the newest
        // access token can be asked for again next time rather than written
        // back on the way past.
        let access_token = match &credentials.refresh_token {
            Some(refresh_token) => {
                crate::state::ely_oauth::refresh(refresh_token)
                    .await
                    .map_or_else(
                        |_| credentials.access_token.clone(),
                        |tokens| tokens.access_token,
                    )
            }
            None => credentials.access_token.clone(),
        };
        found.push(RelayIdentity::Online {
            provider: "ely",
            username: credentials.username,
            access_token,
            uuid: credentials.uuid,
        });
    }

    for (username, access_token, uuid) in microsoft_accounts(state).await? {
        // The messenger checks a Microsoft account the way Minecraft's own
        // services do: with the Minecraft access token, the one the game is
        // launched with. The Microsoft OAuth token behind it is refused as
        // `msa_token_invalid`. `Credentials::get_all` has already renewed the
        // Minecraft token if it was about to run out.
        found.push(RelayIdentity::Online {
            provider: "msa",
            username,
            access_token,
            uuid,
        });
    }

    Ok(found)
}

/// The Microsoft accounts, copied out of the map they are held in.
///
/// Each with the Minecraft access token, already renewed by `get_all` when it
/// was close to running out.
async fn microsoft_accounts(
    state: &crate::State,
) -> crate::Result<Vec<(String, String, Uuid)>> {
    let accounts = crate::state::Credentials::get_all(&state.pool).await?;
    Ok(accounts
        .iter()
        .map(|entry| {
            (
                entry.offline_profile.name.clone(),
                entry.access_token.clone(),
                entry.offline_profile.id,
            )
        })
        .collect())
}

/// A token the relay accepts.
async fn relay_bearer(
    state: &crate::State,
    identity: &RelayIdentity,
) -> crate::Result<String> {
    let RelayIdentity::Online {
        provider,
        access_token,
        ..
    } = identity
    else {
        // The relay does not take a name on its own. It was asked to, and it
        // answered with a refusal, so a world opened by somebody playing
        // without an account cannot be published - and saying so is better
        // than a token it will not take.
        return Err(crate::Error::from(crate::ErrorKind::InputError(
            "a Microsoft or Ely.by account is needed to open a world to the \
             network: the relay only takes an account it knows"
                .to_string(),
        )));
    };

    messenger_token(state, provider, access_token).await.map_err(|error| {
        anyhow::anyhow!(format!(
            "the account could not be used to open the world to the network: {error}"
        ))
    })
}

/// Trades an account's own token for the relay's bearer token.
///
/// This one endpoint is *not* under the relay's prefix. Everything the relay
/// itself serves lives under `/client/api/relay`, and the messenger session is
/// the launcher-facing service that hands out the tokens for it — asking for it
/// through the relay's own prefix is asking a door that does not exist, and the
/// only answer that comes back is that the request was refused.
async fn messenger_token(
    state: &crate::State,
    provider: &str,
    access_token: &str,
) -> crate::Result<String> {
    let _permit = state.api_semaphore.0.acquire().await?;

    let response = crate::util::fetch::REQWEST_CLIENT
        .post(format!("{RELAY_BASE}/client/api/messenger/session"))
        .header("User-Agent", RELAY_USER_AGENT)
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "provider": provider,
            "accessToken": access_token,
        }))
        .send()
        .await
        .map_err(|source| {
            crate::Error::from(crate::ErrorKind::FetchError(source))
        })?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        // The messenger says which check failed (`msa_token_invalid`,
        // `ely_token_invalid`, ...); without it every refusal reads the same.
        let code = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("code")
                    .or_else(|| value.get("error"))
                    .and_then(|code| code.as_str())
                    .map(String::from)
            })
            .map(|code| format!(" ({provider}: {code})"))
            .unwrap_or_default();
        return Err(anyhow::anyhow!(format!(
            "the messenger would not issue a relay token: HTTP {status}{code}"
        )));
    }

    serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|error| {
            anyhow::anyhow!(format!(
                "the messenger's answer was not JSON: {error}"
            ))
        })?
        .get("token")
        .and_then(|token| token.as_str())
        .map(String::from)
        .ok_or_else(|| {
            anyhow::anyhow!("the messenger did not return a token".to_string(),)
        })
}

async fn relay_request(
    state: &crate::State,
    method: reqwest::Method,
    path: &str,
    bearer: &str,
    body: Option<serde_json::Value>,
) -> crate::Result<serde_json::Value> {
    let _permit = state.api_semaphore.0.acquire().await?;

    let mut request = crate::util::fetch::REQWEST_CLIENT
        .request(method, format!("{RELAY_BASE}/client/api/relay{path}"))
        .header("User-Agent", RELAY_USER_AGENT)
        .header("Accept", "application/json");
    if !bearer.is_empty() {
        request = request.bearer_auth(bearer);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(|source| {
        tracing::warn!("talking to the relay failed: {source}");
        crate::Error::from(crate::ErrorKind::FetchError(source))
    })?;

    let status = response.status();
    let body = response
        .json::<serde_json::Value>()
        .await
        .unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow::anyhow!(
            body["error"]
                .as_str()
                .unwrap_or("the relay refused the request")
                .to_string(),
        ));
    }
    Ok(body)
}

/// How long a step of the tunnel's own handshake is waited for.
const HANDSHAKE_TIMEOUT: std::time::Duration =
    std::time::Duration::from_secs(10);

/// How many times a dropped control connection is opened again before the
/// world is given up as lost, and how long is waited before each attempt.
const RECONNECT_DELAYS: [u64; 5] = [1, 2, 4, 8, 15];

/// Everything needed to talk to the relay about one session.
#[derive(Clone)]
struct Tunnel {
    session_id: String,
    token: String,
    host: String,
    port: u16,
    local_port: u16,
}

/// Why opening the control connection did not work.
enum ControlError {
    /// The relay could not be reached. Worth trying again.
    Unreachable(String),
    /// The relay answered and would not take the session. It is gone.
    Refused(String),
}

impl std::fmt::Display for ControlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unreachable(error) => {
                write!(f, "the relay could not be reached: {error}")
            }
            Self::Refused(answer) => {
                write!(f, "the relay refused the tunnel: {answer}")
            }
        }
    }
}

/// Opens the control connection and says which session it is for.
///
/// The reader is handed back as it is, buffer and all: the relay may already
/// have sent the first `CONNECT` behind its greeting, and unwrapping the reader
/// here would throw that line away.
async fn open_control(
    session_id: &str,
    token: &str,
    host: &str,
    port: u16,
) -> Result<BufReader<TcpStream>, ControlError> {
    let mut control = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        TcpStream::connect((host, port)),
    )
    .await
    .map_err(|_| ControlError::Unreachable("timed out".to_string()))?
    .map_err(|error| ControlError::Unreachable(error.to_string()))?;
    let _ = control.set_nodelay(true);
    control
        .write_all(format!("HOST {session_id} {token}\n").as_bytes())
        .await
        .map_err(|error| ControlError::Unreachable(error.to_string()))?;

    let mut control = BufReader::new(control);
    let mut greeting = String::new();
    match tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        control.read_line(&mut greeting),
    )
    .await
    {
        Err(_) => Err(ControlError::Unreachable("timed out".to_string())),
        Ok(Err(error)) => Err(ControlError::Unreachable(error.to_string())),
        Ok(Ok(0)) => Err(ControlError::Unreachable(
            "the connection was closed".to_string(),
        )),
        Ok(Ok(_)) => {
            if greeting
                .trim_start()
                .to_ascii_uppercase()
                .starts_with("OK HOST")
            {
                Ok(control)
            } else {
                Err(ControlError::Refused(greeting.trim().to_string()))
            }
        }
    }
}

/// How a control connection came to an end.
enum ControlEnd {
    /// The relay said `CLOSE`: the session is over.
    Closed,
    /// The connection dropped without a word.
    Dropped,
}

/// Holds one published world open.
///
/// The relay is told which session this is and then left to talk. Every
/// `CONNECT` it asks for is answered on a connection of its own, because the
/// control connection is the one carrying the questions. A control connection
/// that drops is opened again for as long as the world is still open, because
/// the network blinking for a second is no reason to hand out a new address.
async fn run_tunnel(
    mut control: BufReader<TcpStream>,
    tunnel: Tunnel,
    tunnel_up: Arc<AtomicBool>,
    reason: Arc<std::sync::Mutex<Option<String>>>,
) {
    let _up = UpUntilDrop(tunnel_up);
    let give_up = |why: String| {
        tracing::warn!("LAN relay {} stopped: {why}", tunnel.session_id);
        if let Ok(mut reason) = reason.lock() {
            *reason = Some(why);
        }
    };

    'session: loop {
        if let ControlEnd::Closed = carry_connections(control, &tunnel).await {
            give_up("The relay closed the session".to_string());
            return;
        }

        for delay in RECONNECT_DELAYS {
            tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            if !is_serving(tunnel.local_port).await {
                give_up(
                    "The world was closed to the network in the game"
                        .to_string(),
                );
                return;
            }
            match open_control(
                &tunnel.session_id,
                &tunnel.token,
                &tunnel.host,
                tunnel.port,
            )
            .await
            {
                Ok(reopened) => {
                    control = reopened;
                    continue 'session;
                }
                Err(ControlError::Refused(answer)) => {
                    give_up(format!("The relay ended the session: {answer}"));
                    return;
                }
                Err(ControlError::Unreachable(_)) => {}
            }
        }

        give_up("The connection to the relay was lost".to_string());
        return;
    }
}

async fn carry_connections(
    control: BufReader<TcpStream>,
    tunnel: &Tunnel,
) -> ControlEnd {
    // The connection is read whole, buffer included, so nothing the relay sent
    // behind its greeting is lost, and it stays open from this side.
    let mut lines = control.lines();
    loop {
        let line = match lines.next_line().await {
            Ok(Some(line)) => line,
            Ok(None) | Err(_) => return ControlEnd::Dropped,
        };
        let parts: Vec<&str> = line.split_whitespace().collect();
        match parts.first().copied() {
            Some(directive) if directive.eq_ignore_ascii_case("CONNECT") => {
                let Some(connection_id) = parts.get(1).copied() else {
                    continue;
                };
                let connection_id = connection_id.to_string();
                let tunnel = tunnel.clone();
                tokio::spawn(async move {
                    carry_one_connection(&tunnel, &connection_id).await;
                });
            }
            Some(directive) if directive.eq_ignore_ascii_case("CLOSE") => {
                return ControlEnd::Closed;
            }
            _ => {}
        }
    }
}

/// Marks a tunnel as no longer carrying players however it ends, including the
/// cancellation that comes from stopping the game.
struct UpUntilDrop(Arc<AtomicBool>);

impl Drop for UpUntilDrop {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
    }
}

/// Carries one player's connection through to the world.
async fn carry_one_connection(tunnel: &Tunnel, connection_id: &str) {
    let Ok(Ok(mut remote)) = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        TcpStream::connect((tunnel.host.as_str(), tunnel.port)),
    )
    .await
    else {
        return;
    };
    let _ = remote.set_nodelay(true);
    if remote
        .write_all(
            format!(
                "DATA {} {} {connection_id}\n",
                tunnel.session_id, tunnel.token
            )
            .as_bytes(),
        )
        .await
        .is_err()
    {
        return;
    }

    // The player's first bytes can arrive in the same packet as the relay's
    // answer. The buffered reader is what copies on from here, so whatever it
    // already holds goes to the world instead of being dropped — losing it
    // would cut the game's handshake short and the player would never get in.
    let mut greeting = String::new();
    let mut remote = BufReader::new(remote);
    match tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        remote.read_line(&mut greeting),
    )
    .await
    {
        Ok(Ok(read)) if read > 0 => {}
        _ => return,
    }
    if !greeting
        .trim_start()
        .to_ascii_uppercase()
        .starts_with("OK DATA")
    {
        return;
    }

    let Ok(mut local) =
        TcpStream::connect(("127.0.0.1", tunnel.local_port)).await
    else {
        return;
    };
    let _ = local.set_nodelay(true);
    let _ = tokio::io::copy_bidirectional(&mut remote, &mut local).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    /// The relay is free to send its first `CONNECT` in the same packet as its
    /// greeting, and a player's first bytes in the same packet as `OK DATA`.
    /// Neither may be lost on the way to the world.
    #[tokio::test]
    async fn carries_what_arrives_behind_the_greetings() {
        let world = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let local_port = world.local_addr().unwrap().port();
        let relay = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let relay_port = relay.local_addr().unwrap().port();

        tokio::spawn(async move {
            let (mut control, _) = relay.accept().await.unwrap();
            let mut line = String::new();
            let mut reader = BufReader::new(&mut control);
            reader.read_line(&mut line).await.unwrap();
            assert_eq!(line, "HOST s1 t1\n");
            control.write_all(b"OK HOST\nCONNECT c1\n").await.unwrap();

            let (mut data, _) = relay.accept().await.unwrap();
            let mut line = String::new();
            BufReader::new(&mut data)
                .read_line(&mut line)
                .await
                .unwrap();
            assert_eq!(line, "DATA s1 t1 c1\n");
            data.write_all(b"OK DATA\nhello").await.unwrap();
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            drop(control);
        });

        let control = open_control("s1", "t1", "127.0.0.1", relay_port)
            .await
            .unwrap_or_else(|error| panic!("{error}"));
        let tunnel = Tunnel {
            session_id: "s1".to_string(),
            token: "t1".to_string(),
            host: "127.0.0.1".to_string(),
            port: relay_port,
            local_port,
        };
        tokio::spawn(async move {
            carry_connections(control, &tunnel).await;
        });

        let (mut player, _) =
            tokio::time::timeout(HANDSHAKE_TIMEOUT, world.accept())
                .await
                .unwrap()
                .unwrap();
        let mut received = [0u8; 5];
        tokio::time::timeout(
            HANDSHAKE_TIMEOUT,
            player.read_exact(&mut received),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(&received, b"hello");
    }
}
