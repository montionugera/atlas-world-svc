use crate::auth::AuthGuard;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::RwLock;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

/// Inbound client message packet received from an authenticated session.
#[derive(Debug, Clone, PartialEq)]
pub struct ClientPacket {
    pub session_id: String,
    pub payload: Vec<u8>,
}

/// WebSocket Gateway server managing active client sessions and snapshot broadcasting.
pub struct WsServer {
    local_addr: SocketAddr,
    connections: Arc<RwLock<HashMap<String, UnboundedSender<Message>>>>,
    auth_guard: AuthGuard,
    inbound_tx: UnboundedSender<ClientPacket>,
    inbound_rx: Arc<tokio::sync::Mutex<UnboundedReceiver<ClientPacket>>>,
    pub nakama_client: Option<Arc<crate::storage::NakamaClient>>,
    nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
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
        let (inbound_tx, inbound_rx) = unbounded_channel();
        let inbound_rx = Arc::new(tokio::sync::Mutex::new(inbound_rx));
        let nakama_ref = Arc::new(std::sync::RwLock::new(None));

        let server = Self {
            local_addr,
            connections: connections.clone(),
            auth_guard: auth_guard.clone(),
            inbound_tx: inbound_tx.clone(),
            inbound_rx,
            nakama_client: None,
            nakama_ref: nakama_ref.clone(),
        };

        // Spawn accept loop
        tokio::spawn(Self::accept_loop(
            listener,
            connections,
            auth_guard,
            inbound_tx,
            nakama_ref,
        ));

        Ok(server)
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

    async fn accept_loop(
        listener: TcpListener,
        connections: Arc<RwLock<HashMap<String, UnboundedSender<Message>>>>,
        auth_guard: AuthGuard,
        inbound_tx: UnboundedSender<ClientPacket>,
        nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
    ) {
        info!(
            "WebSocket accept loop running on {}",
            listener.local_addr().unwrap()
        );
        while let Ok((stream, peer_addr)) = listener.accept().await {
            let conns = connections.clone();
            let auth = auth_guard.clone();
            let in_tx = inbound_tx.clone();
            let nakama = nakama_ref.clone();

            tokio::spawn(async move {
                Self::handle_connection(stream, peer_addr, conns, auth, in_tx, nakama).await;
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

    #[allow(clippy::result_large_err)]
    async fn handle_connection(
        stream: TcpStream,
        peer_addr: SocketAddr,
        connections: Arc<RwLock<HashMap<String, UnboundedSender<Message>>>>,
        auth_guard: AuthGuard,
        inbound_tx: UnboundedSender<ClientPacket>,
        nakama_ref: Arc<std::sync::RwLock<Option<Arc<crate::storage::NakamaClient>>>>,
    ) {
        let mut session_id = String::new();
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

            match auth_ref.validate_token(&token) {
                Ok(claims) => {
                    session_id = claims.sub;
                    info!(
                        "WebSocket handshake authenticated: user={} from {}",
                        session_id, peer_addr
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

        // Register active session
        {
            let mut conns = connections.write().await;
            conns.insert(session_id.clone(), out_tx);
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

        // Clean up connection
        {
            let mut conns = connections.write().await;
            conns.remove(&session_id);
        }
        write_task.abort();
        info!("Session {} disconnected", session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::handshake::client::generate_key;
    use tokio_tungstenite::tungstenite::handshake::client::Request as ClientRequest;

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
}
