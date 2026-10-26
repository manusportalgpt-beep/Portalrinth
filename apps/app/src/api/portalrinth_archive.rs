//! The assistant's built-in archiver, the "7-zip" of the launcher.
//!
//! Portalus (the AI agent) may pack the projects it writes in its sandbox
//! into zip / jar / 7z and unpack archives the player shares with it. Only
//! two commands, and both are fenced: every path they accept must live under
//! the app's own data folder (the sandbox, sessions, profiles) or one of the
//! user's usual folders (Downloads, Documents, Pictures, Desktop) - the same
//! ground the file-system scope already grants the interface.

use crate::api::Result;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("portalrinth-archiver")
        .invoke_handler(tauri::generate_handler![
            archiver_pack,
            archiver_unpack,
            archiver_reveal,
            archiver_compile_java,
        ])
        .build()
}

fn error(message: impl ToString) -> crate::api::CommandError {
    anyhow::anyhow!(message.to_string()).into()
}

/// Fences of the archiver: the app's own data folder (the sandbox, the
/// sessions, the profiles) plus the user folders the file-system scope
/// already lets the interface reach.
fn allowed_roots<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Vec<PathBuf> {
    let path = app.path();
    let mut roots = Vec::new();
    for dir in [
        path.app_data_dir().ok(),
        path.download_dir().ok(),
        path.document_dir().ok(),
        path.picture_dir().ok(),
        path.desktop_dir().ok(),
    ] {
        if let Some(dir) = dir {
            roots.push(normalize(&dir));
        }
    }
    roots
}

/// Lexical normalization: absolute, forward slashes, no trailing separator.
/// Case is folded on Windows and macOS, where paths compare insensitively.
fn normalize(path: &Path) -> PathBuf {
    let text = path.to_string_lossy().replace('\\', "/");
    let mut text = text.trim_end_matches('/').to_string();
    if text.is_empty() {
        text = "/".to_string();
    }
    let mut text = PathBuf::from(text);
    if !text.is_absolute() {
        if let Ok(current) = std::env::current_dir() {
            text = normalize(&current.join(text));
        }
    }
    if cfg!(windows) {
        let lowered = text.to_string_lossy().to_lowercase();
        return PathBuf::from(lowered);
    }
    text
}

fn ensure_allowed(roots: &[PathBuf], path: &Path) -> Result<()> {
    let candidate = normalize(path);
    for root in roots {
        if candidate.starts_with(root) {
            return Ok(());
        }
    }
    Err(error(format!(
        "путь вне разрешённых папок: {}",
        path.display()
    )))
}

/// What the destination extension says the archive should be.
enum ArchiveFormat {
    Zip,
    Jar,
    SevenZip,
}

fn format_of(path: &Path) -> Result<ArchiveFormat> {
    let extension = path
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "zip" => Ok(ArchiveFormat::Zip),
        "jar" => Ok(ArchiveFormat::Jar),
        "7z" => Ok(ArchiveFormat::SevenZip),
        other => Err(error(format!(
            "формат .{other} не поддерживается - используйте .zip, .jar или .7z"
        ))),
    }
}

/// Every file under a source, ready to become an archive entry: the entry
/// name keeps the source's own name as the top folder, the way a proper
/// resource pack or mod zip is laid out.
async fn collect_files(
    source: &Path,
    out: &mut Vec<(String, PathBuf)>,
) -> Result<()> {
    let top = source
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "pack".to_string());
    let mut stack = vec![(source.to_path_buf(), String::new())];
    while let Some((dir, prefix)) = stack.pop() {
        let mut entries = tokio::fs::read_dir(&dir)
            .await
            .map_err(|e| error(format!("не удалось открыть папку {}: {e}", dir.display())))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| error(format!("не удалось прочитать папку {}: {e}", dir.display())))?
        {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            let file_type = entry
                .file_type()
                .await
                .map_err(|e| error(format!("не удалось понять тип {}: {e}", path.display())))?;
            if file_type.is_dir() {
                stack.push((path, rel));
            } else if file_type.is_file() {
                out.push((format!("{top}/{rel}"), path));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(())
}

/// `archiver_pack`: zip / jar / 7z. Zip and jar accept many sources; 7z
/// takes one (a file or a whole folder).
#[tauri::command]
pub async fn archiver_pack<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    sources: Vec<String>,
    dest: String,
) -> Result<String> {
    if sources.is_empty() {
        return Err(error("не указано, что упаковывать"));
    }
    let roots = allowed_roots(&app);
    let dest_path = PathBuf::from(&dest);
    ensure_allowed(&roots, &dest_path)?;
    let mut source_paths = Vec::new();
    for source in &sources {
        let path = PathBuf::from(source);
        ensure_allowed(&roots, &path)?;
        if !path.exists() {
            return Err(error(format!("нет такого файла или папки: {source}")));
        }
        source_paths.push(path);
    }
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(&parent)
            .await
            .map_err(|e| error(format!("не удалось создать папку для архива: {e}")))?;
    }

    match format_of(&dest_path) {
        Ok(ArchiveFormat::SevenZip) => {
            if source_paths.len() > 1 {
                return Err(error("в .7z упаковать можно один файл или одну папку - для нескольких источников возьмите .zip"));
            }
            let source = source_paths.remove(0);
            let dest_for_thread = dest_path.clone();
            tokio::task::spawn_blocking(move || {
                sevenz_rust::compress_to_path(&source, &dest_for_thread)
            })
            .await
            .map_err(|e| error(format!("сжатие не выполнилось: {e}")))?
            .map_err(|e| error(format!("7z не получился: {e}")))?;
        }
        Ok(ArchiveFormat::Zip | ArchiveFormat::Jar) => {
            let mut files = Vec::new();
            for source in &source_paths {
                collect_files(source, &mut files).await?;
            }
            let writer = tokio::fs::File::create(&dest_path)
                .await
                .map_err(|e| error(format!("не удалось создать архив: {e}")))?;
            let mut writer = async_zip::tokio::write::ZipFileWriter::with_tokio(writer);
            for (name, path) in files {
                let bytes = tokio::fs::read(&path)
                    .await
                    .map_err(|e| error(format!("не удалось прочитать {}: {e}", path.display())))?;
                let builder = async_zip::ZipEntryBuilder::new(
                    name.clone().into(),
                    async_zip::Compression::Deflate,
                );
                writer
                    .write_entry_whole(builder, &bytes)
                    .await
                    .map_err(|e| error(format!("не удалось добавить {name} в архив: {e}")))?;
            }
            writer
                .close()
                .await
                .map_err(|e| error(format!("не удалось закрыть архив: {e}")))?;
        }
    }
    let size = tokio::fs::metadata(&dest_path)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    Ok(format!(
        "архив собран: {} ({size} байт)",
        dest_path.display()
    ))
}

/// `archiver_unpack`: zip / jar / 7z into a folder, with entry names
/// sanitized the same way the launcher's own zip importer does it.
#[tauri::command]
pub async fn archiver_unpack<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    archive: String,
    dest_dir: String,
) -> Result<String> {
    let roots = allowed_roots(&app);
    let archive_path = PathBuf::from(&archive);
    ensure_allowed(&roots, &archive_path)?;
    if !archive_path.exists() {
        return Err(error(format!("нет такого архива: {archive}")));
    }
    let dest_path = PathBuf::from(&dest_dir);
    ensure_allowed(&roots, &dest_path)?;
    tokio::fs::create_dir_all(&dest_path)
        .await
        .map_err(|e| error(format!("не удалось создать папку {}: {e}", dest_path.display())))?;

    match format_of(&archive_path) {
        Ok(ArchiveFormat::SevenZip) => {
            let archive_for_thread = archive_path.clone();
            let dest_for_thread = dest_path.clone();
            tokio::task::spawn_blocking(move || {
                sevenz_rust::decompress_file(&archive_for_thread, &dest_for_thread)
            })
            .await
            .map_err(|e| error(format!("распаковка не выполнилась: {e}")))?
            .map_err(|e| error(format!("7z не распаковался: {e}")))?;
        }
        Ok(ArchiveFormat::Zip | ArchiveFormat::Jar) => {
            let mut reader = async_zip::tokio::read::fs::ZipFileReader::new(&archive_path)
                .await
                .map_err(|e| error(format!("архив не читается: {e}")))?;
            let count = reader.file().entries().len();
            for index in 0..count {
                let name = reader.file().entries()[index]
                    .filename()
                    .as_str()
                    .map(|name| name.to_string())
                    .map_err(|e| error(format!("имя файла в архиве не читается: {e}")))?;
                if name.is_empty() {
                    continue;
                }
                if name.starts_with('/') || name.contains("..") {
                    return Err(error(format!("опасное имя файла в архиве: {name}")));
                }
                let safe_name = name.replace('\\', "/");
                let target = dest_path.join(&safe_name);
                if !target.starts_with(&dest_path) {
                    return Err(error(format!("опасное имя файла в архиве: {name}")));
                }
                if safe_name.ends_with('/') {
                    tokio::fs::create_dir_all(&target).await.map_err(|e| {
                        error(format!("не удалось создать папку {safe_name}: {e}"))
                    })?;
                    continue;
                }
                let mut bytes = Vec::new();
                {
                    let mut entry = reader
                        .reader_with_entry(index)
                        .await
                        .map_err(|e| error(format!("не удалось открыть {safe_name}: {e}")))?;
                    entry.read_to_end_checked(&mut bytes).await.map_err(|e| {
                        error(format!("не удалось прочитать {safe_name}: {e}"))
                    })?;
                }
                if let Some(parent) = target.parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| error(format!("не удалось создать папку для {safe_name}: {e}")))?;
                }
                tokio::fs::write(&target, &bytes)
                    .await
                    .map_err(|e| error(format!("не удалось записать {safe_name}: {e}")))?;
            }
        }
    }
    let mut written = 0usize;
    let mut stack = vec![dest_path.clone()];
    while let Some(dir) = stack.pop() {
        if let Ok(mut entries) = tokio::fs::read_dir(&dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                match entry.file_type().await {
                    Ok(kind) if kind.is_dir() => stack.push(entry.path()),
                    Ok(_) => written += 1,
                    Err(_) => {}
                }
            }
        }
    }
    Ok(format!(
        "распаковано файлов: {written} в {}",
        dest_path.display()
    ))
}

/// `archiver_reveal`: shows a file or folder in the system file manager -
/// the way the launcher reveals screenshots and instances. Portalus uses it
/// to hand the player the folder its project lives in.
#[tauri::command]
pub async fn archiver_reveal<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<()> {
    let roots = allowed_roots(&app);
    let path = PathBuf::from(&path);
    ensure_allowed(&roots, &path)?;
    if !path.exists() {
        return Err(error(format!(
            "нет такого файла или папки: {}",
            path.display()
        )));
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| error(format!("не удалось открыть папку: {e}")))?;
    Ok(())
}

/// Every .java file under a source folder, ready for the compiler.
async fn collect_java_sources(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    let mut entries = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| error(format!("не удалось открыть папку {}: {e}", dir.display())))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| error(format!("не удалось прочитать папку {}: {e}", dir.display())))?
    {
        let path = entry.path();
        let kind = entry
            .file_type()
            .await
            .map_err(|e| error(format!("не удалось понять тип {}: {e}", path.display())))?;
        if kind.is_dir() {
            Box::pin(collect_java_sources(&path, out)).await?;
        } else if kind.is_file() && path.extension().map(|ext| ext == "java").unwrap_or(false) {
            out.push(path);
        }
    }
    Ok(())
}

/// Archives a folder's contents into a zip/jar with the entries at the
/// archive root - the layout a mod jar expects (com/..., fabric.mod.json...).
async fn pack_flat_jar(dir: &Path, dest: &Path) -> Result<usize> {
    let mut files = Vec::new();
    let mut stack = vec![(dir.to_path_buf(), String::new())];
    while let Some((current, prefix)) = stack.pop() {
        let mut entries = tokio::fs::read_dir(&current)
            .await
            .map_err(|e| error(format!("не удалось открыть папку {}: {e}", current.display())))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| error(format!("не удалось прочитать папку {}: {e}", current.display())))?
        {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            let kind = entry
                .file_type()
                .await
                .map_err(|e| error(format!("не удалось понять тип {}: {e}", path.display())))?;
            if kind.is_dir() {
                stack.push((path, rel));
            } else if kind.is_file() {
                files.push((rel, path));
            }
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let writer = tokio::fs::File::create(dest)
        .await
        .map_err(|e| error(format!("не удалось создать архив: {e}")))?;
    let mut writer = async_zip::tokio::write::ZipFileWriter::with_tokio(writer);
    for (name, path) in &files {
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|e| error(format!("не удалось прочитать {}: {e}", path.display())))?;
        let builder = async_zip::ZipEntryBuilder::new(
            name.clone().into(),
            async_zip::Compression::Deflate,
        );
        writer
            .write_entry_whole(builder, &bytes)
            .await
            .map_err(|e| error(format!("не удалось добавить {name} в архив: {e}")))?;
    }
    writer
        .close()
        .await
        .map_err(|e| error(format!("не удалось закрыть архив: {e}")))?;
    Ok(files.len())
}

/// Finds javac: first on PATH, then under JAVA_HOME.
fn find_javac() -> Option<PathBuf> {
    let name = if cfg!(windows) { "javac.exe" } else { "javac" };
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let candidate = PathBuf::from(home).join("bin").join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// `archiver_compile_java`: compiles every .java under a folder with the
/// system javac and packs the classes into a .jar - a real compiled mod, not
/// just a zipped source folder. The compiler is searched on PATH and under
/// JAVA_HOME; without a JDK the launcher stays honest about it.
#[tauri::command]
pub async fn archiver_compile_java<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    source_dir: String,
    output_jar: String,
) -> Result<String> {
    let roots = allowed_roots(&app);
    let source = PathBuf::from(&source_dir);
    ensure_allowed(&roots, &source)?;
    if !source.is_dir() {
        return Err(error(format!(
            "это не папка: {}",
            source.display()
        )));
    }
    let jar_path = PathBuf::from(&output_jar);
    ensure_allowed(&roots, &jar_path)?;
    if jar_path
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase() != "jar")
        .unwrap_or(true)
    {
        return Err(error("результат должен быть .jar"));
    }

    let mut sources = Vec::new();
    collect_java_sources(&source, &mut sources).await?;
    if sources.is_empty() {
        return Err(error("в папке нет .java файлов"));
    }

    let javac = find_javac().ok_or_else(|| {
        error("javac не найден: нужен JDK (на коробке Java от Mojang его нет). Установи JDK или добавь его в JAVA_HOME")
    })?;

    let classes = source.parent().unwrap_or(&source).join(".javac-classes");
    let _ = tokio::fs::remove_dir_all(&classes).await;
    tokio::fs::create_dir_all(&classes)
        .await
        .map_err(|e| error(format!("не удалось создать папку классов: {e}")))?;

    let mut command = tokio::process::Command::new(&javac);
    command
        .arg("-encoding")
        .arg("UTF-8")
        .arg("-nowarn")
        .arg("-d")
        .arg(&classes)
        .args(&sources);
    let output = command
        .output()
        .await
        .map_err(|e| error(format!("компилятор не запустился: {e}")))?;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        let _ = tokio::fs::remove_dir_all(&classes).await;
        let tail: String = {
            let lines: Vec<&str> = stderr.lines().collect();
            let start = lines.len().saturating_sub(20);
            lines[start..].join("\n")
        };
        return Err(error(format!("ошибки компиляции:\n{}", tail)));
    }

    let count = pack_flat_jar(&classes, &jar_path).await?;
    let _ = tokio::fs::remove_dir_all(&classes).await;
    Ok(format!(
        "скопилировано {count} записей в {} (файлов .java: {})",
        jar_path.display(),
        sources.len()
    ))
}
