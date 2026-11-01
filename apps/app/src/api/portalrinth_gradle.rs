//! Gradle for the assistant's mod projects, downloaded on demand.
//!
//! Nothing ships with the installer: the first `gradle_build` fetches the
//! official Gradle distribution (checked against its SHA-256) into the app
//! data folder, next to its own Gradle home. JDK toolchains the build asks
//! for are fetched by Gradle itself through the foojay resolver, so the
//! launcher's Java settings stay untouched. The player can see the size and
//! wipe everything from the AI settings.

use crate::api::Result;
use crate::api::portalrinth_archive::{allowed_roots, ensure_allowed, error, find_javac};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_http::reqwest;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const GRADLE_VERSION: &str = "9.8.2";
const GRADLE_SHA256: &str =
    "21bd5da2de49b642904077f38c0efdc7778e92b3ed0889392dca61b97e389607";
const BUILD_TIMEOUT: Duration = Duration::from_secs(20 * 60);

const INIT_SCRIPT: &str = r#"initscript {
	repositories {
		gradlePluginPortal()
	}
	dependencies {
		classpath 'org.gradle.toolchains:foojay-resolver:1.0.0'
	}
}

settingsEvaluated { settings ->
	if (!settings.pluginManager.hasPlugin('org.gradle.toolchains.foojay-resolver-convention') &&
		!settings.pluginManager.hasPlugin('org.gradle.toolchains.foojay-resolver')) {
		settings.pluginManager.apply(org.gradle.toolchains.foojay.FoojayToolchainsConventionPlugin)
	}
}
"#;

static INSTALL_LOCK: Mutex<()> = Mutex::const_new(());

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-gradle")
        .invoke_handler(tauri::generate_handler![
            gradle_status,
            gradle_build,
            gradle_remove,
        ])
        .build()
}

fn gradle_root<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("gradle"))
        .map_err(|e| error(format!("нет папки данных: {e}")))
}

fn gradle_launcher(root: &Path) -> PathBuf {
    let name = if cfg!(windows) { "gradle.bat" } else { "gradle" };
    root.join("dist")
        .join(format!("gradle-{GRADLE_VERSION}"))
        .join("bin")
        .join(name)
}

async fn folder_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&dir).await else {
            continue;
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            match entry.metadata().await {
                Ok(meta) if meta.is_dir() => stack.push(entry.path()),
                Ok(meta) => total += meta.len(),
                Err(_) => {}
            }
        }
    }
    total
}

#[derive(Serialize)]
pub struct GradleStatus {
    installed: bool,
    version: String,
    bytes: u64,
}

/// `gradle_status`: whether Gradle is downloaded and how much space the
/// distribution, its caches and the fetched toolchains take.
#[tauri::command]
pub async fn gradle_status<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<GradleStatus> {
    let root = gradle_root(&app)?;
    Ok(GradleStatus {
        installed: gradle_launcher(&root).is_file(),
        version: GRADLE_VERSION.to_string(),
        bytes: folder_size(&root).await,
    })
}

/// `gradle_remove`: deletes the distribution, the Gradle home and every
/// toolchain it fetched. The next build downloads Gradle again.
#[tauri::command]
pub async fn gradle_remove<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<()> {
    let _guard = INSTALL_LOCK.lock().await;
    let root = gradle_root(&app)?;
    if root.exists() {
        tokio::fs::remove_dir_all(&root)
            .await
            .map_err(|e| error(format!("не удалось удалить Gradle: {e}")))?;
    }
    Ok(())
}

async fn ensure_gradle(root: &Path) -> Result<PathBuf> {
    let _guard = INSTALL_LOCK.lock().await;
    let launcher = gradle_launcher(root);
    if launcher.is_file() {
        return Ok(launcher);
    }
    let dist = root.join("dist");
    tokio::fs::create_dir_all(&dist)
        .await
        .map_err(|e| error(format!("не удалось создать папку Gradle: {e}")))?;
    let archive = dist.join(format!("gradle-{GRADLE_VERSION}-bin.zip.part"));
    let url = format!("https://services.gradle.org/distributions/gradle-{GRADLE_VERSION}-bin.zip");
    let mut response = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|e| error(format!("Gradle не скачался: {e}")))?;
    let mut file = tokio::fs::File::create(&archive)
        .await
        .map_err(|e| error(format!("не удалось записать архив Gradle: {e}")))?;
    let mut hasher = Sha256::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| error(format!("загрузка Gradle прервалась: {e}")))?
    {
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| error(format!("не удалось записать архив Gradle: {e}")))?;
    }
    file.flush().await.ok();
    drop(file);
    let digest: String = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    if digest != GRADLE_SHA256 {
        let _ = tokio::fs::remove_file(&archive).await;
        return Err(error("архив Gradle повреждён: контрольная сумма не совпала"));
    }

    let reader = async_zip::tokio::read::fs::ZipFileReader::new(&archive)
        .await
        .map_err(|e| error(format!("архив Gradle не читается: {e}")))?;
    let count = reader.file().entries().len();
    for index in 0..count {
        let name = reader.file().entries()[index]
            .filename()
            .as_str()
            .map(|name| name.replace('\\', "/"))
            .map_err(|e| error(format!("имя файла в архиве Gradle не читается: {e}")))?;
        if name.is_empty() || name.starts_with('/') || name.contains("..") {
            continue;
        }
        let target = dist.join(&name);
        if name.ends_with('/') {
            tokio::fs::create_dir_all(&target).await.ok();
            continue;
        }
        let mut bytes = Vec::new();
        {
            let mut entry = reader
                .reader_with_entry(index)
                .await
                .map_err(|e| error(format!("не удалось открыть {name}: {e}")))?;
            entry
                .read_to_end_checked(&mut bytes)
                .await
                .map_err(|e| error(format!("не удалось прочитать {name}: {e}")))?;
        }
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        tokio::fs::write(&target, &bytes)
            .await
            .map_err(|e| error(format!("не удалось записать {name}: {e}")))?;
    }
    let _ = tokio::fs::remove_file(&archive).await;
    make_executable(&launcher).await;
    if !launcher.is_file() {
        return Err(error("в архиве Gradle нет bin/gradle"));
    }
    Ok(launcher)
}

#[cfg(unix)]
async fn make_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).await;
}

#[cfg(not(unix))]
async fn make_executable(_path: &Path) {}

/// The JVM Gradle itself runs on: the one the interface picked from the
/// launcher's installed runtimes, else JAVA_HOME, else the javac on PATH.
fn java_home_for(java_path: Option<&str>) -> Option<PathBuf> {
    if let Some(java) = java_path.filter(|path| !path.trim().is_empty()) {
        let java = PathBuf::from(java);
        let named_java = java
            .file_stem()
            .map(|stem| {
                let stem = stem.to_string_lossy().to_lowercase();
                stem == "java" || stem == "javaw"
            })
            .unwrap_or(false);
        if java.is_file() && named_java {
            return java.parent().and_then(Path::parent).map(Path::to_path_buf);
        }
    }
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let home = PathBuf::from(home);
        if home.join("bin").is_dir() {
            return Some(home);
        }
    }
    find_javac().and_then(|javac| javac.parent().and_then(Path::parent).map(Path::to_path_buf))
}

async fn collect_jars(dir: &Path) -> Vec<PathBuf> {
    let mut jars = Vec::new();
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return jars;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case("jar"))
            .unwrap_or(false)
        {
            jars.push(path);
        }
    }
    jars.sort();
    jars
}

fn tail(text: &str, count: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|line| !line.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(count);
    lines[start..].join("\n")
}

/// `gradle_build`: runs Gradle tasks (default `build`) in a project inside
/// the sandbox. A project with a complete wrapper uses its own `gradlew`;
/// any other gets the launcher's Gradle. Returns the jars from build/libs.
#[tauri::command]
pub async fn gradle_build<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    project_dir: String,
    tasks: Option<String>,
    java_path: Option<String>,
) -> Result<String> {
    let roots = allowed_roots(&app);
    let project = PathBuf::from(&project_dir);
    ensure_allowed(&roots, &project)?;
    let has_script = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]
        .iter()
        .any(|name| project.join(name).is_file());
    if !project.is_dir() || !has_script {
        return Err(error(format!(
            "в {} нет build.gradle / settings.gradle",
            project.display()
        )));
    }
    let tasks: Vec<String> = tasks
        .as_deref()
        .unwrap_or("build")
        .split_whitespace()
        .filter(|task| {
            task.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '-' | '_' | '.'))
        })
        .map(str::to_string)
        .collect();
    let tasks = if tasks.is_empty() {
        vec!["build".to_string()]
    } else {
        tasks
    };

    let java_home = java_home_for(java_path.as_deref()).ok_or_else(|| {
        error("нет Java для запуска Gradle: установи Java 17+ в настройках лаунчера (Java для сборок)")
    })?;

    let root = gradle_root(&app)?;
    let wrapper_name = if cfg!(windows) { "gradlew.bat" } else { "gradlew" };
    let wrapper = project.join(wrapper_name);
    let use_wrapper = wrapper.is_file()
        && project
            .join("gradle")
            .join("wrapper")
            .join("gradle-wrapper.jar")
            .is_file();
    let launcher = if use_wrapper {
        make_executable(&wrapper).await;
        wrapper
    } else {
        ensure_gradle(&root).await?
    };
    let home = root.join("home");
    tokio::fs::create_dir_all(&home).await.ok();
    let init_script = root.join("portalrinth-init.gradle");
    tokio::fs::write(&init_script, INIT_SCRIPT)
        .await
        .map_err(|e| error(format!("не удалось записать init-скрипт: {e}")))?;

    let mut command = tokio::process::Command::new(&launcher);
    command
        .current_dir(&project)
        .env("JAVA_HOME", &java_home)
        .env("GRADLE_USER_HOME", &home)
        .arg("--no-daemon")
        .arg("--console=plain")
        .arg("-I")
        .arg(&init_script)
        .args(&tasks)
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        command.creation_flags(0x0800_0000);
    }
    let output = tokio::time::timeout(BUILD_TIMEOUT, command.output())
        .await
        .map_err(|_| error("Gradle работал дольше 20 минут и был остановлен"))?
        .map_err(|e| error(format!("Gradle не запустился: {e}")))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        let errors: Vec<&str> = stdout
            .lines()
            .chain(stderr.lines())
            .filter(|line| line.contains("error:") || line.starts_with("e: "))
            .take(25)
            .collect();
        return Err(error(format!(
            "сборка Gradle упала:\n{}{}",
            if errors.is_empty() {
                String::new()
            } else {
                format!("{}\n...\n", errors.join("\n"))
            },
            tail(&stderr, 25)
        )));
    }
    let jars = collect_jars(&project.join("build").join("libs")).await;
    let listed = jars
        .iter()
        .map(|jar| jar.display().to_string())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(format!(
        "Gradle {}: {} ({})\n{}\nГотовый мод — jar без -sources/-dev, ставь его через install_to_instance.",
        if use_wrapper { "wrapper" } else { GRADLE_VERSION },
        tasks.join(" "),
        tail(&stdout, 3),
        if jars.is_empty() {
            "в build/libs нет jar".to_string()
        } else {
            format!("jar в build/libs:\n{listed}")
        },
    ))
}
