use crate::auth::AuthGuard;
use crate::debug::{DebugCommand, DebugCommandBody, MAX_COMMANDS_PER_TICK};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
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
    limits: ConnectionLimits,
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
        let limits = ConnectionLimits {
            rate_limit: Arc::new(std::sync::RwLock::new((
                DEFAULT_MAX_INPUTS_PER_SEC,
                DEFAULT_INPUT_BURST_CAPACITY,
            ))),
            outbound_queue_depth: Arc::new(AtomicUsize::new(MAX_OUTBOUND_QUEUE_DEPTH)),
            idle_timeout: Arc::new(std::sync::RwLock::new(DEFAULT_IDLE_TIMEOUT)),
            rate_limited_drops: Arc::new(AtomicUsize::new(0)),
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
            limits: limits.clone(),
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
            limits,
        ));

        Ok(server)
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

    /// Returns the total number of inbound packets dropped due to per-connection rate limiting.
    pub fn rate_limited_drop_count(&self) -> usize {
        self.limits.rate_limited_drops.load(Ordering::Relaxed)
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
                    Ok(()) => {}
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
                        Ok(()) => {}
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
        limits: ConnectionLimits,
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
            let limits = limits.clone();

            tokio::spawn(async move {
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

        let callback = |req: &Request, response: Response| -> Result<Response, ErrorResponse> {
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
            room_id = crate::content::map::room_id_for(&req_map).to_string();
            req_proto = Self::extract_proto(req);

            match auth_ref.validate_token(&token) {
                Ok(claims) => {
                    session_id = claims.sub;
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
                for (old_key, _) in existing_keys {
                    if let Some(old_tx) = conns.remove(&old_key) {
                        let close_frame = CloseFrame {
                            code: CloseCode::Library(crate::protocol::DUPLICATE_SESSION_CLOSE_CODE),
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

        if superseded_on_arrival {
            let close_frame = CloseFrame {
                code: CloseCode::Library(crate::protocol::DUPLICATE_SESSION_CLOSE_CODE),
                reason: "session replaced by newer connection".into(),
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
}
