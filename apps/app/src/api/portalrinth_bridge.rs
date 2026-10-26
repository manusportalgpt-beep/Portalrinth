//! The local bridge: a tiny WebSocket server living inside the launcher.
//!
//! The agent stays where it always was - inside the launcher - but now a
//! browser tab on the same machine can talk to it: open
//! `http://127.0.0.1:<port>/`, paste the one-time key shown in the chat, and
//! the conversation flows over a local socket. Every action still happens in
//! the launcher, nothing leaves the machine, no cloud, no fees.
//!
//! Auth is a random key checked on every WebSocket upgrade; the served page
//! never contains the key, so only someone the launcher told can connect.

use std::sync::{Arc, Mutex, OnceLock};

use async_tungstenite::tungstenite::Message;
use base64::Engine as _;
use rand::RngCore;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;

const BRIDGE_CHAT_EVENT: &str = "bridge-chat";

type WsError = async_tungstenite::tungstenite::Error;

struct BridgeState {
    port: u16,
    key: String,
    tx: broadcast::Sender<String>,
    tasks: Mutex<Vec<tokio::task::JoinHandle<()>>>,
}

impl BridgeState {
    fn info(&self) -> serde_json::Value {
        serde_json::json!({
            "port": self.port,
            "key": self.key,
            "url": format!("http://127.0.0.1:{}", self.port),
        })
    }
}

static BRIDGE: OnceLock<Mutex<Option<Arc<BridgeState>>>> = OnceLock::new();

fn bridge_slot() -> &'static Mutex<Option<Arc<BridgeState>>> {
    BRIDGE.get_or_init(|| Mutex::new(None))
}

fn existing_state() -> Option<Arc<BridgeState>> {
    let guard = bridge_slot().lock().ok()?;
    guard.as_ref().cloned()
}

/// A random connection key: enough for a localhost door that the launcher
/// opens on demand and shows only to its player.
fn generate_key() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// The page a browser opens. It asks for the key (the launcher shows it),
/// then speaks JSON over the socket: {type:"chat", text}; replies come back
/// as {type:"reply", text}.
fn bridge_page() -> &'static str {
    r#"<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Portalrinth — Мост</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #10131a; color: #ecf9ff; min-height: 100vh; display: flex; flex-direction: column; }
  header { padding: 1rem 1.25rem; display: flex; align-items: center; gap: .6rem; border-bottom: 1px solid #2c3342; }
  .dot { width: .6rem; height: .6rem; border-radius: 999px; background: #5b657a; }
  .dot.on { background: #00af54; box-shadow: 0 0 8px #00af54; }
  h1 { font-size: 1rem; margin: 0; font-weight: 700; }
  .sub { font-size: .75rem; color: #93a1bd; }
  #keyrow { display: flex; gap: .5rem; padding: .75rem 1.25rem; border-bottom: 1px solid #2c3342; }
  input { background: #1a1f2b; color: #ecf9ff; border: 1px solid #2c3342; border-radius: .75rem; padding: .55rem .8rem; font-size: .9rem; outline: none; }
  input:focus { border-color: #00af54; }
  #key { flex: 1; min-width: 0; font-family: ui-monospace, monospace; }
  button { background: #00af54; color: #06210f; border: none; border-radius: .75rem; padding: .55rem 1rem; font-size: .9rem; font-weight: 600; cursor: pointer; }
  button:hover { filter: brightness(1.1); }
  button:disabled { opacity: .5; cursor: default; }
  #log { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .6rem; }
  .msg { max-width: 82%; padding: .55rem .85rem; border-radius: 1rem; font-size: .9rem; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .me { align-self: flex-end; background: #1d3a2b; border: 1px solid #2e5c41; border-bottom-right-radius: .35rem; }
  .bot { align-self: flex-start; background: #1a1f2b; border: 1px solid #2c3342; border-bottom-left-radius: .35rem; }
  .sys { align-self: center; color: #93a1bd; font-size: .75rem; }
  #inputrow { display: flex; gap: .5rem; padding: .75rem 1.25rem; border-top: 1px solid #2c3342; }
  #text { flex: 1; }
</style>
</head>
<body>
<header>
  <span id="dot" class="dot"></span>
  <div>
    <h1>Portalrinth — Мост</h1>
    <div class="sub">Порталус отвечает из лаунчера; ключ — в чате лаунчера</div>
  </div>
</header>
<div id="keyrow">
  <input id="key" placeholder="Ключ подключения" spellcheck="false" />
  <button id="connect">Подключить</button>
</div>
<div id="log"><div class="sys">Вставьте ключ из чата лаунчера и нажмите «Подключить»</div></div>
<div id="inputrow">
  <input id="text" placeholder="Сообщение Порталусу…" disabled />
  <button id="send" disabled>Отправить</button>
</div>
<script>
  const log = document.getElementById('log');
  const dot = document.getElementById('dot');
  const keyInput = document.getElementById('key');
  const text = document.getElementById('text');
  const sendBtn = document.getElementById('send');
  const connectBtn = document.getElementById('connect');
  let ws = null;
  keyInput.value = localStorage.getItem('portalrinth-bridge-key') || '';
  function add(cls, t) { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = t; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  function connect() {
    const key = keyInput.value.trim();
    if (!key) { add('sys', 'Нужен ключ из чата лаунчера'); return; }
    localStorage.setItem('portalrinth-bridge-key', key);
    if (ws) { try { ws.close(); } catch (e) {} }
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/ws?key=' + encodeURIComponent(key));
    connectBtn.textContent = '…';
    ws.onopen = () => { dot.classList.add('on'); connectBtn.textContent = 'Отключить'; text.disabled = false; sendBtn.disabled = false; add('sys', 'Мост подключён'); };
    ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.type === 'reply' && m.text) add('bot', m.text); } catch (err) {} };
    ws.onclose = () => { dot.classList.remove('on'); connectBtn.textContent = 'Подключить'; text.disabled = true; sendBtn.disabled = true; add('sys', 'Соединение закрыто'); };
    ws.onerror = () => { add('sys', 'Не подключилось: проверьте ключ'); };
  }
  function sendMsg() {
    const t = text.value.trim();
    if (!t || !ws || ws.readyState !== 1) return;
    add('me', t);
    ws.send(JSON.stringify({ type: 'chat', text: t }));
    text.value = '';
  }
  connectBtn.onclick = connect;
  keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  sendBtn.onclick = sendMsg;
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
</script>
</body>
</html>
"#
}

fn ok_page(body: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    )
    .into_bytes()
}

fn not_found() -> Vec<u8> {
    b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: 10\r\n\r\nnot found\n"
        .to_vec()
}

/// Reads the request head without consuming it (peek), so a WebSocket
/// upgrade can still be handed to the library untouched.
async fn peek_head(stream: &mut TcpStream) -> Option<(String, usize)> {
    let mut buf = [0u8; 16384];
    for _ in 0..200 {
        let n = stream.peek(&mut buf).await.ok()?;
        if n == 0 {
            return None;
        }
        if let Some(pos) = buf[..n].windows(4).position(|w| w == b"\r\n\r\n") {
            return Some((String::from_utf8_lossy(&buf[..n]).into_owned(), pos + 4));
        }
        if n == buf.len() {
            return None;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    None
}

async fn handle_connection<R: tauri::Runtime>(
    app: AppHandle<R>,
    mut stream: TcpStream,
    key: String,
    tx: broadcast::Sender<String>,
) {
    let Some((head, head_len)) = peek_head(&mut stream).await else {
        return;
    };
    let lowered = head.to_ascii_lowercase();
    if lowered.contains("upgrade: websocket") {
        // Auth happens before the handshake: a wrong key never even gets a
        // socket, it gets an honest 403.
        let authorized = head
            .lines()
            .next()
            .map(|line| line.split(' ').nth(1).unwrap_or(""))
            .map(|path| path.split('?').nth(1).unwrap_or("").split('&').any(|pair| pair == format!("key={key}")))
            .unwrap_or(false);
        if !authorized {
            let reject = b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec();
            let mut skip = vec![0u8; head_len];
            if stream.read_exact(&mut skip).await.is_err() {
                return;
            }
            let _ = stream.write_all(&reject).await;
            let _ = stream.shutdown().await;
            return;
        }
        match async_tungstenite::tokio::accept_async(stream).await {
            Ok(ws_stream) => serve_socket(app, ws_stream, tx).await,
            Err(_) => {}
        }
        return;
    }
    // Plain HTTP: the little page (and nothing else).
    let request_line = head.lines().next().unwrap_or("");
    let path = request_line.split(' ').nth(1).unwrap_or("");
    let is_root = request_line.starts_with("GET ") && (path == "/" || path.starts_with("/?"));
    let body = if is_root { ok_page(bridge_page()) } else { not_found() };
    let mut skip = vec![0u8; head_len];
    if stream.read_exact(&mut skip).await.is_err() {
        return;
    }
    if stream.write_all(&body).await.is_ok() {
        let _ = stream.flush().await;
        let _ = stream.shutdown().await;
    }
}

/// Relays one browser connection: chat lines go to the frontend event bus,
/// replies from the agent go back to every connected tab.
async fn serve_socket<R: tauri::Runtime>(
    app: AppHandle<R>,
    ws_stream: async_tungstenite::WebSocketStream<TcpStream>,
    tx: broadcast::Sender<String>,
) {
    use futures_util::{SinkExt, StreamExt};
    use tokio::sync::broadcast::error::RecvError;

    let (mut sink, mut source) = ws_stream.split();
    let mut replies = tx.subscribe();
    loop {
        tokio::select! {
            incoming = source.next() => {
                match incoming {
                    Ok(Message::Text(text)) => {
                        match serde_json::from_str::<BridgeClientMessage>(text.as_str()) {
                            Ok(message) if message.kind == "chat" && !message.text.trim().is_empty() => {
                                let _ = app.emit(BRIDGE_CHAT_EVENT, message.text.trim().to_string());
                            }
                            _ => {}
                        }
                    }
                    Ok(Message::Close(_)) | Err(WsError::ConnectionClosed) | Err(WsError::AlreadyClosed) | None => break,
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
            outgoing = replies.recv() => {
                match outgoing {
                    Ok(text) => {
                        let payload = serde_json::json!({ "type": "reply", "text": text }).to_string();
                        if sink.send(Message::text(payload)).await.is_err() {
                            break;
                        }
                    }
                    Err(RecvError::Lagged(_)) => {}
                    Err(RecvError::Closed) => break,
                }
            }
        }
    }
}

fn spawn_into(state: &BridgeState, task: tokio::task::JoinHandle<()>) {
    if let Ok(mut tasks) = state.tasks.lock() {
        tasks.retain(|handle| !handle.is_finished());
        tasks.push(task);
    }
}

fn abort_all(state: &BridgeState) {
    if let Ok(mut tasks) = state.tasks.lock() {
        for handle in tasks.drain(..) {
            handle.abort();
        }
    }
}

/// Starts the bridge (idempotent): binds a random localhost port and serves
/// the page plus the authenticated socket.
#[tauri::command]
pub async fn bridge_start<R: tauri::Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    if let Some(state) = existing_state() {
        return Ok(state.info());
    }
    let key = generate_key();
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("порт не занять: {e}"))?;
    let port: u16 = listener
        .local_addr()
        .map_err(|e| format!("адрес не читается: {e}"))?
        .port();
    let (tx, _) = broadcast::channel::<String>(64);
    let state = Arc::new(BridgeState {
        port,
        key: key.clone(),
        tx: tx.clone(),
        tasks: Mutex::new(Vec::new()),
    });
    let accept_state = state.clone();
    let task_app = app.clone();
    let task_key = key;
    let accept_task = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let state = accept_state.clone();
                    let app = task_app.clone();
                    let key = task_key.clone();
                    let tx = state.tx.clone();
                    spawn_into(
                        &state,
                        tokio::spawn(async move {
                            handle_connection(app, stream, key, tx).await;
                        }),
                    );
                }
                Err(_) => break,
            }
        }
    });
    spawn_into(&state, accept_task);
    *bridge_slot().lock().map_err(|e| format!("состояние: {e}"))? = Some(state.clone());
    Ok(state.info())
}

/// Where the bridge currently listens, if at all.
#[tauri::command]
pub async fn bridge_info() -> Result<Option<serde_json::Value>, String> {
    Ok(existing_state().map(|state| state.info()))
}

/// Stops the bridge and disconnects every tab.
#[tauri::command]
pub async fn bridge_stop() -> Result<(), String> {
    if let Some(state) = bridge_slot().lock().map_err(|e| format!("состояние: {e}"))?.take() {
        abort_all(&state);
    }
    Ok(())
}

/// Pushes one reply from the agent to the connected browser tabs.
#[tauri::command]
pub async fn bridge_send(text: String) -> Result<(), String> {
    if let Some(state) = existing_state() {
        let _ = state.tx.send(text);
        Ok(())
    } else {
        Err("Мост не запущен".into())
    }
}

#[derive(Deserialize)]
struct BridgeClientMessage {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-bridge")
        .invoke_handler(tauri::generate_handler![
            bridge_start,
            bridge_info,
            bridge_stop,
            bridge_send,
        ])
        .build()
}
