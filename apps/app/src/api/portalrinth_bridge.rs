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
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;

const BRIDGE_CHAT_EVENT: &str = "bridge-chat";

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
  :root {
    color-scheme: dark;
    --bg: #0b0e14;
    --panel: rgba(22, 27, 39, .72);
    --line: rgba(255, 255, 255, .08);
    --text: #eef4ff;
    --muted: #8fa0bd;
    --brand: #00af54;
    --brand-soft: rgba(0, 175, 84, .14);
    --bubble: #1a2030;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background:
      radial-gradient(1200px 600px at 15% -10%, rgba(0, 175, 84, .10), transparent 60%),
      radial-gradient(900px 500px at 90% 110%, rgba(56, 130, 246, .08), transparent 60%),
      var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex; align-items: center; gap: .8rem;
    padding: .9rem 1.25rem;
    background: var(--panel);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--line);
  }
  .logo {
    width: 2.4rem; height: 2.4rem; border-radius: .9rem;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #00af54, #0a7a40);
    box-shadow: 0 4px 18px rgba(0, 175, 84, .35);
    font-size: 1.15rem;
  }
  h1 { font-size: 1.02rem; margin: 0; letter-spacing: .01em; }
  h1 b { background: linear-gradient(90deg, #5eeaa0, #00af54); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { font-size: .74rem; color: var(--muted); margin-top: .1rem; }
  .dot { width: .55rem; height: .55rem; border-radius: 999px; background: #57627a; margin-left: auto; transition: background .25s; }
  .dot.on { background: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft), 0 0 12px var(--brand); }
  .state { font-size: .74rem; color: var(--muted); white-space: nowrap; }

  #gate {
    flex: 1; display: grid; place-items: center; padding: 1rem;
  }
  .gate-card {
    width: min(26rem, 94vw);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.25rem;
    padding: 1.6rem;
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 50px rgba(0, 0, 0, .45);
  }
  .gate-card h2 { margin: 0 0 .4rem; font-size: 1.1rem; }
  .gate-card p { margin: 0 0 1rem; font-size: .82rem; line-height: 1.5; color: var(--muted); }
  .row { display: flex; gap: .5rem; }
  input, textarea {
    background: rgba(10, 13, 20, .8);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: .8rem;
    padding: .65rem .85rem;
    font-size: .9rem;
    font-family: inherit;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus, textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
  #key { flex: 1; min-width: 0; font-family: ui-monospace, monospace; letter-spacing: .03em; }
  button.primary {
    background: linear-gradient(135deg, #00c25e, #00914a);
    color: #04170c;
    border: none; border-radius: .8rem;
    padding: .65rem 1.1rem;
    font-size: .88rem; font-weight: 700;
    cursor: pointer;
    transition: filter .15s, transform .08s;
  }
  button.primary:hover { filter: brightness(1.08); }
  button.primary:active { transform: scale(.97); }
  button.ghost {
    background: transparent; color: var(--muted);
    border: 1px solid var(--line); border-radius: .8rem;
    padding: .65rem .9rem; font-size: .85rem; cursor: pointer;
  }
  button.ghost:hover { color: var(--text); border-color: rgba(255, 255, 255, .2); }
  button:disabled { opacity: .45; cursor: default; transform: none; }

  #chat { display: none; flex: 1; min-height: 0; flex-direction: column; }
  #log {
    flex: 1; overflow-y: auto;
    padding: 1.1rem 1.25rem;
    display: flex; flex-direction: column; gap: .7rem;
    scroll-behavior: smooth;
  }
  .msg {
    max-width: min(82%, 40rem);
    padding: .6rem .9rem;
    border-radius: 1.1rem;
    font-size: .9rem; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
    animation: rise .22s ease;
    position: relative;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .me {
    align-self: flex-end;
    background: linear-gradient(135deg, rgba(0, 175, 84, .28), rgba(0, 175, 84, .16));
    border: 1px solid rgba(0, 175, 84, .35);
    border-bottom-right-radius: .35rem;
  }
  .bot {
    align-self: flex-start;
    background: var(--bubble);
    border: 1px solid var(--line);
    border-bottom-left-radius: .35rem;
  }
  .who { display: block; font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; opacity: .55; margin-bottom: .2rem; }
  .sys {
    align-self: center;
    color: var(--muted);
    font-size: .74rem;
    background: rgba(255, 255, 255, .04);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: .25rem .8rem;
    animation: rise .22s ease;
  }
  .typing { display: inline-flex; gap: .3rem; align-items: center; padding: .2rem 0; }
  .typing i {
    width: .42rem; height: .42rem; border-radius: 999px;
    background: var(--brand);
    opacity: .4;
    animation: bounce 1.1s infinite;
  }
  .typing i:nth-child(2) { animation-delay: .18s; }
  .typing i:nth-child(3) { animation-delay: .36s; }
  @keyframes bounce { 0%, 60%, 100% { transform: none; opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }

  #inputrow {
    display: flex; gap: .55rem; align-items: flex-end;
    padding: .8rem 1.25rem 1rem;
    background: var(--panel);
    backdrop-filter: blur(14px);
    border-top: 1px solid var(--line);
  }
  #text {
    flex: 1; min-width: 0; resize: none;
    max-height: 8rem; border-radius: 1rem;
    line-height: 1.45;
  }
  @media (max-width: 480px) {
    header { padding: .8rem 1rem; }
    #log { padding: 1rem; }
    #inputrow { padding: .7rem 1rem .9rem; }
    .msg { max-width: 90%; }
  }
</style>
</head>
<body>
<header>
  <div class="logo">🌌</div>
  <div>
    <h1>Portalrinth <b>Мост</b></h1>
    <div class="sub">Порталус отвечает из лаунчера — ключ показывается в чате лаунчера</div>
  </div>
  <span class="dot" id="dot"></span>
  <span class="state" id="state">не подключено</span>
</header>

<div id="gate">
  <div class="gate-card">
    <h2>Подключение к лаунчеру</h2>
    <p>Вставьте ключ из настроек ИИ в лаунчере (кнопка «Мост» в попапе выбора модели). Всё общение идёт по локальной сети этого компьютера — без облака.</p>
    <div class="row">
      <input id="key" placeholder="Ключ подключения" spellcheck="false" autocomplete="off" />
      <button class="primary" id="connect">Подключить</button>
    </div>
  </div>
</div>

<div id="chat">
  <div id="log"><div class="sys">Мост подключён — пишите Порталусу</div></div>
  <div id="inputrow">
    <textarea id="text" rows="1" placeholder="Сообщение Порталусу…" disabled></textarea>
    <button class="primary" id="send" disabled>Отправить</button>
    <button class="ghost" id="disconnect">Выйти</button>
  </div>
</div>

<script>
  const gate = document.getElementById('gate');
  const chat = document.getElementById('chat');
  const log = document.getElementById('log');
  const dot = document.getElementById('dot');
  const state = document.getElementById('state');
  const keyInput = document.getElementById('key');
  const text = document.getElementById('text');
  const sendBtn = document.getElementById('send');
  const connectBtn = document.getElementById('connect');
  const disconnectBtn = document.getElementById('disconnect');
  let ws = null;
  let wantConnected = false;
  let retryDelay = 1500;
  let retryTimer = null;
  let typingEl = null;

  keyInput.value = localStorage.getItem('portalrinth-bridge-key') || '';

  function add(cls, t, who) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    if (who) {
      const w = document.createElement('span');
      w.className = 'who';
      w.textContent = who;
      d.appendChild(w);
    }
    d.appendChild(document.createTextNode(t));
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'msg bot';
    typingEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    log.appendChild(typingEl);
    log.scrollTop = log.scrollHeight;
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }
  function setConnected(on) {
    dot.classList.toggle('on', on);
    state.textContent = on ? 'подключено' : 'не подключено';
    text.disabled = !on;
    sendBtn.disabled = !on;
    connectBtn.textContent = on ? 'Переподключить' : 'Подключить';
    gate.style.display = on ? 'none' : 'grid';
    chat.style.display = on ? 'flex' : 'none';
    if (on) { hideTyping(); retryDelay = 1500; }
  }
  function scheduleRetry() {
    if (!wantConnected) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 1.6, 10000);
  }
  function connect() {
    const key = keyInput.value.trim();
    if (!key) { add('sys', 'Нужен ключ из чата лаунчера'); return; }
    localStorage.setItem('portalrinth-bridge-key', key);
    wantConnected = true;
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} }
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    state.textContent = 'подключаюсь…';
    ws = new WebSocket(proto + location.host + '/ws?key=' + encodeURIComponent(key));
    ws.onopen = () => { setConnected(true); add('sys', 'Мост подключён'); };
    ws.onmessage = (e) => {
      hideTyping();
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'reply' && m.text) add('bot', m.text, 'Порталус');
      } catch (err) {}
    };
    ws.onclose = () => {
      hideTyping();
      setConnected(false);
      if (wantConnected) { add('sys', 'Соединение потеряно — переподключаюсь…'); scheduleRetry(); }
    };
    ws.onerror = () => { state.textContent = 'не подключилось — проверьте ключ'; };
  }
  function sendMsg() {
    const t = text.value.trim();
    if (!t || !ws || ws.readyState !== 1) return;
    add('me', t, 'Вы');
    showTyping();
    ws.send(JSON.stringify({ type: 'chat', text: t }));
    text.value = '';
    text.style.height = 'auto';
  }
  connectBtn.onclick = connect;
  keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  sendBtn.onclick = sendMsg;
  disconnectBtn.onclick = () => {
    wantConnected = false;
    clearTimeout(retryTimer);
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} }
    setConnected(false);
    log.innerHTML = '';
    add('sys', 'Отключено. Ключ всё ещё сохранён в этом браузере.');
  };
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
  text.addEventListener('input', () => {
    text.style.height = 'auto';
    text.style.height = Math.min(text.scrollHeight, 128) + 'px';
  });
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
    ws_stream: async_tungstenite::WebSocketStream<async_tungstenite::tokio::TokioAdapter<TcpStream>>,
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
                    None => break,
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<BridgeClientMessage>(text.as_str()) {
                            Ok(message) if message.kind == "chat" && !message.text.trim().is_empty() => {
                                let _ = app.emit(BRIDGE_CHAT_EVENT, message.text.trim().to_string());
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
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
