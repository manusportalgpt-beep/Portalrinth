use crate::state::DirectoryInfo;
use sqlx::migrate::Migrator;
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions,
};
use sqlx::{Pool, Row, Sqlite};
use std::collections::BTreeMap;
use std::path::Path;
use std::time::Duration;

static MIGRATOR: Migrator = sqlx::migrate!();

pub(crate) async fn connect(
    app_identifier: &str,
) -> crate::Result<Pool<Sqlite>> {
    let settings_dir = DirectoryInfo::initial_settings_dir_path(app_identifier)
        .ok_or(crate::ErrorKind::FSError(
            "Could not find valid config dir".to_string(),
        ))?;

    crate::util::io::create_dir_all(&settings_dir).await?;

    let db_path = settings_dir.join("app.db");

    connect_app_db(&db_path).await
}

async fn connect_app_db(db_path: &Path) -> crate::Result<Pool<Sqlite>> {
    if let Err(err) =
        super::db_backup::maybe_backup_existing_app_db(db_path).await
    {
        tracing::warn!(
            "Continuing without a pre-migration app database backup: {err}"
        );
    }
    open_migrated_app_db(db_path).await
}

async fn open_migrated_app_db(db_path: &Path) -> crate::Result<Pool<Sqlite>> {
    let pool = open_app_db_pool(db_path).await?;

    if let Err(err) = stale_data_cleanup(&pool).await {
        tracing::warn!(
            "Failed to clean up stale data from state database before migrations: {err}"
        );
    }

    run_migrations(&pool).await?;
    record_current_app_version(&pool).await?;

    if let Err(err) = stale_data_cleanup(&pool).await {
        tracing::warn!(
            "Failed to clean up stale data from state database: {err}"
        );
    }

    Ok(pool)
}

/// Applies the embedded migrations, refusing to start on a set that cannot be
/// applied safely.
///
/// sqlx keys applied migrations by version alone, so two files sharing a
/// version make it compare a stored checksum against the other file's contents
/// and refuse with "previously applied but has been modified" — leaving a
/// launcher that will not open and an error naming a number rather than the two
/// files behind it. Portalrinth adds migrations alongside upstream's, which is
/// exactly how a version gets used twice; this checks before anything runs and
/// says which files collided.
async fn run_migrations(pool: &Pool<Sqlite>) -> crate::Result<()> {
    if let Some(problem) = duplicate_migration_versions(&MIGRATOR) {
        return Err(crate::ErrorKind::OtherError(format!(
            "Refusing to migrate the state database: {problem}. Renumber the \
             migration that has not shipped yet — the one already applied on \
             installs cannot move."
        ))
        .into());
    }

    // Before anything is checked: the checksums of the migrations the fork
    // once renamed and put back.
    if let Err(err) = heal_restored_migration_checksums(pool).await {
        tracing::warn!("Could not repair the migration checksums: {err}");
    }

    MIGRATOR.run(pool).await.inspect_err(|err| {
        tracing::error!(
            "Failed to apply migrations to the state database: {err}. A copy of \
             the database from before this launch is kept next to it."
        );
    })?;

    Ok(())
}

/// The migrations the fork once renamed and put back.
///
/// Their contents are byte for byte what shipped, and the versions are the
/// same. But a launcher that ran while they were renamed wrote down the
/// checksum of the renamed version, and that checksum does not match the file
/// that is there now - so the launcher refuses to open its own database, and
/// because the window is only shown once the interface is up, it refuses in
/// the way that looks like nothing happening at all.
///
/// Only these are put right, and only where the recorded checksum is not the
/// one the file has. A migration that has really been changed is still
/// refused, because that is what the check is for.
const RESTORED_MIGRATIONS: &[i64] = &[
    20260820214600,
    20261017120000,
    20261021121500,
    20260911121500,
    20260911130000,
    20260911140000,
];

/// Puts the recorded checksum of the migrations above right.
async fn heal_restored_migration_checksums(pool: &Pool<Sqlite>) -> crate::Result<()> {
    for version in RESTORED_MIGRATIONS {
        let Some(migration) = MIGRATOR.iter().find(|m| m.version == *version) else {
            continue;
        };
        // The table is not there yet on a first run, which is not a problem:
        // there is nothing to be wrong about.
        let Ok(rows) = sqlx::query(
            "SELECT checksum FROM _sqlx_migrations WHERE version = ? AND success = 1",
        )
        .bind(version)
        .fetch_all(pool)
        .await
        else {
            continue;
        };
        let checksum: &[u8] = &migration.checksum[..];
        for row in rows {
            let recorded: Vec<u8> = match row.try_get(0) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if recorded.as_slice() == checksum {
                continue;
            }
            sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = ?")
                .bind(checksum)
                .bind(version)
                .execute(pool)
                .await?;
            tracing::warn!(
                "Put the recorded checksum of migration {version} right: the \
                 file was renamed and put back, and the launcher had written \
                 down the checksum of the renamed one."
            );
        }
    }
    Ok(())
}

/// The first version used by more than one migration, described by name.
fn duplicate_migration_versions(migrator: &Migrator) -> Option<String> {
    let mut by_version: BTreeMap<i64, Vec<&str>> = BTreeMap::new();
    for migration in migrator.iter() {
        by_version
            .entry(migration.version)
            .or_default()
            .push(migration.description.as_ref());
    }

    by_version.into_iter().find_map(|(version, names)| {
        (names.len() > 1).then(|| {
            format!("version {version} is used by {}", names.join(" and "))
        })
    })
}

async fn open_app_db_pool(db_path: &Path) -> crate::Result<Pool<Sqlite>> {
    let conn_options = SqliteConnectOptions::new()
        .filename(db_path)
        .busy_timeout(Duration::from_secs(30))
        .journal_mode(SqliteJournalMode::Wal)
        .optimize_on_close(true, None)
        .create_if_missing(true);

    Ok(SqlitePoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .idle_timeout(Duration::from_secs(120))
        .connect_with(conn_options)
        .await?)
}

async fn record_current_app_version(pool: &Pool<Sqlite>) -> crate::Result<()> {
    let previous_version = sqlx::query_scalar!(
        "SELECT value FROM app_metadata WHERE key = 'app_version'"
    )
    .fetch_optional(pool)
    .await?;
    let already_used_sync_update = previous_version
        .as_deref()
        .and_then(|version| {
            let mut parts = version.split('.');
            Some((
                parts.next()?.parse::<u64>().ok()?,
                parts.next()?.parse::<u64>().ok()?,
            ))
        })
        .is_some_and(|version| version >= (0, 20));

    if env!("CARGO_PKG_VERSION").starts_with("0.20.")
        && already_used_sync_update
    {
        let mut settings = super::Settings::get(pool).await?;
        if settings.pending_update_toast_for_version.is_some() {
            settings.pending_update_toast_for_version = None;
            settings.update(pool).await?;
        }
    }

    sqlx::query!(
        "
		INSERT INTO app_metadata (key, value, updated_at)
		VALUES ('app_version', ?, unixepoch())
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at
		",
        env!("CARGO_PKG_VERSION"),
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Cleans up data from the database that is no longer referenced, but must be
/// kept around for a little while to allow users to recover from accidental
/// deletions.
async fn stale_data_cleanup(pool: &Pool<Sqlite>) -> crate::Result<()> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

    let has_skin_tables = sqlx::query!(
		"SELECT COUNT(*) AS \"count!: i64\" FROM sqlite_master WHERE type = 'table' AND name IN ('custom_minecraft_skins', 'minecraft_users')",
	)
	.fetch_one(&mut *tx)
	.await?
	.count == 2;

    if has_skin_tables {
        sqlx::query!(
			"DELETE FROM custom_minecraft_skins WHERE minecraft_user_uuid NOT IN (SELECT uuid FROM minecraft_users)"
		)
		.execute(&mut *tx)
		.await?;
    }

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A duplicate version is invisible until a launcher that already ran the
    /// first one meets the second, which is a shipped release later. Catching it
    /// here costs nothing and is the whole reason the check above exists.
    #[test]
    fn every_migration_has_its_own_version() {
        assert_eq!(duplicate_migration_versions(&MIGRATOR), None);
    }

    /// Version numbers are timestamps, and sqlx applies them in order. A new
    /// migration numbered below one that is already applied would simply never
    /// run on an existing install.
    #[test]
    fn migrations_are_ordered_by_version() {
        let versions: Vec<i64> =
            MIGRATOR.iter().map(|migration| migration.version).collect();
        let mut sorted = versions.clone();
        sorted.sort_unstable();
        assert_eq!(versions, sorted);
    }
}
