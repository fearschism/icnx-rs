use std::convert::Infallible;
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};

use hyper::{Body, Request, Response, Server, StatusCode};
use hyper::service::{make_service_fn, service_fn};
use tempfile::tempdir;

use icnx::downloader::{Downloader, QueueItem, DownloadStatus};
use icnx::data::Settings;
use icnx::core::model::DownloadItem;

async fn spawn_test_server() -> String {
    // Shared state for /retry
    let counter = Arc::new(AtomicUsize::new(0));
    let make_svc = make_service_fn(move |_conn| {
        let counter = counter.clone();
        async move {
            Ok::<_, Infallible>(service_fn(move |req: Request<Body>| {
                let counter = counter.clone();
                async move {
                    let path = req.uri().path().to_string();
                    match path.as_str() {
                        "/file" => {
                            let body = vec![b'a'; 1024];
                            Ok::<_, Infallible>(Response::new(Body::from(body)))
                        }
                        "/retry" => {
                            let count = counter.fetch_add(1, Ordering::SeqCst);
                            if count == 0 {
                                let mut res = Response::new(Body::from("server error"));
                                *res.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
                                Ok(res)
                            } else {
                                let body = vec![b'b'; 512];
                                Ok(Response::new(Body::from(body)))
                            }
                        }
                        "/incomplete" => {
                            let body = vec![b'c'; 1024];
                            let mut res = Response::new(Body::from(body));
                            res.headers_mut().insert(hyper::header::CONTENT_LENGTH, hyper::header::HeaderValue::from_static("2048"));
                            Ok(res)
                        }
                        _ => {
                            let mut res = Response::new(Body::from("not found"));
                            *res.status_mut() = StatusCode::NOT_FOUND;
                            Ok(res)
                        }
                    }
                }
            }))
        }
    });

    // Bind to ephemeral port
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("local_addr");
    listener.set_nonblocking(true).expect("nonblocking");
    let server = Server::from_tcp(listener).expect("from_tcp").serve(make_svc);
    tokio::spawn(async move {
        if let Err(e) = server.await {
            eprintln!("test server error: {}", e);
        }
    });
    format!("http://{}", addr)
}

#[tokio::test]
async fn download_basic_success_integration() {
    let base = spawn_test_server().await;
    let url = format!("{}/file", base);

    let dir = tempdir().unwrap();
    let settings = Settings::default();
    let dl = Downloader::with_concurrency(&settings, 2);

    let item = DownloadItem { url, filename: None, title: None, r#type: None, headers: std::collections::HashMap::new() };
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
}

#[tokio::test]
async fn download_retry_success_integration() {
    let base = spawn_test_server().await;
    let url = format!("{}/retry", base);

    let dir = tempdir().unwrap();
    let settings = Settings::default();
    let dl = Downloader::with_concurrency(&settings, 2);

    let item = DownloadItem { url, filename: None, title: None, r#type: None, headers: std::collections::HashMap::new() };
    let q = QueueItem { id: "retry1".to_string(), item, dir: dir.path().to_path_buf() };

    let status = dl.download(q, 1, 10).await;
    match status {
        DownloadStatus::Completed { size, path } => {
            assert_eq!(size, 512);
            let data = tokio::fs::read(path).await.unwrap();
            assert_eq!(data.len(), 512);
        }
        other => panic!("Expected completed after retry, got {:?}", other),
    }
}

#[tokio::test]
async fn download_incomplete_detected_integration() {
    // Create a raw TCP listener that will send a Content-Length header of 2048
    // but only write 1024 bytes then close the socket to simulate an incomplete response.
    use tokio::net::TcpListener;
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind tcp");
    let addr = listener.local_addr().unwrap();

    // Spawn a task that accepts one connection and writes the partial response.
    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            // read request (headers) until double CRLF, but ignore content
            let mut buf = [0u8; 1024];
            let _ = socket.readable().await;
            // try to read and ignore
            let _ = socket.try_read(&mut buf);

            let headers = "HTTP/1.1 200 OK\r\nContent-Length: 2048\r\n\r\n";
            let _ = socket.write_all(headers.as_bytes()).await;
            // send only 1024 bytes then close
            let body = vec![b'c'; 1024];
            let _ = socket.write_all(&body).await;
            // drop socket to close
        }
    });

    let url = format!("http://{}{}", addr, "/incomplete");

    let dir = tempdir().unwrap();
    let settings = Settings::default();
    let dl = Downloader::with_concurrency(&settings, 2);

    let item = DownloadItem { url, filename: None, title: None, r#type: None, headers: std::collections::HashMap::new() };
    let q = QueueItem { id: "inc1".to_string(), item, dir: dir.path().to_path_buf() };

    let status = dl.download(q, 0, 10).await;
    // Allow either a failure (with any message) or a canceled result depending on how the client reports the truncated response.
    match status {
        DownloadStatus::Failed(msg) => {
            eprintln!("download failed as expected: {}", msg);
            assert!(!msg.is_empty());
        }
        DownloadStatus::Canceled => {
            eprintln!("download was canceled (accepted for this simulation)");
        }
        other => panic!("Expected failed or canceled due to incomplete response, got {:?}", other),
    }
}
