use crate::auth::AuthGuard;
use crate::debug::{DebugCommand, DebugCommandBody, MAX_COMMANDS_PER_TICK};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::{oneshot, RwLock};
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

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

pub struct WsServer {
    local_addr: SocketAddr,
    connections: Arc<RwLock<HashMap<String, UnboundedSender<Message>>>>,
    session_rooms: Arc<RwLock<HashMap<String, String>>>,
    auth_guard: AuthGuard,
    inbound_tx: UnboundedSender<ClientPacket>,
    inbound_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<ClientPacket>>>,
    disconnect_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<(String, String)>>>,
    pub nakama_client: Option<Arc<crate::storage::NakamaClient>>,
    nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
    debug_enabled: Arc<AtomicBool>,
    debug_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<DebugRequest>>>,
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
        let (inbound_tx, inbound_rx) = unbounded_channel();
        let inbound_rx = Arc::new(tokio::sync::Mutex::new(inbound_rx));
        let (disconnect_tx, disconnect_rx) = unbounded_channel();
        let disconnect_rx = Arc::new(tokio::sync::Mutex::new(disconnect_rx));
        let nakama_ref = Arc::new(std::sync::RwLock::new(None));
        let debug_enabled = Arc::new(AtomicBool::new(false));
        let (debug_tx, debug_rx) = unbounded_channel();

        let server = Self {
            local_addr,
            connections: connections.clone(),
            session_rooms: session_rooms.clone(),
            auth_guard: auth_guard.clone(),
            inbound_tx: inbound_tx.clone(),
            inbound_rx,
            disconnect_rx,
            nakama_client: None,
            nakama_ref: nakama_ref.clone(),
            debug_enabled: debug_enabled.clone(),
            debug_rx: Arc::new(tokio::sync::Mutex::new(debug_rx)),
        };

        // Spawn accept loop
        tokio::spawn(Self::accept_loop(
            listener,
            connections,
            session_rooms,
            auth_guard,
            inbound_tx,
            disconnect_tx,
            nakama_ref,
            DebugGate {
                enabled: debug_enabled,
                tx: debug_tx,
            },
        ));

        Ok(server)
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

    pub fn connections(&self) -> Arc<RwLock<HashMap<String, UnboundedSender<Message>>>> {
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

    pub fn inbound_tx(&self) -> &UnboundedSender<ClientPacket> {
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
        gone.retain(|(s, _)| !has_session(&conns, s));
        gone
    }

    /// Broadcast serialized snapshot bytes to all active sessions.
    pub async fn broadcast_snapshot(&self, bytes: &[u8]) {
        let conns = self.connections.read().await;
        if conns.is_empty() {
            return;
        }

        let msg = Message::Binary(bytes.to_vec().into());
        for (session_id, tx) in conns.iter() {
            if let Err(e) = tx.send(msg.clone()) {
                debug!("Failed to send snapshot to session {}: {}", session_id, e);
            }
        }
    }

    /// Broadcast serialized snapshot bytes to active sessions in a specific room.
    pub async fn broadcast_snapshot_to_room(&self, room_id: &str, bytes: &[u8]) {
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
                if let Err(e) = tx.send(msg.clone()) {
                    debug!("Failed to send snapshot to session {}: {}", conn_key, e);
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn accept_loop(
        listener: TcpListener,
        connections: Arc<RwLock<HashMap<String, UnboundedSender<Message>>>>,
        session_rooms: Arc<RwLock<HashMap<String, String>>>,
        auth_guard: AuthGuard,
        inbound_tx: UnboundedSender<ClientPacket>,
        disconnect_tx: UnboundedSender<(String, String)>,
        nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
        debug: DebugGate,
    ) {
        info!(
            "WebSocket accept loop running on {}",
            listener.local_addr().unwrap()
        );
        while let Ok((stream, peer_addr)) = listener.accept().await {
            if let Err(e) = stream.set_nodelay(true) {
                warn!("Failed to set TCP_NODELAY for {}: {}", peer_addr, e);
            }
            let conns = connections.clone();
            let rooms = session_rooms.clone();
            let auth = auth_guard.clone();
            let in_tx = inbound_tx.clone();
            let dc_tx = disconnect_tx.clone();
            let nakama = nakama_ref.clone();
            let debug = debug.clone();

            tokio::spawn(async move {
                if is_debug_http(&stream).await {
                    serve_debug_http(stream, peer_addr.ip(), debug).await;
                    return;
                }
                Self::handle_connection(
                    stream, peer_addr, conns, rooms, auth, in_tx, dc_tx, nakama,
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

    #[allow(clippy::result_large_err, clippy::too_many_arguments)]
    async fn handle_connection(
        stream: TcpStream,
        peer_addr: SocketAddr,
        connections: Arc<RwLock<HashMap<String, UnboundedSender<Message>>>>,
        session_rooms: Arc<RwLock<HashMap<String, String>>>,
        auth_guard: AuthGuard,
        inbound_tx: UnboundedSender<ClientPacket>,
        disconnect_tx: UnboundedSender<(String, String)>,
        nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
    ) {
        let mut session_id = String::new();
        let mut room_id = "map-for-play".to_string();
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

        let ws_stream = match accept_hdr_async(stream, callback).await {
            Ok(ws) => ws,
            Err(e) => {
                debug!("WebSocket handshake failed with {}: {}", peer_addr, e);
                return;
            }
        };

        // When token is validated, if nakama_client is configured, fetch get_loadout(&session_id)
        let client_opt = nakama_ref.read().unwrap().clone();
        if let Some(client) = client_opt {
            match client.get_loadout(&session_id).await {
                Ok(Some(loadout)) => {
                    info!(
                        "Retrieved persistent loadout for user {}: level {}",
                        session_id, loadout.profile.level
                    );
                }
                Ok(None) => {
                    info!("No persistent loadout for user {}, defaulting", session_id);
                }
                Err(e) => {
                    warn!(
                        "Failed to fetch persistent loadout for user {}: {}",
                        session_id, e
                    );
                }
            }
        }

        let (mut ws_write, mut ws_read) = ws_stream.split();
        let (out_tx, mut out_rx) = unbounded_channel::<Message>();

        // Register under a per-connection key. Two sockets for the same session (StrictMode
        // double-mount, reload, second tab) finish their handshakes concurrently, so
        // registration order is arbitrary — a session-keyed map let whichever registered
        // last evict the other, and closing the discarded one left the live tab with no feed.
        static CONN_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let conn_key = format!(
            "{}#{}",
            session_id,
            CONN_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        {
            let mut conns = connections.write().await;
            conns.insert(conn_key.clone(), out_tx);
            let mut rooms = session_rooms.write().await;
            rooms.insert(conn_key.clone(), room_id.clone());
        }

        // Task for writing outbound messages to client
        let session_id_out = session_id.clone();
        let write_task = tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                if let Err(e) = ws_write.send(msg).await {
                    debug!("WebSocket write error for {}: {}", session_id_out, e);
                    break;
                }
            }
        });

        // Inbound loop reading messages from client
        while let Some(msg_result) = ws_read.next().await {
            match msg_result {
                Ok(Message::Binary(bin)) => {
                    let packet = ClientPacket {
                        session_id: session_id.clone(),
                        room_id: room_id.clone(),
                        payload: bin.to_vec(),
                    };
                    if let Err(e) = inbound_tx.send(packet) {
                        error!("Failed to route inbound client packet: {}", e);
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

        // Clean up only this connection's entry; other sockets for the session stay live.
        // Only when the session's LAST socket closes does the sim drop its avatar.
        {
            let mut conns = connections.write().await;
            conns.remove(&conn_key);
            let mut rooms = session_rooms.write().await;
            rooms.remove(&conn_key);
            if !has_session(&conns, &session_id) {
                let _ = disconnect_tx.send((session_id.clone(), room_id.clone()));
            }
        }
        write_task.abort();
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

fn has_session(conns: &HashMap<String, UnboundedSender<Message>>, session_id: &str) -> bool {
    conns
        .keys()
        .any(|k| k.rsplit_once('#').is_some_and(|(s, _)| s == session_id))
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
    async fn test_stale_duplicate_session_close_keeps_newer_socket() {
        // Regression: StrictMode double-mount / page reload opens a 2nd socket for the
        // same session; when the old one closed it unregistered the NEW one, so the
        // live tab silently stopped receiving snapshots.
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let url = format!("ws://{}/ws?token=dev-token:dup", server.local_addr());

        let (mut old_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        let (mut new_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        old_ws.close(None).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(server.active_connections_count().await, 1);

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
    async fn test_closing_last_registered_duplicate_keeps_other_socket_live() {
        // Regression: StrictMode opens two sockets whose handshakes finish in the same
        // instant, so server registration order is arbitrary. If the socket the client
        // discards registered LAST, a session-keyed registry dropped the live socket.
        let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
        let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
        let url = format!("ws://{}/ws?token=dev-token:dup2", server.local_addr());

        let (mut kept_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        let (mut discarded_ws, _) = connect_async(&url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        discarded_ws.close(None).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(server.active_connections_count().await, 1);

        server.broadcast_snapshot(&[9, 9]).await;
        let msg = tokio::time::timeout(Duration::from_secs(1), kept_ws.next())
            .await
            .expect("remaining socket must still receive snapshots")
            .unwrap()
            .unwrap();
        assert_eq!(msg, Message::Binary(vec![9u8, 9].into()));
        kept_ws.close(None).await.unwrap();
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
}
