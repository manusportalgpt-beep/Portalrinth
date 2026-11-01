use std::sync::mpsc;

use discord_rich_presence::{
    DiscordIpc, DiscordIpcClient,
    activity::{Activity, Assets, Timestamps},
};

use sqlx::SqlitePool;

use crate::state::ProcessManager;

enum Presence {
    Activity {
        text: String,
        in_game: bool,
        reconnect_if_fail: bool,
    },
    Clear,
}

/// Talks to Discord from a thread of its own. Every call into
/// `discord-rich-presence` is a blocking read on the IPC pipe with no timeout,
/// and a Discord that accepts the pipe but never answers the handshake holds
/// that read forever — so nothing here is ever awaited: callers queue what the
/// presence should be and move on, and a stuck pipe only stalls the presence.
pub struct DiscordGuard {
    sender: mpsc::Sender<Presence>,
}

impl DiscordGuard {
    /// Starts the Discord thread. It connects on the first activity it is
    /// given, and never just to clear one.
    pub fn init() -> crate::Result<DiscordGuard> {
        // Portalrinth's own Discord application, registered at
        // https://discord.com/developers/applications — not Modrinth's, which
        // is where the name Discord shows on the presence comes from.
        //
        // The application is also where the pictures come from: `LARGE_IMAGE`
        // and the status keys below are keys into that application's Rich
        // Presence → Art Assets, not files in this repository, and a key with
        // nothing uploaded under it draws no picture at all.
        let client = DiscordIpcClient::new("1548634472554037368");

        let (sender, receiver) = mpsc::channel();
        std::thread::Builder::new()
            .name("discord-rpc".into())
            .spawn(move || run(client, receiver))?;

        Ok(DiscordGuard { sender })
    }

    /// Set the activity to the given message, or clear it if Discord RPC is
    /// disabled in the settings
    pub async fn set_activity(
        &self,
        msg: &str,
        in_game: bool,
        reconnect_if_fail: bool,
        pool: &SqlitePool,
    ) -> crate::Result<()> {
        let settings = crate::state::Settings::get(pool).await?;
        let _ = self.sender.send(if settings.discord_rpc {
            Presence::Activity {
                text: msg.to_string(),
                in_game,
                reconnect_if_fail,
            }
        } else {
            Presence::Clear
        });
        Ok(())
    }

    /// Clear the activity, but if there is a running profile, set the activity to that instead
    pub async fn clear_to_default(
        &self,
        reconnect_if_fail: bool,
        pool: &SqlitePool,
        process_manager: &ProcessManager,
    ) -> crate::Result<()> {
        let running_instances = process_manager.get_all();
        if let Some(existing_child) = running_instances.first() {
            self.set_activity(
                &format!("Playing {}", existing_child.instance_name),
                true,
                reconnect_if_fail,
                pool,
            )
            .await
        } else {
            self.set_activity("Idling...", false, reconnect_if_fail, pool)
                .await
        }
    }
}

const LARGE_IMAGE: &str = "portalrinth_logo";

fn run(mut client: DiscordIpcClient, receiver: mpsc::Receiver<Presence>) {
    let mut connected = false;
    let mut game_started: Option<(String, i64)> = None;
    while let Ok(mut presence) = receiver.recv() {
        // Only the newest request matters once the thread has fallen behind.
        while let Ok(newer) = receiver.try_recv() {
            presence = newer;
        }

        match presence {
            Presence::Activity {
                text,
                in_game,
                reconnect_if_fail,
            } => {
                // The client can panic when used without ever having connected.
                if !connected {
                    connected = client.connect().is_ok();
                    if !connected {
                        continue;
                    }
                }

                let started = if in_game {
                    match &game_started {
                        Some((started_text, at)) if *started_text == text => {
                            Some(*at)
                        }
                        _ => {
                            let at = chrono::Utc::now().timestamp_millis();
                            game_started = Some((text.clone(), at));
                            Some(at)
                        }
                    }
                } else {
                    game_started = None;
                    None
                };
                let (small_image, small_text) = if in_game {
                    ("status_ingame", "В игре")
                } else {
                    ("status_launcher", "В лаунчере")
                };
                let mut activity = Activity::new().state(&text).assets(
                    Assets::new()
                        .large_image(LARGE_IMAGE)
                        .large_text("Portalrinth")
                        .small_image(small_image)
                        .small_text(small_text),
                );
                if let Some(at) = started {
                    activity = activity.timestamps(Timestamps::new().start(at));
                }
                if client.set_activity(activity.clone()).is_err()
                    && reconnect_if_fail
                {
                    connected = client.reconnect().is_ok()
                        && client.set_activity(activity).is_ok();
                }
            }
            Presence::Clear => {
                game_started = None;
                if connected && client.clear_activity().is_err() {
                    connected = client.reconnect().is_ok()
                        && client.clear_activity().is_ok();
                }
            }
        }
    }
}
