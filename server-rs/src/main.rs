use server_rs::auth::AuthGuard;
use server_rs::content::map::room_id_for;
use server_rs::fleet::{AgonesClient, FleetLifecycle, HeartbeatTask};
use server_rs::net::WsServer;
use server_rs::protocol::SnapshotBuilder;
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, error, info};
use tracing_subscriber::EnvFilter;

/// Fixed-rate simulation timer. After a stall the default behaviour fires every missed
/// tick back to back (snapshots 2 ms apart, then the world lurches); skip them instead.
fn sim_ticker(period: Duration) -> tokio::time::Interval {
    let mut ticker = tokio::time::interval(period);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    ticker
}

/// Ticks per timing report: 10 s at 20 Hz.
const TICK_REPORT_EVERY: usize = 200;

/// Start-to-start interval and wall time of recent ticks, reported at DEBUG so a late
/// timer and a slow tick body can be told apart on a running server.
#[derive(Default)]
struct TickTimings {
    last_start: Option<Instant>,
    interval_us: Vec<u64>,
    work_us: Vec<u64>,
}

impl TickTimings {
    fn record(&mut self, start: Instant, work: Duration) {
        if let Some(prev) = self.last_start.replace(start) {
            self.interval_us.push((start - prev).as_micros() as u64);
        }
        self.work_us.push(work.as_micros() as u64);
        if self.work_us.len() >= TICK_REPORT_EVERY {
            debug!(
                interval_ms = %summarize(&mut self.interval_us),
                work_ms = %summarize(&mut self.work_us),
                "tick timing"
            );
            self.interval_us.clear();
            self.work_us.clear();
        }
    }
}

/// `min/p50/p95/max` of microsecond samples, in milliseconds.
fn summarize(micros: &mut [u64]) -> String {
    if micros.is_empty() {
        return "-".to_string();
    }
    micros.sort_unstable();
    let at = |percent: usize| micros[(micros.len() * percent / 100).min(micros.len() - 1)];
    let ms = |us: u64| us as f64 / 1000.0;
    format!(
        "{:.1}/{:.1}/{:.1}/{:.1}",
        ms(micros[0]),
        ms(at(50)),
        ms(at(95)),
        ms(at(100))
    )
}

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

    // 4. Terrain Sandbox Map (every terrain type as a strip, 2 slow mobs off to the side)
    rooms.insert(
        "map-for-test-terrain".to_string(),
        AtlasSimulation::live(LiveConfig {
            seed: seed.wrapping_add(3),
            arena_width: 1000.0,
            arena_height: 1000.0,
            bot_count: 0,
            mob_count: 2,
            mob_respawn_sec,
            player_respawn_sec,
            map_id: Some("map-for-test-terrain".to_string()),
        }),
    );

    // 5. Large scale-testing map (4000 x 4000)
    rooms.insert(
        "map-for-test-large".to_string(),
        AtlasSimulation::live(LiveConfig {
            seed,
            arena_width: 4000.0,
            arena_height: 4000.0,
            bot_count: 10,
            mob_count: 200,
            mob_respawn_sec,
            player_respawn_sec,
            map_id: Some("map-for-test-large".to_string()),
        }),
    );

    info!(
        "Initialized {} simulation rooms: {:?}",
        rooms.len(),
        rooms.keys().collect::<Vec<_>>()
    );
    let debug_enabled = server_rs::debug::debug_enabled_from_env();
    ws_server.set_debug_enabled(debug_enabled);
    for sim in rooms.values_mut() {
        sim.debug_enabled = debug_enabled;
    }
    info!(
        "Debug controls (/debug/*) {}",
        if debug_enabled { "ENABLED" } else { "disabled" }
    );
    let mut snapshot_builder = SnapshotBuilder::new();

    // 6. 20 Hz simulation tick loop (50ms interval)
    let tick_rate_ms = 50;
    let mut ticker = sim_ticker(Duration::from_millis(tick_rate_ms));

    let mut timings = TickTimings::default();

    info!("Entering 20 Hz simulation tick loop...");

    tokio::select! {
        _ = async {
            loop {
                ticker.tick().await;
                let tick_start = Instant::now();

                let inputs = ws_server.drain_inbound().await;
                let disconnected = ws_server.drain_disconnects_with_rooms().await;

                for request in ws_server.drain_debug().await {
                    let map = if request.map.is_empty() {
                        "map-for-play"
                    } else {
                        request.map.as_str()
                    };
                    let result = match rooms.get_mut(map) {
                        Some(sim) => sim.debug_apply(&request.command, request.player.as_deref()),
                        None => Err(format!("unknown map {map}")),
                    };
                    let _ = request.reply.send(result);
                }

                for (room_id, sim) in rooms.iter_mut() {
                    let room_inputs: Vec<server_rs::net::ClientPacket> = inputs
                        .iter()
                        .filter(|p| room_id_for(&p.room_id) == room_id)
                        .cloned()
                        .collect();

                    let room_disconnects: Vec<String> = disconnected
                        .iter()
                        .filter(|(_, r)| room_id_for(r) == room_id)
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
                timings.record(tick_start, tick_start.elapsed());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarize_reports_min_median_p95_and_max_in_milliseconds() {
        let mut micros: Vec<u64> = (1..=100).rev().map(|n| n * 1000).collect();
        assert_eq!(summarize(&mut micros), "1.0/51.0/96.0/100.0");
        assert_eq!(summarize(&mut [2500]), "2.5/2.5/2.5/2.5");
        assert_eq!(summarize(&mut []), "-");
    }

    #[test]
    fn tick_timings_measure_start_to_start_and_reset_after_a_report() {
        let mut timings = TickTimings::default();
        let start = Instant::now();
        for n in 0..TICK_REPORT_EVERY as u32 - 1 {
            timings.record(
                start + Duration::from_millis(50) * n,
                Duration::from_millis(2),
            );
        }
        assert_eq!(timings.interval_us.last(), Some(&50_000));
        assert_eq!(timings.work_us.len(), TICK_REPORT_EVERY - 1);
        timings.record(start + Duration::from_secs(60), Duration::from_millis(2));
        assert!(timings.interval_us.is_empty() && timings.work_us.is_empty());
    }

    #[tokio::test]
    async fn sim_ticker_does_not_burst_after_a_stall() {
        let period = Duration::from_millis(20);
        let mut ticker = sim_ticker(period);
        ticker.tick().await;
        // Stall for six periods, as an overrunning tick or a starved host would.
        std::thread::sleep(period * 6);
        let resumed = Instant::now();
        for _ in 0..4 {
            ticker.tick().await;
        }
        // One tick is due at once; the next three keep the 20 ms cadence. A bursting
        // timer returns all four immediately.
        assert!(resumed.elapsed() >= period * 2, "{:?}", resumed.elapsed());
    }
}
