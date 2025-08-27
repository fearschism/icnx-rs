use anyhow::Result;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub default_download_dir: PathBuf,
    pub max_concurrent: usize,
    pub retries: u32,
    pub backoff_ms: u64,
    pub user_agent: String,
    pub theme: Theme,
    pub language: String,
    pub enable_crash_reports: bool,
    pub enable_logging: bool,
    pub auto_close_downloads: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Theme {
    Light,
    Dark,
}

impl Default for Settings {
    fn default() -> Self {
        let dirs = app_dirs();
        let default_download_dir = dirs.join("downloads");
        Self {
            default_download_dir,
            max_concurrent: 3,
            retries: 3,
            backoff_ms: 1000,
            user_agent: "ICNX/0.1".to_string(),
            theme: Theme::Dark,
            language: "en".to_string(),
            enable_crash_reports: false,
            enable_logging: false,
            auto_close_downloads: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub session_id: String,
    pub url: String,
    pub filename: String,
    pub dir: PathBuf,
    pub size: Option<u64>,
    pub status: String, // Completed | Failed | Deleted
    pub file_type: Option<String>,
    pub script_name: Option<String>,
    pub source_url: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct History {
    pub items: Vec<DownloadRecord>,
}

pub fn app_dirs() -> PathBuf {
    let proj = ProjectDirs::from("com", "icnx", "icnx").expect("project dirs");
    let data_dir = proj.data_dir();
    fs::create_dir_all(data_dir).ok();
    data_dir.to_path_buf()
}

fn settings_path() -> PathBuf {
    app_dirs().join("settings.json")
}

pub fn history_path() -> PathBuf {
    app_dirs().join("history.json")
}

pub fn load_settings() -> Settings {
    let path = settings_path();
    match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save_settings(settings: &Settings) -> Result<()> {
    let path = settings_path();
    let json = serde_json::to_vec_pretty(settings)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn load_history() -> History {
    let path = history_path();
    match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => History::default(),
    }
}

pub fn save_history(history: &History) -> Result<()> {
    let path = history_path();
    let json = serde_json::to_vec_pretty(history)?;
    fs::write(path, json)?;
    Ok(())
}


