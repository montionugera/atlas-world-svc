use server_rs::auth::AuthGuard;
use server_rs::fleet::{AgonesClient, FleetLifecycle, FleetState, HeartbeatTask, MockFleetClient};
use server_rs::net::WsServer;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::http::StatusCode;

#[tokio::test]
async fn test_agones_lifecycle_and_heartbeat() {
    let mock = Arc::new(MockFleetClient::new());
    assert_eq!(mock.state(), FleetState::Init);

    mock.ready().await.unwrap();
    assert_eq!(mock.state(), FleetState::Ready);

    let heartbeat = HeartbeatTask::start(mock.clone(), 1);
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert!(mock.health_count() >= 1);

    heartbeat.stop();
    mock.shutdown().await.unwrap();
    assert_eq!(mock.state(), FleetState::Shutdown);
}

#[tokio::test]
async fn test_websocket_auth_end_to_end() {
    let auth = AuthGuard::new(b"e2e_secret_key_12345".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
    let addr = server.local_addr();

    // 1. Unauthorized client rejected
    let unauthorized_url = format!("ws://{}/ws", addr);
    let connect_res = connect_async(&unauthorized_url).await;
    assert!(
        connect_res.is_err(),
        "Client without token must be rejected"
    );

    // 2. Expired client rejected
    let exp_token = auth.generate_test_token("exp-user", "exp", -10);
    let exp_url = format!("ws://{}/ws?token={}", addr, exp_token);
    let exp_res = connect_async(&exp_url).await;
    assert!(
        exp_res.is_err(),
        "Client with expired token must be rejected"
    );

    // 3. Authorized client accepted
    let valid_token = auth.generate_test_token("valid-user", "valid", 3600);
    let valid_url = format!("ws://{}/ws?token={}", addr, valid_token);
    let (mut client_ws, response) = connect_async(&valid_url)
        .await
        .expect("Authorized client must connect");
    assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);

    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(server.active_connections_count().await, 1);

    // Disconnect
    client_ws.close(None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(server.active_connections_count().await, 0);
}

#[tokio::test]
async fn test_server_boot_time_under_50ms() {
    let start = Instant::now();

    let auth = AuthGuard::new(b"boot_test_secret".to_vec());
    let agones = Arc::new(AgonesClient::new(None, false));
    agones.ready().await.unwrap();
    let _heartbeat = HeartbeatTask::start(agones.clone(), 2);
    let server = WsServer::bind("127.0.0.1:0", auth).await.unwrap();

    let boot_duration = start.elapsed();
    assert!(
        boot_duration < Duration::from_millis(50),
        "Server boot time must be < 50ms, was {:?}",
        boot_duration
    );
    assert_eq!(server.active_connections_count().await, 0);
}
