use tokio_util::sync::CancellationToken;

use crate::downloader::{set_session_paused, is_session_paused, remove_session_pause_flag, register_session_token, unregister_session_token, cancel_session};

#[tokio::test]
async fn test_pause_flag_lifecycle() {
    let sid = "unit-test-session-1";
    // start paused = true
    set_session_paused(sid, true);
    assert!(is_session_paused(sid));
    // clear
    set_session_paused(sid, false);
    assert!(!is_session_paused(sid));
    // remove flag
    remove_session_pause_flag(sid);
    assert!(!is_session_paused(sid));
}

#[tokio::test]
async fn test_session_token_registry() {
    let sid = "unit-test-session-2";
    let token = CancellationToken::new();
    register_session_token(sid, token.clone());
    // cancel via registry
    let cancelled = cancel_session(sid);
    assert!(cancelled, "expected cancel_session to find and cancel token");
    // subsequent cancel should return false
    let cancelled_again = cancel_session(sid);
    assert!(!cancelled_again, "expected second cancel to return false");
    // register/unregister also should be safe (no panic)
    register_session_token(sid, CancellationToken::new());
    unregister_session_token(sid);
}
