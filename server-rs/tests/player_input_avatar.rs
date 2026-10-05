use futures_util::{SinkExt, StreamExt};
use server_rs::auth::AuthGuard;
use server_rs::net::WsServer;
use server_rs::protocol::{
    deserialize_client_input, root_as_world_snapshot, serialize_client_input, EntitySnapshotData,
    EntityType, SnapshotBuilder,
};
use server_rs::simulation::AtlasSimulation;
use std::sync::Arc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn test_player_avatar_input_pipeline_and_broadcast() {
    let auth_guard = AuthGuard::new(b"test-secret-key-32-bytes-long!!".to_vec());
    let token = auth_guard.generate_test_token("user-hero-77", "Hero", 3600);

    let ws_server = Arc::new(
        WsServer::bind("127.0.0.1:0", auth_guard.clone())
            .await
            .expect("bind ws server"),
    );
    let addr = ws_server.local_addr();
    let ws_url = format!("ws://{}/ws?token={}", addr, token);

    // Connect client
    let (mut ws_client, _resp) = connect_async(&ws_url)
        .await
        .expect("successful websocket connection");

    // Initialize simulation
    let mut sim = AtlasSimulation::new(0x42, 800.0, 800.0);
    let mut snapshot_builder = SnapshotBuilder::new();

    // Client sends ClientInput moving diagonally: (move_x=0.8, move_y=0.6)
    let input_bytes = serialize_client_input(10, 0.8, 0.6, true, 1, 42);
    ws_client
        .send(Message::Binary(input_bytes.into()))
        .await
        .expect("send input message");

    // Allow packet to reach inbound channel
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // Server tick: drain inputs and step
    let packets = ws_server.drain_inbound().await;
    assert_eq!(packets.len(), 1);
    assert_eq!(packets[0].session_id, "user-hero-77");

    let client_input = deserialize_client_input(&packets[0].payload).expect("valid input");
    sim.apply_player_input(&packets[0].session_id, &client_input);

    // Step simulation 2 ticks (100ms total, at speed 150.0)
    sim.step();
    sim.step();

    // Capture snapshot
    let trace_snap = sim.capture_snapshot(2);
    let hero = trace_snap
        .entities
        .iter()
        .find(|e| e.id == "user-hero-77")
        .expect("hero entity present in simulation");

    // (0.8, 0.6) has length 1.0, so vx ~ 120, vy ~ 90
    assert!((hero.vx - 120.0).abs() < 2.0);
    assert!((hero.vy - 90.0).abs() < 2.0);

    // Center was (400, 400). Over 0.1s: dx = 12, dy = 9 => (412, 409)
    assert!((hero.x - 412.0).abs() < 1.0);
    assert!((hero.y - 409.0).abs() < 1.0);

    // Broadcast snapshot to client
    let entities = vec![EntitySnapshotData {
        id: 77,
        entity_type: EntityType::Player,
        x: hero.x,
        y: hero.y,
        vx: hero.vx,
        vy: hero.vy,
        health: 100.0,
        max_health: 100.0,
        state_flags: 1,
        target_id: 42,
    }];
    let snapshot_bytes = snapshot_builder.build_snapshot(2, 100, &entities, &[]);
    ws_server.broadcast_snapshot(snapshot_bytes).await;

    // Client receives broadcast frame
    let msg = ws_client
        .next()
        .await
        .expect("stream item")
        .expect("valid message");
    if let Message::Binary(bin) = msg {
        let decoded = root_as_world_snapshot(&bin).expect("valid world snapshot");
        assert_eq!(decoded.tick(), 2);
        let entities = decoded.entities().expect("entities vector");
        assert_eq!(entities.len(), 1);
        let player = entities.get(0);
        assert_eq!(player.id(), 77);
        assert!((player.pos().unwrap().x() - 412.0).abs() < 1.0);
        assert!((player.pos().unwrap().y() - 409.0).abs() < 1.0);
        assert_eq!(player.target_id(), 42);
    } else {
        panic!("expected binary message");
    }

    let _ = ws_client.close(None).await;
}
