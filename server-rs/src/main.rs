use server_rs::auth::AuthGuard;
use server_rs::fleet::{AgonesClient, FleetLifecycle, HeartbeatTask};
use server_rs::net::WsServer;
use server_rs::protocol::SnapshotBuilder;
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize tracing subscriber
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,server_rs=debug".into()),
        )
        .init();

    info!("Starting Atlas Game Server (server-rs)...");

    // Configuration from environment
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "2567".to_string());
    let bind_addr = format!("{}:{}", host, port);

    let seed: u32 = std::env::var("SIM_SEED")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0x1337c0de);
    let player_count: usize = std::env::var("PLAYER_COUNT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);
    let mob_count: usize = std::env::var("MOB_COUNT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(50);
    let arena_width: f32 = std::env::var("ARENA_WIDTH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1000.0);
    let arena_height: f32 = std::env::var("ARENA_HEIGHT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1000.0);

    // 2. Auth Guard
    let auth_guard = AuthGuard::from_env();

    // 3. Agones lifecycle & heartbeat
    let agones = Arc::new(AgonesClient::from_env());
    if let Err(e) = agones.ready().await {
        error!("Failed to notify Agones Ready: {}", e);
    } else {
        info!("Agones lifecycle marked Ready");
    }
    let heartbeat = HeartbeatTask::start(agones.clone(), 2);
    info!("Agones 2-second heartbeat loop initiated");

    // 4. WebSocket Server
    let ws_server = Arc::new(
        WsServer::bind(&bind_addr, auth_guard)
            .await
            .map_err(std::io::Error::other)?,
    );
    info!("WebSocket gateway listening on {}", ws_server.local_addr());

    // 5. Simulation initialization — `AtlasSimulation::live` is the ONLY constructor the
    // live server may use (the golden-trace harness uses `with_arena`).
    let live_cfg = LiveConfig {
        seed,
        arena_width,
        arena_height,
        bot_count: player_count,
        mob_count,
        mob_respawn_sec: env_f32("MOB_RESPAWN_MS", 5000.0) / 1000.0,
        player_respawn_sec: env_f32("PLAYER_RESPAWN_MS", 5000.0) / 1000.0,
    };
    info!("AtlasSimulation live config: {:?}", live_cfg);
    let mut sim = AtlasSimulation::live(live_cfg);
    let mut snapshot_builder = SnapshotBuilder::new();

    // 6. 20 Hz simulation tick loop (50ms interval)
    let tick_rate_ms = 50;
    let mut ticker = tokio::time::interval(Duration::from_millis(tick_rate_ms));

    info!("Entering 20 Hz simulation tick loop...");

    tokio::select! {
        _ = async {
            loop {
                ticker.tick().await;

                // Inbound first: drain_disconnects re-checks the registry, so a session that
                // reconnects between the two drains is not reported as gone.
                let inputs = ws_server.drain_inbound().await;
                let disconnected = ws_server.drain_disconnects().await;
                let frame = sim.live_tick(&inputs, &disconnected);

                // Broadcast snapshot (incl. removed ids) to active clients
                if ws_server.active_connections_count().await > 0 {
                    let snapshot_bytes = snapshot_builder.build_snapshot(
                        frame.tick,
                        frame.sim_time_ms,
                        &frame.entities,
                        &frame.removed_ids,
                    );
                    ws_server.broadcast_snapshot(snapshot_bytes).await;
                }
            }
        } => {}
        _ = wait_for_shutdown_signal() => {
            info!("Shutdown signal received. Initiating graceful shutdown...");
        }
    }

    // Graceful shutdown sequence
    heartbeat.stop();
    if let Err(e) = agones.shutdown().await {
        error!("Agones shutdown hook error: {}", e);
    } else {
        info!("Agones lifecycle marked Shutdown");
    }

    info!("Server shutdown completed cleanly.");
    Ok(())
}

fn env_f32(key: &str, default: f32) -> f32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = signal(SignalKind::terminate()).expect("Failed to bind SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                info!("Received SIGINT (Ctrl+C)");
            }
            _ = sigterm.recv() => {
                info!("Received SIGTERM");
            }
        }
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to listen for Ctrl+C");
        info!("Received Ctrl+C");
    }
}
