use crate::auth::AuthGuard;
use crate::debug::{DebugCommand, DebugCommandBody, MAX_COMMANDS_PER_TICK};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::error::TrySendError;
use tokio::sync::mpsc::{
    channel, unbounded_channel, Receiver, Sender, UnboundedReceiver, UnboundedSender,
};
use tokio::sync::{oneshot, RwLock};
use tokio_tungstenite::accept_hdr_async_with_config;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, WebSocketConfig};
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, info, warn};

/// Maximum WebSocket frame/message size accepted by the gateway.
pub const MAX_WS_FRAME_BYTES: usize = 4096;
/// Maximum binary input payload size accepted per client frame.
pub const MAX_INPUT_PACKET_BYTES: usize = 512;
/// Default sustained input packet rate allowed per connection (packets/sec).
pub const DEFAULT_MAX_INPUTS_PER_SEC: u32 = 60;
/// Default token-bucket burst capacity per connection.
pub const DEFAULT_INPUT_BURST_CAPACITY: u32 = 30;
/// Default bounded per-connection outbound snapshot queue depth.
pub const MAX_OUTBOUND_QUEUE_DEPTH: usize = 64;
/// Bounded server-wide inbound packet queue depth.
pub const MAX_INBOUND_QUEUE_DEPTH: usize = 4096;
/// Default idle timeout before a silent connection is closed.
pub const DEFAULT_IDLE_TIMEOUT: Duration = Duration::from_secs(60);
/// Default maximum active player connections allowed per region room.
pub const DEFAULT_MAX_PLAYERS_PER_ROOM: usize = 100;

/// Token-bucket rate limiter enforced per WebSocket connection.
#[derive(Debug, Clone)]
pub struct InputRateLimiter {
    tokens: f64,
    capacity: f64,
    refill_per_sec: f64,
    last_refill: Instant,
}

impl InputRateLimiter {
    pub fn new(max_per_sec: u32, burst_capacity: u32) -> Self {
        let cap = burst_capacity.max(1) as f64;
        Self {
            tokens: cap,
            capacity: cap,
            refill_per_sec: max_per_sec.max(1) as f64,
            last_refill: Instant::now(),
        }
    }

    pub fn allow(&mut self, now: Instant) -> bool {
        let elapsed = now
            .saturating_duration_since(self.last_refill)
            .as_secs_f64();
        if elapsed > 0.0 {
            self.tokens = (self.tokens + elapsed * self.refill_per_sec).min(self.capacity);
            self.last_refill = now;
        }
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Process-wide cache of the most recent join-time `LoadoutSnapshot` per `session_id`
/// so `AtlasSimulation::apply_player_input` can apply a saved character even when invoked
/// directly in integration tests without `main.rs`'s `drain_loadouts` loop.
fn global_session_loadouts(
) -> &'static std::sync::RwLock<HashMap<String, crate::storage::LoadoutSnapshot>> {
    static LOADOUTS: OnceLock<std::sync::RwLock<HashMap<String, crate::storage::LoadoutSnapshot>>> =
        OnceLock::new();
    LOADOUTS.get_or_init(|| std::sync::RwLock::new(HashMap::new()))
}

/// Returns the latest cached `LoadoutSnapshot` for `session_id`, if any.
pub fn cached_session_loadout(session_id: &str) -> Option<crate::storage::LoadoutSnapshot> {
    global_session_loadouts()
        .read()
        .ok()
        .and_then(|map| map.get(session_id).cloned())
}

/// Updates or clears the process-wide cached `LoadoutSnapshot` for `session_id`.
pub fn set_cached_session_loadout(
    session_id: &str,
    loadout: Option<crate::storage::LoadoutSnapshot>,
) {
    if let Ok(mut map) = global_session_loadouts().write() {
        match loadout {
            Some(l) => {
                map.insert(session_id.to_string(), l);
            }
            None => {
                map.remove(session_id);
            }
        }
    }
}

/// Returns `true` when `user_id` is a canonical 36-character hyphenated UUID (`8-4-4-4-12` hex).
/// Nakama's `storageRead` rejects non-UUID user IDs (`expects 'userId' value to be a valid id`),
/// so join-time loadout fetches are skipped for non-UUID dev tokens.
pub fn is_uuid_user_id(user_id: &str) -> bool {
    let bytes = user_id.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (i, &b) in bytes.iter().enumerate() {
        if i == 8 || i == 13 || i == 18 || i == 23 {
            if b != b'-' {
                return false;
            }
        } else if !b.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

/// Inbound client message packet received from an authenticated session.
#[derive(Debug, Clone, PartialEq)]
pub struct ClientPacket {
    pub session_id: String,
    pub room_id: String,
    pub payload: Vec<u8>,
}

impl ClientPacket {
    pub fn new(session_id: impl Into<String>, payload: Vec<u8>) -> Self {
        Self {
            session_id: session_id.into(),
            room_id: "map-for-play".to_string(),
            payload,
        }
    }

    pub fn with_room(mut self, room_id: impl Into<String>) -> Self {
        self.room_id = room_id.into();
        self
    }
}

/// WebSocket Gateway server managing active client sessions and snapshot broadcasting.
/// One debug command waiting for the tick loop; the answer goes back through `reply`.
pub struct DebugRequest {
    pub map: String,
    pub player: Option<String>,
    pub command: DebugCommand,
    pub reply: oneshot::Sender<Result<serde_json::Value, String>>,
}

/// What a connection needs to serve `/debug/*`: the switch and the queue to the tick loop.
#[derive(Clone)]
struct DebugGate {
    enabled: Arc<AtomicBool>,
    tx: UnboundedSender<DebugRequest>,
}

/// Configurable input/queue/idle limits shared with the accept loop.
#[derive(Clone)]
struct ConnectionLimits {
    rate_limit: Arc<std::sync::RwLock<(u32, u32)>>,
    outbound_queue_depth: Arc<AtomicUsize>,
    idle_timeout: Arc<std::sync::RwLock<Duration>>,
    rate_limited_drops: Arc<AtomicUsize>,
    allowed_origins: Arc<std::sync::RwLock<Vec<String>>>,
    max_players_per_room: Arc<AtomicUsize>,
}

/// Live server metrics shared with the `/metrics` HTTP endpoint.
#[derive(Clone, Default)]
struct ServerMetrics {
    bytes_sent: Arc<AtomicU64>,
    frames_sent: Arc<AtomicU64>,
    snapshot_bytes_last: Arc<AtomicUsize>,
    ticks_completed: Arc<AtomicU64>,
    entities_count: Arc<AtomicUsize>,
    last_tick_us: Arc<AtomicU64>,
    tick_samples_us: Arc<std::sync::Mutex<Vec<u64>>>,
}

impl ServerMetrics {
    fn record_tick(&self, work: Duration, entities: usize) {
        let us = work.as_micros() as u64;
        self.last_tick_us.store(us, Ordering::Relaxed);
        self.ticks_completed.fetch_add(1, Ordering::Relaxed);
        self.entities_count.store(entities, Ordering::Relaxed);
        if let Ok(mut samples) = self.tick_samples_us.lock() {
            if samples.len() >= 200 {
                samples.remove(0);
            }
            samples.push(us);
        }
    }

    fn snapshot_json(&self, players: usize, rate_limited_drops: usize) -> serde_json::Value {
        let last_ms = self.last_tick_us.load(Ordering::Relaxed) as f64 / 1000.0;
        let (p50_ms, p95_ms, max_ms) = if let Ok(samples) = self.tick_samples_us.lock() {
            if samples.is_empty() {
                (0.0, 0.0, 0.0)
            } else {
                let mut sorted = samples.clone();
                sorted.sort_unstable();
                let at = |pct: usize| sorted[(sorted.len() * pct / 100).min(sorted.len() - 1)];
                (
                    at(50) as f64 / 1000.0,
                    at(95) as f64 / 1000.0,
                    sorted[sorted.len() - 1] as f64 / 1000.0,
                )
            }
        } else {
            (0.0, 0.0, 0.0)
        };

        serde_json::json!({
            "ok": true,
            "tick_time_ms": {
                "last": last_ms,
                "p50": p50_ms,
                "p95": p95_ms,
                "max": max_ms,
            },
            "players": players,
            "entities": self.entities_count.load(Ordering::Relaxed),
            "bytes_sent": self.bytes_sent.load(Ordering::Relaxed),
            "frames_sent": self.frames_sent.load(Ordering::Relaxed),
            "snapshot_bytes_last": self.snapshot_bytes_last.load(Ordering::Relaxed),
            "ticks_completed": self.ticks_completed.load(Ordering::Relaxed),
            "rate_limited_drops": rate_limited_drops,
        })
    }
}

pub type LoadoutNotice = (String, String, Option<crate::storage::LoadoutSnapshot>);

pub struct WsServer {
    local_addr: SocketAddr,
    connections: Arc<RwLock<HashMap<String, Sender<Message>>>>,
    session_rooms: Arc<RwLock<HashMap<String, String>>>,
    session_loadouts: Arc<std::sync::RwLock<HashMap<String, crate::storage::LoadoutSnapshot>>>,
    loadout_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<LoadoutNotice>>>,
    auth_guard: AuthGuard,
    inbound_tx: Sender<ClientPacket>,
    inbound_rx: Arc<tokio::sync::Mutex<Receiver<ClientPacket>>>,
    disconnect_tx: UnboundedSender<(String, String)>,
    disconnect_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<(String, String)>>>,
    pub nakama_client: Option<Arc<crate::storage::NakamaClient>>,
    nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
    non_uuid_skip_logs: Arc<AtomicUsize>,
    debug_enabled: Arc<AtomicBool>,
    debug_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<DebugRequest>>>,
    ready: Arc<AtomicBool>,
    limits: ConnectionLimits,
    metrics: ServerMetrics,
}

impl WsServer {
    pub async fn bind(addr: &str, auth_guard: AuthGuard) -> Result<Self, String> {
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;
        let local_addr = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local addr: {}", e))?;

        let connections = Arc::new(RwLock::new(HashMap::new()));
        let session_rooms = Arc::new(RwLock::new(HashMap::new()));
        let session_loadouts = Arc::new(std::sync::RwLock::new(HashMap::new()));
        let (loadout_tx, loadout_rx) = unbounded_channel();
        let loadout_rx = Arc::new(tokio::sync::Mutex::new(loadout_rx));
        let (inbound_tx, inbound_rx) = channel(MAX_INBOUND_QUEUE_DEPTH);
        let inbound_rx = Arc::new(tokio::sync::Mutex::new(inbound_rx));
        let (disconnect_tx, disconnect_rx) = unbounded_channel();
        let disconnect_rx = Arc::new(tokio::sync::Mutex::new(disconnect_rx));
        let nakama_ref = Arc::new(std::sync::RwLock::new(None));
        let non_uuid_skip_logs = Arc::new(AtomicUsize::new(0));
        let debug_enabled = Arc::new(AtomicBool::new(false));
        let (debug_tx, debug_rx) = unbounded_channel();
        let ready = Arc::new(AtomicBool::new(true));
        let metrics = ServerMetrics::default();
        let env_origins: Vec<String> = std::env::var("ATLAS_ALLOWED_ORIGINS")
            .or_else(|_| std::env::var("ALLOWED_ORIGINS"))
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let env_max_players_per_room = std::env::var("ATLAS_MAX_PLAYERS_PER_ROOM")
            .ok()
            .and_then(|v| v.trim().parse::<usize>().ok())
            .filter(|&n| n > 0)
            .unwrap_or(DEFAULT_MAX_PLAYERS_PER_ROOM);
        let limits = ConnectionLimits {
            rate_limit: Arc::new(std::sync::RwLock::new((
                DEFAULT_MAX_INPUTS_PER_SEC,
                DEFAULT_INPUT_BURST_CAPACITY,
            ))),
            outbound_queue_depth: Arc::new(AtomicUsize::new(MAX_OUTBOUND_QUEUE_DEPTH)),
            idle_timeout: Arc::new(std::sync::RwLock::new(DEFAULT_IDLE_TIMEOUT)),
            rate_limited_drops: Arc::new(AtomicUsize::new(0)),
            allowed_origins: Arc::new(std::sync::RwLock::new(env_origins)),
            max_players_per_room: Arc::new(AtomicUsize::new(env_max_players_per_room)),
        };

        let server = Self {
            local_addr,
            connections: connections.clone(),
            session_rooms: session_rooms.clone(),
            session_loadouts: session_loadouts.clone(),
            loadout_rx,
            auth_guard: auth_guard.clone(),
            inbound_tx: inbound_tx.clone(),
            inbound_rx,
            disconnect_tx: disconnect_tx.clone(),
            disconnect_rx,
            nakama_client: None,
            nakama_ref: nakama_ref.clone(),
            non_uuid_skip_logs: non_uuid_skip_logs.clone(),
            debug_enabled: debug_enabled.clone(),
            debug_rx: Arc::new(tokio::sync::Mutex::new(debug_rx)),
            ready: ready.clone(),
            limits: limits.clone(),
            metrics: metrics.clone(),
        };

        // Spawn accept loop
        tokio::spawn(Self::accept_loop(
            listener,
            connections,
            session_rooms,
            session_loadouts,
            loadout_tx,
            auth_guard,
            inbound_tx,
            disconnect_tx,
            nakama_ref,
            non_uuid_skip_logs,
            DebugGate {
                enabled: debug_enabled,
                tx: debug_tx,
            },
            ready,
            limits,
            metrics,
        ));

        Ok(server)
    }

    /// Sets whether the `/readyz` probe reports `200 OK` (`true`) or `503 Service Unavailable` (`false`).
    pub fn set_ready(&self, ready: bool) {
        self.ready.store(ready, Ordering::SeqCst);
    }

    /// Returns whether the server is currently marked ready for `/readyz`.
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    /// Initiates graceful WebSocket shutdown: marks `/readyz` not-ready (`503`) and sends
    /// `CloseCode::Away` (`1001 Going Away`) frames to all active client connections.
    pub async fn shutdown(&self) {
        self.set_ready(false);
        let drained: Vec<(String, Sender<Message>, String)> = {
            let mut conns = self.connections.write().await;
            let mut rooms = self.session_rooms.write().await;
            conns
                .drain()
                .map(|(conn_key, tx)| {
                    let room = rooms
                        .remove(&conn_key)
                        .unwrap_or_else(|| "map-for-play".to_string());
                    (conn_key, tx, room)
                })
                .collect()
        };

        if drained.is_empty() {
            return;
        }

        let close_frame = CloseFrame {
            code: CloseCode::Away,
            reason: "server shutting down".into(),
        };
        for (conn_key, tx, room) in drained {
            let _ = tx.try_send(Message::Close(Some(close_frame.clone())));
            if let Some((session_id, _)) = conn_key.rsplit_once('#') {
                let _ = self.disconnect_tx.send((session_id.to_string(), room));
            }
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }

    /// Configures the per-connection input rate limit (`max_per_sec` and `burst_capacity`).
    pub fn with_rate_limit(self, max_per_sec: u32, burst_capacity: u32) -> Self {
        *self.limits.rate_limit.write().unwrap() = (max_per_sec, burst_capacity);
        self
    }

    /// Configures the bounded outbound queue depth per connection.
    pub fn with_outbound_queue_depth(self, depth: usize) -> Self {
        self.limits
            .outbound_queue_depth
            .store(depth.max(1), Ordering::Relaxed);
        self
    }

    /// Configures the idle timeout before a silent connection is closed.
    pub fn with_idle_timeout(self, timeout: Duration) -> Self {
        *self.limits.idle_timeout.write().unwrap() = timeout;
        self
    }

    /// Configures the additional allowed `Origin` values for WebSocket upgrades.
    pub fn with_allowed_origins(self, origins: Vec<String>) -> Self {
        *self.limits.allowed_origins.write().unwrap() = origins;
        self
    }

    /// Configures the maximum number of active player connections allowed per region (`room_id`).
    pub fn with_max_players_per_room(self, max_players: usize) -> Self {
        self.limits
            .max_players_per_room
            .store(max_players.max(1), Ordering::Relaxed);
        self
    }

    /// Returns the total number of inbound packets dropped due to per-connection rate limiting.
    pub fn rate_limited_drop_count(&self) -> usize {
        self.limits.rate_limited_drops.load(Ordering::Relaxed)
    }

    /// Records a completed simulation tick's work duration and total simulated entity count.
    pub fn record_tick_metrics(&self, work_duration: Duration, total_entities: usize) {
        self.metrics.record_tick(work_duration, total_entities);
    }

    /// Returns a JSON snapshot of the server's current metrics (`/metrics`).
    pub async fn metrics_snapshot(&self) -> serde_json::Value {
        let players = self.active_connections_count().await;
        self.metrics
            .snapshot_json(players, self.rate_limited_drop_count())
    }

    /// Returns the most recently fetched `LoadoutSnapshot` for `session_id` on this server.
    pub fn session_loadout(&self, session_id: &str) -> Option<crate::storage::LoadoutSnapshot> {
        self.session_loadouts
            .read()
            .ok()
            .and_then(|map| map.get(session_id).cloned())
    }

    /// Drains `(session_id, room_id, Option<LoadoutSnapshot>)` updates fetched during recent joins.
    pub async fn drain_loadouts(&self) -> Vec<LoadoutNotice> {
        let mut rx = self.loadout_rx.lock().await;
        let mut out = Vec::new();
        while let Ok(item) = rx.try_recv() {
            out.push(item);
        }
        out
    }

    /// Number of times this server instance logged skipping a non-UUID loadout fetch (capped at 1).
    pub fn non_uuid_skip_log_count(&self) -> usize {
        self.non_uuid_skip_logs.load(Ordering::Relaxed)
    }

    /// Turns the `/debug/*` HTTP routes on or off (off until called).
    pub fn set_debug_enabled(&self, enabled: bool) {
        self.debug_enabled.store(enabled, Ordering::Relaxed);
    }

    /// Up to `MAX_COMMANDS_PER_TICK` waiting debug commands, for the tick loop to apply and
    /// answer; the rest stay queued. Requests whose client stopped waiting are discarded.
    pub async fn drain_debug(&self) -> Vec<DebugRequest> {
        let mut rx = self.debug_rx.lock().await;
        let mut requests = Vec::new();
        while requests.len() < MAX_COMMANDS_PER_TICK {
            match rx.try_recv() {
                Ok(request) if request.reply.is_closed() => {}
                Ok(request) => requests.push(request),
                Err(_) => break,
            }
        }
        requests
    }

    pub fn with_nakama(mut self, client: Arc<crate::storage::NakamaClient>) -> Self {
        *self.nakama_ref.write().unwrap() = Some(client.clone());
        self.nakama_client = Some(client);
        self
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub fn connections(&self) -> Arc<RwLock<HashMap<String, Sender<Message>>>> {
        self.connections.clone()
    }

    pub async fn active_connections_count(&self) -> usize {
        self.connections.read().await.len()
    }

    pub async fn active_connections_in_room(&self, room_id: &str) -> usize {
        let rooms = self.session_rooms.read().await;
        rooms.values().filter(|r| r.as_str() == room_id).count()
    }

    /// Returns the distinct active `session_id`s currently connected in `room_id`.
    pub async fn active_sessions_in_room(&self, room_id: &str) -> Vec<String> {
        let rooms = self.session_rooms.read().await;
        let mut sessions = Vec::new();
        for (conn_key, r) in rooms.iter() {
            if r.as_str() == room_id {
                if let Some((session_id, _)) = conn_key.rsplit_once('#') {
                    let s = session_id.to_string();
                    if !sessions.contains(&s) {
                        sessions.push(s);
                    }
                }
            }
        }
        sessions.sort();
        sessions
    }

    /// Sends a serialized snapshot frame to a single session in `room_id`, evicting stalled sockets.
    pub async fn send_snapshot_to_session_in_room(
        &self,
        room_id: &str,
        session_id: &str,
        bytes: &[u8],
    ) {
        let mut stalled = Vec::new();
        {
            let conns = self.connections.read().await;
            let rooms = self.session_rooms.read().await;
            let msg = Message::Binary(bytes.to_vec().into());
            for (conn_key, tx) in conns.iter() {
                let matches_session = conn_key
                    .rsplit_once('#')
                    .is_some_and(|(s, _)| s == session_id);
                let conn_room = rooms
                    .get(conn_key)
                    .map(|s| s.as_str())
                    .unwrap_or("map-for-play");
                if matches_session && conn_room == room_id {
                    match tx.try_send(msg.clone()) {
                        Ok(()) => {
                            self.metrics
                                .bytes_sent
                                .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                            self.metrics.frames_sent.fetch_add(1, Ordering::Relaxed);
                            self.metrics
                                .snapshot_bytes_last
                                .store(bytes.len(), Ordering::Relaxed);
                        }
                        Err(TrySendError::Full(_)) | Err(TrySendError::Closed(_)) => {
                            stalled.push(conn_key.clone());
                        }
                    }
                }
            }
        }
        self.evict_stalled_connections(stalled).await;
    }

    /// Broadcasts per-viewer AOI-filtered snapshots to every connected session in `room_id`.
    #[allow(clippy::too_many_arguments)]
    pub async fn broadcast_aoi_snapshots_to_room(
        &self,
        room_id: &str,
        aoi: &mut crate::spatial::AoiTracker,
        snapshot_builder: &mut crate::protocol::SnapshotBuilder,
        tick: u32,
        time_ms: u64,
        entities: &[crate::protocol::EntitySnapshotData],
        removed_ids: &[u32],
        events: &[crate::protocol::GameEventData],
    ) {
        let sessions = self.active_sessions_in_room(room_id).await;
        for session_id in sessions {
            let viewer_id = crate::protocol::fnv1a_32(&session_id);
            let (vis_entities, vis_removed, vis_events) =
                aoi.filter_for_viewer(viewer_id, entities, removed_ids, events);
            let bytes = snapshot_builder.build_frame(
                tick,
                time_ms,
                &vis_entities,
                &vis_removed,
                &vis_events,
            );
            self.send_snapshot_to_session_in_room(room_id, &session_id, bytes)
                .await;
        }
    }

    pub fn auth_guard(&self) -> &AuthGuard {
        &self.auth_guard
    }

    pub fn inbound_tx(&self) -> &Sender<ClientPacket> {
        &self.inbound_tx
    }

    /// Drain queued inbound client packets.
    pub async fn drain_inbound(&self) -> Vec<ClientPacket> {
        let mut rx = self.inbound_rx.lock().await;
        let mut packets = Vec::new();
        while let Ok(packet) = rx.try_recv() {
            packets.push(packet);
        }
        packets
    }

    /// Drain session ids whose LAST socket has closed since the previous drain. A session
    /// that has reconnected since its notice was queued is skipped (its avatar stays).
    pub async fn drain_disconnects(&self) -> Vec<String> {
        let mut rx = self.disconnect_rx.lock().await;
        let mut gone = Vec::new();
        while let Ok((session_id, _room_id)) = rx.try_recv() {
            if !gone.contains(&session_id) {
                gone.push(session_id);
            }
        }
        drop(rx);
        let conns = self.connections.read().await;
        gone.retain(|s| !has_session(&conns, s));
        gone
    }

    /// Drain (session_id, room_id) pairs whose LAST socket in that room has closed.
    pub async fn drain_disconnects_with_rooms(&self) -> Vec<(String, String)> {
        let mut rx = self.disconnect_rx.lock().await;
        let mut gone = Vec::new();
        while let Ok((session_id, room_id)) = rx.try_recv() {
            if !gone.contains(&(session_id.clone(), room_id.clone())) {
                gone.push((session_id, room_id));
            }
        }
        drop(rx);
        let conns = self.connections.read().await;
        let rooms = self.session_rooms.read().await;
        gone.retain(|(s, r)| !has_session_in_room(&conns, &rooms, s, r));
        gone
    }

    async fn evict_stalled_connections(&self, stalled_keys: Vec<String>) {
        if stalled_keys.is_empty() {
            return;
        }
        let mut conns = self.connections.write().await;
        let mut rooms = self.session_rooms.write().await;
        for conn_key in stalled_keys {
            let was_active = conns.remove(&conn_key).is_some();
            let old_room = rooms
                .remove(&conn_key)
                .unwrap_or_else(|| "map-for-play".to_string());
            if was_active {
                if let Some((session_id, _)) = conn_key.rsplit_once('#') {
                    warn!(
                        "Evicting stalled/closed connection {} in room {}",
                        conn_key, old_room
                    );
                    if !has_session_in_room(&conns, &rooms, session_id, &old_room) {
                        let _ = self.disconnect_tx.send((session_id.to_string(), old_room));
                    }
                }
            }
        }
    }

    /// Broadcast serialized snapshot bytes to all active sessions.
    pub async fn broadcast_snapshot(&self, bytes: &[u8]) {
        let mut stalled = Vec::new();
        {
            let conns = self.connections.read().await;
            if conns.is_empty() {
                return;
            }

            let msg = Message::Binary(bytes.to_vec().into());
            for (conn_key, tx) in conns.iter() {
                match tx.try_send(msg.clone()) {
                    Ok(()) => {
                        self.metrics
                            .bytes_sent
                            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        self.metrics.frames_sent.fetch_add(1, Ordering::Relaxed);
                        self.metrics
                            .snapshot_bytes_last
                            .store(bytes.len(), Ordering::Relaxed);
                    }
                    Err(TrySendError::Full(_)) | Err(TrySendError::Closed(_)) => {
                        debug!(
                            "Outbound queue full/closed for session {}; marking for eviction",
                            conn_key
                        );
                        stalled.push(conn_key.clone());
                    }
                }
            }
        }
        self.evict_stalled_connections(stalled).await;
    }

    /// Broadcast serialized snapshot bytes to active sessions in a specific room.
    pub async fn broadcast_snapshot_to_room(&self, room_id: &str, bytes: &[u8]) {
        let mut stalled = Vec::new();
        {
            let conns = self.connections.read().await;
            let rooms = self.session_rooms.read().await;
            if conns.is_empty() {
                return;
            }

            let msg = Message::Binary(bytes.to_vec().into());
            for (conn_key, tx) in conns.iter() {
                let conn_room = rooms
                    .get(conn_key)
                    .map(|s| s.as_str())
                    .unwrap_or("map-for-play");
                if conn_room == room_id {
                    match tx.try_send(msg.clone()) {
                        Ok(()) => {
                            self.metrics
                                .bytes_sent
                                .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                            self.metrics.frames_sent.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(TrySendError::Full(_)) | Err(TrySendError::Closed(_)) => {
                            debug!(
                                "Outbound queue full/closed for session {}; marking for eviction",
                                conn_key
                            );
                            stalled.push(conn_key.clone());
                        }
                    }
                }
            }
        }
        self.evict_stalled_connections(stalled).await;
    }

    #[allow(clippy::too_many_arguments)]
    async fn accept_loop(
        listener: TcpListener,
        connections: Arc<RwLock<HashMap<String, Sender<Message>>>>,
        session_rooms: Arc<RwLock<HashMap<String, String>>>,
        session_loadouts: Arc<std::sync::RwLock<HashMap<String, crate::storage::LoadoutSnapshot>>>,
        loadout_tx: UnboundedSender<LoadoutNotice>,
        auth_guard: AuthGuard,
        inbound_tx: Sender<ClientPacket>,
        disconnect_tx: UnboundedSender<(String, String)>,
        nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
        non_uuid_skip_logs: Arc<AtomicUsize>,
        debug: DebugGate,
        ready: Arc<AtomicBool>,
        limits: ConnectionLimits,
        metrics: ServerMetrics,
    ) {
        info!(
            "WebSocket accept loop running on {}",
            listener.local_addr().unwrap()
        );
        static ACCEPT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        while let Ok((stream, peer_addr)) = listener.accept().await {
            let conn_seq = ACCEPT_SEQ.fetch_add(1, Ordering::Relaxed);
            if let Err(e) = stream.set_nodelay(true) {
                warn!("Failed to set TCP_NODELAY for {}: {}", peer_addr, e);
            }
            let conns = connections.clone();
            let rooms = session_rooms.clone();
            let loadouts = session_loadouts.clone();
            let lo_tx = loadout_tx.clone();
            let auth = auth_guard.clone();
            let in_tx = inbound_tx.clone();
            let dc_tx = disconnect_tx.clone();
            let nakama = nakama_ref.clone();
            let skip_logs = non_uuid_skip_logs.clone();
            let debug = debug.clone();
            let ready = ready.clone();
            let limits = limits.clone();
            let metrics = metrics.clone();

            tokio::spawn(async move {
                if is_probe_http(&stream).await {
                    let players = conns.read().await.len();
                    let drops = limits.rate_limited_drops.load(Ordering::Relaxed);
                    serve_probe_http(stream, ready, metrics, players, drops).await;
                    return;
                }
                if is_debug_http(&stream).await {
                    serve_debug_http(stream, peer_addr.ip(), debug).await;
                    return;
                }
                Self::handle_connection(
                    stream, peer_addr, conn_seq, conns, rooms, loadouts, lo_tx, auth, in_tx, dc_tx,
                    nakama, skip_logs, limits,
                )
                .await;
            });
        }
    }

    fn extract_token(req: &Request) -> Option<String> {
        // 1. Try query parameter ?token=...
        if let Some(query) = req.uri().query() {
            for pair in query.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "token" {
                        return Some(v.to_string());
                    }
                }
            }
        }

        // 2. Try Authorization: Bearer <token>
        if let Some(auth_hdr) = req.headers().get("Authorization") {
            if let Ok(auth_str) = auth_hdr.to_str() {
                if let Some(token) = auth_str.strip_prefix("Bearer ") {
                    return Some(token.trim().to_string());
                }
            }
        }

        // 3. Try Sec-WebSocket-Protocol
        if let Some(proto_hdr) = req.headers().get("Sec-WebSocket-Protocol") {
            if let Ok(proto_str) = proto_hdr.to_str() {
                for part in proto_str.split(',') {
                    let trimmed = part.trim();
                    if let Some(token) = trimmed.strip_prefix("token.") {
                        return Some(token.to_string());
                    }
                }
            }
        }

        None
    }

    fn select_echo_subprotocol(req: &Request) -> Option<String> {
        let proto_hdr = req.headers().get("Sec-WebSocket-Protocol")?;
        let proto_str = proto_hdr.to_str().ok()?;
        let parts: Vec<&str> = proto_str
            .split(',')
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect();
        if parts.is_empty() {
            return None;
        }
        if let Some(non_token) = parts.iter().find(|p| !p.starts_with("token.")) {
            Some((*non_token).to_string())
        } else {
            Some(parts[0].to_string())
        }
    }

    fn extract_map(req: &Request) -> Option<String> {
        if let Some(query) = req.uri().query() {
            for pair in query.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "map" {
                        return Some(v.to_string());
                    }
                }
            }
        }
        None
    }

    fn extract_proto(req: &Request) -> Option<String> {
        if let Some(query) = req.uri().query() {
            for pair in query.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "proto" {
                        return Some(v.to_string());
                    }
                }
            }
        }
        None
    }

    #[allow(clippy::result_large_err, clippy::too_many_arguments)]
    async fn handle_connection(
        stream: TcpStream,
        peer_addr: SocketAddr,
        conn_seq: u64,
        connections: Arc<RwLock<HashMap<String, Sender<Message>>>>,
        session_rooms: Arc<RwLock<HashMap<String, String>>>,
        session_loadouts: Arc<std::sync::RwLock<HashMap<String, crate::storage::LoadoutSnapshot>>>,
        loadout_tx: UnboundedSender<LoadoutNotice>,
        auth_guard: AuthGuard,
        inbound_tx: Sender<ClientPacket>,
        disconnect_tx: UnboundedSender<(String, String)>,
        nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
        non_uuid_skip_logs: Arc<AtomicUsize>,
        limits: ConnectionLimits,
    ) {
        let mut session_id = String::new();
        let mut room_id = "map-for-play".to_string();
        let mut req_proto: Option<String> = None;
        let auth_ref = &auth_guard;

        let allowed_origins_snapshot = limits.allowed_origins.read().unwrap().clone();
        let callback = |req: &Request, mut response: Response| -> Result<Response, ErrorResponse> {
            let origin_hdr = req.headers().get("Origin").and_then(|v| v.to_str().ok());
            if !ws_origin_allowed(origin_hdr, &allowed_origins_snapshot) {
                warn!(
                    "WebSocket handshake rejected from {}: disallowed Origin {:?}",
                    peer_addr, origin_hdr
                );
                let mut resp = ErrorResponse::new(Some("Forbidden Origin".to_string()));
                *resp.status_mut() = StatusCode::FORBIDDEN;
                return Err(resp);
            }

            let token = match Self::extract_token(req) {
                Some(t) => t,
                None => {
                    warn!(
                        "WebSocket handshake rejected from {}: missing token",
                        peer_addr
                    );
                    let mut resp = ErrorResponse::new(Some("Missing token".to_string()));
                    *resp.status_mut() = StatusCode::UNAUTHORIZED;
                    return Err(resp);
                }
            };

            let req_map = Self::extract_map(req).unwrap_or_else(|| "map-for-play".to_string());
            room_id =
                crate::content::world_regions::resolve_room_or_region_id(&req_map).to_string();
            req_proto = Self::extract_proto(req);

            match auth_ref.validate_token(&token) {
                Ok(claims) => {
                    session_id = claims.sub;
                    if let Some(selected_proto) = Self::select_echo_subprotocol(req) {
                        if let Ok(hdr_val) = selected_proto.parse() {
                            response
                                .headers_mut()
                                .insert("Sec-WebSocket-Protocol", hdr_val);
                        }
                    }
                    info!(
                        "WebSocket handshake authenticated: user={} room={} from {}",
                        session_id, room_id, peer_addr
                    );
                    Ok(response)
                }
                Err(err) => {
                    warn!(
                        "WebSocket handshake rejected from {}: invalid token ({})",
                        peer_addr, err
                    );
                    let mut resp = ErrorResponse::new(Some(format!("Unauthorized: {}", err)));
                    *resp.status_mut() = StatusCode::UNAUTHORIZED;
                    Err(resp)
                }
            }
        };

        let mut ws_config = WebSocketConfig::default();
        ws_config.max_message_size = Some(MAX_WS_FRAME_BYTES);
        ws_config.max_frame_size = Some(MAX_WS_FRAME_BYTES);

        let mut ws_stream =
            match accept_hdr_async_with_config(stream, callback, Some(ws_config)).await {
                Ok(ws) => ws,
                Err(e) => {
                    debug!("WebSocket handshake failed with {}: {}", peer_addr, e);
                    return;
                }
            };

        // Check protocol version before fetching persistent loadout or registering connection.
        let server_ver = crate::protocol::PROTOCOL_VERSION;
        match req_proto.as_deref() {
            Some(raw) => match raw.parse::<u32>() {
                Ok(client_ver) if client_ver == server_ver => {}
                Ok(client_ver) => {
                    let reason = format!(
                        "protocol version mismatch: server={} client={}",
                        server_ver, client_ver
                    );
                    warn!(
                        "Rejecting WebSocket connection for user={} from {}: {}",
                        session_id, peer_addr, reason
                    );
                    let frame = CloseFrame {
                        code: CloseCode::Library(4001),
                        reason: reason.into(),
                    };
                    let _ = ws_stream.close(Some(frame)).await;
                    return;
                }
                Err(_) => {
                    let reason = format!(
                        "protocol version mismatch: server={} client=invalid",
                        server_ver
                    );
                    warn!(
                        "Rejecting WebSocket connection for user={} from {}: invalid proto parameter",
                        session_id, peer_addr
                    );
                    let frame = CloseFrame {
                        code: CloseCode::Library(4001),
                        reason: reason.into(),
                    };
                    let _ = ws_stream.close(Some(frame)).await;
                    return;
                }
            },
            None => {
                warn!(
                    "WebSocket connection from {} (user={}) missing proto query parameter; admitting under rollout allowance",
                    peer_addr, session_id
                );
            }
        }

        // When token is validated, if nakama_client is configured, fetch get_loadout(&session_id).
        // Nakama's storageRead rejects non-UUID user IDs, so non-UUID dev tokens skip the fetch
        // and log once per server instance.
        let client_opt = nakama_ref.read().unwrap().clone();
        let mut fetched_loadout: Option<Option<crate::storage::LoadoutSnapshot>> = None;
        if let Some(client) = client_opt {
            if !is_uuid_user_id(&session_id) {
                if non_uuid_skip_logs
                    .compare_exchange(0, 1, Ordering::Relaxed, Ordering::Relaxed)
                    .is_ok()
                {
                    info!(
                        "Skipping persistent loadout fetch for non-UUID user {} (Nakama requires UUID userIds; logging once)",
                        session_id
                    );
                }
            } else {
                match client.get_loadout(&session_id).await {
                    Ok(Some(loadout)) => {
                        info!(
                            "Retrieved persistent loadout for user {}: level {}",
                            session_id, loadout.profile.level
                        );
                        fetched_loadout = Some(Some(loadout));
                    }
                    Ok(None) => {
                        info!("No persistent loadout for user {}, defaulting", session_id);
                        fetched_loadout = Some(None);
                    }
                    Err(e) => {
                        warn!(
                            "Failed to fetch persistent loadout for user {}: {}",
                            session_id, e
                        );
                    }
                }
            }
        }

        let (mut ws_write, mut ws_read) = ws_stream.split();
        let queue_depth = limits.outbound_queue_depth.load(Ordering::Relaxed).max(1);
        let (out_tx, mut out_rx) = channel::<Message>(queue_depth);
        let conn_out_tx = out_tx.clone();

        // Enforce one live session per account using the accept-order sequence `conn_seq`:
        // - If an older connection (`old_seq < conn_seq`) is active for `session_id`, remove it
        //   and close it with `DUPLICATE_SESSION_CLOSE_CODE` (4002).
        // - If a newer connection (`old_seq > conn_seq`) has ALREADY registered (e.g. React
        //   StrictMode double-mount where mount-1 finished handshake/loadout after mount-2),
        //   keep the newer connection and immediately close this stale socket with 4002.
        let conn_key = format!("{}#{}", session_id, conn_seq);
        let mut superseded_on_arrival = false;
        let mut region_full_on_arrival: Option<(usize, usize)> = None;
        {
            let mut conns = connections.write().await;
            let mut rooms = session_rooms.write().await;

            let existing_keys: Vec<(String, u64)> = conns
                .keys()
                .filter_map(|k| {
                    let (s, seq_str) = k.rsplit_once('#')?;
                    if s == session_id {
                        seq_str.parse::<u64>().ok().map(|seq| (k.clone(), seq))
                    } else {
                        None
                    }
                })
                .collect();

            if existing_keys.iter().any(|(_, seq)| *seq > conn_seq) {
                superseded_on_arrival = true;
            } else {
                let already_in_target_room = existing_keys.iter().any(|(old_key, _)| {
                    rooms.get(old_key).map(|r| r.as_str()) == Some(room_id.as_str())
                });
                let current_in_room = rooms.values().filter(|r| r.as_str() == room_id).count();
                let max_in_room = limits.max_players_per_room.load(Ordering::Relaxed).max(1);

                if !already_in_target_room && current_in_room >= max_in_room {
                    region_full_on_arrival = Some((current_in_room, max_in_room));
                } else {
                    for (old_key, _) in existing_keys {
                        if let Some(old_tx) = conns.remove(&old_key) {
                            let close_frame = CloseFrame {
                                code: CloseCode::Library(
                                    crate::protocol::DUPLICATE_SESSION_CLOSE_CODE,
                                ),
                                reason: "session replaced by newer connection".into(),
                            };
                            let _ = old_tx.try_send(Message::Close(Some(close_frame)));
                        }
                        if let Some(old_room) = rooms.remove(&old_key) {
                            if old_room != room_id {
                                let _ = disconnect_tx.send((session_id.clone(), old_room));
                            }
                        }
                    }
                    conns.insert(conn_key.clone(), out_tx);
                    rooms.insert(conn_key.clone(), room_id.clone());
                }
            }
        }

        if superseded_on_arrival {
            let close_frame = CloseFrame {
                code: CloseCode::Library(crate::protocol::DUPLICATE_SESSION_CLOSE_CODE),
                reason: "session replaced by newer connection".into(),
            };
            let _ = ws_write.send(Message::Close(Some(close_frame))).await;
            let _ = ws_write.close().await;
            return;
        }

        if let Some((current_in_room, max_in_room)) = region_full_on_arrival {
            let reason = format!(
                "region full: {} is at capacity ({}/{})",
                room_id, current_in_room, max_in_room
            );
            warn!(
                "Rejecting WebSocket connection for user={} in {}: {}",
                session_id, room_id, reason
            );
            let close_frame = CloseFrame {
                code: CloseCode::Library(crate::protocol::REGION_FULL_CLOSE_CODE),
                reason: reason.into(),
            };
            let _ = ws_write.send(Message::Close(Some(close_frame))).await;
            let _ = ws_write.close().await;
            return;
        }

        // Apply fetched loadout once this connection is confirmed as the active session.
        if let Some(loadout_opt) = fetched_loadout {
            if let Ok(mut map) = session_loadouts.write() {
                match &loadout_opt {
                    Some(l) => {
                        map.insert(session_id.clone(), l.clone());
                    }
                    None => {
                        map.remove(&session_id);
                    }
                }
            }
            set_cached_session_loadout(&session_id, loadout_opt.clone());
            let _ = loadout_tx.send((session_id.clone(), room_id.clone(), loadout_opt));
        }

        // Task for writing outbound messages to client
        let session_id_out = session_id.clone();
        let write_task = tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                let is_close = matches!(msg, Message::Close(_));
                if let Err(e) = ws_write.send(msg).await {
                    debug!("WebSocket write error for {}: {}", session_id_out, e);
                    break;
                }
                if is_close {
                    let _ = ws_write.close().await;
                    break;
                }
            }
        });

        let (max_per_sec, burst_cap) = *limits.rate_limit.read().unwrap();
        let mut rate_limiter = InputRateLimiter::new(max_per_sec, burst_cap);
        let idle_timeout = *limits.idle_timeout.read().unwrap();

        // Inbound loop reading messages from client with idle timeout & size/rate caps
        loop {
            let next_frame = tokio::time::timeout(idle_timeout, ws_read.next()).await;
            let msg_result = match next_frame {
                Ok(Some(res)) => res,
                Ok(None) => break,
                Err(_) => {
                    info!(
                        "Closing idle connection {} after {:?} without frames",
                        session_id, idle_timeout
                    );
                    let close_frame = CloseFrame {
                        code: CloseCode::Policy,
                        reason: "idle connection timeout".into(),
                    };
                    let _ = conn_out_tx.try_send(Message::Close(Some(close_frame)));
                    break;
                }
            };

            match msg_result {
                Ok(Message::Binary(bin)) => {
                    if bin.len() > MAX_INPUT_PACKET_BYTES {
                        warn!(
                            "Rejecting oversized input packet ({} bytes > {}) from {}",
                            bin.len(),
                            MAX_INPUT_PACKET_BYTES,
                            session_id
                        );
                        let close_frame = CloseFrame {
                            code: CloseCode::Size,
                            reason: "input packet exceeds max size".into(),
                        };
                        let _ = conn_out_tx.try_send(Message::Close(Some(close_frame)));
                        break;
                    }
                    if !rate_limiter.allow(Instant::now()) {
                        limits.rate_limited_drops.fetch_add(1, Ordering::Relaxed);
                        debug!("Rate-limiting excess input packet from {}", session_id);
                        continue;
                    }
                    let packet = ClientPacket {
                        session_id: session_id.clone(),
                        room_id: room_id.clone(),
                        payload: bin.to_vec(),
                    };
                    if let Err(e) = inbound_tx.try_send(packet) {
                        warn!(
                            "Inbound packet queue full or closed for {}: {}",
                            session_id, e
                        );
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("Client {} sent close frame", session_id);
                    break;
                }
                Ok(Message::Ping(_)) => {}
                Ok(Message::Pong(_)) => {}
                Ok(Message::Text(_)) => {
                    debug!("Ignoring text message from {}", session_id);
                }
                Ok(Message::Frame(_)) => {}
                Err(e) => {
                    debug!("WebSocket read error for {}: {}", session_id, e);
                    break;
                }
            }
        }

        // Clean up only if this connection is still the active entry for `session_id`.
        {
            let mut conns = connections.write().await;
            let was_active = conns.remove(&conn_key).is_some();
            let mut rooms = session_rooms.write().await;
            rooms.remove(&conn_key);
            if was_active && !has_session_in_room(&conns, &rooms, &session_id, &room_id) {
                let _ = disconnect_tx.send((session_id.clone(), room_id.clone()));
            }
        }
        let _ = tokio::time::timeout(std::time::Duration::from_millis(50), write_task).await;
        info!("Session {} disconnected from room {}", session_id, room_id);
    }
}

/// True when the connection opens with a plain HTTP liveness/readiness request (`/healthz` or `/readyz`).
async fn is_probe_http(stream: &TcpStream) -> bool {
    let mut head = [0u8; 16];
    let n = stream.peek(&mut head).await.unwrap_or(0);
    [
        &b"GET /healthz"[..],
        &b"GET /readyz"[..],
        &b"GET /metrics"[..],
    ]
    .iter()
    .any(|prefix| head[..n].starts_with(prefix))
}

/// Serves `/healthz`, `/readyz`, and `/metrics`.
async fn serve_probe_http(
    mut stream: TcpStream,
    ready: Arc<AtomicBool>,
    metrics: ServerMetrics,
    players: usize,
    rate_limited_drops: usize,
) {
    let mut raw = Vec::new();
    let mut chunk = [0u8; 1024];
    let head_end = loop {
        if let Some(head_end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break head_end;
        }
        match stream.read(&mut chunk).await {
            Ok(n) if n > 0 && raw.len() < DEBUG_HEAD_MAX_BYTES => {
                raw.extend_from_slice(&chunk[..n])
            }
            _ => return,
        }
    };
    let head = String::from_utf8_lossy(&raw[..head_end]);
    let mut request_line = head.lines().next().unwrap_or("").split(' ');
    let method = request_line.next().unwrap_or("");
    let target = request_line.next().unwrap_or("");
    let (path, _) = target.split_once('?').unwrap_or((target, ""));

    let (status, payload) = match (method, path) {
        ("GET", "/healthz") => (
            "200 OK",
            serde_json::json!({ "ok": true, "status": "healthy" }).to_string(),
        ),
        ("GET", "/readyz") => {
            if ready.load(Ordering::SeqCst) {
                (
                    "200 OK",
                    serde_json::json!({ "ok": true, "ready": true }).to_string(),
                )
            } else {
                (
                    "503 Service Unavailable",
                    serde_json::json!({ "ok": false, "ready": false }).to_string(),
                )
            }
        }
        ("GET", "/metrics") => (
            "200 OK",
            metrics
                .snapshot_json(players, rate_limited_drops)
                .to_string(),
        ),
        _ => (
            "404 Not Found",
            serde_json::json!({ "ok": false, "error": "not found" }).to_string(),
        ),
    };

    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// True if any registered `session#seq` connection key belongs to `session_id`.
/// True when the connection opens with a plain HTTP request for `/debug/...` rather than a
/// WebSocket upgrade (which the client sends to `/` or `/ws`).
async fn is_debug_http(stream: &TcpStream) -> bool {
    let mut head = [0u8; 15];
    let n = stream.peek(&mut head).await.unwrap_or(0);
    [&b"GET /debug/"[..], b"POST /debug/", b"OPTIONS /debug/"]
        .iter()
        .any(|prefix| head[..n].starts_with(prefix))
}

/// Largest debug request head and body accepted.
const DEBUG_HEAD_MAX_BYTES: usize = 16 * 1024;
const DEBUG_BODY_MAX_BYTES: usize = 64 * 1024;

/// `localhost`, `127.0.0.1` or `[::1]`, with an optional port.
fn is_local_authority(authority: &str) -> bool {
    ["localhost", "127.0.0.1", "[::1]"].iter().any(|host| {
        authority.strip_prefix(host).is_some_and(|rest| {
            rest.is_empty()
                || rest
                    .strip_prefix(':')
                    .is_some_and(|p| p.parse::<u16>().is_ok())
        })
    })
}

/// The debug routes exist only with the gate on, for a loopback peer that addressed this
/// host by a local name (a page that rebinds its DNS name here still sends its own `Host`).
fn debug_request_allowed(enabled: bool, peer: IpAddr, host: Option<&str>) -> bool {
    enabled && peer.to_canonical().is_loopback() && host.is_some_and(is_local_authority)
}

/// The request's `Origin` when it is a local page: `http://localhost` or `http://127.0.0.1`,
/// any port. Only these are named in the CORS headers.
fn local_origin(origin: Option<&str>) -> Option<&str> {
    origin.filter(|origin| {
        origin
            .strip_prefix("http://")
            .is_some_and(|authority| !authority.starts_with('[') && is_local_authority(authority))
    })
}

/// Checks whether a WebSocket upgrade `Origin` header is allowed:
/// - `None` (non-browser clients that omit `Origin`) is allowed.
/// - Local HTTP/HTTPS origins (`localhost`, `127.0.0.1` on any port) are allowed.
/// - Any origin matching the configured `allowed_origins` list is allowed.
pub fn ws_origin_allowed(origin: Option<&str>, allowed_origins: &[String]) -> bool {
    let Some(orig) = origin else {
        return true;
    };
    let trimmed = orig.trim();
    if local_origin(Some(trimmed)).is_some() {
        return true;
    }
    if trimmed
        .strip_prefix("https://")
        .is_some_and(|authority| !authority.starts_with('[') && is_local_authority(authority))
    {
        return true;
    }
    allowed_origins
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(trimmed))
}

/// Serves one `/debug/*` request and closes: `GET /debug/state?map=<room>` and
/// `POST /debug/command` (JSON body, see `debug::DebugCommandBody`). Every route is 404
/// unless `debug_request_allowed`. Commands are queued for the tick loop, never applied here.
async fn serve_debug_http(mut stream: TcpStream, peer: IpAddr, debug: DebugGate) {
    let mut raw = Vec::new();
    let mut chunk = [0u8; 2048];
    let head_end = loop {
        if let Some(head_end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break head_end;
        }
        match stream.read(&mut chunk).await {
            Ok(n) if n > 0 && raw.len() < DEBUG_HEAD_MAX_BYTES => {
                raw.extend_from_slice(&chunk[..n])
            }
            _ => return,
        }
    };
    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let header = |name: &str| {
        head.lines()
            .skip(1)
            .filter_map(|line| line.split_once(':'))
            .find(|(key, _)| key.trim().eq_ignore_ascii_case(name))
            .map(|(_, value)| value.trim())
    };
    let mut request_line = head.lines().next().unwrap_or("").split(' ');
    let method = request_line.next().unwrap_or("");
    let target = request_line.next().unwrap_or("");
    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    // Refuse before reading the body: a closed gate or an absurd length costs nothing.
    let length = header("content-length").map(|value| value.parse::<usize>());
    let allowed =
        debug_request_allowed(debug.enabled.load(Ordering::Relaxed), peer, header("host"));
    let refused = match &length {
        _ if !allowed => Some(("404 Not Found", "not found")),
        Some(Err(_)) => Some(("400 Bad Request", "malformed Content-Length")),
        Some(Ok(n)) if *n > DEBUG_BODY_MAX_BYTES => {
            Some(("413 Content Too Large", "request body too large"))
        }
        _ => None,
    };
    let body_len = match (refused, length) {
        (None, Some(Ok(n))) => n,
        _ => 0,
    };
    let body_start = head_end + 4;
    while raw.len() < body_start + body_len {
        match stream.read(&mut chunk).await {
            Ok(n) if n > 0 => raw.extend_from_slice(&chunk[..n]),
            _ => return,
        }
    }
    let body = &raw[body_start..body_start + body_len];
    // A cross-origin page can send JSON only after a preflight, which `local_origin` decides.
    let is_json = header("content-type").is_some_and(|value| {
        let media_type = value.split(';').next().unwrap_or("").trim();
        media_type.eq_ignore_ascii_case("application/json")
    });

    let error = |message: &str| serde_json::json!({ "ok": false, "error": message });
    let (status, payload) = if let Some((status, message)) = refused {
        (status, error(message))
    } else if method == "OPTIONS" {
        ("204 No Content", serde_json::Value::Null)
    } else {
        let parsed = match (method, path) {
            ("GET", "/debug/state") => Ok(DebugCommandBody {
                map: query
                    .split('&')
                    .find_map(|pair| pair.strip_prefix("map="))
                    .unwrap_or("")
                    .to_string(),
                player: None,
                command: DebugCommand::State,
            }),
            ("POST", "/debug/command") if !is_json => Err((
                "415 Unsupported Media Type",
                "Content-Type must be application/json".to_string(),
            )),
            ("POST", "/debug/command") => serde_json::from_slice::<DebugCommandBody>(body)
                .map_err(|e| ("400 Bad Request", e.to_string())),
            _ => Err(("400 Bad Request", "unknown debug route".to_string())),
        };
        match parsed {
            Err((status, message)) => (status, error(&message)),
            Ok(parsed) => {
                let (reply, answer) = oneshot::channel();
                let _ = debug.tx.send(DebugRequest {
                    map: parsed.map,
                    player: parsed.player,
                    command: parsed.command,
                    reply,
                });
                match tokio::time::timeout(std::time::Duration::from_secs(2), answer).await {
                    Ok(Ok(Ok(state))) => {
                        ("200 OK", serde_json::json!({ "ok": true, "state": state }))
                    }
                    Ok(Ok(Err(message))) => ("400 Bad Request", error(&message)),
                    _ => ("503 Service Unavailable", error("tick loop did not answer")),
                }
            }
        }
    };
    let payload = if payload.is_null() {
        String::new()
    } else {
        payload.to_string()
    };
    let cors = local_origin(header("origin"))
        .map(|origin| {
            format!(
                "Access-Control-Allow-Origin: {origin}\r\nVary: Origin\r\n\
                 Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                 Access-Control-Allow-Headers: content-type\r\n"
            )
        })
        .unwrap_or_default();
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\
         {cors}Connection: close\r\n\r\n{payload}",
        payload.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

fn has_session(conns: &HashMap<String, Sender<Message>>, session_id: &str) -> bool {
    conns
        .keys()
        .any(|k| k.rsplit_once('#').is_some_and(|(s, _)| s == session_id))
}

fn has_session_in_room(
    conns: &HashMap<String, Sender<Message>>,
    rooms: &HashMap<String, String>,
    session_id: &str,
    room_id: &str,
) -> bool {
    conns.keys().any(|k| {
        k.rsplit_once('#').is_some_and(|(s, _)| s == session_id)
            && rooms.get(k).map(|r| r.as_str()) == Some(room_id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::handshake::client::generate_key;
    use tokio_tungstenite::tungstenite::handshake::client::Request as ClientRequest;

    #[test]
    fn debug_routes_need_an_open_gate_a_loopback_peer_and_a_local_host() {
        let allowed = |enabled: bool, peer: &str, host: Option<&str>| {
            debug_request_allowed(enabled, peer.parse().unwrap(), host)
        };
        assert!(allowed(true, "127.0.0.1", Some("localhost:2567")));
        assert!(allowed(true, "127.0.0.1", Some("127.0.0.1")));
        assert!(allowed(true, "::1", Some("[::1]:2567")));
        assert!(allowed(true, "::ffff:127.0.0.1", Some("localhost")));
        assert!(!allowed(false, "127.0.0.1", Some("localhost:2567")));
        for peer in ["192.168.1.20", "10.0.0.5", "fe80::1", "::ffff:192.168.1.20"] {
            assert!(!allowed(true, peer, Some("localhost:2567")), "peer {peer}");
        }
        for host in [
            "evil.example",
            "localhost.evil.example",
            "127.0.0.1.evil.example:80",
            "localhost:port",
            "",
        ] {
            assert!(!allowed(true, "127.0.0.1", Some(host)), "host {host}");
        }
        assert!(!allowed(true, "127.0.0.1", None));
    }

    #[test]
    fn only_local_http_origins_are_named_in_cors_headers() {
        for origin in [
            "http://localhost:3000",
            "http://127.0.0.1:3001",
            "http://localhost",
        ] {
            assert_eq!(local_origin(Some(origin)), Some(origin));
        }
        for origin in [
            "http://evil.example",
            "http://localhost.evil.example",
            "https://localhost:3000",
            "http://[::1]:3000",
            "null",
        ] {
            assert_eq!(local_origin(Some(origin)), None, "origin {origin}");
        }
        assert_eq!(local_origin(None), None);
    }

    #[tokio::test]
    async fn test_ws_server_valid_token_handshake_and_bidirectional() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        let token = auth.generate_test_token("hero-player-1", "Hero", 3600);
        let ws_url = format!("ws://{}/ws?token={}", addr, token);

        let (mut client_ws, response) =
            connect_async(&ws_url).await.expect("Client should connect");
        assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);

        // Wait a brief moment for connection to register
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 1);

        // Client sends binary payload
        let client_input = vec![0xDE, 0xAD, 0xBE, 0xEF];
        client_ws
            .send(Message::Binary(client_input.clone().into()))
            .await
            .expect("Client should send binary");

        tokio::time::sleep(Duration::from_millis(50)).await;
        let packets = server.drain_inbound().await;
        assert_eq!(packets.len(), 1);
        assert_eq!(packets[0].session_id, "hero-player-1");
        assert_eq!(packets[0].payload, client_input);

        // Server broadcasts snapshot
        let snapshot_data = vec![0x01, 0x02, 0x03, 0x04];
        server.broadcast_snapshot(&snapshot_data).await;

        let received = tokio::time::timeout(Duration::from_secs(1), client_ws.next())
            .await
            .expect("Timeout waiting for snapshot")
            .expect("Stream should not be empty")
            .expect("Should receive message");

        match received {
            Message::Binary(bin) => assert_eq!(bin.as_ref(), &snapshot_data[..]),
            other => panic!("Expected binary message, got {:?}", other),
        }

        // Close client
        client_ws.close(None).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 0);
    }

    #[tokio::test]
    async fn test_ws_server_authorization_header_handshake() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        let token = auth.generate_test_token("hero-player-2", "Warrior", 3600);
        let req = ClientRequest::builder()
            .uri(format!("ws://{}/ws", addr))
            .header("Host", addr.to_string())
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", generate_key())
            .header("Authorization", format!("Bearer {}", token))
            .body(())
            .unwrap();

        let (mut client_ws, response) = connect_async(req)
            .await
            .expect("Client should connect via Authorization header");
        assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 1);

        client_ws.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_duplicate_session_newest_wins_and_closes_older_with_4002() {
        // E-003 slice 4: newest connection wins and the older one is closed with named
        // close code DUPLICATE_SESSION_CLOSE_CODE (4002), while the newer socket stays
        // live and the avatar is not despawned.
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let url = format!(
            "ws://{}/ws?token=dev-token:dup&proto=1",
            server.local_addr()
        );

        let (mut old_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 1);

        let (mut new_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 1);

        // Older socket must receive Close(4002)
        let close_msg = tokio::time::timeout(Duration::from_secs(1), old_ws.next())
            .await
            .expect("older socket should receive close frame")
            .expect("stream should yield close frame")
            .expect("no websocket transport error");
        match close_msg {
            Message::Close(Some(frame)) => {
                assert_eq!(
                    frame.code,
                    CloseCode::Library(crate::protocol::DUPLICATE_SESSION_CLOSE_CODE)
                );
                assert!(frame.reason.contains("replaced"));
            }
            other => panic!("expected Close(4002) on older socket, got {:?}", other),
        }

        let _ = old_ws.close(None).await;
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 1);
        assert!(
            server.drain_disconnects().await.is_empty(),
            "evicting the older socket must not despawn the live session"
        );

        server.broadcast_snapshot(&[7, 7, 7]).await;
        let msg = tokio::time::timeout(Duration::from_secs(1), new_ws.next())
            .await
            .expect("newer socket must still receive snapshots")
            .unwrap()
            .unwrap();
        assert_eq!(msg, Message::Binary(vec![7u8, 7, 7].into()));
        new_ws.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_strict_mode_double_mount_out_of_order_handshake_keeps_newer_socket() {
        // Regression for React StrictMode double-mount (ws.rs:425-428):
        // Mount 1 opens socket 1 (accepted first, conn_seq=1) and discards it;
        // Mount 2 opens socket 2 (accepted second, conn_seq=2) and keeps it.
        // Even if socket 1 finishes its pre-registration work (get_loadout) AFTER socket 2
        // has already registered, socket 2 (the newer connection) must stay live and
        // socket 1 (the older connection) must be closed with 4002.
        let nakama_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let nakama_addr = nakama_listener.local_addr().unwrap();
        let req_count = Arc::new(AtomicUsize::new(0));
        let req_count_srv = req_count.clone();

        tokio::spawn(async move {
            while let Ok((mut stream, _)) = nakama_listener.accept().await {
                let idx = req_count_srv.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    let _ = stream.read(&mut buf).await;
                    if idx == 0 {
                        // Delay mount-1 socket so mount-2 registers first!
                        tokio::time::sleep(Duration::from_millis(120)).await;
                    }
                    let body =
                        serde_json::to_string(&crate::storage::LoadoutSnapshot::default()).unwrap();
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(resp.as_bytes()).await;
                });
            }
        });

        let nakama_client = Arc::new(crate::storage::NakamaClient::new(
            format!("http://{nakama_addr}"),
            "test_http_key".to_string(),
            2000,
            0,
        ));
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone())
            .await
            .unwrap()
            .with_nakama(nakama_client);
        let uid = "00000000-0000-4000-8000-000000000042";
        let url = format!(
            "ws://{}/ws?token=dev-token:{uid}&proto=1",
            server.local_addr()
        );

        // Mount 1 connects first (accepted first, delayed 120ms in get_loadout)
        let (mut discarded_mount1_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(20)).await;
        // Mount 2 connects second (accepted second, finishes get_loadout immediately)
        let (mut kept_mount2_ws, _) = connect_async(&url).await.unwrap();

        // Wait for both handshakes and delayed get_loadout to complete
        tokio::time::sleep(Duration::from_millis(180)).await;
        assert_eq!(server.active_connections_count().await, 1);

        // Mount 1 (older connection) must receive Close(4002)
        let close_msg = tokio::time::timeout(Duration::from_secs(1), discarded_mount1_ws.next())
            .await
            .expect("mount 1 socket should receive close frame")
            .expect("stream should yield close frame")
            .expect("no websocket transport error");
        match close_msg {
            Message::Close(Some(frame)) => {
                assert_eq!(
                    frame.code,
                    CloseCode::Library(crate::protocol::DUPLICATE_SESSION_CLOSE_CODE)
                );
            }
            other => panic!("expected Close(4002) on mount 1 socket, got {:?}", other),
        }

        // Mount 2 (newer connection) must remain live and receive snapshots
        server.broadcast_snapshot(&[9, 9]).await;
        let msg = tokio::time::timeout(Duration::from_secs(1), kept_mount2_ws.next())
            .await
            .expect("mount 2 socket must still receive snapshots")
            .unwrap()
            .unwrap();
        assert_eq!(msg, Message::Binary(vec![9u8, 9].into()));
        kept_mount2_ws.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_server_rejection_missing_or_invalid_token() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        // 1. Missing token
        let ws_url = format!("ws://{}/ws", addr);
        assert!(connect_async(&ws_url).await.is_err());

        // 2. Expired token
        let expired_token = auth.generate_test_token("exp-user", "exp", -100);
        let ws_url_exp = format!("ws://{}/ws?token={}", addr, expired_token);
        assert!(connect_async(&ws_url_exp).await.is_err());

        // 3. Forged token
        let forged_token = "forged.header.signature";
        let ws_url_forged = format!("ws://{}/ws?token={}", addr, forged_token);
        assert!(connect_async(&ws_url_forged).await.is_err());
    }

    #[tokio::test]
    async fn test_ws_server_map_query_routing_and_broadcast() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        let token1 = auth.generate_test_token("deflect-player", "Tester", 3600);
        let token2 = auth.generate_test_token("play-player", "Gamer", 3600);

        let ws_url1 = format!("ws://{}/ws?token={}&map=map-for-test-deflect", addr, token1);
        let ws_url2 = format!("ws://{}/ws?token={}&map=map-for-play", addr, token2);

        let (mut client_deflect, _) = connect_async(&ws_url1).await.unwrap();
        let (mut client_play, _) = connect_async(&ws_url2).await.unwrap();

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(
            server
                .active_connections_in_room("map-for-test-deflect")
                .await,
            1
        );
        assert_eq!(server.active_connections_in_room("map-for-play").await, 1);

        // Broadcast to deflect room only
        server
            .broadcast_snapshot_to_room("map-for-test-deflect", &[11, 22])
            .await;

        let msg1 = tokio::time::timeout(Duration::from_secs(1), client_deflect.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(msg1, Message::Binary(vec![11, 22].into()));

        // Client play should NOT have received that message
        let non_msg = tokio::time::timeout(Duration::from_millis(100), client_play.next()).await;
        assert!(
            non_msg.is_err(),
            "client in play room should not receive deflect snapshot"
        );

        client_deflect.close(None).await.unwrap();
        client_play.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_server_routes_terrain_test_map() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let token = auth.generate_test_token("terrain-player", "Tester", 3600);
        let url = format!(
            "ws://{}/ws?token={}&map=map-for-test-terrain",
            server.local_addr(),
            token
        );

        let (mut client, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(
            server
                .active_connections_in_room("map-for-test-terrain")
                .await,
            1
        );
        assert_eq!(server.active_connections_in_room("map-for-play").await, 0);
        client.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_protocol_version_mismatch_closes_with_4001() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let token = auth.generate_test_token("mismatch-player", "Tester", 3600);
        let server_ver = crate::protocol::PROTOCOL_VERSION;
        let client_ver = server_ver + 1;
        let url = format!(
            "ws://{}/ws?token={}&proto={}",
            server.local_addr(),
            token,
            client_ver
        );

        let (mut client, _) = connect_async(&url).await.unwrap();
        let msg = tokio::time::timeout(Duration::from_secs(1), client.next())
            .await
            .expect("timeout waiting for close frame")
            .expect("stream ended without close frame")
            .expect("websocket error");

        match msg {
            Message::Close(Some(frame)) => {
                assert_eq!(frame.code, CloseCode::Library(4001));
                let reason = frame.reason.as_str();
                assert!(
                    reason.contains(&format!("server={}", server_ver))
                        && reason.contains(&format!("client={}", client_ver)),
                    "unexpected close reason: {}",
                    reason
                );
            }
            other => panic!("expected Close(4001) frame, got {:?}", other),
        }
        assert_eq!(server.active_connections_count().await, 0);
    }

    #[tokio::test]
    async fn test_ws_protocol_version_non_numeric_200_chars_closes_with_4001_invalid() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let token = auth.generate_test_token("bad-proto-player", "Tester", 3600);
        let bad_proto = "x".repeat(200);
        let url = format!(
            "ws://{}/ws?token={}&proto={}",
            server.local_addr(),
            token,
            bad_proto
        );

        let (mut client, _) = connect_async(&url).await.unwrap();
        let msg = tokio::time::timeout(Duration::from_secs(1), client.next())
            .await
            .expect("timeout waiting for close frame")
            .expect("stream ended without close frame")
            .expect("websocket error");

        match msg {
            Message::Close(Some(frame)) => {
                assert_eq!(frame.code, CloseCode::Library(4001));
                let reason = frame.reason.as_str();
                assert!(
                    reason.len() <= 123,
                    "close reason exceeds 123 bytes: len={}",
                    reason.len()
                );
                assert!(
                    reason.contains("client=invalid"),
                    "close reason must contain client=invalid, got: {}",
                    reason
                );
                assert!(!reason.contains(&bad_proto));
            }
            other => panic!("expected Close(4001) frame, got {:?}", other),
        }
        assert_eq!(server.active_connections_count().await, 0);
    }

    #[tokio::test]
    async fn test_ws_protocol_version_matching_and_absent_admitted() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let token1 = auth.generate_test_token("match-player", "Tester1", 3600);
        let token2 = auth.generate_test_token("legacy-player", "Tester2", 3600);
        let server_ver = crate::protocol::PROTOCOL_VERSION;

        let url_matching = format!(
            "ws://{}/ws?token={}&proto={}",
            server.local_addr(),
            token1,
            server_ver
        );
        let url_absent = format!("ws://{}/ws?token={}", server.local_addr(), token2);

        let (mut client_match, _) = connect_async(&url_matching).await.unwrap();
        let (mut client_absent, _) = connect_async(&url_absent).await.unwrap();

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_count().await, 2);

        let snapshot = [1u8, 2, 3, 4];
        server.broadcast_snapshot(&snapshot).await;

        let msg_match = tokio::time::timeout(Duration::from_secs(1), client_match.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let msg_absent = tokio::time::timeout(Duration::from_secs(1), client_absent.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(msg_match, Message::Binary(snapshot.to_vec().into()));
        assert_eq!(msg_absent, Message::Binary(snapshot.to_vec().into()));

        client_match.close(None).await.unwrap();
        client_absent.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_input_limits_oversized_packet_rejected_with_close_size() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let token = auth.generate_test_token("oversize-player", "Tester", 3600);
        let url = format!("ws://{}/ws?token={}&proto=1", server.local_addr(), token);

        let (mut client_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(server.active_connections_count().await, 1);

        // Send a binary packet larger than MAX_INPUT_PACKET_BYTES (512 bytes)
        let big_payload = vec![0xAA; MAX_INPUT_PACKET_BYTES + 1];
        client_ws
            .send(Message::Binary(big_payload.into()))
            .await
            .unwrap();

        let msg = tokio::time::timeout(Duration::from_secs(1), client_ws.next())
            .await
            .expect("should receive close frame for oversized packet")
            .expect("stream should yield close frame")
            .expect("no transport error");
        match msg {
            Message::Close(Some(frame)) => {
                assert_eq!(frame.code, CloseCode::Size);
            }
            other => panic!("expected Close(Size), got {:?}", other),
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(server.drain_inbound().await.is_empty());
        assert_eq!(server.active_connections_count().await, 0);
        assert_eq!(
            server.drain_disconnects().await,
            vec!["oversize-player".to_string()]
        );
    }

    #[tokio::test]
    async fn test_ws_input_limits_per_connection_rate_limiter_drops_excess() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone())
            .await
            .unwrap()
            .with_rate_limit(10, 5);
        let token = auth.generate_test_token("spam-player", "Tester", 3600);
        let url = format!("ws://{}/ws?token={}&proto=1", server.local_addr(), token);

        let (mut client_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;

        // Send 15 small packets in a tight burst; burst capacity is 5
        for i in 0..15u8 {
            client_ws
                .send(Message::Binary(vec![i].into()))
                .await
                .unwrap();
        }
        tokio::time::sleep(Duration::from_millis(60)).await;

        let accepted = server.drain_inbound().await;
        assert!(
            accepted.len() >= 5 && accepted.len() <= 7,
            "expected burst ~5 accepted packets, got {}",
            accepted.len()
        );
        assert!(
            server.rate_limited_drop_count() >= 8,
            "expected excess packets dropped by rate limiter, got {}",
            server.rate_limited_drop_count()
        );
        // Connection remains alive after rate-limiting excess packets
        assert_eq!(server.active_connections_count().await, 1);
        client_ws.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_input_limits_bounded_outbound_queue_evicts_stalled_connection() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone())
            .await
            .unwrap()
            .with_outbound_queue_depth(4);
        let addr = server.local_addr();

        // Perform a raw TCP WebSocket handshake and then never read from the socket,
        // simulating a stalled client whose TCP receive buffer and outbound channel fill up.
        let mut raw_stream = TcpStream::connect(addr).await.unwrap();
        let key = generate_key();
        let req = format!(
            "GET /ws?token=dev-token:stalled-user&proto=1 HTTP/1.1\r\n\
             Host: {addr}\r\n\
             Upgrade: websocket\r\n\
             Connection: Upgrade\r\n\
             Sec-WebSocket-Key: {key}\r\n\
             Sec-WebSocket-Version: 13\r\n\r\n"
        );
        raw_stream.write_all(req.as_bytes()).await.unwrap();
        let mut resp_buf = [0u8; 512];
        let n = raw_stream.read(&mut resp_buf).await.unwrap();
        assert!(String::from_utf8_lossy(&resp_buf[..n]).starts_with("HTTP/1.1 101"));

        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(server.active_connections_count().await, 1);

        // Flood large snapshots without reading from raw_stream so write_task blocks and
        // the bounded channel (depth 4) fills up.
        let big_snapshot = vec![0x55u8; 64 * 1024];
        for _ in 0..128 {
            server.broadcast_snapshot(&big_snapshot).await;
            if server.active_connections_count().await == 0 {
                break;
            }
        }

        assert_eq!(
            server.active_connections_count().await,
            0,
            "stalled connection should be evicted once outbound queue is full"
        );
        assert_eq!(
            server.drain_disconnects().await,
            vec!["stalled-user".to_string()]
        );
    }

    #[tokio::test]
    async fn test_ws_input_limits_idle_connection_dropped_after_timeout() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone())
            .await
            .unwrap()
            .with_idle_timeout(Duration::from_millis(120));
        let token = auth.generate_test_token("idle-player", "Tester", 3600);
        let url = format!("ws://{}/ws?token={}&proto=1", server.local_addr(), token);

        let (mut client_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(server.active_connections_count().await, 1);

        // Stay silent past the 120ms idle timeout
        let msg = tokio::time::timeout(Duration::from_secs(1), client_ws.next())
            .await
            .expect("idle connection should receive close frame")
            .expect("stream should yield close frame")
            .expect("no transport error");
        match msg {
            Message::Close(Some(frame)) => {
                assert_eq!(frame.code, CloseCode::Policy);
                assert!(frame.reason.contains("idle"));
            }
            other => panic!("expected Close(Policy) for idle timeout, got {:?}", other),
        }

        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(server.active_connections_count().await, 0);
        assert_eq!(
            server.drain_disconnects().await,
            vec!["idle-player".to_string()]
        );
    }

    async fn http_get(addr: SocketAddr, path: &str) -> (u16, String) {
        let mut stream = TcpStream::connect(addr).await.unwrap();
        let req = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        let text = String::from_utf8_lossy(&buf).into_owned();
        let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
        let code = head
            .lines()
            .next()
            .unwrap_or("")
            .split_whitespace()
            .nth(1)
            .unwrap_or("0")
            .parse::<u16>()
            .unwrap_or(0);
        (code, body.to_string())
    }

    #[tokio::test]
    async fn test_healthz_readyz_and_graceful_shutdown_close_frames() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        // /healthz and /readyz return 200 OK while running
        let (health_code, health_body) = http_get(addr, "/healthz").await;
        assert_eq!(health_code, 200);
        assert!(health_body.contains("\"healthy\""));

        let (ready_code, ready_body) = http_get(addr, "/readyz").await;
        assert_eq!(ready_code, 200);
        assert!(ready_body.contains("\"ready\":true"));

        // Connect two active WebSocket clients
        let url1 = format!("ws://{addr}/ws?token=dev-token:shut-1&proto=1");
        let url2 = format!("ws://{addr}/ws?token=dev-token:shut-2&proto=1");
        let (mut ws1, _) = connect_async(&url1).await.unwrap();
        let (mut ws2, _) = connect_async(&url2).await.unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(server.active_connections_count().await, 2);

        // Initiate graceful shutdown
        server.shutdown().await;
        assert!(!server.is_ready());
        assert_eq!(server.active_connections_count().await, 0);

        // /readyz now returns 503 Service Unavailable while /healthz remains 200
        let (ready_code_after, ready_body_after) = http_get(addr, "/readyz").await;
        assert_eq!(ready_code_after, 503);
        assert!(ready_body_after.contains("\"ready\":false"));

        // Both connected clients receive CloseCode::Away (1001)
        for ws in [&mut ws1, &mut ws2] {
            let msg = tokio::time::timeout(Duration::from_secs(1), ws.next())
                .await
                .expect("client should receive shutdown close frame")
                .expect("stream should yield close frame")
                .expect("no transport error");
            match msg {
                Message::Close(Some(frame)) => {
                    assert_eq!(frame.code, CloseCode::Away);
                    assert!(frame.reason.contains("shutting down"));
                }
                other => panic!("expected Close(Away) on shutdown, got {:?}", other),
            }
        }
    }

    #[tokio::test]
    async fn test_metrics_endpoint_reports_tick_time_players_entities_and_bytes_sent() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        let url = format!("ws://{addr}/ws?token=dev-token:metrics-p1&proto=1");
        let (mut ws1, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;

        server.record_tick_metrics(Duration::from_micros(2500), 37);
        server.record_tick_metrics(Duration::from_micros(4500), 42);
        server
            .broadcast_snapshot(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
            .await;

        let (code, body) = http_get(addr, "/metrics").await;
        assert_eq!(code, 200);
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["players"], 1);
        assert_eq!(parsed["entities"], 42);
        assert_eq!(parsed["bytes_sent"], 10);
        assert_eq!(parsed["frames_sent"], 1);
        assert_eq!(parsed["ticks_completed"], 2);
        assert!(parsed["tick_time_ms"]["last"].as_f64().unwrap() >= 4.0);
        assert!(parsed["tick_time_ms"]["max"].as_f64().unwrap() >= 4.0);

        ws1.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_origin_allowlist_accepts_local_and_configured_and_rejects_evil_origin() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone())
            .await
            .unwrap()
            .with_allowed_origins(vec!["https://play.atlasworld.example".to_string()]);
        let addr = server.local_addr();
        let token = auth.generate_test_token("origin-player", "Hero", 3600);

        // 1. Disallowed origin -> rejected (403 Forbidden)
        let evil_req = ClientRequest::builder()
            .uri(format!("ws://{addr}/ws?proto=1"))
            .header("Host", addr.to_string())
            .header("Origin", "https://evil.example")
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", generate_key())
            .header("Sec-WebSocket-Protocol", format!("atlas-v1, token.{token}"))
            .body(())
            .unwrap();
        assert!(
            connect_async(evil_req).await.is_err(),
            "untrusted Origin must be rejected on WS upgrade"
        );

        // 2. Configured allowed origin + token in Sec-WebSocket-Protocol (no token in URL) -> accepted
        let allowed_req = ClientRequest::builder()
            .uri(format!("ws://{addr}/ws?proto=1"))
            .header("Host", addr.to_string())
            .header("Origin", "https://play.atlasworld.example")
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", generate_key())
            .header("Sec-WebSocket-Protocol", format!("atlas-v1, token.{token}"))
            .body(())
            .unwrap();
        let (mut ws, resp) = connect_async(allowed_req)
            .await
            .expect("configured Origin with Sec-WebSocket-Protocol token should connect");
        assert_eq!(resp.status(), StatusCode::SWITCHING_PROTOCOLS);
        assert_eq!(
            resp.headers()
                .get("Sec-WebSocket-Protocol")
                .and_then(|v| v.to_str().ok()),
            Some("atlas-v1")
        );
        ws.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_player_cap_per_region_rejects_excess_with_4003_and_allows_other_regions() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone())
            .await
            .unwrap()
            .with_max_players_per_room(2);
        let addr = server.local_addr();

        // 1. Connect 2 distinct players to map-for-play (reaches cap = 2)
        let url1 = format!("ws://{addr}/ws?token=dev-token:cap-p1&map=map-for-play&proto=1");
        let url2 = format!("ws://{addr}/ws?token=dev-token:cap-p2&map=map-for-play&proto=1");
        let (mut ws1, _) = connect_async(&url1).await.unwrap();
        let (mut ws2, _) = connect_async(&url2).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_in_room("map-for-play").await, 2);

        // 2. 3rd distinct player in map-for-play is rejected with Close(4003) "region full"
        let url3 = format!("ws://{addr}/ws?token=dev-token:cap-p3&map=map-for-play&proto=1");
        let (mut ws3, _) = connect_async(&url3).await.unwrap();
        let close_msg = tokio::time::timeout(Duration::from_secs(1), ws3.next())
            .await
            .expect("excess player should receive close frame")
            .expect("stream should yield close frame")
            .expect("no transport error");
        match close_msg {
            Message::Close(Some(frame)) => {
                assert_eq!(
                    frame.code,
                    CloseCode::Library(crate::protocol::REGION_FULL_CLOSE_CODE)
                );
                assert!(
                    frame.reason.contains("region full"),
                    "unexpected close reason: {}",
                    frame.reason
                );
            }
            other => panic!("expected Close(4003) for region full, got {:?}", other),
        }
        assert_eq!(server.active_connections_in_room("map-for-play").await, 2);

        // 3. Reconnecting an already-admitted session (cap-p1) in the same region replaces its own slot
        let (mut ws1_reconn, _) = connect_async(&url1).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(server.active_connections_in_room("map-for-play").await, 2);
        let _ = ws1.close(None).await;

        // 4. Another region (map-for-test-deflect) still accepts new players while map-for-play is full
        let url_other =
            format!("ws://{addr}/ws?token=dev-token:cap-p3&map=map-for-test-deflect&proto=1");
        let (mut ws_other, _) = connect_async(&url_other).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(
            server
                .active_connections_in_room("map-for-test-deflect")
                .await,
            1
        );

        ws1_reconn.close(None).await.unwrap();
        ws2.close(None).await.unwrap();
        ws_other.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_broadcast_aoi_snapshots_to_room_sends_each_player_only_nearby_entities() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();

        let url1 = format!("ws://{addr}/ws?token=dev-token:aoi-west&map=map-for-play&proto=1");
        let url2 = format!("ws://{addr}/ws?token=dev-token:aoi-east&map=map-for-play&proto=1");
        let (mut ws_west, _) = connect_async(&url1).await.unwrap();
        let (mut ws_east, _) = connect_async(&url2).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        let west_id = crate::protocol::fnv1a_32("aoi-west");
        let east_id = crate::protocol::fnv1a_32("aoi-east");
        let entities = vec![
            crate::protocol::EntitySnapshotData {
                id: west_id,
                x: 200.0,
                y: 200.0,
                ..Default::default()
            },
            crate::protocol::EntitySnapshotData {
                id: 1001,
                x: 350.0,
                y: 200.0,
                ..Default::default()
            },
            crate::protocol::EntitySnapshotData {
                id: east_id,
                x: 3500.0,
                y: 3500.0,
                ..Default::default()
            },
            crate::protocol::EntitySnapshotData {
                id: 2002,
                x: 3600.0,
                y: 3500.0,
                ..Default::default()
            },
        ];

        let mut aoi = crate::spatial::AoiTracker::default();
        let mut builder = crate::protocol::SnapshotBuilder::new();
        server
            .broadcast_aoi_snapshots_to_room(
                "map-for-play",
                &mut aoi,
                &mut builder,
                1,
                1000,
                &entities,
                &[],
                &[],
            )
            .await;

        let west_msg = tokio::time::timeout(Duration::from_secs(1), ws_west.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let east_msg = tokio::time::timeout(Duration::from_secs(1), ws_east.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();

        let decode_ids = |msg: Message| -> Vec<u32> {
            let Message::Binary(bin) = msg else {
                panic!("expected binary snapshot");
            };
            let snap = crate::protocol::root_as_world_snapshot(&bin).unwrap();
            let ents = snap.entities().unwrap();
            (0..ents.len()).map(|i| ents.get(i).id()).collect()
        };

        let west_ids = decode_ids(west_msg);
        let east_ids = decode_ids(east_msg);
        assert_eq!(west_ids, vec![west_id, 1001]);
        assert_eq!(east_ids, vec![east_id, 2002]);

        ws_west.close(None).await.unwrap();
        ws_east.close(None).await.unwrap();
    }

    #[tokio::test]
    async fn test_ws_server_routes_generated_world_region_millcross_ford() {
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let addr = server.local_addr();
        let url = format!("ws://{addr}/ws?token=dev-token:region-p1&map=millcross-ford&proto=1");
        let (mut ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(server.active_connections_in_room("millcross-ford").await, 1);
        ws.close(None).await.unwrap();
    }
}
