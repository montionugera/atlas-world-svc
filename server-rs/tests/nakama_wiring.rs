use server_rs::auth::AuthGuard;
use server_rs::net::WsServer;
use server_rs::storage::{LoadoutSnapshot, NakamaClient, PROBE_RETRY_WINDOW};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_tungstenite::connect_async;

#[tokio::test]
async fn probe_retries_twice_then_succeeds() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let attempts = Arc::new(AtomicUsize::new(0));
    let attempts_srv = attempts.clone();

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let mut buf = [0u8; 2048];
            let _ = stream.read(&mut buf).await;
            let n = attempts_srv.fetch_add(1, Ordering::SeqCst);
            if n < 2 {
                let resp = "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let body = r#"{"payload":"{\"ok\":true}"}"#;
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
                break;
            }
        }
    });

    let client = NakamaClient::new(
        format!("http://{addr}"),
        "probe_retry_secret_key".to_string(),
        1000,
        3,
    );
    let res = client.probe().await;
    assert!(
        res.is_ok(),
        "probe() should succeed on 3rd attempt: {res:?}"
    );
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
}

#[tokio::test(start_paused = true)]
async fn probe_retries_for_up_to_60_seconds_before_returning_err() {
    // Grab an unused port and immediately drop the listener so connection attempts fail
    // with ECONNREFUSED, exercising the full 60-second retry window under paused Tokio time.
    let closed_addr = {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap()
    };

    let secret = "never_leak_this_probe_key_60s";
    let client = NakamaClient::new(format!("http://{closed_addr}"), secret.to_string(), 1000, 3);

    let start = tokio::time::Instant::now();
    let res = client.probe().await;
    let elapsed = start.elapsed();

    assert!(res.is_err(), "probe() must fail after retry window");
    let err = res.unwrap_err();
    assert!(
        elapsed >= PROBE_RETRY_WINDOW,
        "expected probe() to retry for at least {:?}, got {:?}",
        PROBE_RETRY_WINDOW,
        elapsed
    );
    assert!(
        !err.contains(secret),
        "probe() error must not leak http_key: {err}"
    );
}

#[tokio::test]
async fn probe_returns_ok_on_200_and_err_on_401_without_leaking_http_key() {
    let secret = "top_secret_http_key_do_not_leak";

    // 1. 200 OK -> Ok(())
    let ok_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let ok_addr = ok_listener.local_addr().unwrap();
    tokio::spawn(async move {
        if let Ok((mut stream, _)) = ok_listener.accept().await {
            let mut buf = [0u8; 2048];
            let _ = stream.read(&mut buf).await;
            let body = r#"{"payload":"{\"ok\":true}"}"#;
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
    });

    let ok_client = NakamaClient::new(format!("http://{ok_addr}"), secret.to_string(), 1000, 0);
    assert_eq!(ok_client.probe().await, Ok(()));

    // 2. 401 Unauthorized on probe() and get_loadout() -> Err without http_key
    let unauth_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let unauth_addr = unauth_listener.local_addr().unwrap();
    tokio::spawn(async move {
        for _ in 0..2 {
            if let Ok((mut stream, _)) = unauth_listener.accept().await {
                let mut buf = [0u8; 2048];
                let _ = stream.read(&mut buf).await;
                let body = r#"{"error":"HTTP key invalid","message":"HTTP key invalid","code":16}"#;
                let resp = format!(
                    "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }
        }
    });

    let unauth_client =
        NakamaClient::new(format!("http://{unauth_addr}"), secret.to_string(), 1000, 0);
    let probe_err = unauth_client.probe().await.unwrap_err();
    assert!(
        probe_err.contains("401"),
        "expected 401 in probe error, got: {probe_err}"
    );
    assert!(
        !probe_err.contains(secret),
        "probe error leaked http_key: {probe_err}"
    );

    let loadout_err = unauth_client
        .get_loadout("00000000-0000-4000-8000-000000000001")
        .await
        .unwrap_err();
    assert!(
        !loadout_err.contains(secret),
        "get_loadout 401 error leaked http_key: {loadout_err}"
    );

    // 3. Network error on get_loadout() (closed port) -> Err without http_key
    let closed_addr = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap()
    };
    let closed_client =
        NakamaClient::new(format!("http://{closed_addr}"), secret.to_string(), 500, 0);
    let net_err = closed_client
        .get_loadout("00000000-0000-4000-8000-000000000001")
        .await
        .unwrap_err();
    assert!(
        !net_err.contains(secret),
        "get_loadout network error leaked http_key: {net_err}"
    );
}

#[tokio::test]
async fn ws_with_nakama_fetches_loadout_for_uuid_and_skips_non_uuid_once() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let nakama_addr = listener.local_addr().unwrap();
    let captured_requests: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let captured_srv = captured_requests.clone();

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let mut raw = Vec::new();
            let mut buf = [0u8; 2048];
            loop {
                match stream.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        raw.extend_from_slice(&buf[..n]);
                        if let Some(hdr_end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                            let head = String::from_utf8_lossy(&raw[..hdr_end]);
                            let content_len = head
                                .lines()
                                .find_map(|line| {
                                    let (k, v) = line.split_once(':')?;
                                    if k.trim().eq_ignore_ascii_case("content-length") {
                                        v.trim().parse::<usize>().ok()
                                    } else {
                                        None
                                    }
                                })
                                .unwrap_or(0);
                            if raw.len() >= hdr_end + 4 + content_len {
                                break;
                            }
                        }
                    }
                }
            }
            captured_srv
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&raw).into_owned());

            let body = serde_json::to_string(&LoadoutSnapshot::default()).unwrap();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
    });

    let http_key = "atlas_test_wiring_key";
    let nakama_client = Arc::new(NakamaClient::new(
        format!("http://{nakama_addr}"),
        http_key.to_string(),
        2000,
        1,
    ));

    let auth = AuthGuard::new(b"wiring_test_secret".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth)
        .await
        .unwrap()
        .with_nakama(nakama_client);
    let ws_addr = server.local_addr();

    // 1. Non-UUID dev tokens must skip the Nakama loadout fetch and log once.
    let (mut non_uuid_1, _) = connect_async(format!(
        "ws://{ws_addr}/ws?token=dev-token:dev-player&proto=1"
    ))
    .await
    .unwrap();
    let (mut non_uuid_2, _) = connect_async(format!(
        "ws://{ws_addr}/ws?token=dev-token:second-non-uuid&proto=1"
    ))
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(80)).await;
    assert_eq!(
        captured_requests.lock().unwrap().len(),
        0,
        "non-UUID dev tokens must not call get_loadout"
    );
    assert_eq!(
        server.non_uuid_skip_log_count(),
        1,
        "non-UUID skip message must be logged exactly once"
    );
    non_uuid_1.close(None).await.unwrap();
    non_uuid_2.close(None).await.unwrap();

    // 2. UUID dev token triggers POST /v2/rpc/get_loadout with userId and http_key.
    let uuid_user = "00000000-0000-4000-8000-000000000099";
    let (mut uuid_ws, _) = connect_async(format!(
        "ws://{ws_addr}/ws?token=dev-token:{uuid_user}&proto=1"
    ))
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    let reqs = captured_requests.lock().unwrap().clone();
    assert_eq!(
        reqs.len(),
        1,
        "expected 1 get_loadout request, got {reqs:?}"
    );
    let req = &reqs[0];
    assert!(
        req.starts_with(&format!(
            "POST /v2/rpc/get_loadout?http_key={http_key}&unwrap HTTP/1.1"
        )),
        "unexpected request line: {req}"
    );
    assert!(
        req.contains(&format!(r#""userId":"{uuid_user}""#)),
        "expected userId in body: {req}"
    );
    uuid_ws.close(None).await.unwrap();
}

#[tokio::test]
async fn ws_accepts_real_nakama_session_token_and_rejects_dev_token_in_strict_mode() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let nakama_addr = listener.local_addr().unwrap();
    let captured_requests: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let captured_srv = captured_requests.clone();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let mut raw = Vec::new();
            let mut buf = [0u8; 2048];
            loop {
                match stream.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        raw.extend_from_slice(&buf[..n]);
                        if let Some(hdr_end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                            let head = String::from_utf8_lossy(&raw[..hdr_end]);
                            let content_len = head
                                .lines()
                                .find_map(|line| {
                                    let (k, v) = line.split_once(':')?;
                                    if k.trim().eq_ignore_ascii_case("content-length") {
                                        v.trim().parse::<usize>().ok()
                                    } else {
                                        None
                                    }
                                })
                                .unwrap_or(0);
                            if raw.len() >= hdr_end + 4 + content_len {
                                break;
                            }
                        }
                    }
                }
            }
            captured_srv
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&raw).into_owned());

            let body = serde_json::to_string(&LoadoutSnapshot::default()).unwrap();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
    });

    let http_key = "atlas_dev_http_key";
    let nakama_client = Arc::new(NakamaClient::new(
        format!("http://{nakama_addr}"),
        http_key.to_string(),
        2000,
        1,
    ));

    let session_key = b"atlas_dev_session_key_change_me_please_32".to_vec();
    let auth = AuthGuard::new_strict(session_key.clone());
    let token_minter = AuthGuard::new_strict(session_key);
    let server = WsServer::bind("127.0.0.1:0", auth)
        .await
        .unwrap()
        .with_nakama(nakama_client);
    let ws_addr = server.local_addr();

    // 1. In strict/release mode, dev-token must be rejected with HTTP 401 Unauthorized.
    let dev_err = connect_async(format!(
        "ws://{ws_addr}/ws?token=dev-token:00000000-0000-4000-8000-000000000001&proto=1"
    ))
    .await
    .expect_err("dev-token must be rejected in strict mode");
    assert!(
        dev_err.to_string().contains("401"),
        "expected HTTP 401 on rejected dev-token, got: {dev_err}"
    );

    // 2. Real Nakama session token (with uid/usn/tid signed by session.encryption_key) connects
    // and triggers get_loadout for the UUID uid.
    let uid = "e560e7e0-6767-4287-bb3c-e89b555659a4";
    let nakama_jwt = token_minter.generate_nakama_token(
        uid,
        "GkLijrIgcc",
        "a7245236-451d-4184-8556-cdd8371014ce",
        7200,
    );
    let (mut ws, _) = connect_async(format!("ws://{ws_addr}/ws?token={nakama_jwt}&proto=1"))
        .await
        .expect("real Nakama session token must be accepted");
    tokio::time::sleep(Duration::from_millis(100)).await;

    let reqs = captured_requests.lock().unwrap().clone();
    assert_eq!(reqs.len(), 1, "expected 1 get_loadout request");
    assert!(
        reqs[0].contains(&format!(r#""userId":"{uid}""#)),
        "expected uid {uid} in get_loadout request body: {}",
        reqs[0]
    );
    ws.close(None).await.unwrap();
}

#[test]
fn server_rs_binary_offline_and_closed_port_startup() {
    let bin = env!("CARGO_BIN_EXE_server-rs");

    let clear_nakama_env = |cmd: &mut Command| {
        for (k, _) in std::env::vars() {
            if k.starts_with("NAKAMA_") {
                cmd.env_remove(k);
            }
        }
    };

    // 1. Neither NAKAMA_URL nor NAKAMA_HTTP_KEY set -> stays up and logs "Nakama not configured".
    let mut child = Command::new(bin);
    clear_nakama_env(&mut child);
    child
        .env("PORT", "0")
        .env("AGONES_ENABLED", "false")
        .env("NO_COLOR", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut running = child.spawn().expect("failed to spawn server-rs");
    let stdout = running.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut saw_not_configured = false;
    let mut saw_listening = false;

    for line in reader.lines().take(20).flatten() {
        if line.contains("Nakama not configured") {
            saw_not_configured = true;
        }
        if line.contains("Entering 20 Hz simulation tick loop")
            || line.contains("WebSocket gateway listening on")
        {
            saw_listening = true;
        }
        if saw_not_configured && saw_listening {
            break;
        }
    }

    assert!(
        running.try_wait().unwrap().is_none(),
        "server-rs should stay up when Nakama is not configured"
    );
    let _ = running.kill();
    let _ = running.wait();
    assert!(
        saw_not_configured,
        "expected 'Nakama not configured' log when variables are unset"
    );

    // 2. NAKAMA_URL pointing at a closed port (with NAKAMA_HTTP_KEY set) -> retries across
    // the startup window, exits non-zero, and prints an error naming Nakama without the key.
    let closed_addr = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap()
    };
    let secret = "binary_closed_port_secret_key";

    let mut failing_cmd = Command::new(bin);
    clear_nakama_env(&mut failing_cmd);
    let start = Instant::now();
    let output = failing_cmd
        .env("PORT", "0")
        .env("AGONES_ENABLED", "false")
        .env("NO_COLOR", "1")
        .env("NAKAMA_URL", format!("http://{closed_addr}"))
        .env("NAKAMA_HTTP_KEY", secret)
        .env("NAKAMA_PROBE_RETRY_SECS", "2")
        .output()
        .expect("failed to execute server-rs with closed NAKAMA_URL");
    let elapsed = start.elapsed();

    assert!(
        !output.status.success(),
        "server-rs must exit non-zero when Nakama probe fails"
    );
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        combined.contains("Nakama"),
        "expected output to name Nakama, got:\n{combined}"
    );
    assert!(
        combined.contains("retrying"),
        "expected output to show startup probe retries, got:\n{combined}"
    );
    assert!(
        elapsed >= Duration::from_secs(1),
        "expected binary to retry for ~60s before exiting, elapsed={elapsed:?}"
    );
    assert!(
        !combined.contains(secret),
        "output must not leak NAKAMA_HTTP_KEY:\n{combined}"
    );
}
