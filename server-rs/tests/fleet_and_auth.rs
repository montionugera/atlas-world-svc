use futures_util::StreamExt;
use server_rs::auth::AuthGuard;
use server_rs::fleet::{AgonesClient, FleetLifecycle, FleetState, HeartbeatTask, MockFleetClient};
use server_rs::net::WsServer;
use server_rs::protocol::{EntitySnapshotData, EntityType, SnapshotBuilder};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn test_agones_lifecycle_transitions() {
    // 1. Initialize MockFleetClient
    let mock = Arc::new(MockFleetClient::new());

    // 2. Verify state is Init
    assert_eq!(mock.state(), FleetState::Init);
    assert_eq!(mock.health_count(), 0);

    // 3. Call ready(), verify state transitions to Ready
    mock.ready().await.expect("ready() failed");
    assert_eq!(mock.state(), FleetState::Ready);

    // 4. Start HeartbeatTask with interval 100ms, sleep 250ms, verify health counter >= 2
    let heartbeat = HeartbeatTask::start_millis(mock.clone(), 100);
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert!(
        mock.health_count() >= 2,
        "Expected health heartbeat counter >= 2, got {}",
        mock.health_count()
    );
    heartbeat.stop();

    // 5. Call allocate(), verify state transitions to Allocated
    mock.allocate().await.expect("allocate() failed");
    assert_eq!(mock.state(), FleetState::Allocated);

    // 6. Call shutdown(), verify state transitions to Shutdown
    mock.shutdown().await.expect("shutdown() failed");
    assert_eq!(mock.state(), FleetState::Shutdown);
}

#[tokio::test]
async fn test_websocket_auth_and_binary_delta_streaming() {
    // Spin up WsServer with test AuthGuard on ephemeral port
    let auth = AuthGuard::new(b"e2e_integration_secret_key_12345".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth.clone())
        .await
        .expect("WsServer bind failed");
    let addr = server.local_addr();

    // 1. Connection without token -> fails handshake / rejected
    let unauthorized_url = format!("ws://{}/ws", addr);
    let unauthorized_res = connect_async(&unauthorized_url).await;
    assert!(
        unauthorized_res.is_err(),
        "Connection without token must fail handshake"
    );

    // 2. Connection with expired token -> fails handshake / rejected
    let expired_token = auth.generate_test_token("expired-sub", "old_player", -10);
    let expired_url = format!("ws://{}/ws?token={}", addr, expired_token);
    let expired_res = connect_async(&expired_url).await;
    assert!(
        expired_res.is_err(),
        "Connection with expired token must fail handshake"
    );

    // 3. Connection with valid token -> successfully connects
    let valid_token = auth.generate_test_token("player-omega-1", "Omega", 3600);
    let valid_url = format!("ws://{}/ws?token={}", addr, valid_token);
    let (mut client_ws, response) = connect_async(&valid_url)
        .await
        .expect("Connection with valid token must succeed");
    assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);

    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(server.active_connections_count().await, 1);

    // 4. Server broadcasts binary FlatBuffers snapshot -> client receives identical binary frame
    let mut builder = SnapshotBuilder::new();
    let entity = EntitySnapshotData {
        id: 42,
        entity_type: EntityType::Player,
        x: 128.5,
        y: 256.25,
        vx: 1.5,
        vy: -2.0,
        health: 85.0,
        max_health: 100.0,
        state_flags: 1,
        target_id: 0,
    };
    let snapshot_bytes = builder.build_snapshot(1, 50, &[entity], &[]);
    server.broadcast_snapshot(snapshot_bytes).await;

    let received = tokio::time::timeout(Duration::from_secs(1), client_ws.next())
        .await
        .expect("Timeout waiting for broadcast snapshot")
        .expect("Stream should yield a message")
        .expect("Message read failed");

    match received {
        Message::Binary(bin) => {
            assert_eq!(
                bin.as_ref(),
                snapshot_bytes,
                "Received binary frame must match broadcast snapshot bit-for-bit"
            );
        }
        other => panic!("Expected Message::Binary, received {:?}", other),
    }

    // Clean disconnect
    client_ws.close(None).await.expect("Client close failed");
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(server.active_connections_count().await, 0);
}

#[tokio::test]
async fn test_cold_boot_latency_under_50ms() {
    // Measure time from process startup initialization to ready() + listening on socket
    let start = Instant::now();

    let auth = AuthGuard::new(b"cold_boot_perf_test_key".to_vec());
    let agones = Arc::new(AgonesClient::new(None, false));
    agones.ready().await.expect("Agones ready failed");
    let _heartbeat = HeartbeatTask::start(agones.clone(), 2);
    let server = WsServer::bind("127.0.0.1:0", auth)
        .await
        .expect("WsServer bind failed");

    let boot_elapsed = start.elapsed();
    assert!(
        boot_elapsed < Duration::from_millis(50),
        "Cold boot latency must be < 50ms, elapsed: {:?}",
        boot_elapsed
    );
    assert_eq!(server.active_connections_count().await, 0);
}
