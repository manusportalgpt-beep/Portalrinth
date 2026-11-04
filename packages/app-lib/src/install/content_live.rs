//! Live per-file detail of a running content download.
//!
//! The install job's snapshot carries counters - so many files of so many -
//! but a person watching a big pack come in wants names: which mod is coming
//! down right now, which ones are already in place, which ones failed. The
//! installer knows all of that while it works, and this is where it leaves
//! it, keyed by the job the same way the live progress is.
//!
//! Nothing here is persisted: it exists only while the job runs in this
//! process, and a finished job needs none of it. Reading is a cheap clone
//! under a short lock; writing happens from the download tasks themselves.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};

use serde::Serialize;
use uuid::Uuid;

use crate::api::pack::manifest_preview::PackManifestEntry;

/// What one running content download knows about itself right now.
#[derive(Clone, Debug, Default, Serialize)]
pub struct InstallContentLive {
    /// Every file the pack will download, in the order the pack lists them.
    /// Names, icons and the rest are filled by whoever reads them - the
    /// installer only vouches for the identity of each file.
    pub entries: Vec<PackManifestEntry>,
    /// Paths (or file names) that are fully handled.
    pub done: Vec<String>,
    /// Paths that came back with an error. They count towards the job's
    /// progress, so they are named here rather than left to look pending.
    pub failed: Vec<String>,
    /// Paths currently being downloaded.
    pub active: Vec<String>,
}

static CONTENT_LIVE: LazyLock<Mutex<HashMap<Uuid, Arc<Mutex<InstallContentLive>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn content_live() -> MutexGuard<'static, HashMap<Uuid, Arc<Mutex<InstallContentLive>>>> {
    CONTENT_LIVE.lock().unwrap_or_else(|error| error.into_inner())
}

/// Opens a live-detail slot for a job. Called once, right before the content
/// downloads start; whatever was there under the same id is replaced.
pub fn register(job_id: Uuid) -> Arc<Mutex<InstallContentLive>> {
    let mut live = content_live();
    // The map only ever holds running or very recently finished jobs, but a
    // session of many installs should not hoard every pack it ever listed.
    if live.len() > 24 {
        live.clear();
    }
    let cell = Arc::new(Mutex::new(InstallContentLive::default()));
    live.insert(job_id, cell.clone());
    cell
}

/// A consistent read of one job's live detail, if it has any.
pub fn snapshot(job_id: Uuid) -> Option<InstallContentLive> {
    let cell = content_live().get(&job_id)?.clone();
    Some(cell.lock().unwrap_or_else(|error| error.into_inner()).clone())
}

fn edit(cell: &Mutex<InstallContentLive>, edit: impl FnOnce(&mut InstallContentLive)) {
    let mut live = cell.lock().unwrap_or_else(|error| error.into_inner());
    edit(&mut live);
}

/// Hands the installer's file list to the slot.
pub fn set_entries(cell: &Mutex<InstallContentLive>, entries: Vec<PackManifestEntry>) {
    edit(cell, |live| live.entries = entries);
}

/// Marks one file fully handled: out of the in-flight set, into the done one.
pub fn mark_done(cell: &Mutex<InstallContentLive>, path: &str) {
    edit(cell, |live| {
        live.active.retain(|item| item != path);
        live.failed.retain(|item| item != path);
        if !live.done.iter().any(|item| item == path) {
            live.done.push(path.to_string());
        }
    });
}

/// Marks one file as come back with an error.
pub fn mark_failed(cell: &Mutex<InstallContentLive>, path: &str) {
    edit(cell, |live| {
        live.active.retain(|item| item != path);
        if !live.failed.iter().any(|item| item == path) {
            live.failed.push(path.to_string());
        }
    });
}

/// Puts a file into (or takes it out of) the in-flight set.
pub fn mark_active(cell: &Mutex<InstallContentLive>, path: &str, active: bool) {
    edit(cell, |live| {
        if active {
            if !live.active.iter().any(|item| item == path) {
                live.active.push(path.to_string());
            }
        } else {
            live.active.retain(|item| item != path);
        }
    });
}
