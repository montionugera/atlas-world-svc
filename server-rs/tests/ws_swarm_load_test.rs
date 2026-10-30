//! Integration test for real-socket 50-client headless WebSocket load harness.

use server_rs::auth::AuthGuard;
use server_rs::net::WsServer;
use server_rs::protocol::SnapshotBuilder;
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use server_rs::ws_swarm::{run_swarm, SwarmConfig};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::watch;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_ws_swarm_50_clients_real_socket_load() {
    let auth = AuthGuard::new(b"ws-swarm-load-test-secret-key-32b".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth)
        .await
        .expect("Failed to bind WsServer")
        .with_max_players_per_room(100);
    let addr = server.local_addr();

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    // Boot 20 Hz simulation & snapshot broadcast loop
    let server_ref = Arc::new(server);
    let server_tick = server_ref.clone();

    let sim_handle = tokio::spawn(async move {
        let mut sim = AtlasSimulation::live(LiveConfig {
            seed: 0x50c0,
            arena_width: 2000.0,
            arena_height: 2000.0,
            bot_count: 5,
            mob_count: 20,
            mob_respawn_sec: 5.0,
            player_respawn_sec: 5.0,
            map_id: Some("map-for-play".to_string()),
        });
        let mut builder = SnapshotBuilder::new();
        let mut ticker = tokio::time::interval(Duration::from_millis(50));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        while !*shutdown_rx.borrow() {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        break;
                    }
                }
                _ = ticker.tick() => {
                    let tick_start = std::time::Instant::now();
                    let inputs = server_tick.drain_inbound().await;
                    let disconnects = server_tick.drain_disconnects().await;
                    let frame = sim.live_tick(&inputs, &disconnects);
                    server_tick.record_tick_metrics(tick_start.elapsed(), frame.entities.len());

                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(frame.sim_time_ms);

                    let bytes = builder.build_frame(
                        frame.tick,
                        now_ms,
                        &frame.entities,
                        &frame.removed_ids,
                        &frame.events,
                    );
                    server_tick.broadcast_snapshot(bytes).await;
                }
            }
        }
    });

    let config = SwarmConfig {
        addr: addr.to_string(),
        clients: 50,
        duration: Duration::from_secs(5),
        input_hz: 20,
    };

    let report = run_swarm(config).await;

    // Report numbers printed in test output
    println!(
        "\n=== WS SWARM LOAD TEST REPORT ===\n{}",
        report.to_markdown_table()
    );

    // Stop tick loop
    let _ = shutdown_tx.send(true);
    let _ = sim_handle.await;

    // Acceptance criteria assertions:
    // 50 clients connected, 0 failed, p95 gap < 150ms, every client received snapshots
    assert_eq!(report.clients_connected, 50, "All 50 clients must connect");
    assert_eq!(report.clients_failed, 0, "Zero client connection failures");
    assert!(
        report.snapshots_received >= 50 * 20,
        "Every client received snapshots (total snapshots = {})",
        report.snapshots_received
    );
    assert!(
        report.p95_ms > 0.0 && report.p95_ms < 150.0,
        "p95 inter-snapshot gap must be < 150ms (got {:.2}ms)",
        report.p95_ms
    );
    assert!(
        report.bytes_per_client_per_sec > 0.0,
        "bytes_per_client_per_sec must be positive"
    );
}
