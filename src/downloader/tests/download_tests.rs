use httptest::{matchers::*, responders::*, Expectation, Server};
use std::time::Duration;
use tempfile::tempdir;
use tokio::runtime::Runtime;

use crate::downloader::{Downloader, QueueItem, DownloadStatus};
use crate::data::Settings;
use crate::core::model::DownloadItem;

#[test]
fn test_downloader_basic_success() {
    let rt = Runtime::new().unwrap();
    rt.block_on(async {
        // Start test HTTP server
        let server = Server::run();

        // Expect GET /file returning 1KB of 'a'
        let body = vec![b'a'; 1024];
        server.expect(
            Expectation::matching(request::method_path("GET", "/file"))
                .respond_with(status_code(200).body(body.clone()).delay(Duration::from_millis(1)))
        );

        // Create temp dir
        let dir = tempdir().unwrap();
        let settings = Settings::default();
        let dl = Downloader::with_concurrency(&settings, 2);

        let item = DownloadItem { url: server.url_str("/file"), filename: None, title: None, r#type: None, headers: std::collections::HashMap::new() };
        let q = QueueItem { id: "test1".to_string(), item, dir: dir.path().to_path_buf() };

        let status = dl.download(q, 1, 100).await;
        match status {
            DownloadStatus::Completed { size, path } => {
                assert_eq!(size, 1024);
                assert!(path.exists());
                let data = tokio::fs::read(path).await.unwrap();
                assert_eq!(data.len(), 1024);
            }
            other => panic!("Expected completed, got {:?}", other),
        }
    });
}

#[test]
fn test_downloader_retry_success() {
    let rt = Runtime::new().unwrap();
    rt.block_on(async {
        let server = Server::run();
        // First response: 500
        server.expect(
            Expectation::matching(request::method_path("GET", "/retry"))
                .times(1)
                .respond_with(status_code(500).body("server error"))
        );
        // Second response: 200 with 512 bytes
        let body = vec![b'b'; 512];
        server.expect(
            Expectation::matching(request::method_path("GET", "/retry"))
                .times(1)
                .respond_with(status_code(200).body(body.clone()))
        );

        let dir = tempdir().unwrap();
        let settings = Settings::default();
        let dl = Downloader::with_concurrency(&settings, 2);

        let item = DownloadItem { url: server.url_str("/retry"), filename: None, title: None, r#type: None, headers: std::collections::HashMap::new() };
        let q = QueueItem { id: "retry1".to_string(), item, dir: dir.path().to_path_buf() };

        // allow 1 retry (so total attempts = 2)
        let status = dl.download(q, 1, 10).await;
        match status {
            DownloadStatus::Completed { size, path } => {
                assert_eq!(size, 512);
                let data = tokio::fs::read(path).await.unwrap();
                assert_eq!(data.len(), 512);
            }
            other => panic!("Expected completed after retry, got {:?}", other),
        }
    });
}

#[test]
fn test_downloader_incomplete_detected() {
    let rt = Runtime::new().unwrap();
    rt.block_on(async {
        let server = Server::run();
        // Return Content-Length 2048 but only send 1024 bytes
        let body = vec![b'c'; 1024];
        server.expect(
            Expectation::matching(request::method_path("GET", "/incomplete"))
                .respond_with(
                    status_code(200)
                        .append_header("Content-Length", "2048")
                        .body(body.clone())
                )
        );

        let dir = tempdir().unwrap();
        let settings = Settings::default();
        let dl = Downloader::with_concurrency(&settings, 2);

        let item = DownloadItem { url: server.url_str("/incomplete"), filename: None, title: None, r#type: None, headers: std::collections::HashMap::new() };
        let q = QueueItem { id: "inc1".to_string(), item, dir: dir.path().to_path_buf() };

        // no retries so the incomplete download should cause a failure
        let status = dl.download(q, 0, 10).await;
        match status {
            DownloadStatus::Failed(msg) => {
                // should mention incomplete or expected
                assert!(msg.contains("Incomplete") || msg.to_lowercase().contains("expected"));
            }
            other => panic!("Expected failed due to incomplete, got {:?}", other),
        }
    });
}
