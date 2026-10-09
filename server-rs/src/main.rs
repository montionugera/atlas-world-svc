use server_rs::auth::AuthGuard;
use server_rs::fleet::{AgonesClient, FleetLifecycle, HeartbeatTask};
use server_rs::net::WsServer;
use server_rs::protocol::SnapshotBuilder;
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info};
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

    // 5. Simulation initialization — initialize rooms for play and test maps
    let mob_respawn_sec = env_f32("MOB_RESPAWN_MS", 5000.0) / 1000.0;
    let player_respawn_sec = env_f32("PLAYER_RESPAWN_MS", 5000.0) / 1000.0;

    let mut rooms: std::collections::HashMap<String, AtlasSimulation> =
        std::collections::HashMap::new();

    // 1. Primary Play World
    let play_map_id = std::env::var("MAP_ID").unwrap_or_else(|_| "map-for-play".to_string());
    rooms.insert(
        "map-for-play".to_string(),
        AtlasSimulation::live(LiveConfig {
            seed,
            arena_width,
            arena_height,
            bot_count: player_count,
            mob_count,
            mob_respawn_sec,
            player_respawn_sec,
            map_id: Some(play_map_id),
        }),
    );

    // 2. Projectile Testing Map (6 spear-throwers in cluster)
    rooms.insert(
        "map-for-test-projectile".to_string(),
        AtlasSimulation::live(LiveConfig {
            seed: seed.wrapping_add(1),
            arena_width: 1000.0,
            arena_height: 1000.0,
            bot_count: 0,
            mob_count: 6,
            mob_respawn_sec,
            player_respawn_sec,
            map_id: Some("map-for-test-projectile".to_string()),
        }),
    );

    // 3. Deflect / Parry Testing Map (100x100 arena, 1 spear-thrower mob)
    rooms.insert(
        "map-for-test-deflect".to_string(),
        AtlasSimulation::live(LiveConfig {
            seed: seed.wrapping_add(2),
            arena_width: 100.0,
            arena_height: 100.0,
            bot_count: 0,
            mob_count: 1,
            mob_respawn_sec,
            player_respawn_sec,
            map_id: Some("map-for-test-deflect".to_string()),
        }),
    );

    info!(
        "Initialized {} simulation rooms: {:?}",
        rooms.len(),
        rooms.keys().collect::<Vec<_>>()
    );
    let mut snapshot_builder = SnapshotBuilder::new();

    // 6. 20 Hz simulation tick loop (50ms interval)
    let tick_rate_ms = 50;
    let mut ticker = tokio::time::interval(Duration::from_millis(tick_rate_ms));

    info!("Entering 20 Hz simulation tick loop...");

    tokio::select! {
        _ = async {
            loop {
                ticker.tick().await;

                let inputs = ws_server.drain_inbound().await;
                let disconnected = ws_server.drain_disconnects_with_rooms().await;

                for (room_id, sim) in rooms.iter_mut() {
                    let room_inputs: Vec<server_rs::net::ClientPacket> = inputs
                        .iter()
                        .filter(|p| {
                            if room_id == "map-for-play" {
                                p.room_id == "map-for-play"
                                    || p.room_id.is_empty()
                                    || (p.room_id != "map-for-test-projectile"
                                        && p.room_id != "map-for-test-deflect")
                            } else {
                                p.room_id == *room_id
                            }
                        })
                        .cloned()
                        .collect();

                    let room_disconnects: Vec<String> = disconnected
                        .iter()
                        .filter(|(_, r)| {
                            if room_id == "map-for-play" {
                                r == "map-for-play"
                                    || r.is_empty()
                                    || (r != "map-for-test-projectile"
                                        && r != "map-for-test-deflect")
                            } else {
                                r == room_id
                            }
                        })
                        .map(|(s, _)| s.clone())
                        .collect();

                    let frame = sim.live_tick(&room_inputs, &room_disconnects);

                    for (user_id, event) in &frame.match_events {
                        debug!(user_id = %user_id, room = %room_id, event = ?event, "match event");
                    }

                    if ws_server.active_connections_in_room(room_id).await > 0 {
                        let epoch_ms = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(frame.sim_time_ms);
                        let snapshot_bytes = snapshot_builder.build_frame(
                            frame.tick,
                            epoch_ms,
                            &frame.entities,
                            &frame.removed_ids,
                            &frame.events,
                        );
                        ws_server.broadcast_snapshot_to_room(room_id, snapshot_bytes).await;
                    }
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
