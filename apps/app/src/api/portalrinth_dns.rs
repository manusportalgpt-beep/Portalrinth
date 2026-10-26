//! DNS diagnostics for the Resources section of the settings.
//!
//! Some networks answer slowly or not at all for the services a launcher
//! needs, and a public resolver often fixes it - but which one works is a
//! question only a live query can answer. This plugin asks a chosen DNS
//! server, straight over UDP port 53, for the address of a domain, and
//! reports what came back and how fast.
//!
//! It only ever *reads*: nothing here changes the system's DNS settings, so
//! trying a server is perfectly safe and fully reversible by closing the
//! window. The servers themselves are set by the player, in their router or
//! network settings - the section shows how.

use crate::api::Result;
use serde::Serialize;
use std::time::Duration;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-dns")
        .invoke_handler(tauri::generate_handler![dns_check])
        .build()
}

/// The answer to one lookup: whether it worked, which addresses came back,
/// and how long the round trip took.
#[derive(Serialize)]
pub struct DnsCheck {
    pub ok: bool,
    pub ips: Vec<String>,
    pub ms: u64,
    pub detail: String,
}

fn error(message: impl ToString) -> crate::api::CommandError {
    anyhow::anyhow!(message.to_string()).into()
}

/// A name the query builder accepts: plain domain labels, nothing clever.
fn valid_domain(domain: &str) -> bool {
    let domain = domain.trim().trim_end_matches('.');
    !domain.is_empty()
        && domain.len() <= 253
        && domain
            .split('.')
            .all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && label
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            })
}

/// A server address the query builder accepts: an IP, nothing else - so the
/// command can never be talked into reaching anywhere but a DNS endpoint.
fn valid_server(server: &str) -> bool {
    server.parse::<std::net::IpAddr>().is_ok()
}

/// Builds a minimal DNS query: one A question about `domain`, recursion
/// desired. Only names `valid_domain` lets through ever reach this.
fn build_query(id: u16, domain: &str) -> Vec<u8> {
    let mut buf = Vec::with_capacity(17 + domain.len());
    buf.extend_from_slice(&id.to_be_bytes());
    // Flags: recursion desired; counts: one question, nothing else.
    buf.extend_from_slice(&[0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    for label in domain.trim().trim_end_matches('.').split('.') {
        buf.push(label.len() as u8);
        buf.extend_from_slice(label.as_bytes());
    }
    buf.push(0);
    // QTYPE = A (1), QCLASS = IN (1).
    buf.extend_from_slice(&[0x00, 0x01, 0x00, 0x01]);
    buf
}

/// Walks past a (possibly compressed) name in a DNS payload.
fn skip_name(payload: &[u8], mut pos: usize) -> Option<usize> {
    loop {
        let len = *payload.get(pos)?;
        if len & 0xC0 == 0xC0 {
            return Some(pos + 2);
        }
        pos += 1;
        if len == 0 {
            return Some(pos);
        }
        pos += usize::from(len);
    }
}

/// Collects the A records out of a response; anything else is ignored.
fn parse_a_records(payload: &[u8]) -> Vec<String> {
    let mut ips = Vec::new();
    if payload.len() < 12 {
        return ips;
    }
    let questions = u16::from_be_bytes([payload[4], payload[5]]) as usize;
    let answers = u16::from_be_bytes([payload[6], payload[7]]) as usize;
    let mut pos = 12usize;
    for _ in 0..questions {
        match skip_name(payload, pos) {
            Some(next) => pos = next + 4,
            None => return ips,
        }
    }
    for _ in 0..answers {
        pos = match skip_name(payload, pos) {
            Some(next) => next,
            None => return ips,
        };
        let record = match payload.get(pos..pos + 10) {
            Some(record) => record,
            None => return ips,
        };
        let record_type = u16::from_be_bytes([record[0], record[1]]);
        let data_len = u16::from_be_bytes([record[8], record[9]]) as usize;
        let data = pos + 10;
        if record_type == 1 && data_len == 4 {
            if let Some(bytes) = payload.get(data..data + 4) {
                ips.push(format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3]));
            }
        }
        pos = data + data_len;
    }
    ips
}

/// Asks one DNS server (an IP like `9.9.9.9`) for `domain`'s address, the
/// way any resolver would: a plain UDP query on port 53, one retry, four
/// seconds of patience per try. Read-only, system untouched.
#[tauri::command]
pub async fn dns_check(server: String, domain: String) -> Result<DnsCheck> {
    let server = server.trim().to_string();
    let domain = domain.trim().to_string();
    if !valid_server(&server) {
        return Err(error("Сервер должен быть IP-адресом, например 9.9.9.9"));
    }
    if !valid_domain(&domain) {
        return Err(error("Некорректное имя домена"));
    }
    let address: std::net::SocketAddr = format!("{server}:53")
        .parse()
        .map_err(|e| error(format!("Адрес не читается: {e}")))?;
    let bind: std::net::SocketAddr = if address.is_ipv4() {
        "0.0.0.0:0".parse().unwrap()
    } else {
        "[::]:0".parse().unwrap()
    };

    let started = std::time::Instant::now();
    let socket = tokio::net::UdpSocket::bind(bind)
        .await
        .map_err(|e| error(format!("Сокет не открыть: {e}")))?;
    socket
        .connect(address)
        .await
        .map_err(|e| error(format!("К серверу не подключиться: {e}")))?;

    let id: u16 = rand::random();
    let query = build_query(id, &domain);
    let mut last_detail = String::from("ответ не пришёл");

    for _ in 0..2 {
        socket
            .send(&query)
            .await
            .map_err(|e| error(format!("Запрос не ушёл: {e}")))?;
        let mut buf = vec![0u8; 1500];
        loop {
            match tokio::time::timeout(Duration::from_secs(4), socket.recv_from(&mut buf)).await {
                Err(_) => {
                    last_detail = "сервер молчит (таймаут)".to_string();
                    break;
                }
                Ok(Err(e)) => {
                    last_detail = format!("ошибка чтения: {e}");
                    break;
                }
                Ok(Ok((len, from))) => {
                    if from != address || len < 12 {
                        continue; // a stray packet from somewhere else, or junk
                    }
                    let payload = &buf[..len];
                    let answer_id = u16::from_be_bytes([payload[0], payload[1]]);
                    if answer_id != id {
                        continue; // an old answer to an earlier question
                    }
                    let ips = parse_a_records(payload);
                    let ms = started.elapsed().as_millis() as u64;
                    if ips.is_empty() {
                        return Ok(DnsCheck {
                            ok: false,
                            ips,
                            ms,
                            detail: "сервер ответил, но адресов не дал".to_string(),
                        });
                    }
                    return Ok(DnsCheck {
                        ok: true,
                        ips,
                        ms,
                        detail: String::new(),
                    });
                }
            }
        }
    }

    Ok(DnsCheck {
        ok: false,
        ips: Vec::new(),
        ms: started.elapsed().as_millis() as u64,
        detail: last_detail,
    })
}
