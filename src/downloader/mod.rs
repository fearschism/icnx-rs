use anyhow::{Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

use crate::core::model::DownloadItem;
use crate::data::Settings;

// expose the session DB helper
pub mod session_db;
use crate::downloader::session_db::SessionDb;

#[derive(Debug, Clone)]
pub enum DownloadStatus {
    Queued,
    Running {
        progress: f32,
        downloaded: u64,
        total: Option<u64>,
        speed: f64, // bytes per second
        eta: Option<Duration>,
    },
    Completed { size: u64, path: PathBuf },
    Failed(String),
    Canceled,
}

#[derive(Debug, Clone)]
pub struct QueueItem {
    pub id: String,
    pub item: DownloadItem,
    pub dir: PathBuf,
}

#[derive(Clone)]
pub struct Downloader {
    client: Client,
    semaphore: Arc<Semaphore>,
    cancel_token: CancellationToken,
}

// Global registry of session cancellation tokens
static GLOBAL_SESSION_TOKENS: OnceLock<std::sync::Mutex<HashMap<String, CancellationToken>>> = OnceLock::new();

fn global_tokens() -> std::sync::MutexGuard<'static, HashMap<String, CancellationToken>> {
    GLOBAL_SESSION_TOKENS.get_or_init(|| std::sync::Mutex::new(HashMap::new())).lock().unwrap()
}

// Global registry of session pause flags
static GLOBAL_PAUSE_FLAGS: OnceLock<std::sync::Mutex<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>> = OnceLock::new();

/// Set or clear the paused state for a session. Returns true if session exists or was created.
pub fn set_session_paused(session_id: &str, paused: bool) {
    let m = GLOBAL_PAUSE_FLAGS.get_or_init(|| std::sync::Mutex::new(HashMap::new()));
    let mut map = m.lock().unwrap();
    let flag = map.entry(session_id.to_string()).or_insert_with(|| Arc::new(std::sync::atomic::AtomicBool::new(false))).clone();
    flag.store(paused, std::sync::atomic::Ordering::SeqCst);
    eprintln!("ICNX: set_session_paused({}, {})", session_id, paused);
}

/// Returns whether the session is currently paused
pub fn is_session_paused(session_id: &str) -> bool {
    if let Some(m) = GLOBAL_PAUSE_FLAGS.get() {
        let map = m.lock().unwrap();
        if let Some(flag) = map.get(session_id) {
            let v = flag.load(std::sync::atomic::Ordering::SeqCst);
            eprintln!("ICNX: is_session_paused({}, {})", session_id, v);
            return v;
        }
    }
    false
}

/// Remove pause flag entry for a session
pub fn remove_session_pause_flag(session_id: &str) {
    if let Some(m) = GLOBAL_PAUSE_FLAGS.get() {
        let mut map = m.lock().unwrap();
        map.remove(session_id);
    }
}

impl Downloader {
    pub fn new(settings: &Settings) -> Self {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(settings.user_agent.clone())
            .build()
            .expect("client");
        let maxc = std::cmp::max(1, settings.max_concurrent);
        Self {
            client,
            semaphore: Arc::new(Semaphore::new(maxc)),
            cancel_token: CancellationToken::new(),
        }
    }

    pub fn with_concurrency(settings: &Settings, concurrency: usize) -> Self {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(settings.user_agent.clone())
            .build()
            .expect("client");
        let concurrency = std::cmp::max(1, concurrency);
        Self {
            client,
            semaphore: Arc::new(Semaphore::new(concurrency)),
            cancel_token: CancellationToken::new(),
        }
    }

    pub fn cancel_all(&self) {
        self.cancel_token.cancel();
    }

    /// Download an item while emitting `download_progress` events to the provided AppHandle (if any).
    pub async fn download_with_progress(&self, app: Option<tauri::AppHandle>, q: QueueItem, retries: u32, backoff_ms: u64, session_id: Option<String>, cancel_token: CancellationToken) -> DownloadStatus {
        // Acquire semaphore permit to respect concurrency limits
        let _permit = match self.semaphore.acquire().await {
            Ok(p) => {
                // Log permit acquisition for diagnostics
                eprintln!("ICNX: acquired permit for {}", q.item.url);
                p
            }
            Err(_) => return DownloadStatus::Failed("semaphore closed".into()),
        };

        let mut attempt = 0u32;
        loop {
            // Respect external cancellation
            if cancel_token.is_cancelled() {
                let _ = emit_progress(&app, &q, 0.0, 0, None, 0.0, None, "cancelled", Some("cancelled by user".to_string()), session_id.as_deref());
                return DownloadStatus::Canceled;
            }

            match self.download_once_with_emit(&app, &q, session_id.clone(), &cancel_token).await {
                Ok(status) => return status,
                Err(e) => {
                    attempt += 1;
                    if attempt > retries {
                        let _ = emit_progress(&app, &q, 0.0, 0, None, 0.0, None, "failed", Some(e.to_string()), session_id.as_deref());
                        return DownloadStatus::Failed(e.to_string());
                    }
                    tokio::time::sleep(Duration::from_millis(backoff_ms * attempt as u64)).await;
                }
            }
        }
    }

    async fn download_once(&self, q: &QueueItem) -> Result<DownloadStatus> {
        tokio::fs::create_dir_all(&q.dir).await.ok();

        let mut req = self.client.get(&q.item.url);
        for (k, v) in &q.item.headers {
            req = req.header(k, v);
        }
        let resp = req.send().await.context("request failed")?;
        if !resp.status().is_success() {
            return Err(anyhow::anyhow!("HTTP {}", resp.status()));
        }
        // Filename
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let type_str = q.item.r#type.as_deref().unwrap_or("");
        let fallback_mime = mime_guess::from_ext(type_str).first_or_octet_stream();
        let fallback_ext_owned = fallback_mime
            .essence_str()
            .split('/')
            .nth(1)
            .unwrap_or("bin")
            .to_string();

        // Extract extension from Content-Type header
        let ct_ext_owned = if content_type.contains("jpeg") || content_type.contains("jpg") {
            "jpg".to_string()
        } else if content_type.contains("png") {
            "png".to_string()
        } else if content_type.contains("gif") {
            "gif".to_string()
        } else if content_type.contains("webp") {
            "webp".to_string()
        } else if content_type.contains("mp4") {
            "mp4".to_string()
        } else if content_type.contains("webm") {
            "webm".to_string()
        } else if content_type.contains("pdf") {
            "pdf".to_string()
        } else if content_type.contains("zip") {
            "zip".to_string()
        } else if content_type.contains("json") {
            "json".to_string()
        } else if content_type.contains("text") {
            "txt".to_string()
        } else {
            fallback_ext_owned
        };

        let filename = q.item.filename.clone().unwrap_or_else(|| {
            // Try to get filename from URL
            let url_filename = q.item.url
                .split('/')
                .last()
                .unwrap_or("download")
                .split('?')
                .next()
                .unwrap_or("download");
            
            if url_filename.contains('.') && !url_filename.ends_with('.') {
                url_filename.to_string()
            } else {
                format!("{}.{}", url_filename.trim_end_matches('.'), ct_ext_owned)
            }
        });

        let path = q.dir.join(filename);
        let mut file = tokio::fs::File::create(&path).await?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk?;
            downloaded += bytes.len() as u64;
            file.write_all(&bytes).await?;
        }
        file.flush().await?;
        Ok(DownloadStatus::Completed { size: downloaded, path })
    }

    async fn download_once_with_emit(&self, app: &Option<tauri::AppHandle>, q: &QueueItem, session_id: Option<String>, cancel_token: &CancellationToken) -> Result<DownloadStatus, anyhow::Error> {
        tokio::fs::create_dir_all(&q.dir).await.ok();

        let mut req = self.client.get(&q.item.url);
        for (k, v) in &q.item.headers {
            req = req.header(k, v);
        }
        let resp = req.send().await.context("request failed")?;
        // Inform frontend that we received an HTTP response for this item
        if let Some(a) = app.as_ref() {
            let _ = a.emit_all("download_item_response", &json!({
                "url": q.item.url,
                "status": resp.status().as_u16(),
                "content_length": resp.headers().get(reqwest::header::CONTENT_LENGTH).and_then(|h| h.to_str().ok()).and_then(|s| s.parse::<u64>().ok())
            }));
        }
        if !resp.status().is_success() {
            return Err(anyhow::anyhow!("HTTP {}", resp.status()));
        }

        let total_size = resp
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok());

        // Determine filename
        let filename = q.item.filename.clone().unwrap_or_else(|| {
            let url_filename = q.item.url
                .split('/')
                .last()
                .unwrap_or("download")
                .split('?')
                .next()
                .unwrap_or("download");
            if url_filename.contains('.') && !url_filename.ends_with('.') {
                url_filename.to_string()
            } else {
                // fallback ext
                let content_type = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|h| h.to_str().ok())
                    .unwrap_or("");
                let ext = if content_type.contains("json") { "json" } else { "bin" };
                format!("{}.{}", url_filename.trim_end_matches('.'), ext)
            }
        });

        let path = q.dir.join(&filename);
        let mut file = tokio::fs::File::create(&path).await?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;
        let start = Instant::now();

        loop {
            // Check cancellation frequently before reading more bytes
            if cancel_token.is_cancelled() {
                // emit cancelled
                let _ = emit_progress(app, q, (downloaded as f32) / (total_size.unwrap_or(1) as f32), downloaded, total_size, 0.0, None, "cancelled", Some("cancelled by user".to_string()), session_id.as_deref());
                // try to cleanup partial file
                let _ = tokio::fs::remove_file(&path).await;
                return Ok(DownloadStatus::Canceled);
            }

            // Respect session pause flag if provided — check BEFORE consuming the next chunk so we don't keep reading from the network while paused
            if let Some(sid) = session_id.as_deref() {
                if is_session_paused(sid) {
                    // emit paused status occasionally and a per-item paused event so UI can reflect paused rows
                    let _ = emit_progress(app, q, (downloaded as f32) / (total_size.unwrap_or(1) as f32), downloaded, total_size, 0.0, None, "paused", None, session_id.as_deref());
                    if let Some(a) = app.as_ref() {
                        let _ = a.emit_all("download_item_paused", &json!({ "url": q.item.url, "session_id": sid }));
                    }
                    // sleep briefly and re-check without consuming the stream
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    continue;
                }
            }

            match stream.next().await {
                Some(chunk) => {
                    let bytes = chunk?;
                    downloaded += bytes.len() as u64;
                    file.write_all(&bytes).await?;

                    // Emit progress event
                    let elapsed = start.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };
                    let progress_ratio = match total_size { Some(t) if t > 0 => (downloaded as f32) / (t as f32), _ => 0.0 };
                    let eta = match (total_size, speed) { (Some(t), s) if s > 0.0 && downloaded < t => Some(((t - downloaded) as f64 / s) as u64), _ => None };
                    let _ = emit_progress(app, q, progress_ratio, downloaded, total_size, speed, eta, "downloading", None, session_id.as_deref());
                    // If we were previously paused, emit a resumed event for this item so UI can clear paused indicator
                    if let Some(sid) = session_id.as_deref() {
                        if let Some(a) = app.as_ref() {
                            let _ = a.emit_all("download_item_resumed", &json!({ "url": q.item.url, "session_id": sid }));
                        }
                    }
                }
                None => break,
            }
        }

        file.flush().await?;

        // Finalize
        let elapsed = start.elapsed().as_secs_f64();
        let final_speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };

        // Verify size
        if let Some(expected) = total_size {
            if downloaded != expected {
                return Err(anyhow::anyhow!("Incomplete download: expected {} bytes, got {} bytes", expected, downloaded));
            }
        }

        // Emit completed
        let _ = emit_progress(app, q, 1.0, downloaded, total_size, final_speed, None, "completed", None, session_id.as_deref());
        if let Some(a) = app.as_ref() {
            let _ = a.emit_all("download_item_completed", &json!({ "url": q.item.url, "size": downloaded }));
        }
        Ok(DownloadStatus::Completed { size: downloaded, path })
    }

    pub async fn download(&self, q: QueueItem, retries: u32, backoff_ms: u64) -> DownloadStatus {
        // Compatibility wrapper for callers that expect a simple download API.
        let cancel_token = CancellationToken::new();
        // no app handle provided, pass None
        self.download_with_progress(None, q, retries, backoff_ms, None, cancel_token).await
    }
}

fn emit_progress(app: &Option<tauri::AppHandle>, q: &QueueItem, progress: f32, downloaded: u64, total: Option<u64>, speed: f64, eta: Option<u64>, status: &str, error: Option<String>, session_id: Option<&str>) -> Result<(), ()> {
    if let Some(a) = app.as_ref() {
         let filename = q.item.filename.clone().unwrap_or_else(|| {
             q.item.url.split('/').last().unwrap_or("download").to_string()
         });
         let payload = json!({
             "progress": progress,
             "downloaded": downloaded,
             "total": total,
             "speed": speed,
             "eta": eta,
             "status": status,
             "url": q.item.url,
             "filename": filename,
             "error": error
         });
         let _ = a.emit_all("download_progress", &payload);
    }

    // Persist to per-session SQLite DB if session id present using background writer
    if let Some(sid) = session_id {
        // derive db path: prefer application data dir when available, fall back to <dest>/.icnx
        let db_path = if let Some(a) = app.as_ref() {
            if let Some(data_dir) = a.path_resolver().app_data_dir() {
                let mut p = data_dir;
                p.push(".icnx");
                p.push(format!("session-{}.db", sid));
                p
            } else {
                let mut p = q.dir.clone();
                p.push(".icnx");
                p.push(format!("session-{}.db", sid));
                p
            }
        } else {
            let mut p = q.dir.clone();
            p.push(".icnx");
            p.push(format!("session-{}.db", sid));
            p
        };

        let url = q.item.url.clone();
        let filename = q.item.filename.clone().unwrap_or_else(|| url.split('/').last().unwrap_or("download").to_string());
        let progress_val = progress;
        let downloaded_val = downloaded;
        let total_val = total;
        let speed_val = speed;
        let eta_val = eta;
        let status_str = status.to_string();

        // Log enqueue
        eprintln!("ICNX: enqueue session db write: {} -> {} (progress={:.3})", db_path.display(), url, progress_val);

        // enqueue to background writer (non-blocking)
        crate::downloader::session_db::enqueue_progress(db_path.clone(), url.clone(), filename.clone(), progress_val, downloaded_val, total_val, speed_val, eta_val, status_str.clone());

        // Also enqueue a history record for completed/failed/cancelled states
        if status == "completed" || status == "failed" || status == "cancelled" {
            // prefer app_data history DB
            let history_db = if let Some(a) = app.as_ref() {
                if let Some(mut p) = a.path_resolver().app_data_dir() { p.push(".icnx"); p.push("history.db"); p } else { let mut p = q.dir.clone(); p.push(".icnx"); p.push("history.db"); p }
            } else { let mut p = q.dir.clone(); p.push(".icnx"); p.push("history.db"); p };

            let id = uuid::Uuid::new_v4().to_string();
            let sid_str = session_id.map(|s| s.to_string()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let dir_str = q.dir.to_string_lossy().to_string();
            let size_opt = if status == "completed" { Some(downloaded_val) } else { None };
            // file_type & script_name & source_url are not available here - pass None for optional fields
            crate::downloader::session_db::enqueue_history_record(history_db, id, sid_str, q.item.url.clone(), filename.clone(), dir_str, size_opt, status.to_string(), q.item.r#type.clone(), None, None, chrono::Utc::now().timestamp());
        }
    }

    Ok(())
}

/// Register a session cancellation token so it can be cancelled externally.
pub fn register_session_token(session_id: &str, token: CancellationToken) {
    let mut g = GLOBAL_SESSION_TOKENS.get_or_init(|| std::sync::Mutex::new(HashMap::new())).lock().unwrap();
    g.insert(session_id.to_string(), token);
}

/// Unregister a previously registered session token.
pub fn unregister_session_token(session_id: &str) {
    if let Some(m) = GLOBAL_SESSION_TOKENS.get() {
        let mut g = m.lock().unwrap();
        g.remove(session_id);
    }
}

/// Check whether a session token is currently registered for the given session id.
pub fn has_session_token(session_id: &str) -> bool {
    if let Some(m) = GLOBAL_SESSION_TOKENS.get() {
        let g = m.lock().unwrap();
        return g.contains_key(session_id);
    }
    false
}

/// Cancel a session by id. Returns true if a token was found and cancelled.
pub fn cancel_session(session_id: &str) -> bool {
    if let Some(m) = GLOBAL_SESSION_TOKENS.get() {
        let mut g = m.lock().unwrap();
        if let Some(tok) = g.remove(session_id) {
            tok.cancel();
            return true;
        }
    }
    false
}


