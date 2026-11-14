//! Keeps the last good copy of every config file in an instance and puts it
//! back when the file turns up empty.
//!
//! Most mods write their configs by truncating the file and writing it again.
//! A game that goes down in between, killed, crashed or out of power, leaves
//! the file empty or zeroed, and the mod then refuses to start on it. A copy
//! is taken before every run and checked after it, so a config that was fine
//! before the run is never lost to one.

use std::path::{Path, PathBuf};

use crate::State;

const EXTENSIONS: &[&str] = &[
    "toml",
    "json",
    "json5",
    "jsonc",
    "cfg",
    "conf",
    "properties",
    "snbt",
    "yml",
    "yaml",
];

const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_FILES: usize = 8000;

fn guard_dir(state: &State, instance_path: &str) -> PathBuf {
    state
        .directories
        .caches_dir()
        .join("portalrinth-config-guard")
        .join(instance_path)
}

fn config_roots(instance_dir: &Path) -> Vec<PathBuf> {
    let mut roots = vec![
        instance_dir.join("config"),
        instance_dir.join("defaultconfigs"),
    ];
    if let Ok(worlds) = std::fs::read_dir(instance_dir.join("saves")) {
        for world in worlds.flatten() {
            roots.push(world.path().join("serverconfig"));
        }
    }
    roots
}

fn is_config(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
}

fn is_blank(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .all(|byte| *byte == 0 || byte.is_ascii_whitespace())
}

fn config_files(instance_dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut pending = config_roots(instance_dir);
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_dir() {
                pending.push(path);
            } else if file_type.is_file() && is_config(&path) {
                files.push(path);
                if files.len() >= MAX_FILES {
                    return files;
                }
            }
        }
    }
    files
}

fn replace(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = target.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
    std::fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    std::io::Write::write_all(&mut temporary, bytes)?;
    temporary.as_file().sync_all()?;
    temporary.persist(target).map_err(|error| error.error)?;
    Ok(())
}

/// Brings back every config that is empty now and was not at the last check,
/// and keeps a copy of every one that has something in it.
///
/// Returns the files that were brought back, relative to the instance.
fn protect_blocking(instance_dir: &Path, guard: &Path) -> Vec<String> {
    let mut restored = Vec::new();
    for path in config_files(instance_dir) {
        let Ok(relative) = path.strip_prefix(instance_dir) else {
            continue;
        };
        let Ok(metadata) = std::fs::metadata(&path) else {
            continue;
        };
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let copy = guard.join(relative);

        if is_blank(&bytes) {
            let Ok(good) = std::fs::read(&copy) else {
                continue;
            };
            if is_blank(&good) {
                continue;
            }
            match replace(&path, &good) {
                Ok(()) => {
                    let relative = relative.to_string_lossy();
                    restored.push(relative.replace('\\', "/"));
                }
                Err(error) => tracing::warn!(
                    "Could not restore {}: {error}",
                    path.display()
                ),
            }
            continue;
        }

        if std::fs::read(&copy).is_ok_and(|good| good == bytes) {
            continue;
        }
        if let Err(error) = replace(&copy, &bytes) {
            tracing::warn!(
                "Could not keep a copy of {}: {error}",
                copy.display()
            );
        }
    }
    restored
}

/// Checks the configs of an instance, see the module docs.
///
/// Never fails: a guard that cannot do its job must not stop a launch.
pub async fn protect(instance_path: &str) -> Vec<String> {
    let Ok(state) = State::get().await else {
        return Vec::new();
    };
    let instance_dir = state.directories.instances_dir().join(instance_path);
    let guard = guard_dir(&state, instance_path);
    let restored = tokio::task::spawn_blocking(move || {
        protect_blocking(&instance_dir, &guard)
    })
    .await
    .unwrap_or_default();
    for file in &restored {
        tracing::warn!(
            "Restored {file} of {instance_path}: it was left empty, \
             the last good copy was put back"
        );
    }
    restored
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_config_comes_back_and_good_ones_are_kept() {
        let instance = tempfile::tempdir().unwrap();
        let guard = tempfile::tempdir().unwrap();
        let config = instance.path().join("config");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::write(config.join("a.toml"), "a = 1\n").unwrap();
        std::fs::write(config.join("notes.bin"), "").unwrap();

        assert!(protect_blocking(instance.path(), guard.path()).is_empty());

        std::fs::write(config.join("a.toml"), [0u8; 16]).unwrap();
        let restored = protect_blocking(instance.path(), guard.path());
        assert_eq!(restored, vec!["config/a.toml".to_string()]);
        assert_eq!(
            std::fs::read_to_string(config.join("a.toml")).unwrap(),
            "a = 1\n"
        );

        std::fs::write(config.join("a.toml"), "a = 2\n").unwrap();
        protect_blocking(instance.path(), guard.path());
        std::fs::write(config.join("a.toml"), "").unwrap();
        protect_blocking(instance.path(), guard.path());
        assert_eq!(
            std::fs::read_to_string(config.join("a.toml")).unwrap(),
            "a = 2\n"
        );
    }

    #[test]
    fn blank_file_without_a_copy_is_left_alone() {
        let instance = tempfile::tempdir().unwrap();
        let guard = tempfile::tempdir().unwrap();
        let config = instance.path().join("config");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::write(config.join("b.json"), "").unwrap();

        assert!(protect_blocking(instance.path(), guard.path()).is_empty());
        assert!(std::fs::read(config.join("b.json")).unwrap().is_empty());
    }
}
