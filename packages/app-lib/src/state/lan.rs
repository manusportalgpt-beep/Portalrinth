//! The port a world opened to the local network is listening on.
//!
//! Minecraft tells nobody when a world is opened to LAN. It says so once, in
//! its own output, and picks the port at that moment — a different one every
//! time, and one the launcher has no other way of learning. So the output is
//! read as it arrives and the port is remembered against the copy of the
//! instance that said it, which is the only thing that can be told apart when
//! the same instance is running twice.

use dashmap::DashMap;
use std::sync::LazyLock;

/// What the game prints when a world starts serving, in the languages it is
/// likely to be running in.
///
/// These end where the port begins, rather than being a word that could be
/// reused by an unrelated line, because a number taken from a line that was
/// never about serving is worse than no number at all.
const HOSTING_MARKERS: &[&str] = &[
    "local game hosted on port",
    "integrated minecraft server on",
    "serving minecraft server on port",
    "publishing lan on port",
    "opened to lan on port",
    "hosting on port",
    "listening on port",
    "локальная игра опубликована на порту",
    "локальная игра размещена на порту",
    "интегрированного сервера minecraft на порту",
    "сервер запущен на порту",
    "открыт lan на порту",
];

/// Ports below this are not something Minecraft hands out for a world, and a
/// line that mentions one is talking about something else.
const LOWEST_WORLD_PORT: u16 = 1024;

/// What the game prints when the world it was serving is closed to the network.
///
/// Without these a port would be remembered for as long as the game ran, and the
/// next world that instance opens would be reported on the last one's port.
const SERVING_STOPPED_MARKERS: &[&str] = &[
    "stopping integrated minecraft server",
    "stopping singleplayer server",
    "closing listener",
    "closing serversocket",
    "остановка интегрированного сервера",
    "остановка локального сервера",
    "сервер остановлен",
];

/// The alphanumeric runs of a line, in order and lowercased.
///
/// Splitting on everything else — brackets, colons, commas, dots — means the
/// timestamp every log line opens with cannot be read as a port, and that
/// `port:52123` and `порту 52123` are the same shape.
fn words_of(line: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    for character in line.chars() {
        if character.is_alphanumeric() {
            current.extend(character.to_lowercase());
        } else if !current.is_empty() {
            words.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

/// The port a line says a world is being served on, if it says one at all.
pub fn port_in_line(line: &str) -> Option<u16> {
    port_after_marker(&words_of(line), HOSTING_MARKERS)
}

fn port_after_marker(words: &[String], markers: &[&str]) -> Option<u16> {
    let after = after_any_marker(words, markers)?;

    // Only the word straight after the marker counts. Anything further along
    // the line may be a number about something else entirely.
    words
        .get(after)?
        .parse::<u16>()
        .ok()
        .filter(|port| *port >= LOWEST_WORLD_PORT)
}

/// Where the word after the first of these phrases starts, if one of them is in
/// the line at all.
fn after_any_marker(words: &[String], markers: &[&str]) -> Option<usize> {
    markers.iter().find_map(|marker| {
        let marker_words: Vec<&str> = marker.split(' ').collect();
        let marker_at = words.windows(marker_words.len()).position(
            |window| {
                window
                    .iter()
                    .map(String::as_str)
                    .eq(marker_words.iter().copied())
            },
        )?;
        Some(marker_at + marker_words.len())
    })
}

struct OpenPort {
    port: u16,
}

/// Which port each running copy of an instance has open.
static OPEN_PORTS: LazyLock<DashMap<String, OpenPort>> =
    LazyLock::new(DashMap::new);

/// Takes note of a copy that has just opened a world to the network.
pub fn note_opened_port(process_uuid: &str, port: u16) {
    OPEN_PORTS.insert(process_uuid.to_string(), OpenPort { port });
}

/// Reads one line of a running game's output, and remembers the port if this is
/// the line its world was opened on — or forgets it if this is the line the
/// world was closed on.
///
/// Every line of every running game comes through here, so the line is taken
/// apart once rather than once per question being asked of it.
pub fn note_log_line(process_uuid: &str, line: &str) {
    let words = words_of(line);
    if after_any_marker(&words, SERVING_STOPPED_MARKERS).is_some() {
        forget_process(process_uuid);
    } else if let Some(port) = port_after_marker(&words, HOSTING_MARKERS) {
        note_opened_port(process_uuid, port);
    }
}

/// The port a copy of an instance currently has open to the network.
pub fn port_for_process(process_uuid: &str) -> Option<u16> {
    OPEN_PORTS.get(process_uuid).map(|entry| entry.port)
}

/// Forgets a copy that has closed.
///
/// A world closed to the network takes its port with it, and the next world
/// this instance opens will be on a different one — a port remembered past the
/// game that was holding it is a port nobody is listening on.
pub fn forget_process(process_uuid: &str) {
    OPEN_PORTS.remove(process_uuid);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_port_vanilla_prints() {
        assert_eq!(
            port_in_line(
                "[12:34:56 Server thread/INFO]: Local game hosted on port 52123"
            ),
            Some(52123)
        );
        assert_eq!(
            port_in_line(
                "[12:34:56 Server thread/INFO]: \
                 Started integrated minecraft server on 39876"
            ),
            Some(39876)
        );
    }

    #[test]
    fn reads_the_port_in_russian() {
        assert_eq!(
            port_in_line(
                "[12:34:56 [Сервер]: INFO]: \
                 Локальная игра опубликована на порту 52123"
            ),
            Some(52123)
        );
    }

    #[test]
    fn reads_a_port_written_without_a_space() {
        assert_eq!(port_in_line("Local game hosted on port:52123"), Some(52123));
    }

    #[test]
    fn does_not_read_a_port_out_of_a_timestamp() {
        assert_eq!(
            port_in_line(
                "[2026-10-17 12:34:56 Server thread/INFO]: \
                 Local game hosted on port 52123"
            ),
            Some(52123)
        );
    }

    #[test]
    fn ignores_lines_that_only_mention_a_port() {
        assert_eq!(port_in_line("Connecting to 127.0.0.1:25565"), None);
        assert_eq!(
            port_in_line("[12:34:56 INFO]: Environment variable PORT set to 8080"),
            None
        );
        assert_eq!(port_in_line(""), None);
    }

    #[test]
    fn keeps_each_copy_of_an_instance_apart() {
        let first = "11111111-1111-1111-1111-111111111111";
        let second = "22222222-2222-2222-2222-222222222222";

        note_log_line(first, "Local game hosted on port 52123");
        note_log_line(second, "Local game hosted on port 52124");

        assert_eq!(port_for_process(first), Some(52123));
        assert_eq!(port_for_process(second), Some(52124));

        forget_process(second);
        assert_eq!(port_for_process(second), None);
        assert_eq!(port_for_process(first), Some(52123));
    }

    #[test]
    fn forgets_the_port_when_the_world_is_closed_again() {
        let process = "11111111-1111-1111-1111-111111111111";

        note_log_line(process, "Local game hosted on port 52123");
        note_log_line(process, "Stopping integrated minecraft server");
        assert_eq!(port_for_process(process), None);

        note_log_line(process, "Local game hosted on port 52124");
        assert_eq!(port_for_process(process), Some(52124));
    }
}