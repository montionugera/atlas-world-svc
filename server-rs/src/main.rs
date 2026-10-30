use server_rs::auth::AuthGuard;
use server_rs::content::world_regions::{resolve_room_or_region_id, GENERATED_REGION_IDS};
use server_rs::fleet::{AgonesClient, FleetLifecycle, HeartbeatTask};
use server_rs::meta::{
    spawn_meta_http_listener, InMemoryMetaStore, MetaDocStore, MetaHttpConfig, PostgresMetaStore,
    RustMetaEngine, SqliteMetaStore,
};
use server_rs::net::WsServer;
use server_rs::protocol::SnapshotBuilder;
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use server_rs::spatial::{
    collect_region_border_ghosts, AuthorityHandoffCoordinator, RegionAdjacencyGraph,
};
use server_rs::storage::{
    CharacterStateBuffer, MatchEventBuffer, NakamaClient, NakamaConfig, NakamaStorage,
};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};
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

fn build_meta_doc_store_from_env() -> Result<Arc<dyn MetaDocStore>, String> {
    if let Some(db_path) = std::env::var("META_DB_PATH")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        if db_path == ":memory:" {
            info!("Initializing SqliteMetaStore (:memory:)");
            let store = SqliteMetaStore::in_memory().map_err(|e| e.to_string())?;
            return Ok(Arc::new(store));
        }
        info!("Initializing SqliteMetaStore at {}", db_path);
        let store = SqliteMetaStore::open(&db_path).map_err(|e| e.to_string())?;
        return Ok(Arc::new(store));
    }

    if let Some(pg_url) = std::env::var("META_POSTGRES_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        info!("Initializing PostgresMetaStore");
        let store = PostgresMetaStore::from_url(&pg_url).map_err(|e| e.to_string())?;
        return Ok(Arc::new(store));
    }

    info!("Initializing InMemoryMetaStore (META_DB_PATH unset)");
    Ok(Arc::new(InMemoryMetaStore::new()))
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

    // 2b. Persistent storage backend: external Nakama S2S client when NAKAMA_URL/NAKAMA_HTTP_KEY
    // are configured, or native in-process RustMetaEngine by default.
    let mut nakama_client: Option<Arc<NakamaClient>> = None;
    let mut in_process_meta: Option<Arc<RustMetaEngine>> = None;

    match NakamaConfig::from_env() {
        Ok(Some(cfg)) => {
            info!("Configuring Nakama client for {}", cfg.base_url);
            let client = Arc::new(NakamaClient::new(
                cfg.base_url.clone(),
                cfg.http_key,
                5000,
                3,
            ));
            if let Err(err) = client.probe().await {
                error!("Nakama startup probe failed for {}: {}", cfg.base_url, err);
                eprintln!("Nakama startup probe failed for {}: {}", cfg.base_url, err);
                std::process::exit(1);
            }
            info!("Nakama startup probe succeeded ({})", cfg.base_url);
            nakama_client = Some(client);
        }
        Ok(None) => {
            info!(
                "Nakama not configured (NAKAMA_URL and NAKAMA_HTTP_KEY unset); running in-process RustMetaEngine"
            );
            let store = match build_meta_doc_store_from_env() {
                Ok(s) => s,
                Err(err) => {
                    error!("Failed to initialize MetaDocStore: {}", err);
                    eprintln!("Failed to initialize MetaDocStore: {}", err);
                    std::process::exit(1);
                }
            };
            let engine = match RustMetaEngine::new(store) {
                Ok(eng) => Arc::new(eng),
                Err(err) => {
                    error!("Failed to initialize RustMetaEngine catalogs: {}", err);
                    eprintln!("Failed to initialize RustMetaEngine catalogs: {}", err);
                    std::process::exit(1);
                }
            };
            in_process_meta = Some(engine);
        }
        Err(err) => {
            error!("Nakama configuration error: {}", err);
            eprintln!("Nakama configuration error: {}", err);
            std::process::exit(1);
        }
    }

    let storage_backend: Option<Arc<dyn NakamaStorage>> = if let Some(ref client) = nakama_client {
        Some(client.clone())
    } else if let Some(ref engine) = in_process_meta {
        Some(engine.clone())
    } else {
        None
    };

    // Optional secondary HTTP listener for Nakama `/v2/*` compatibility (e.g. `:7350`)
    if let Some(meta_bind) = std::env::var("META_BIND_ADDR")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        if let Some(ref engine) = in_process_meta {
            let meta_cfg = MetaHttpConfig::from_env(engine.clone(), auth_guard.clone());
            let bound = spawn_meta_http_listener(&meta_bind, meta_cfg)
                .await
                .map_err(std::io::Error::other)?;
            info!("Secondary Meta HTTP gateway listening on {}", bound);
        }
    }

    // 3. Agones lifecycle & heartbeat
    let agones = Arc::new(AgonesClient::from_env());
    if let Err(e) = agones.ready().await {
        error!("Failed to notify Agones Ready: {}", e);
    } else {
        info!("Agones lifecycle marked Ready");
    }
    let heartbeat = HeartbeatTask::start(agones.clone(), 2);
    info!("Agones 2-second heartbeat loop initiated");

    // Instanced Dungeon Registry
    let dungeons = Arc::new(server_rs::fleet::DungeonRegistry::new());

    // 4. WebSocket Server
    let mut ws_server_inner = WsServer::bind(&bind_addr, auth_guard)
        .await
        .map_err(std::io::Error::other)?
        .with_dungeons(dungeons.clone())
        .with_agones(agones.clone());
    if let Some(ref client) = nakama_client {
        ws_server_inner = ws_server_inner.with_nakama(client.clone());
    } else if let Some(ref engine) = in_process_meta {
        ws_server_inner = ws_server_inner.with_meta_engine_from_env(engine.clone());
    }
    let ws_server = Arc::new(ws_server_inner);
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

    // 6. Generated-world regions (Wealdmarch c02 compiled regions)
    for (idx, &region_id) in GENERATED_REGION_IDS.iter().enumerate() {
        if let Some(sim) =
            AtlasSimulation::from_generated_region(region_id, seed.wrapping_add(100 + idx as u32))
        {
            rooms.insert(region_id.to_string(), sim);
        }
    }

    info!(
        "Initialized {} simulation rooms: {:?}",
        rooms.len(),
        rooms.keys().collect::<Vec<_>>()
    );
    let debug_enabled = server_rs::debug::debug_enabled_from_env();
    ws_server.set_debug_enabled(debug_enabled);

    // 6. 20 Hz simulation tick loop (50ms interval)
    let tick_rate_ms = 50;
    let disconnect_grace_sec = env_f32("ATLAS_DISCONNECT_GRACE_SEC", 5.0).max(0.0);
    let disconnect_grace_ticks =
        ((disconnect_grace_sec * 1000.0) / tick_rate_ms as f32).round() as u32;
    for sim in rooms.values_mut() {
        sim.debug_enabled = debug_enabled;
        sim.set_disconnect_grace_ticks(disconnect_grace_ticks);
    }
    info!(
        "Debug controls (/debug/*) {}, disconnect grace window = {:.1}s ({} ticks)",
        if debug_enabled { "ENABLED" } else { "disabled" },
        disconnect_grace_sec,
        disconnect_grace_ticks,
    );
    let mut snapshot_builder = SnapshotBuilder::new();
    let mut aoi_trackers: std::collections::HashMap<String, server_rs::spatial::AoiTracker> =
        std::collections::HashMap::new();
    let adjacency_graph = RegionAdjacencyGraph::wealdmarch_default();
    let mut handoff_coordinator = AuthorityHandoffCoordinator::default();
    let mut match_event_buffer = MatchEventBuffer::default();
    let mut character_state_buffer = CharacterStateBuffer::default();

    let tick_dt = Duration::from_millis(tick_rate_ms);
    let mut ticker = sim_ticker(tick_dt);

    let mut timings = TickTimings::default();

    info!("Entering 20 Hz simulation tick loop...");

    tokio::select! {
        _ = async {
            loop {
                ticker.tick().await;
                let tick_start = Instant::now();

                for (session_id, _room_id, loadout) in ws_server.drain_loadouts().await {
                    for sim in rooms.values_mut() {
                        sim.set_session_loadout(&session_id, loadout.clone());
                    }
                }

                let inputs = ws_server.drain_inbound().await;
                let disconnected = ws_server.drain_disconnects_with_rooms().await;

                for request in ws_server.drain_debug().await {
                    let result = server_rs::debug::debug_apply_to_room(
                        &mut rooms,
                        &request.map,
                        &request.command,
                        request.player.as_deref(),
                    );
                    let _ = request.reply.send(result);
                }

                let mut departed_users: Vec<String> =
                    disconnected.iter().map(|(s, _)| s.clone()).collect();
                let mut total_entities: usize = 0;
                let mut room_frames: std::collections::HashMap<String, server_rs::simulation::LiveFrame> =
                    std::collections::HashMap::with_capacity(rooms.len());
                let mut room_disconnects_map: std::collections::HashMap<String, Vec<String>> =
                    std::collections::HashMap::with_capacity(rooms.len());

                for (room_id, sim) in rooms.iter_mut() {
                    let room_inputs: Vec<server_rs::net::ClientPacket> = inputs
                        .iter()
                        .filter(|p| resolve_room_or_region_id(&p.room_id) == room_id)
                        .cloned()
                        .collect();

                    let room_disconnects: Vec<String> = disconnected
                        .iter()
                        .filter(|(_, r)| resolve_room_or_region_id(r) == room_id)
                        .map(|(s, _)| s.clone())
                        .collect();

                    let frame = sim.live_tick(&room_inputs, &room_disconnects);
                    total_entities += frame.entities.len();

                    for (user_id, event) in &frame.match_events {
                        debug!(user_id = %user_id, room = %room_id, event = ?event, "match event");
                        match_event_buffer.record(user_id, event.clone());
                    }

                    for portal_entry in &frame.dungeon_portal_events {
                        info!(
                            user_id = %portal_entry.player_id,
                            portal_id = %portal_entry.portal_id,
                            dungeon = %portal_entry.dungeon_template_id,
                            boss = %portal_entry.mvp_boss_id,
                            "Player triggered spatial dungeon portal entry"
                        );
                        let entry = portal_entry.clone();
                        let ws = ws_server.clone();
                        tokio::spawn(async move {
                            let _ = ws
                                .handle_dungeon_portal_entry(
                                    &entry.player_id,
                                    &entry.dungeon_template_id,
                                    &entry.mvp_boss_id,
                                    std::slice::from_ref(&entry.player_id),
                                )
                                .await;
                        });
                    }

                    for (user_id, state) in &frame.departed_states {
                        character_state_buffer.record(user_id, state.clone());
                        if !departed_users.contains(user_id) {
                            departed_users.push(user_id.clone());
                        }
                    }

                    room_disconnects_map.insert(room_id.clone(), room_disconnects);
                    room_frames.insert(room_id.clone(), frame);
                }

                let epoch_now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let handoff_tokens = handoff_coordinator.step_handoffs_with_frames(
                    &mut rooms,
                    &mut room_frames,
                    &adjacency_graph,
                    epoch_now_ms,
                );
                for token in &handoff_tokens {
                    if let Some(aoi) = aoi_trackers.get_mut(&token.transfer.from_region) {
                        aoi.remove_viewer(server_rs::protocol::fnv1a_32(&token.transfer.session_id));
                    }
                    ws_server
                        .reassign_session_room(
                            &token.transfer.session_id,
                            &token.transfer.to_region,
                        )
                        .await;
                }

                let region_snapshots: std::collections::HashMap<String, Vec<server_rs::protocol::EntitySnapshotData>> =
                    room_frames
                        .iter()
                        .map(|(r, f)| (r.clone(), f.entities.clone()))
                        .collect();

                for (room_id, frame) in &room_frames {
                    if ws_server.active_connections_in_room(room_id).await > 0 {
                        let epoch_ms = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(frame.sim_time_ms);
                        let aoi = aoi_trackers.entry(room_id.clone()).or_default();
                        if let Some(room_disconnects) = room_disconnects_map.get(room_id) {
                            for departed in room_disconnects {
                                aoi.remove_viewer(server_rs::protocol::fnv1a_32(departed));
                            }
                        }
                        let border_ghosts = collect_region_border_ghosts(
                            room_id,
                            &adjacency_graph,
                            &region_snapshots,
                        );
                        ws_server
                            .broadcast_aoi_snapshots_with_ghosts_to_room(
                                room_id,
                                aoi,
                                &mut snapshot_builder,
                                frame.tick,
                                epoch_ms,
                                &frame.entities,
                                &border_ghosts,
                                &frame.removed_ids,
                                &frame.events,
                            )
                            .await;
                    }
                }

                let mut batches_to_flush = match_event_buffer.flush_users(&departed_users);
                batches_to_flush.extend(match_event_buffer.tick(tick_dt));

                if !batches_to_flush.is_empty() {
                    if let Some(ref storage) = storage_backend {
                        let storage = storage.clone();
                        tokio::spawn(async move {
                            for res in
                                MatchEventBuffer::dispatch_batches(storage.as_ref(), &batches_to_flush)
                                    .await
                            {
                                if let Err(err) = res {
                                    warn!("Failed to report match events to storage backend: {}", err);
                                }
                            }
                        });
                    }
                }

                let mut states_to_flush = character_state_buffer.flush_users(&departed_users);
                if character_state_buffer.should_checkpoint(tick_dt) {
                    for sim in rooms.values_mut() {
                        character_state_buffer.record_all(sim.snapshot_active_player_states());
                    }
                    states_to_flush.extend(character_state_buffer.flush_all());
                }

                if !states_to_flush.is_empty() {
                    if let Some(ref storage) = storage_backend {
                        let storage = storage.clone();
                        tokio::spawn(async move {
                            for res in CharacterStateBuffer::dispatch_states(
                                storage.as_ref(),
                                &states_to_flush,
                            )
                            .await
                            {
                                if let Err(err) = res {
                                    warn!("Failed to save character state to storage backend: {}", err);
                                }
                            }
                        });
                    }
                }

                let tick_work = tick_start.elapsed();
                ws_server.record_tick_metrics(tick_work, total_entities);
                timings.record(tick_start, tick_work);
            }
        } => {}
        _ = wait_for_shutdown_signal() => {
            info!("Shutdown signal received. Initiating graceful shutdown...");
        }
    }

    // Mark readiness probe not-ready and send CloseCode::Away (1001) to all active clients
    ws_server.shutdown().await;

    for sim in rooms.values_mut() {
        character_state_buffer.record_all(sim.snapshot_active_player_states());
    }
    let final_states = character_state_buffer.flush_all();
    if !final_states.is_empty() {
        if let Some(ref storage) = storage_backend {
            for res in CharacterStateBuffer::dispatch_states(storage.as_ref(), &final_states).await
            {
                if let Err(err) = res {
                    warn!("Failed to flush character state on shutdown: {}", err);
                }
            }
        }
    }

    let final_batches = match_event_buffer.flush_all();
    if !final_batches.is_empty() {
        if let Some(ref storage) = storage_backend {
            for res in MatchEventBuffer::dispatch_batches(storage.as_ref(), &final_batches).await {
                if let Err(err) = res {
                    warn!("Failed to flush final match events on shutdown: {}", err);
                }
            }
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
}
