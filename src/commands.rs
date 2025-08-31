use std::path::PathBuf;
use tauri::{command, Manager};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::core::model::{EmitPayload, DownloadItem};
use crate::data::{Settings, load_settings, load_history, save_history, DownloadRecord};
use tauri::api::shell;
use crate::downloader::{Downloader, QueueItem, DownloadStatus};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptInfo {
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub icon: Option<String>,
    pub website: Option<String>,
    pub supported_domains: Option<Vec<String>>,
    pub options: Option<Vec<ScriptOption>>,
    pub dir: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptOption {
    pub id: String,
    pub r#type: String,
    pub label: String,
    pub description: Option<String>,
    pub required: Option<bool>,
    pub default: Option<serde_json::Value>,
    pub placeholder: Option<String>,
    pub min: Option<i32>,
    pub max: Option<i32>,
    pub options: Option<Vec<SelectOption>>,
    pub depends_on: Option<DependsOn>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DependsOn {
    pub option: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveScriptRequest {
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>, // from comma-separated or array
    pub icon: Option<String>,
    pub website: Option<String>,
    #[serde(rename = "supported_domains")]
    pub supported_domains: Option<Vec<String>>,
    pub options: Option<Vec<ScriptOption>>,
    pub code: String,
    pub existing_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickDownloadRequest {
    pub url: String,
    pub destination: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub script_name: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub file_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub progress: f32,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub speed: f64,
    pub eta: Option<u64>, // seconds
    pub status: String,
    pub url: String,
    pub filename: String,
    pub error: Option<String>,
}



#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadSessionSummary {
    pub session_id: String,
    pub title: String, // use source URL
    pub subtitle: String, // script or No scraper used
    pub total_size: String,
    pub status: String, // Completed | Incomplete | Failed | Mixed
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRecordView {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub path: String,
    pub size: Option<u64>,
    pub status: String,
    pub file_type: Option<String>,
}

#[command]
pub async fn quick_download(request: QuickDownloadRequest) -> Result<String, String> {
    let settings = load_settings();
    let downloader = Downloader::new(&settings);
    
    let item = DownloadItem {
        url: request.url.clone(),
        filename: None,
        title: None,
        r#type: None,
        headers: std::collections::HashMap::new(),
    };
    
    let queue_item = QueueItem {
        id: uuid::Uuid::new_v4().to_string(),
        item,
        dir: PathBuf::from(&request.destination),
    };
    
    match downloader.download(queue_item, settings.retries, settings.backoff_ms).await {
        DownloadStatus::Completed { .. } => Ok("Download completed successfully".to_string()),
        DownloadStatus::Failed(err) => Err(format!("Download failed: {}", err)),
        DownloadStatus::Canceled => Err("Download was canceled".to_string()),
        _ => Err("Download is in progress".to_string()),
    }
}

#[command]
pub async fn download_with_progress(app: tauri::AppHandle, request: QuickDownloadRequest) -> Result<DownloadProgress, String> {
    let settings = load_settings();
    
    // Create HTTP client
    let client = reqwest::Client::builder()
        .user_agent(&settings.user_agent)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Start download
    let resp = client
        .get(&request.url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP error: {}", resp.status()));
    }

    // Get total size and content type
    let total_size = resp
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    // Determine filename (prefer provided)
    let base_filename = request
        .filename
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| determine_filename(&request.url, content_type));

    // Create destination directory
    let dest_path = PathBuf::from(&request.destination);
    tokio::fs::create_dir_all(&dest_path)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Ensure unique name if file exists
    let mut file_path = dest_path.join(&base_filename);
    let mut filename = base_filename.clone();
    if file_path.exists() {
        let (stem, ext) = split_name_ext(&base_filename);
        let mut idx: u32 = 1;
        loop {
            let candidate = if let Some(ext) = &ext {
                format!("{} ({}) .{}", stem, idx, ext).replace("  .", ".")
            } else {
                format!("{} ({})", stem, idx)
            };
            let cand_path = dest_path.join(&candidate);
            if !cand_path.exists() {
                filename = candidate;
                file_path = cand_path;
                break;
            }
            idx += 1;
        }
    }
    
    // Create file
    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    // Download with progress tracking
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let start_time = Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;
        
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        
        downloaded += chunk.len() as u64;
        // Emit progress event
        let elapsed = start_time.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };
        let progress_ratio = match total_size { Some(t) if t > 0 => (downloaded as f32) / (t as f32), _ => 0.0 };
        let eta = match (total_size, speed) { (Some(t), s) if s > 0.0 && downloaded < t => Some(((t - downloaded) as f64 / s) as u64), _ => None };
        let _ = app.emit_all("download_progress", &DownloadProgress {
            progress: progress_ratio,
            downloaded,
            total: total_size,
            speed,
            eta,
            status: "downloading".to_string(),
            url: request.url.clone(),
            filename: filename.clone(),
            error: None,
        });
    }

    // Ensure file is completely written
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);

    // Calculate final metrics
    let elapsed = start_time.elapsed().as_secs_f64();
    let final_speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };

    // Verify file size if we had total_size
    if let Some(expected_size) = total_size {
        if downloaded != expected_size {
            return Err(format!(
                "Incomplete download: expected {} bytes, got {} bytes", 
                expected_size, downloaded
            ));
        }
    }

    // Append to history
    let mut history = load_history();
    let session_id = request.session_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let rec = DownloadRecord {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        url: request.url.clone(),
        filename: filename.clone(),
        dir: dest_path.clone(),
        size: Some(downloaded),
        status: "Completed".to_string(),
        file_type: request.file_type.clone(),
        script_name: request.script_name.clone(),
        source_url: request.source_url.clone(),
        created_at: chrono::Utc::now().timestamp(),
    };
    history.items.push(rec);
    let _ = save_history(&history);

    Ok(DownloadProgress {
        progress: 1.0,
        downloaded,
        total: total_size,
        speed: final_speed,
        eta: None,
        status: "completed".to_string(),
        url: request.url,
        filename,
        error: None,
    })
}

fn determine_filename(url: &str, content_type: &str) -> String {
    // Try to get filename from URL first
    let url_filename = url
        .split('/')
        .last()
        .unwrap_or("download")
        .split('?')
        .next()
        .unwrap_or("download");
    
    if url_filename.contains('.') && !url_filename.ends_with('.') && url_filename.len() > 1 {
        return url_filename.to_string();
    }
    
    // Use content type to determine extension
    let extension = if content_type.contains("jpeg") || content_type.contains("jpg") {
        "jpg"
    } else if content_type.contains("png") {
        "png"
    } else if content_type.contains("gif") {
        "gif"
    } else if content_type.contains("webp") {
        "webp"
    } else if content_type.contains("mp4") {
        "mp4"
    } else if content_type.contains("webm") {
        "webm"
    } else if content_type.contains("pdf") {
        "pdf"
    } else if content_type.contains("zip") {
        "zip"
    } else if content_type.contains("json") {
        "json"
    } else if content_type.contains("text") {
        "txt"
    } else {
        "bin"
    };
    
    format!("{}.{}", url_filename.trim_end_matches('.'), extension)
}

fn split_name_ext(name: &str) -> (String, Option<String>) {
    if let Some(idx) = name.rfind('.') {
        let (a, b) = name.split_at(idx);
        if b.len() > 1 { return (a.to_string(), Some(b[1..].to_string())); }
    }
    (name.to_string(), None)
}

#[command]
pub async fn run_script(app: tauri::AppHandle, script_name: String, options: Option<serde_json::Value>) -> Result<EmitPayload, String> {
    // Accept either script folder name or manifest name
    let scripts_dir = PathBuf::from("scripts");
    let mut script_dir = scripts_dir.join(&script_name);
    
    // If direct folder doesn't exist, try to resolve by manifest name
    if !script_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&scripts_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let manifest_path = p.join("manifest.json");
                    if manifest_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                                if manifest["name"].as_str().unwrap_or("") == script_name {
                                    script_dir = p;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Look for Python script only
    let python_script = script_dir.join("script.py");
    
    if python_script.exists() {
        // Execute Python script
        match std::fs::read_to_string(&python_script) {
            Ok(source) => {
                let (sender, _receiver) = crossbeam_channel::unbounded();
                match crate::core::python_runtime::PythonEngine::new(sender, Some(app.clone())) {
                    Ok(engine) => {
                        match engine.execute_script_with_options(&script_name, &source, options) {
                            Ok(_) => {
                                if let Some(payload) = engine.get_result() {
                                    Ok(payload)
                                } else {
                                    Err("Python script did not emit any data".to_string())
                                }
                            }
                            Err(e) => Err(format!("Python script execution error: {}", e))
                        }
                    }
                    Err(e) => Err(format!("Python engine error: {}", e))
                }
            }
            Err(e) => Err(format!("Failed to read Python script: {}", e))
        }
    } else {
        Err(format!("No Python script found in directory: {} (looking for script.py)", script_dir.display()))
    }
}

#[command]
pub async fn get_installed_scripts() -> Result<Vec<ScriptInfo>, String> {
    let scripts_dir = PathBuf::from("scripts");
    
    if !scripts_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut scripts = Vec::new();
    
    match std::fs::read_dir(&scripts_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_dir() {
                        // Look for script.py file first (new __meta__ approach)
                        let script_path = path.join("script.py");
                        if script_path.exists() {
                            match parse_python_script_meta(&script_path) {
                                Ok(script_info) => {
                                    scripts.push(ScriptInfo {
                                        name: script_info.name,
                                        description: script_info.description,
                                        version: script_info.version,
                                        author: script_info.author,
                                        category: script_info.category,
                                        tags: script_info.tags,
                                        icon: script_info.icon,
                                        website: script_info.website,
                                        supported_domains: script_info.supported_domains,
                                        options: script_info.options,
                                        dir: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                    });
                                    continue;
                                }
                                Err(e) => {
                                    eprintln!("Failed to parse Python script meta for {}: {}", script_path.display(), e);
                                }
                            }
                        }
                        
                        // Fallback to manifest.json for backwards compatibility
                        let manifest_path = path.join("manifest.json");
                        if manifest_path.exists() {
                            match std::fs::read_to_string(&manifest_path) {
                                Ok(content) => {
                                    if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                                        let script_info = ScriptInfo {
                                            name: manifest["name"].as_str().unwrap_or("Unknown").to_string(),
                                            description: manifest["description"].as_str().unwrap_or("").to_string(),
                                            version: manifest["version"].as_str().unwrap_or("0.1.0").to_string(),
                                            author: manifest["author"].as_str().unwrap_or("Unknown").to_string(),
                                            category: manifest["category"].as_str().map(|s| s.to_string()),
                                            tags: manifest["tags"].as_array()
                                                .map(|arr| arr.iter()
                                                    .filter_map(|v| v.as_str())
                                                    .map(|s| s.to_string())
                                                    .collect()),
                                            icon: manifest["icon"].as_str().map(|s| s.to_string()),
                                            website: manifest["website"].as_str().map(|s| s.to_string()),
                                            supported_domains: manifest["supportedDomains"].as_array()
                                                .map(|arr| arr.iter()
                                                    .filter_map(|v| v.as_str())
                                                    .map(|s| s.to_string())
                                                    .collect()),
                                            options: parse_script_options(&manifest["options"]),
                                            dir: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                        };
                                        scripts.push(script_info);
                                    }
                                }
                                Err(_) => continue,
                            }
                        }
                    }
                }
            }
        }
        Err(e) => return Err(format!("Failed to read scripts directory: {}", e)),
    }
    
    Ok(scripts)
}

fn parse_script_options(options_value: &serde_json::Value) -> Option<Vec<ScriptOption>> {
    options_value.as_array().map(|arr| {
        arr.iter()
            .filter_map(|opt| {
                let id = opt["id"].as_str()?.to_string();
                let r#type = opt["type"].as_str()?.to_string();
                let label = opt["label"].as_str()?.to_string();
                
                Some(ScriptOption {
                    id,
                    r#type,
                    label,
                    description: opt["description"].as_str().map(|s| s.to_string()),
                    required: opt["required"].as_bool(),
                    default: if opt["default"].is_null() { None } else { Some(opt["default"].clone()) },
                    placeholder: opt["placeholder"].as_str().map(|s| s.to_string()),
                    min: opt["min"].as_i64().map(|n| n as i32),
                    max: opt["max"].as_i64().map(|n| n as i32),
                    options: opt["options"].as_array().map(|arr| {
                        arr.iter()
                            .filter_map(|item| {
                                Some(SelectOption {
                                    label: item["label"].as_str()?.to_string(),
                                    value: item["value"].as_str()?.to_string(),
                                })
                            })
                            .collect()
                    }),
                    depends_on: opt["dependsOn"].as_object().map(|obj| {
                        DependsOn {
                            option: obj["option"].as_str().unwrap_or("").to_string(),
                            value: obj["value"].as_str().unwrap_or("").to_string(),
                        }
                    }),
                })
            })
            .collect()
    })
}

#[command]
pub async fn save_script(req: SaveScriptRequest) -> Result<(), String> {
    use std::fs;
    use std::io::Write;

    fn slugify(name: &str) -> String {
        let lower = name.to_lowercase();
        let mut out = String::with_capacity(lower.len());
        for ch in lower.chars() {
            if ch.is_alphanumeric() { out.push(ch); }
            else if ch.is_whitespace() || ch == '-' || ch == '_' { out.push('-'); }
            else { out.push('-'); }
        }
        // collapse multiple dashes
        let mut collapsed = String::new();
        let mut prev_dash = false;
        for c in out.chars() {
            if c == '-' {
                if !prev_dash { collapsed.push('-'); prev_dash = true; }
            } else { collapsed.push(c); prev_dash = false; }
        }
        collapsed.trim_matches('-').to_string()
    }

    let base_dir = if let Some(existing) = &req.existing_dir {
        PathBuf::from("scripts").join(existing)
    } else {
        let dir_name = slugify(&req.name);
        PathBuf::from("scripts").join(&dir_name)
    };
    fs::create_dir_all(&base_dir).map_err(|e| format!("create dir failed: {}", e))?;

    // Write script.js
    let script_path = base_dir.join("script.js");
    fs::write(&script_path, req.code.as_bytes()).map_err(|e| format!("write script failed: {}", e))?;

    // Build manifest JSON
    let manifest = serde_json::json!({
        "name": req.name,
        "description": req.description,
        "version": req.version,
        "author": req.author,
        "category": req.category,
        "tags": req.tags,
        "icon": req.icon,
        "website": req.website,
        "supportedDomains": req.supported_domains,
        "options": req.options.unwrap_or_default(),
    });
    let manifest_path = base_dir.join("manifest.json");
    let data = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(&manifest_path, data).map_err(|e| format!("write manifest failed: {}", e))?;

    Ok(())
}

#[command]
pub async fn open_file_in_system(app: tauri::AppHandle, path: String) -> Result<(), String> {
    shell::open(&app.shell_scope(), path, None).map_err(|e| format!("open failed: {}", e))
}

#[command]
pub async fn delete_file_at_path(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("delete failed: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScriptFileResponse {
    pub dir: String,
    pub manifest: serde_json::Value,
    pub code: String,
}

#[tauri::command]
pub async fn run_script_playground(code: String, app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use crate::core::python_runtime::PythonEngine;
    
    // Create a dummy sender for playground mode
    let (tx, _rx) = crossbeam_channel::unbounded();
    let engine = PythonEngine::new(tx, Some(app_handle)).map_err(|e| e.to_string())?;
    
    // For playground mode, we can execute the code directly as an inline script
    engine.execute_script("playground", &code).map_err(|e| e.to_string())?;
    
    // Return result from Python execution
    if let Some(payload) = engine.get_result() {
        Ok(serde_json::to_value(payload).unwrap_or_else(|_| serde_json::json!({"status": "success", "message": "Python script executed"})))
    } else {
        Ok(serde_json::json!({"status": "success", "message": "Python script executed"}))
    }
}

fn resolve_script_dir(script_name_or_dir: &str) -> Option<PathBuf> {
    let direct = PathBuf::from("scripts").join(script_name_or_dir);
    if direct.join("script.py").exists() { 
        return Some(direct); 
    }
    // search by manifest name
    let scripts_dir = PathBuf::from("scripts");
    if let Ok(entries) = std::fs::read_dir(&scripts_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let manifest_path = p.join("manifest.json");
                if manifest_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                        if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                            if manifest["name"].as_str().unwrap_or("") == script_name_or_dir {
                                return Some(p);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[command]
pub async fn get_script(script_name_or_dir: String) -> Result<ScriptFileResponse, String> {
    let Some(dir) = resolve_script_dir(&script_name_or_dir) else { return Err("Script not found".into()) };
    let manifest_path = dir.join("manifest.json");
    
    // Check for Python script only
    let python_script = dir.join("script.py");
    
    if !python_script.exists() {
        return Err("No Python script file found (script.py)".into());
    }
    
    let manifest = std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest failed: {}", e))?;
    let code = std::fs::read_to_string(&python_script).map_err(|e| format!("read script failed: {}", e))?;
    let mut manifest_json: serde_json::Value = serde_json::from_str(&manifest).map_err(|e| format!("parse manifest failed: {}", e))?;
    
    // Add script type to manifest
    manifest_json["scriptType"] = serde_json::Value::String("python".to_string());
    
    Ok(ScriptFileResponse { 
        dir: dir.file_name().unwrap_or_default().to_string_lossy().to_string(), 
        manifest: manifest_json, 
        code 
    })
}

#[command]
pub async fn delete_script(script_name_or_dir: String) -> Result<(), String> {
    let Some(dir) = resolve_script_dir(&script_name_or_dir) else { return Err("Script not found".into()) };
    std::fs::remove_dir_all(&dir).map_err(|e| format!("delete failed: {}", e))
}

#[command]
pub async fn get_settings() -> Result<Settings, String> {
    Ok(load_settings())
}

#[command]
pub async fn save_settings_cmd(settings: Settings) -> Result<(), String> {
    crate::data::save_settings(&settings).map_err(|e| format!("Failed to save settings: {}", e))
}

#[command]
pub async fn pick_directory() -> Result<Option<String>, String> {
    match rfd::FileDialog::new().pick_folder() {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[command]
pub async fn get_download_history() -> Result<Vec<DownloadSessionSummary>, String> {
    let history = load_history();
    use std::collections::BTreeMap;
    let mut by_session: BTreeMap<String, Vec<DownloadRecord>> = BTreeMap::new();
    for rec in history.items {
        by_session.entry(rec.session_id.clone()).or_default().push(rec);
    }
    let mut out: Vec<DownloadSessionSummary> = Vec::new();
    for (session_id, mut recs) in by_session {
        recs.sort_by_key(|r| r.created_at);
        let title = recs.first().and_then(|r| r.source_url.clone()).unwrap_or_else(|| recs.first().map(|r| r.url.clone()).unwrap_or_default());
        let script = recs.first().and_then(|r| r.script_name.clone());
        let subtitle = script.unwrap_or_else(|| "No scrapper used".to_string());
        let total_size_bytes: u64 = recs.iter().filter_map(|r| r.size).sum();
        let total_size = format_size(total_size_bytes);
        let (mut has_failed, mut has_completed, mut has_other) = (false, false, false);
        for r in &recs {
            match r.status.as_str() { 
                "Completed" => has_completed = true, 
                "Failed" => has_failed = true, 
                _ => has_other = true,
            }
        }
        let status = if has_failed && !has_completed { "Failed" } else if has_completed && !has_failed && !has_other { "Completed" } else if has_failed && has_completed { "Mixed" } else { "Incomplete" }.to_string();
        let created_at = recs.first().map(|r| r.created_at).unwrap_or(0);
        out.push(DownloadSessionSummary { session_id, title, subtitle, total_size, status, created_at });
    }
    // newest first
    out.sort_by_key(|s| std::cmp::Reverse(s.created_at));
    Ok(out)
}

#[command]
pub async fn get_download_session_details(session_id: String) -> Result<Vec<DownloadRecordView>, String> {
    let history = load_history();
    let recs: Vec<DownloadRecordView> = history.items.into_iter().filter(|r| r.session_id == session_id).map(|r| DownloadRecordView {
        id: r.id,
        url: r.url,
        filename: r.filename.clone(),
        path: r.dir.join(&r.filename).to_string_lossy().to_string(),
        size: r.size,
        status: r.status,
        file_type: r.file_type,
    }).collect();
    Ok(recs)
}

#[command]
pub async fn record_failed_download(request: QuickDownloadRequest, _reason: Option<String>) -> Result<(), String> {
    let mut history = load_history();
    let session_id = request.session_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let fname = request.filename.clone().unwrap_or_else(|| determine_filename(&request.url, ""));
    let dir = std::path::PathBuf::from(&request.destination);
    let rec = DownloadRecord {
        id: uuid::Uuid::new_v4().to_string(),
        session_id,
        url: request.url,
        filename: fname,
        dir,
        size: None,
        status: "Failed".to_string(),
        file_type: request.file_type,
        script_name: request.script_name,
        source_url: request.source_url,
        created_at: chrono::Utc::now().timestamp(),
    };
    history.items.push(rec);
    save_history(&history).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_download_session(session_id: String, delete_files: bool) -> Result<(), String> {
    let mut history = load_history();
    if delete_files {
        for rec in history.items.iter().filter(|r| r.session_id == session_id) {
            let path = rec.dir.join(&rec.filename);
            if path.exists() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    history.items.retain(|r| r.session_id != session_id);
    save_history(&history).map_err(|e| e.to_string())
}

#[command]
pub async fn start_download_session(app: tauri::AppHandle, items: Vec<serde_json::Value>, destination: String, concurrency: Option<usize>) -> Result<String, String> {
    let settings = load_settings();
    let concurrency = concurrency.unwrap_or(settings.max_concurrent);
    let downloader = Downloader::with_concurrency(&settings, concurrency);

    // ensure destination/.icnx exists for session DB storage
    let mut icnx_dir = std::path::PathBuf::from(&destination);
    icnx_dir.push(".icnx");
    if let Err(e) = tokio::fs::create_dir_all(&icnx_dir).await {
        eprintln!("ICNX: failed to create .icnx dir at {:?}: {}", icnx_dir, e);
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    let cancel_token = tokio_util::sync::CancellationToken::new();
    // register so UI can cancel later
    crate::downloader::register_session_token(&session_id, cancel_token.clone());

    // Clone session_id for the background task to avoid moving the original
    let session_id_for_spawn = session_id.clone();

    // Spawn background worker to process all items concurrently (bounded by downloader semaphore)
    let app_clone = app.clone();
    let dest_clone = destination.clone();
    // emit session started event
    let _ = app_clone.emit_all("download_session_started", &serde_json::json!({ "session_id": session_id_for_spawn, "count": items.len(), "destination": dest_clone }));
    eprintln!("ICNX: start_download_session: {} items -> {} (session={})", items.len(), dest_clone, session_id_for_spawn);
     tokio::spawn(async move {
         let mut handles = Vec::new();
         for v in items.into_iter() {
            // try to deserialize into DownloadItem, fill missing headers with empty map
            let di: DownloadItem = match serde_json::from_value::<DownloadItem>(v) {
                Ok(mut d) => { if d.headers.is_empty() { d.headers = std::collections::HashMap::new(); } d },
                Err(e) => {
                    // emit a parse warning and skip
                    let _ = app_clone.emit_all("icnx:download_item_parse_error", &serde_json::json!({ "session": session_id_for_spawn, "error": e.to_string() }));
                    eprintln!("ICNX: failed to parse download item in session {}: {}", session_id_for_spawn, e);
                    continue;
                }
            };
            let qi = QueueItem { id: uuid::Uuid::new_v4().to_string(), item: di.clone(), dir: std::path::PathBuf::from(&dest_clone) };
            let url_for_log = qi.item.url.clone();
            let dl = downloader.clone();
            let tok_clone = cancel_token.clone();
            let app_h = Some(app_clone.clone());
            let sid = session_id_for_spawn.clone();
            let settings_local = settings.clone();
            // emit queued event
            let _ = app_clone.emit_all("download_item_queued", &serde_json::json!({ "session_id": sid, "url": qi.item.url, "filename": qi.item.filename }));
            eprintln!("ICNX: queued {} (session={})", qi.item.url, sid);

            let h = tokio::spawn(async move {
                // emit started event for this item
                if let Some(a) = &app_h {
                    let _ = a.emit_all("download_item_started", &serde_json::json!({ "session_id": sid.clone(), "url": qi.item.url }));
                }
                eprintln!("ICNX: started {} (session={})", url_for_log, sid.clone());
                let _ = dl.download_with_progress(app_h, qi, settings_local.retries, settings_local.backoff_ms, Some(sid.clone()), tok_clone).await;
                eprintln!("ICNX: finished {} (session={})", url_for_log, sid.clone());
            });
            handles.push(h);
         }

         // Wait for all tasks to finish
         for h in handles {
             let _ = h.await;
         }

         // cleanup: ensure any remaining token is cancelled (best-effort), then unregister and remove pause flag
         // cancel_session will remove and cancel the token if present
         let _ = crate::downloader::cancel_session(&session_id_for_spawn);
         crate::downloader::unregister_session_token(&session_id_for_spawn);
         crate::downloader::remove_session_pause_flag(&session_id_for_spawn);
         // emit finished and cleanup events so frontend can finalize UI and clear caches
         let _ = app_clone.emit_all("download_session_finished", &serde_json::json!({ "session_id": session_id_for_spawn }));
         let _ = app_clone.emit_all("download_session_cleanup", &serde_json::json!({ "session_id": session_id_for_spawn }));
         eprintln!("ICNX: download_session_finished {}", session_id_for_spawn);
     });

     Ok(session_id)
}

#[command]
pub async fn read_download_session(app: tauri::AppHandle, session_id: String, destination: String) -> Result<serde_json::Value, String> {
    use std::path::PathBuf;
    // build both candidate paths
    let mut app_db = None;
    if let Some(mut p) = app.path_resolver().app_data_dir() { p.push(".icnx"); p.push(format!("session-{}.db", session_id)); app_db = Some(p); }
    let dest_db = if destination.len() > 0 { Some(PathBuf::from(&destination).join(".icnx").join(format!("session-{}.db", session_id))) } else { None };

    // choose db path: prefer existing app_data db, else existing destination db, else prefer app_db if present, else fallback constructed path
    let app_db_clone = app_db.clone();
    let dest_db_clone = dest_db.clone();
    let db_path = match (app_db_clone, dest_db_clone) {
        (Some(a), Some(d)) => {
            if a.exists() { a } else if d.exists() { d } else { a }
        }
        (Some(a), None) => a,
        (None, Some(d)) => d,
        (None, None) => PathBuf::from(&destination).join(".icnx").join(format!("session-{}.db", session_id)),
    };

    eprintln!("ICNX: read_download_session chosen db {} (app_db_exists={}, dest_db_exists={})", db_path.display(), app_db.as_ref().map(|p| p.exists()).unwrap_or(false), dest_db.as_ref().map(|p| p.exists()).unwrap_or(false));

    if !db_path.exists() {
        return Ok(serde_json::json!({ "rows": [] }));
    }
    match crate::downloader::session_db::SessionDb::open(db_path) {
        Ok(db) => match db.read_all() {
            Ok(rows) => Ok(serde_json::json!({ "rows": rows })),
            Err(e) => Err(format!("failed to read session db: {}", e)),
        },
        Err(e) => Err(format!("failed to open session db: {}", e)),
    }
}

#[command]
pub async fn read_scrape_session(app: tauri::AppHandle, session_key: String) -> Result<serde_json::Value, String> {
    use std::path::PathBuf;
    // prefer app data dir
    let mut db_path = if let Some(mut p) = app.path_resolver().app_data_dir() { p.push(".icnx"); p.push("scrape.db"); p } else { PathBuf::from(".icnx").join("scrape.db") };

    eprintln!("ICNX: read_scrape_session reading {} for key {}", db_path.display(), session_key);

    if !db_path.exists() {
        return Ok(serde_json::json!({ "rows": [] }));
    }
    match crate::downloader::session_db::read_scrape_items(db_path, &session_key) {
        Ok(rows) => Ok(serde_json::json!({ "rows": rows })),
        Err(e) => Err(format!("failed to read scrape db: {}", e)),
    }
}

fn format_size(bytes: u64) -> String {
    if bytes == 0 { return "0 B".to_string(); }
    let units = ["B","KB","MB","GB","TB"]; let mut b = bytes as f64; let mut i = 0usize;
    while b >= 1024.0 && i < units.len() - 1 { b /= 1024.0; i += 1; }
    format!("{:.2} {}", b, units[i])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(1), "1.00 B");
        assert!(format_size(1024).starts_with("1.00"));
        assert!(format_size(1024 * 1024).contains("MB"));
    }

    #[test]
    fn test_split_name_ext() {
        let (a, b) = split_name_ext("file.txt");
        assert_eq!(a, "file");
        assert_eq!(b.unwrap(), "txt");

        let (a2, b2) = split_name_ext("noext");
        assert_eq!(a2, "noext");
        assert!(b2.is_none());

        let (a3, b3) = split_name_ext("weird.name.tar.gz");
        assert_eq!(a3, "weird.name.tar");
        assert_eq!(b3.unwrap(), "gz");
    }

    #[test]
    fn test_determine_filename_from_url_and_content_type() {
        let url = "https://example.com/path/image";
        let fname = determine_filename(url, "image/png");
        assert!(fname.ends_with("png"));

        let url2 = "https://example.com/file.jpg?query=1";
        let fname2 = determine_filename(url2, "");
        assert!(fname2.ends_with("jpg"));

        let url3 = "https://example.com/";
        let fname3 = determine_filename(url3, "application/pdf");
        assert!(fname3.ends_with("pdf"));
    }
}

#[tauri::command]
pub async fn cancel_download_session(app: tauri::AppHandle, session_id: String) -> Result<bool, String> {
    let ok = crate::downloader::cancel_session(&session_id);
    // emit cancellation event so UI can update
    let _ = app.emit_all("download_session_cancelled", &serde_json::json!({ "session_id": session_id }));
    Ok(ok)
}

#[tauri::command]
pub async fn pause_download_session(app: tauri::AppHandle, session_id: String) -> Result<bool, String> {
    crate::downloader::set_session_paused(&session_id, true);
    // notify listeners
    let _ = app.emit_all("download_session_paused", &serde_json::json!({ "session_id": session_id }));
    Ok(true)
}

#[tauri::command]
pub async fn resume_download_session(app: tauri::AppHandle, session_id: String) -> Result<bool, String> {
    crate::downloader::set_session_paused(&session_id, false);
    let _ = app.emit_all("download_session_resumed", &serde_json::json!({ "session_id": session_id }));
    Ok(true)
}

#[command]
pub async fn get_persistent_history(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use std::path::PathBuf;
    // prefer app_data dir
    let db_path = if let Some(mut p) = app.path_resolver().app_data_dir() { p.push(".icnx"); p.push("history.db"); p } else { PathBuf::from(".icnx").join("history.db") };
    eprintln!("ICNX: get_persistent_history reading {}", db_path.display());
    if !db_path.exists() { return Ok(serde_json::json!({ "rows": [] })); }
    match crate::downloader::session_db::read_history(db_path) {
        Ok(rows) => Ok(serde_json::json!({ "rows": rows })),
        Err(e) => Err(format!("failed to read history db: {}", e)),
    }
}

#[command]
pub async fn purge_persistent_history(app: tauri::AppHandle, older_than: Option<i64>) -> Result<(), String> {
    // older_than (timestamp) optional - if None, purge all
    let db_path = if let Some(mut p) = app.path_resolver().app_data_dir() { p.push(".icnx"); p.push("history.db"); p } else { std::path::PathBuf::from(".icnx").join("history.db") };
    eprintln!("ICNX: purge_persistent_history {} older_than={:?}", db_path.display(), older_than);
    if !db_path.exists() { return Ok(()); }
    // perform direct sqlite delete
    match rusqlite::Connection::open(db_path) {
        Ok(conn) => {
            if older_than.is_none() {
                let _ = conn.execute("DELETE FROM history", []);
            } else {
                let val = older_than.unwrap();
                let _ = conn.execute("DELETE FROM history WHERE created_at < ?1", [val]);
            }
            Ok(())
        }
        Err(e) => Err(format!("failed to open history db: {}", e)),
    }
}

#[command]
pub async fn migrate_json_history_to_db(app: tauri::AppHandle) -> Result<(), String> {
    use std::path::PathBuf;
    let json_path = crate::data::history_path();
    if !json_path.exists() { return Ok(()); }
    match std::fs::read_to_string(&json_path) {
        Ok(content) => {
            if content.trim().is_empty() { return Ok(()); }
            let hist: crate::data::History = match serde_json::from_str(&content) {
                Ok(h) => h,
                Err(e) => return Err(format!("failed to parse legacy history.json: {}", e)),
            };
            // destination history DB
            let db_path = if let Some(mut p) = app.path_resolver().app_data_dir() { p.push(".icnx"); p.push("history.db"); p } else { PathBuf::from(".icnx").join("history.db") };
            for rec in hist.items {
                crate::downloader::session_db::enqueue_history_record(db_path.clone(), rec.id, rec.session_id, rec.url, rec.filename, rec.dir.to_string_lossy().to_string(), rec.size, rec.status, rec.file_type, rec.script_name, rec.source_url, rec.created_at);
            }
            // clear the legacy file (best-effort) to avoid duplicate migrations
            let _ = std::fs::write(&json_path, "[]");
            Ok(())
        }
        Err(e) => Err(format!("failed to read legacy history.json: {}", e)),
    }
}

// Python package management commands

#[command]
pub async fn setup_python_environment() -> Result<String, String> {
    use crate::core::python_runtime::PythonLibraryManager;
    
    match PythonLibraryManager::setup_environment() {
        Ok(()) => Ok("Python environment setup completed successfully".to_string()),
        Err(e) => Err(format!("Failed to setup Python environment: {}", e)),
    }
}

#[command]
pub async fn install_python_packages(packages: Vec<String>) -> Result<String, String> {
    use crate::core::python_runtime::PythonLibraryManager;
    
    let package_refs: Vec<&str> = packages.iter().map(|s| s.as_str()).collect();
    match PythonLibraryManager::install_packages(&package_refs) {
        Ok(()) => Ok(format!("Successfully installed packages: {}", packages.join(", "))),
        Err(e) => Err(format!("Failed to install packages: {}", e)),
    }
}

#[command]
pub async fn check_python_packages(packages: Vec<String>) -> Result<Vec<(String, bool)>, String> {
    use crate::core::python_runtime::PythonLibraryManager;
    
    let package_refs: Vec<&str> = packages.iter().map(|s| s.as_str()).collect();
    match PythonLibraryManager::check_packages(&package_refs) {
        Ok(results) => Ok(results),
        Err(e) => Err(format!("Failed to check packages: {}", e)),
    }
}

#[command]
pub async fn install_python_essentials() -> Result<String, String> {
    use crate::core::python_runtime::PythonLibraryManager;
    
    match PythonLibraryManager::install_essentials() {
        Ok(()) => Ok("Successfully installed essential Python packages for web scraping".to_string()),
        Err(e) => Err(format!("Failed to install essential packages: {}", e)),
    }
}

#[command]
pub async fn detect_scripts_for_url(url: String) -> Result<Vec<ScriptInfo>, String> {
    let scripts = get_installed_scripts().await?;
    
    // Parse the URL to extract domain
    let parsed_url = match url::Url::parse(&url) {
        Ok(u) => u,
        Err(_) => return Ok(vec![]), // Invalid URL, no matches
    };
    
    let domain = parsed_url.host_str().unwrap_or("");
    let full_host = parsed_url.host_str().unwrap_or("");
    
    // Filter scripts that support this domain
    let matching_scripts: Vec<ScriptInfo> = scripts.into_iter()
        .filter(|script| {
            if let Some(ref domains) = script.supported_domains {
                domains.iter().any(|supported_domain| {
                    // Check for exact domain match
                    if domain == supported_domain {
                        return true;
                    }
                    
                    // Check for subdomain match (e.g., "news.ycombinator.com" matches "ycombinator.com")
                    if domain.ends_with(&format!(".{}", supported_domain)) {
                        return true;
                    }
                    
                    // Check for pattern matching (e.g., "*.github.com" matches "github.com")
                    if supported_domain.starts_with("*.") {
                        let pattern = &supported_domain[2..]; // Remove "*."
                        if domain == pattern || domain.ends_with(&format!(".{}", pattern)) {
                            return true;
                        }
                    }
                    
                    // Check for protocol-aware matching
                    if supported_domain.starts_with("http") {
                        if let Ok(supported_url) = url::Url::parse(supported_domain) {
                            if let Some(supported_host) = supported_url.host_str() {
                                return domain == supported_host;
                            }
                        }
                    }
                    
                    false
                })
            } else {
                // No supported domains specified - this script doesn't match any specific URL
                false
            }
        })
        .collect();
    
    Ok(matching_scripts)
}

// Parse __meta__ from Python script
fn parse_python_script_meta(script_path: &PathBuf) -> Result<ScriptInfo, String> {
    let content = std::fs::read_to_string(script_path)
        .map_err(|e| format!("Failed to read script file: {}", e))?;
    
    // Find __meta__ = { ... } in the Python file
    let lines: Vec<&str> = content.lines().collect();
    let mut meta_start = None;
    let mut brace_count = 0;
    let mut in_meta = false;
    let mut meta_lines = Vec::new();
    
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        
        if trimmed.starts_with("__meta__") && trimmed.contains("=") && trimmed.contains("{") {
            meta_start = Some(i);
            in_meta = true;
            // Count braces in this line
            for ch in trimmed.chars() {
                match ch {
                    '{' => brace_count += 1,
                    '}' => brace_count -= 1,
                    _ => {}
                }
            }
            // Start collecting from the opening brace
            if let Some(pos) = trimmed.find('{') {
                meta_lines.push(&trimmed[pos..]);
            }
            
            if brace_count == 0 {
                break; // Single line __meta__
            }
        } else if in_meta {
            meta_lines.push(line);
            // Count braces
            for ch in line.chars() {
                match ch {
                    '{' => brace_count += 1,
                    '}' => brace_count -= 1,
                    _ => {}
                }
            }
            if brace_count == 0 {
                break; // End of __meta__
            }
        }
    }
    
    if meta_lines.is_empty() {
        return Err("No __meta__ found in Python script".to_string());
    }
    
    // Join the meta lines and try to parse as JSON-like syntax
    let meta_content = meta_lines.join("\n");
    
    // Convert Python dict syntax to JSON
    let json_content = python_dict_to_json(&meta_content)
        .map_err(|e| format!("Failed to convert Python dict to JSON: {}", e))?;
    
    // Parse the JSON
    let meta: serde_json::Value = serde_json::from_str(&json_content)
        .map_err(|e| format!("Failed to parse meta JSON: {}", e))?;
    
    Ok(ScriptInfo {
        name: meta["name"].as_str().unwrap_or("Unknown").to_string(),
        description: meta["description"].as_str().unwrap_or("").to_string(),
        version: meta["version"].as_str().unwrap_or("0.1.0").to_string(),
        author: meta["author"].as_str().unwrap_or("Unknown").to_string(),
        category: meta["category"].as_str().map(|s| s.to_string()),
        tags: meta["tags"].as_array()
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect()),
        icon: meta["icon"].as_str().map(|s| s.to_string()),
        website: meta["website"].as_str().map(|s| s.to_string()),
        supported_domains: meta["supportedDomains"].as_array()
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect()),
        options: parse_script_options(&meta["options"]),
        dir: script_path.parent()
            .and_then(|p| p.file_name())
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
    })
}

// Convert Python dict syntax to JSON
fn python_dict_to_json(python_dict: &str) -> Result<String, String> {
    let mut result = python_dict.to_string();
    
    // Replace Python boolean values
    result = result.replace("True", "true");
    result = result.replace("False", "false");
    result = result.replace("None", "null");
    
    // This is a simple conversion - for production, you'd want a proper Python parser
    // But for our __meta__ use case, this should work fine
    
    Ok(result)
}
