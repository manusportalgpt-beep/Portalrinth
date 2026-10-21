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
}

static RELAYS: LazyLock<DashMap<Uuid, ActiveRelay>> =
    LazyLock::new(DashMap::new);


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
    };

    if let Some(relay) = RELAYS.get(&process_uuid) {
        if relay.tunnel_up.load(Ordering::Relaxed) {
            info.state = LanRelayState::Live;
            info.local_port = Some(relay.local_port);
            info.public_host = Some(relay.public_host.clone());
            info.public_port = Some(relay.public_port);
            return info;
        }
        info.state = LanRelayState::Lost;
        info.error =
            Some("The relay stopped carrying players".to_string());
    }

    // The tunnel is down and the entry has served its purpose; drop it so the
    // world can be published again.
    if info.state == LanRelayState::Lost {
        detach_process(process_uuid);
    }

    info.players = players_in_world(state, &process.instance_path).await;
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
        return Some(port);
    }

    // Both logs are read, and neither is skipped because the other was read
    // before: the line may be in either, and which one it is in is not a
    // thing to guess at. The game's own log is only read again when it has
    // grown, because that is the one that is being written to.
    if let Some(port) = port_from_log_tail(state, &process.instance_path).await {
        if is_serving(port).await {
            crate::state::lan::note_opened_port(&process_uuid, port);
            return Some(port);
        }
    }

    None
}

/// Who is in the world right now, read out of the game's own log.
///
/// The log is the only place the game says it. It is read a little at a time,
/// from the end, and only the lines about people are looked at.
async fn players_in_world(state: &crate::State, instance_path: &str) -> Vec<String> {
    let Some(length) = log_length(state, instance_path).await else {
        return Vec::new();
    };
    let Ok(mut file) = tokio::fs::File::open(game_log(state, instance_path)).await else {
        return Vec::new();
    };
    if file
        .seek(std::io::SeekFrom::Start(length.saturating_sub(MAX_LOG_TAIL)))
        .await
        .is_err()
    {
        return Vec::new();
    }
    let mut tail = String::new();
    if file.read_to_string(&mut tail).await.is_err() {
        return Vec::new();
    }
    crate::state::lan::players_in_lines(tail.lines())
}

async fn is_serving(port: u16) -> bool {
    tokio::time::timeout(
        std::time::Duration::from_millis(1500),
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await
    .is_ok_and(|connected| connected.is_ok())
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
fn launcher_log(state: &crate::State, instance_path: &str) -> std::path::PathBuf {
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
    tail.lines()
        .rev()
        .find_map(crate::state::lan::port_in_line)
}

/// Publishes the world a running copy of an instance has open.
#[tracing::instrument]
pub async fn start(process_uuid: Uuid) -> crate::Result<LanRelayInfo> {
    let state = crate::State::get().await?;
    let process = state
        .process_manager
        .get(process_uuid)
        .ok_or_else(|| {
            crate::ErrorKind::InputError(
                "that instance is no longer running".to_string(),
            )
        })?;

    let Some(local_port) = local_port(&state, &process).await else {
        return Err(crate::ErrorKind::InputError(
            "this world is not open to the network, open it to LAN in Minecraft first"
                .to_string(),
        )
        .as_error());
    };

    // Whatever was published for this copy before is taken down first, so that
    // starting twice leaves one address behind rather than two.
    stop(process_uuid).await?;

    let identity = resolve_identity(&state, &process.account_name).await?;
    let bearer = relay_bearer(&state, &identity).await?;

    let session = relay_request(
        &state,
        reqwest::Method::POST,
        "/sessions",
        &bearer,
        Some(serde_json::json!({ "localPort": local_port })),
    )
    .await?;

    let field = |name: &str| -> crate::Result<String> {
        session[name]
            .as_str()
            .map(String::from)
            .ok_or_else(|| {
                crate::ErrorKind::OtherError(format!(
                    "the relay did not return {name}"
                ))
                .as_error()
            })
    };

    let session_id = field("sessionId")?;
    let tunnel_token = field("tunnelToken")?;
    let public_port = session["publicPort"].as_u64().ok_or_else(|| {
        crate::ErrorKind::OtherError(
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
        .unwrap_or_else(|| RELAY_BASE.trim_start_matches("https://").to_string());
    let tunnel_host = session["tunnelHost"]
        .as_str()
        .unwrap_or(public_host.as_str())
        .to_string();
    let tunnel_port = session["tunnelPort"].as_u64().unwrap_or(25570) as u16;

    let tunnel_up = Arc::new(AtomicBool::new(true));
    let task = tokio::spawn(run_tunnel(
        session_id.clone(),
        tunnel_token,
        tunnel_host,
        tunnel_port,
        local_port,
        Arc::clone(&tunnel_up),
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
    },
    /// An account that is only a name. The relay takes such an identity at its
    /// word, which is the whole of what a world opened to LAN ever needed.
    Nickname { username: String },
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
        if let Some(at) = identities
            .iter()
            .position(|identity| identity.matches(account_name))
        {
            return Ok(identities.swap_remove(at));
        }
    }

    identities
        .into_iter()
        .next()
        .ok_or_else(|| {
            crate::ErrorKind::InputError(
                "sign in to an account first".to_string(),
            )
            .as_error()
        })
}

/// Every account the launcher holds, most specific first.
async fn identities(
    state: &crate::State,
) -> crate::Result<Vec<RelayIdentity>> {
    let mut found = Vec::new();

    for credentials in
        crate::state::OfflineCredentials::get_all(&state.pool).await?
    {
		found.push(RelayIdentity::Nickname {
			username: credentials.username,
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
		});
    }

    for (username, refresh_token, uuid) in microsoft_accounts(state).await? {
        // What is stored against a Microsoft account is the token Minecraft
        // accepts, and the relay is not Minecraft.
        // An account whose token could not be refreshed is still that
        // account. Dropping it here would leave the person with an error
        // about not being signed in when they are - the one thing they are
        // not. It is kept, and the messenger is asked about it, and the
        // messenger is the one that says it is no good.
        let access_token = match crate::state::oauth_refresh(&refresh_token).await {
            Ok(refreshed) => refreshed.value.access_token,
            Err(_) => String::new(),
        };
		found.push(RelayIdentity::Online {
			provider: "msa",
			username,
			access_token,
		});
    }

    Ok(found)
}

/// The Microsoft accounts, copied out of the map they are held in.
///
/// The token is exchanged for a live one over the network, and a borrow of the
/// map cannot be held across that.
async fn microsoft_accounts(
    state: &crate::State,
) -> crate::Result<Vec<(String, String, Uuid)>> {
    let accounts = crate::state::Credentials::get_all(&state.pool).await?;
    Ok(accounts
        .iter()
        .map(|entry| {
            (
                entry.offline_profile.name.clone(),
                entry.refresh_token.clone(),
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
    let RelayIdentity::Online { provider, access_token, .. } = identity else {
        // The relay does not take a name on its own. It was asked to, and it
        // answered with a refusal, so a world opened by somebody playing
        // without an account cannot be published - and saying so is better
        // than a token it will not take.
        return Err(crate::ErrorKind::InputError(
            "a Microsoft or Ely.by account is needed to open a world to the \
             network: the relay only takes an account it knows"
                .to_string(),
        )
        .as_error());
    };

    messenger_token(state, provider, access_token).await.map_err(|error| {
        crate::ErrorKind::OtherError(format!(
            "the account could not be used to open the world to the network: {error}"
        ))
        .as_error()
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
        .map_err(|source| crate::ErrorKind::FetchError(source).as_error())?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(crate::ErrorKind::OtherError(format!(
            "the messenger would not issue a relay token: HTTP {status}"
        ))
        .as_error());
    }

    serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|error| {
            crate::ErrorKind::OtherError(format!(
                "the messenger's answer was not JSON: {error}"
            ))
            .as_error()
        })?
        .get("token")
        .and_then(|token| token.as_str())
        .map(String::from)
        .ok_or_else(|| {
            crate::ErrorKind::OtherError(
                "the messenger did not return a token".to_string(),
            )
            .as_error()
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
        crate::ErrorKind::FetchError(source).as_error()
    })?;

    let status = response.status();
    let body = response.json::<serde_json::Value>().await.unwrap_or_default();
    if !status.is_success() {
        return Err(crate::ErrorKind::OtherError(
            body["error"]
                .as_str()
                .unwrap_or("the relay refused the request")
                .to_string(),
        )
        .as_error());
    }
    Ok(body)
}

/// Holds one published world open.
///
/// The relay is told which session this is and then left to talk. Every
/// `CONNECT` it asks for is answered on a connection of its own, because the
/// control connection is the one carrying the questions.
async fn run_tunnel(
    session_id: String,
    tunnel_token: String,
    tunnel_host: String,
    tunnel_port: u16,
    local_port: u16,
    tunnel_up: Arc<AtomicBool>,
) {
    let _up = UpUntilDrop(tunnel_up);
    carry_connections(
        &session_id,
        &tunnel_token,
        &tunnel_host,
        tunnel_port,
        local_port,
    )
    .await;
}

async fn carry_connections(
    session_id: &str,
    tunnel_token: &str,
    tunnel_host: &str,
    tunnel_port: u16,
    local_port: u16,
) {
    let Ok(mut control) = TcpStream::connect((tunnel_host, tunnel_port)).await
    else {
        return;
    };
    if control
        .write_all(format!("HOST {session_id} {tunnel_token}\n").as_bytes())
        .await
        .is_err()
    {
        return;
    }

    let mut lines = BufReader::new(control);
    let mut greeting = String::new();
    if lines.read_line(&mut greeting).await.is_err()
        || !greeting
            .trim_start()
            .to_ascii_uppercase()
            .starts_with("OK HOST")
    {
        return;
    }

    let control = lines.into_inner();
    let (reader, _writer) = tokio::io::split(control);
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let parts: Vec<&str> = line.split_whitespace().collect();
        match parts.first().copied() {
            Some(directive) if directive.eq_ignore_ascii_case("CONNECT") => {
                let Some(connection_id) = parts.get(1).copied() else {
                    continue;
                };
                let connection_id = connection_id.to_string();
                let host = tunnel_host.to_string();
                let session_id = session_id.to_string();
                let token = tunnel_token.to_string();
                tokio::spawn(async move {
                    carry_one_connection(
                        &host,
                        tunnel_port,
                        &session_id,
                        &token,
                        &connection_id,
                        local_port,
                    )
                    .await;
                });
            }
            Some(directive) if directive.eq_ignore_ascii_case("CLOSE") => break,
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
async fn carry_one_connection(
    host: &str,
    port: u16,
    session_id: &str,
    token: &str,
    connection_id: &str,
    local_port: u16,
) {
    let Ok(mut remote) = TcpStream::connect((host, port)).await else {
        return;
    };
    if remote
        .write_all(
            format!("DATA {session_id} {token} {connection_id}\n").as_bytes(),
        )
        .await
        .is_err()
    {
        return;
    }

    let mut greeting = String::new();
    let mut remote = BufReader::new(remote);
    if remote.read_line(&mut greeting).await.is_err()
        || !greeting
            .trim_start()
            .to_ascii_uppercase()
            .starts_with("OK DATA")
    {
        return;
    }

    let Ok(mut local) = TcpStream::connect(("127.0.0.1", local_port)).await else {
        return;
    };
    let mut remote = remote.into_inner();
    let _ = tokio::io::copy_bidirectional(&mut remote, &mut local).await;
}