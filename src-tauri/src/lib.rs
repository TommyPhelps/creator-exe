//! CREATOR.EXE native layer: SQLite storage, local files, secure secrets and
//! launching external programs. All product logic lives in the TypeScript
//! frontend; this layer stays small so it is easy to audit.

pub mod db;
pub mod files;
pub mod secrets;
pub mod media;

use serde::Serialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

pub struct AppState {
    pub db: db::Database,
    pub data_dir: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub db_path: String,
    pub platform: String,
}

#[tauri::command]
async fn db_execute(
    state: tauri::State<'_, AppState>,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<db::ExecResult, String> {
    state.db.execute(&sql, &params.unwrap_or_default())
}

#[tauri::command]
async fn db_select(
    state: tauri::State<'_, AppState>,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<Vec<Map<String, Value>>, String> {
    state.db.select(&sql, &params.unwrap_or_default())
}

#[tauri::command]
async fn db_batch(state: tauri::State<'_, AppState>, statements: Vec<db::Statement>) -> Result<u64, String> {
    state.db.batch(&statements)
}

#[tauri::command]
async fn app_info(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: state.data_dir.display().to_string(),
        db_path: state
            .db
            .path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        platform: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
async fn create_project_folders(root: String, name: String, subfolders: Vec<String>) -> Result<String, String> {
    files::create_project_folders(Path::new(&root), &name, &subfolders).map(|p| p.display().to_string())
}

#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    files::write_text(Path::new(&path), &contents)
}

#[tauri::command]
async fn write_binary_file(path: String, base64: String) -> Result<(), String> {
    files::write_base64(Path::new(&path), &base64)
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    files::read_text(Path::new(&path))
}

#[tauri::command]
async fn read_binary_file(path: String) -> Result<String, String> {
    files::read_base64(Path::new(&path))
}

#[tauri::command]
async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// Writes an automatic safety backup into the app-data `backups` folder.
#[tauri::command]
async fn write_safety_backup(state: tauri::State<'_, AppState>, name: String, contents: String) -> Result<String, String> {
    let dir = state.data_dir.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{}.json", files::sanitize_name(&name)));
    files::write_text(&file, &contents)?;
    Ok(file.display().to_string())
}

#[tauri::command]
async fn secret_set(name: String, value: String) -> Result<(), String> {
    secrets::set(&name, &value)
}

#[tauri::command]
async fn secret_get(name: String) -> Result<Option<String>, String> {
    secrets::get(&name)
}

#[tauri::command]
async fn secret_delete(name: String) -> Result<(), String> {
    secrets::delete(&name)
}

/// Opens a folder in Windows File Explorer.
#[tauri::command]
async fn reveal_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("'{}' no longer exists", path));
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Launches a user-configured program (for example a video editor) with an
/// optional file or folder argument. CREATOR.EXE never controls the program.
#[tauri::command]
async fn launch_program(program: String, argument: Option<String>) -> Result<(), String> {
    let exe = Path::new(&program);
    if !exe.is_file() {
        return Err(format!("Program '{}' was not found", program));
    }
    let mut cmd = std::process::Command::new(exe);
    if let Some(a) = argument {
        if !a.is_empty() {
            cmd.arg(a);
        }
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = db::Database::open(&data_dir.join("creator.db"))
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(AppState { db: database, data_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_execute,
            db_select,
            db_batch,
            app_info,
            create_project_folders,
            write_text_file,
            write_binary_file,
            read_text_file,
            read_binary_file,
            path_exists,
            write_safety_backup,
            secret_set,
            secret_get,
            secret_delete,
            reveal_folder,
            launch_program,
            media::inspect_local_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running CREATOR.EXE");
}
