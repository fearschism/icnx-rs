use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::PathBuf;
use chrono::Utc;

#[derive(Debug)]
pub struct SessionDb {
    conn: Connection,
}

impl SessionDb {
    pub fn open(path: PathBuf) -> Result<Self> {
        // Ensure parent directory exists (e.g. <destination>/.icnx)
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", &"WAL")?;
        conn.pragma_update(None, "synchronous", &"NORMAL")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS progress (
                url TEXT PRIMARY KEY,
                filename TEXT,
                progress REAL,
                downloaded INTEGER,
                total INTEGER,
                speed REAL,
                eta INTEGER,
                status TEXT,
                updated_at INTEGER
            );",
        )?;
        Ok(Self { conn })
    }

    pub fn upsert_progress(&self, url: &str, filename: &str, progress: f32, downloaded: u64, total: Option<u64>, speed: f64, eta: Option<u64>, status: &str) -> Result<()> {
        let eta_val: Option<i64> = eta.map(|e| e as i64);
        let total_val: Option<i64> = total.map(|t| t as i64);
        let now = Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO progress(url, filename, progress, downloaded, total, speed, eta, status, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(url) DO UPDATE SET filename=excluded.filename, progress=excluded.progress, downloaded=excluded.downloaded, total=excluded.total, speed=excluded.speed, eta=excluded.eta, status=excluded.status, updated_at=excluded.updated_at;",
            params![url, filename, progress, downloaded as i64, total_val, speed, eta_val, status, now],
        )?;
        Ok(())
    }

    pub fn read_all(&self) -> Result<Vec<serde_json::Value>> {
        let mut stmt = self.conn.prepare("SELECT url, filename, progress, downloaded, total, speed, eta, status, updated_at FROM progress ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |r| {
            let total: Option<i64> = r.get(4)?;
            let eta: Option<i64> = r.get(6)?;
            let v = serde_json::json!({
                "url": r.get::<_, String>(0)?,
                "filename": r.get::<_, String>(1)?,
                "progress": r.get::<_, f64>(2)? as f32,
                "downloaded": r.get::<_, i64>(3)? as u64,
                "total": total.map(|t| t as u64),
                "speed": r.get::<_, f64>(5)?,
                "eta": eta.map(|e| e as u64),
                "status": r.get::<_, String>(7)?,
                "updated_at": r.get::<_, i64>(8)?,
            });
            Ok(v)
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
}

// Background writer: a single dedicated thread owns rusqlite::Connection objects and processes write jobs
use std::sync::OnceLock;
use std::sync::mpsc::{Sender, channel};
use std::collections::HashMap;

#[derive(Debug)]
struct WriteJob {
    db_path: PathBuf,
    url: String,
    filename: String,
    progress: f32,
    downloaded: u64,
    total: Option<u64>,
    speed: f64,
    eta: Option<u64>,
    status: String,
}

static DB_WRITER: OnceLock<Sender<WriteJob>> = OnceLock::new();

fn ensure_db_writer() -> Sender<WriteJob> {
    DB_WRITER.get_or_init(|| {
        let (tx, rx) = channel::<WriteJob>();
        std::thread::spawn(move || {
            let mut conns: HashMap<PathBuf, Connection> = HashMap::new();
            for job in rx {
                // open or reuse connection for job.db_path
                let res: Result<()> = (|| {
                    let conn = conns.entry(job.db_path.clone()).or_insert_with(|| {
                        if let Some(parent) = job.db_path.parent() { std::fs::create_dir_all(parent).ok(); }
                        Connection::open(&job.db_path).expect("open conn")
                    });
                    // ensure pragma and table exist (idempotent)
                    conn.pragma_update(None, "journal_mode", &"WAL")?;
                    conn.pragma_update(None, "synchronous", &"NORMAL")?;
                    conn.execute_batch(
                        "CREATE TABLE IF NOT EXISTS progress (
                            url TEXT PRIMARY KEY,
                            filename TEXT,
                            progress REAL,
                            downloaded INTEGER,
                            total INTEGER,
                            speed REAL,
                            eta INTEGER,
                            status TEXT,
                            updated_at INTEGER
                        );",
                    )?;
                    let eta_val: Option<i64> = job.eta.map(|e| e as i64);
                    let total_val: Option<i64> = job.total.map(|t| t as i64);
                    let now = Utc::now().timestamp();
                    conn.execute(
                        "INSERT INTO progress(url, filename, progress, downloaded, total, speed, eta, status, updated_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
                         ON CONFLICT(url) DO UPDATE SET filename=excluded.filename, progress=excluded.progress, downloaded=excluded.downloaded, total=excluded.total, speed=excluded.speed, eta=excluded.eta, status=excluded.status, updated_at=excluded.updated_at;",
                        params![job.url, job.filename, job.progress, job.downloaded as i64, total_val, job.speed, eta_val, job.status, now],
                    )?;
                    Ok(())
                })();
                if let Err(e) = res {
                    eprintln!("ICNX: session db writer error: {}", e);
                }
            }
        });
        tx
    }).clone()
}

/// Enqueue a progress write to the background DB writer. This is non-blocking and safe to call from async contexts.
pub fn enqueue_progress(db_path: PathBuf, url: String, filename: String, progress: f32, downloaded: u64, total: Option<u64>, speed: f64, eta: Option<u64>, status: String) {
    let tx = ensure_db_writer();
    let job = WriteJob { db_path, url, filename, progress, downloaded, total, speed, eta, status };
    if let Err(e) = tx.send(job) {
        eprintln!("ICNX: failed to enqueue session db write: {}", e);
    }
}

// Scrape DB writer and helpers
use std::sync::mpsc::{Sender as StdSender, channel as std_channel};

#[derive(Debug)]
struct ScrapeJob {
    db_path: PathBuf,
    session_key: String,
    url: String,
    filename: Option<String>,
    title: Option<String>,
    r#type: Option<String>,
    meta: Option<serde_json::Value>,
}

static SCRAPE_WRITER: OnceLock<StdSender<ScrapeJob>> = OnceLock::new();

fn ensure_scrape_writer() -> StdSender<ScrapeJob> {
    SCRAPE_WRITER.get_or_init(|| {
        let (tx, rx) = std_channel::<ScrapeJob>();
        std::thread::spawn(move || {
            let mut conns: HashMap<PathBuf, Connection> = HashMap::new();
            for job in rx {
                let _ = (|| -> Result<()> {
                    let conn = conns.entry(job.db_path.clone()).or_insert_with(|| {
                        if let Some(parent) = job.db_path.parent() { std::fs::create_dir_all(parent).ok(); }
                        Connection::open(&job.db_path).expect("open scrape conn")
                    });
                    conn.pragma_update(None, "journal_mode", &"WAL")?;
                    conn.pragma_update(None, "synchronous", &"NORMAL")?;
                    conn.execute_batch(
                        "CREATE TABLE IF NOT EXISTS scrape (
                            session_key TEXT,
                            url TEXT,
                            filename TEXT,
                            title TEXT,
                            type TEXT,
                            meta TEXT,
                            updated_at INTEGER,
                            PRIMARY KEY(session_key, url)
                        );",
                    )?;
                    let now = Utc::now().timestamp();
                    let meta_str = job.meta.map(|m| serde_json::to_string(&m).unwrap_or_default());
                    conn.execute(
                        "INSERT INTO scrape(session_key, url, filename, title, type, meta, updated_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7)
                         ON CONFLICT(session_key, url) DO UPDATE SET filename=excluded.filename, title=excluded.title, type=excluded.type, meta=excluded.meta, updated_at=excluded.updated_at;",
                         params![job.session_key, job.url, job.filename, job.title, job.r#type, meta_str, now],
                    )?;
                    Ok(())
                })();
            }
        });
        tx
    }).clone()
}

pub fn enqueue_scrape_item(db_path: PathBuf, session_key: String, url: String, filename: Option<String>, title: Option<String>, r#type: Option<String>, meta: Option<serde_json::Value>) {
    let tx = ensure_scrape_writer();
    let job = ScrapeJob { db_path, session_key, url, filename, title, r#type, meta };
    if let Err(e) = tx.send(job) {
        eprintln!("ICNX: failed to enqueue scrape job: {}", e);
    }
}

pub fn read_scrape_items(path: PathBuf, session_key: &str) -> Result<Vec<serde_json::Value>> {
    // Ensure parent exists
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).ok(); }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    conn.pragma_update(None, "synchronous", &"NORMAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS scrape (
            session_key TEXT,
            url TEXT,
            filename TEXT,
            title TEXT,
            type TEXT,
            meta TEXT,
            updated_at INTEGER,
            PRIMARY KEY(session_key, url)
        );",
    )?;
    let mut stmt = conn.prepare("SELECT url, filename, title, type, meta, updated_at FROM scrape WHERE session_key = ?1 ORDER BY updated_at DESC")?;
    let rows = stmt.query_map(params![session_key], |r| {
        let meta_s: Option<String> = r.get(4)?;
        let meta_val = meta_s.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
        let v = serde_json::json!({
            "url": r.get::<_, String>(0)?,
            "filename": r.get::<_, Option<String>>(1)?,
            "title": r.get::<_, Option<String>>(2)?,
            "type": r.get::<_, Option<String>>(3)?,
            "meta": meta_val,
            "updated_at": r.get::<_, i64>(5)?,
        });
        Ok(v)
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

// History DB writer and helpers
#[derive(Debug)]
struct HistoryJob {
    db_path: PathBuf,
    id: String,
    session_id: String,
    url: String,
    filename: String,
    dir: String,
    size: Option<u64>,
    status: String,
    file_type: Option<String>,
    script_name: Option<String>,
    source_url: Option<String>,
    created_at: i64,
}

static HISTORY_WRITER: OnceLock<StdSender<HistoryJob>> = OnceLock::new();

fn ensure_history_writer() -> StdSender<HistoryJob> {
    HISTORY_WRITER.get_or_init(|| {
        let (tx, rx) = std_channel::<HistoryJob>();
        std::thread::spawn(move || {
            let mut conns: HashMap<PathBuf, Connection> = HashMap::new();
            for job in rx {
                let _ = (|| -> Result<()> {
                    let conn = conns.entry(job.db_path.clone()).or_insert_with(|| {
                        if let Some(parent) = job.db_path.parent() { std::fs::create_dir_all(parent).ok(); }
                        Connection::open(&job.db_path).expect("open history conn")
                    });
                    conn.pragma_update(None, "journal_mode", &"WAL")?;
                    conn.pragma_update(None, "synchronous", &"NORMAL")?;
                    conn.execute_batch(
                        "CREATE TABLE IF NOT EXISTS history (
                            id TEXT PRIMARY KEY,
                            session_id TEXT,
                            url TEXT,
                            filename TEXT,
                            dir TEXT,
                            size INTEGER,
                            status TEXT,
                            file_type TEXT,
                            script_name TEXT,
                            source_url TEXT,
                            created_at INTEGER
                        );",
                    )?;

                    let size_val: Option<i64> = job.size.map(|s| s as i64);
                    conn.execute(
                        "INSERT OR REPLACE INTO history(id, session_id, url, filename, dir, size, status, file_type, script_name, source_url, created_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11);",
                        params![job.id, job.session_id, job.url, job.filename, job.dir, size_val, job.status, job.file_type, job.script_name, job.source_url, job.created_at],
                    )?;
                    Ok(())
                })();
            }
        });
        tx
    }).clone()
}

pub fn enqueue_history_record(db_path: PathBuf, id: String, session_id: String, url: String, filename: String, dir: String, size: Option<u64>, status: String, file_type: Option<String>, script_name: Option<String>, source_url: Option<String>, created_at: i64) {
    let tx = ensure_history_writer();
    let job = HistoryJob { db_path, id, session_id, url, filename, dir, size, status, file_type, script_name, source_url, created_at };
    if let Err(e) = tx.send(job) {
        eprintln!("ICNX: failed to enqueue history job: {}", e);
    }
}

pub fn read_history(path: PathBuf) -> Result<Vec<serde_json::Value>> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).ok(); }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    conn.pragma_update(None, "synchronous", &"NORMAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            url TEXT,
            filename TEXT,
            dir TEXT,
            size INTEGER,
            status TEXT,
            file_type TEXT,
            script_name TEXT,
            source_url TEXT,
            created_at INTEGER
        );",
    )?;
    let mut stmt = conn.prepare("SELECT id, session_id, url, filename, dir, size, status, file_type, script_name, source_url, created_at FROM history ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |r| {
        let size: Option<i64> = r.get(5)?;
        let v = serde_json::json!({
            "id": r.get::<_, String>(0)?,
            "session_id": r.get::<_, String>(1)?,
            "url": r.get::<_, String>(2)?,
            "filename": r.get::<_, String>(3)?,
            "dir": r.get::<_, String>(4)?,
            "size": size.map(|s| s as u64),
            "status": r.get::<_, String>(6)?,
            "file_type": r.get::<_, Option<String>>(7)?,
            "script_name": r.get::<_, Option<String>>(8)?,
            "source_url": r.get::<_, Option<String>>(9)?,
            "created_at": r.get::<_, i64>(10)?,
        });
        Ok(v)
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_session_db_upsert_and_read() {
        let td = tempdir().unwrap();
        let icnx_dir = td.path().join(".icnx");
        std::fs::create_dir_all(&icnx_dir).unwrap();
        let db_path = icnx_dir.join("session-test.db");

        // open DB
        let db = SessionDb::open(db_path.clone()).expect("open db");
        db.upsert_progress("https://example.com/a", "a.jpg", 0.5, 512, Some(1024), 100.0, Some(5), "downloading").expect("upsert");
        db.upsert_progress("https://example.com/b", "b.jpg", 1.0, 2048, Some(2048), 200.0, None, "completed").expect("upsert b");

        let rows = db.read_all().expect("read all");
        assert!(rows.len() >= 2);
        // find the entry for a
        let mut found_a = false;
        for r in rows {
            if r["url"] == "https://example.com/a" {
                assert_eq!(r["filename"], "a.jpg");
                found_a = true;
            }
        }
        assert!(found_a);
    }
}
