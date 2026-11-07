use super::model::{
    InstallErrorContext, InstallJobEventKind, InstallJobSnapshot,
    InstallJobState, InstallPhaseDetails, InstallPhaseId, InstallProgress,
};
use super::store;
use sqlx::SqlitePool;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use uuid::Uuid;

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(750);
const CONTENT_PROGRESS_EMIT_STEPS: u64 = 25;
/// How often a phase that is quietly running (steady progress, no events)
/// writes the job's row to the database. The row's `modified` timestamp is
/// what the stuck-job detector reads, so without this a long healthy phase
/// would look exactly like a dead worker.
const PROGRESS_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Clone, Debug)]
pub struct InstallProgressReporter {
    job_id: Uuid,
    pool: SqlitePool,
    state: Arc<Mutex<InstallProgressReporterState>>,
}

#[derive(Debug)]
struct InstallProgressReporterState {
    job: InstallJobState,
    last_emitted_at: Instant,
    last_persisted_at: Instant,
    last_emitted_progress: Option<(InstallPhaseId, u64)>,
}

impl InstallProgressReporter {
    /// The job whose progress this reports, for the places that file live
    /// detail (the per-file names of a content download) under the same id.
    pub fn job_id(&self) -> Uuid {
        self.job_id
    }

    pub fn new(job_id: Uuid, state: InstallJobState, pool: SqlitePool) -> Self {
        Self {
            job_id,
            pool,
            state: Arc::new(Mutex::new(InstallProgressReporterState {
                job: state,
                last_emitted_at: Instant::now(),
                last_persisted_at: Instant::now(),
                last_emitted_progress: None,
            })),
        }
    }

    pub async fn update(
        &self,
        phase: InstallPhaseId,
        progress: Option<InstallProgress>,
        details: InstallPhaseDetails,
    ) -> crate::Result<()> {
        self.update_with_events(phase, progress, details, Vec::new())
            .await
    }

    pub async fn set_context(
        &self,
        context: InstallErrorContext,
    ) -> crate::Result<()> {
        super::control::checkpoint(self.job_id).await?;
        self.update_context(Some(context), true).await
    }

    pub async fn set_transient_context(
        &self,
        context: InstallErrorContext,
    ) -> crate::Result<()> {
        super::control::checkpoint(self.job_id).await?;
        self.update_context(Some(context), false).await
    }

    pub async fn clear_context(&self) -> crate::Result<()> {
        self.update_context(None, true).await
    }

    async fn update_context(
        &self,
        context: Option<InstallErrorContext>,
        persist: bool,
    ) -> crate::Result<()> {
        let mut state = self.state.lock().await;
        state.job.set_context(context);

        if !persist {
            return Ok(());
        }

        let record =
            store::update_state(self.job_id, &state.job, &self.pool).await?;
        state.mark_emitted();
        emit_install_job(&record.snapshot()).await
    }

    pub async fn persist(&self) -> crate::Result<InstallJobSnapshot> {
        let mut state = self.state.lock().await;

        let record =
            store::update_state(self.job_id, &state.job, &self.pool).await?;
        state.mark_emitted();
        let snapshot = record.snapshot();
        emit_install_job(&snapshot).await?;
        Ok(snapshot)
    }

    pub async fn persist_failure_context(&self, context: InstallErrorContext) {
        if let Err(error) = self.update_context(Some(context), true).await {
            tracing::warn!(
                "Failed to persist install context for failed operation: {error}"
            );
        }
    }

    pub async fn preserve_failure_context<T>(
        &self,
        context: InstallErrorContext,
        result: crate::Result<T>,
    ) -> crate::Result<T> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                self.persist_failure_context(context).await;
                Err(error)
            }
        }
    }

    pub async fn update_with_events(
        &self,
        phase: InstallPhaseId,
        progress: Option<InstallProgress>,
        details: InstallPhaseDetails,
        events: Vec<InstallJobEventKind>,
    ) -> crate::Result<()> {
        super::control::checkpoint(self.job_id).await?;
        let mut state = self.state.lock().await;
        let phase_started = state.job.progress.phase != phase
            || matches!(
                &state.job.progress.details,
                InstallPhaseDetails::Empty
            ) && !matches!(&details, InstallPhaseDetails::Empty);

        let persist = phase_started || !events.is_empty();

        state.job.set_progress(phase, progress, details);
        for event in events {
            state.job.record_event(event);
        }

        // A quiet phase still heartbeats the stored row every so often: the
        // interface and the stuck-job detector read the row's `modified` as
        // the worker's pulse, so it must not go stale while the worker lives.
        let heartbeat_due =
            state.last_persisted_at.elapsed() >= PROGRESS_HEARTBEAT_INTERVAL;
        if !persist && !heartbeat_due {
            if !state.should_emit() {
                return Ok(());
            }
            if let Some(snapshot) =
                store::update_live_progress(self.job_id, &state.job)
            {
                state.mark_emitted();
                return emit_install_job(&snapshot).await;
            }
        }

        let record =
            store::update_state(self.job_id, &state.job, &self.pool).await?;
        state.mark_emitted();
        state.last_persisted_at = Instant::now();
        emit_install_job(&record.snapshot()).await
    }
}

impl InstallProgressReporterState {
    fn should_emit(&self) -> bool {
        let Some(progress) = &self.job.progress.progress else {
            return true;
        };

        if progress.current >= progress.total {
            return true;
        }

        let progressed_enough =
            if self.job.progress.phase == InstallPhaseId::DownloadingContent {
                self.last_emitted_progress
                    .map(|(phase, current)| {
                        phase != self.job.progress.phase
                            || progress.current.saturating_sub(current)
                                >= CONTENT_PROGRESS_EMIT_STEPS
                    })
                    .unwrap_or(true)
            } else {
                false
            };

        progressed_enough
            || self.last_emitted_at.elapsed() >= PROGRESS_EMIT_INTERVAL
    }

    fn mark_emitted(&mut self) {
        self.last_emitted_at = Instant::now();
        self.last_emitted_progress = self
            .job
            .progress
            .progress
            .as_ref()
            .map(|progress| (self.job.progress.phase, progress.current));
    }
}

#[allow(unused_variables)]
pub async fn emit_install_job(
    snapshot: &InstallJobSnapshot,
) -> crate::Result<()> {
    #[cfg(feature = "tauri")]
    {
        let result: crate::Result<()> = (|| {
            let event_state = crate::EventState::get();
            event_state.send(crate::event::AppEvent::InstallJob(
                std::sync::Arc::new(snapshot.clone()),
            ))?;
            Ok(())
        })();
        if let Err(error) = result {
            tracing::warn!(
                "Failed to emit install job {} update: {error}",
                snapshot.job_id
            );
        }
    }

    Ok(())
}
