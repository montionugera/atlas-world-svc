use crate::auth::AuthGuard;
use crate::meta::engine::{RpcContext, RustMetaEngine};
use crate::meta::models::MetaError;
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{debug, info, warn};

/// Default Nakama S2S HTTP key matching `nakama/local.yml` (`runtime.http_key`).
pub const DEFAULT_NAKAMA_HTTP_KEY: &str = "atlas_dev_http_key";

/// Default Nakama client server key matching `nakama/local.yml` (`socket.server_key`).
pub const DEFAULT_NAKAMA_SERVER_KEY: &str = "defaultkey";

/// Default session token validity (7 days, matching `nakama/local.yml` `session.token_expiry_sec: 604800`).
pub const DEFAULT_SESSION_EXPIRY_SECS: i64 = 7 * 86400;

const META_HEAD_MAX_BYTES: usize = 16 * 1024;
const META_BODY_MAX_BYTES: usize = 64 * 1024;

/// Shared configuration for the Nakama-compatible `/v2/*` HTTP gateway.
#[derive(Clone)]
pub struct MetaHttpConfig {
    pub engine: Arc<RustMetaEngine>,
    pub auth_guard: AuthGuard,
    pub http_key: String,
    pub server_key: String,
}

impl MetaHttpConfig {
    pub fn new(
        engine: Arc<RustMetaEngine>,
        auth_guard: AuthGuard,
        http_key: impl Into<String>,
        server_key: impl Into<String>,
    ) -> Self {
        Self {
            engine,
            auth_guard,
            http_key: http_key.into(),
            server_key: server_key.into(),
        }
    }

    pub fn from_env(engine: Arc<RustMetaEngine>, auth_guard: AuthGuard) -> Self {
        let http_key = std::env::var("NAKAMA_HTTP_KEY")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_NAKAMA_HTTP_KEY.to_string());
        let server_key = std::env::var("NAKAMA_SERVER_KEY")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_NAKAMA_SERVER_KEY.to_string());
        Self::new(engine, auth_guard, http_key, server_key)
    }
}

/// Returns `true` when the TCP stream begins with an HTTP request targeting `/v2/*`.
pub async fn is_meta_http(stream: &TcpStream) -> bool {
    let mut head = [0u8; 16];
    let n = stream.peek(&mut head).await.unwrap_or(0);
    [
        &b"GET /v2/"[..],
        &b"POST /v2/"[..],
        &b"OPTIONS /v2/"[..],
        &b"PUT /v2/"[..],
        &b"DELETE /v2/"[..],
    ]
    .iter()
    .any(|prefix| head[..n].starts_with(prefix))
}

/// Returns `true` when the TCP stream begins with a Godot/Nakama socket probe
/// (`GET /ws?lang=...&status=...`), which must receive `404 Not Found` rather than colliding
/// with the gameplay WebSocket endpoint (`/ws?token=...&map=...&proto=...`).
pub async fn is_nakama_socket_probe(stream: &TcpStream) -> bool {
    let mut head = [0u8; 160];
    let n = stream.peek(&mut head).await.unwrap_or(0);
    let slice = &head[..n];
    if !slice.starts_with(b"GET /ws?") {
        return false;
    }
    let first_line_end = slice
        .iter()
        .position(|&b| b == b'\r' || b == b'\n')
        .unwrap_or(slice.len());
    let line = String::from_utf8_lossy(&slice[..first_line_end]);
    let target = line.split_whitespace().nth(1).unwrap_or("");
    let (_, query) = target.split_once('?').unwrap_or((target, ""));
    query
        .split('&')
        .any(|pair| pair.starts_with("status=") || pair.starts_with("lang="))
}

/// Responds with `404 Not Found` to Nakama socket probes (`/ws?status=...`).
pub async fn serve_nakama_socket_404(mut stream: TcpStream) {
    let mut buf = [0u8; 1024];
    let _ =
        tokio::time::timeout(std::time::Duration::from_millis(200), stream.read(&mut buf)).await;
    let body = r#"{"error":"Nakama WebSocket endpoint not enabled","message":"Nakama WebSocket endpoint not enabled","code":12}"#;
    let resp = format!(
        "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// Spawns a standalone TCP listener serving `/v2/*` HTTP requests (used when `META_BIND_ADDR` is set).
pub async fn spawn_meta_http_listener(
    bind_addr: &str,
    cfg: MetaHttpConfig,
) -> Result<SocketAddr, String> {
    let listener = TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("Failed to bind META_BIND_ADDR {}: {}", bind_addr, e))?;
    let local_addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to read META_BIND_ADDR local_addr: {}", e))?;

    tokio::spawn(async move {
        info!("Meta HTTP gateway listening on {}", local_addr);
        while let Ok((stream, peer_addr)) = listener.accept().await {
            let _ = stream.set_nodelay(true);
            let cfg_clone = cfg.clone();
            tokio::spawn(async move {
                if is_nakama_socket_probe(&stream).await {
                    serve_nakama_socket_404(stream).await;
                    return;
                }
                if is_meta_http(&stream).await {
                    serve_meta_http(stream, cfg_clone).await;
                } else {
                    debug!(
                        "Closing non-meta request on META_BIND_ADDR from {}",
                        peer_addr
                    );
                    serve_nakama_socket_404(stream).await;
                }
            });
        }
    });

    Ok(local_addr)
}

#[derive(Debug, Deserialize)]
struct AuthenticateDeviceBody {
    id: String,
}

#[derive(Debug, Deserialize)]
struct ReadStorageObjectId {
    collection: String,
    key: String,
    #[serde(default, alias = "userId")]
    user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReadStorageObjectsBody {
    #[serde(default, alias = "objectIds")]
    object_ids: Vec<ReadStorageObjectId>,
}

/// Serves a single Nakama `/v2/*` HTTP request over `stream` and closes the connection.
pub async fn serve_meta_http(mut stream: TcpStream, cfg: MetaHttpConfig) {
    let mut raw = Vec::new();
    let mut chunk = [0u8; 2048];
    let head_end = loop {
        if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos;
        }
        match stream.read(&mut chunk).await {
            Ok(n) if n > 0 && raw.len() < META_HEAD_MAX_BYTES => {
                raw.extend_from_slice(&chunk[..n]);
            }
            _ => return,
        }
    };

    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let header = |name: &str| -> Option<&str> {
        head.lines()
            .skip(1)
            .filter_map(|line| line.split_once(':'))
            .find(|(k, _)| k.trim().eq_ignore_ascii_case(name))
            .map(|(_, v)| v.trim())
    };

    let origin = header("origin").map(ToOwned::to_owned);
    let auth_header = header("authorization").map(ToOwned::to_owned);
    let content_length = header("content-length").map(|v| v.parse::<usize>());

    let mut req_line = head.lines().next().unwrap_or("").split_whitespace();
    let method = req_line.next().unwrap_or("");
    let target = req_line.next().unwrap_or("");
    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    if method == "OPTIONS" {
        write_http_response(&mut stream, "204 No Content", "", origin.as_deref()).await;
        return;
    }

    let body_len = match content_length {
        Some(Ok(n)) if n <= META_BODY_MAX_BYTES => n,
        Some(Ok(_)) => {
            let err = MetaError::BadRequest("request body exceeds 64 KiB limit".to_string());
            write_meta_error(&mut stream, &err, origin.as_deref()).await;
            return;
        }
        Some(Err(_)) => {
            let err = MetaError::BadRequest("malformed Content-Length header".to_string());
            write_meta_error(&mut stream, &err, origin.as_deref()).await;
            return;
        }
        None => 0,
    };

    let body_start = head_end + 4;
    while raw.len() < body_start + body_len {
        match stream.read(&mut chunk).await {
            Ok(n) if n > 0 => raw.extend_from_slice(&chunk[..n]),
            _ => return,
        }
    }
    let body_bytes = &raw[body_start..body_start + body_len];
    let body_str = String::from_utf8_lossy(body_bytes);

    let result: Result<String, MetaError> =
        route_meta_request(method, path, query, auth_header.as_deref(), &body_str, &cfg);

    match result {
        Ok(payload) => {
            write_http_response(&mut stream, "200 OK", &payload, origin.as_deref()).await;
        }
        Err(err) => {
            warn!(
                method = %method,
                path = %path,
                status = ?err.http_status(),
                "Meta HTTP request failed: {}",
                err.message()
            );
            write_meta_error(&mut stream, &err, origin.as_deref()).await;
        }
    }
}

fn route_meta_request(
    method: &str,
    path: &str,
    query: &str,
    auth_header: Option<&str>,
    body_str: &str,
    cfg: &MetaHttpConfig,
) -> Result<String, MetaError> {
    match (method, path) {
        ("POST", "/v2/account/authenticate/device") => {
            verify_basic_server_key(auth_header, &cfg.server_key)?;
            let parsed: AuthenticateDeviceBody = serde_json::from_str(body_str)
                .map_err(|e| MetaError::BadRequest(format!("Invalid device auth body: {e}")))?;
            let create = query_param(query, "create")
                .map(|v| !matches!(v.as_str(), "false" | "0"))
                .unwrap_or(true);
            let username = query_param(query, "username");

            let account =
                cfg.engine
                    .authenticate_device(&parsed.id, username.as_deref(), create)?;
            let token = cfg.auth_guard.issue_session_token(
                &account.user_id,
                &account.username,
                DEFAULT_SESSION_EXPIRY_SECS,
            );
            Ok(serde_json::json!({
                "token": token,
            })
            .to_string())
        }
        ("GET", "/v2/account") => {
            let claims = verify_bearer_token(auth_header, &cfg.auth_guard)?;
            let (id, username) = match cfg.engine.get_account(&claims.sub)? {
                Some(acc) => (acc.user_id, acc.username),
                None => {
                    let fallback_name = claims.username.unwrap_or_else(|| claims.sub.clone());
                    (claims.sub, fallback_name)
                }
            };
            Ok(serde_json::json!({
                "user": {
                    "id": id,
                    "username": username,
                    "display_name": username,
                }
            })
            .to_string())
        }
        ("POST", "/v2/storage") => {
            let claims = verify_bearer_token(auth_header, &cfg.auth_guard)?;
            let parsed: ReadStorageObjectsBody = if body_str.trim().is_empty() {
                ReadStorageObjectsBody {
                    object_ids: Vec::new(),
                }
            } else {
                serde_json::from_str(body_str)
                    .map_err(|e| MetaError::BadRequest(format!("Invalid storage read body: {e}")))?
            };

            let mut objects = Vec::new();
            for item in parsed.object_ids {
                let target_user = item
                    .user_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or(&claims.sub);
                if let Some(doc) =
                    cfg.engine
                        .read_raw_doc(target_user, &item.collection, &item.key)?
                {
                    let can_read = (doc.user_id == claims.sub && doc.permission_read >= 1)
                        || doc.permission_read >= 2;
                    if can_read {
                        let value_str =
                            serde_json::to_string(&doc.value).unwrap_or_else(|_| "{}".to_string());
                        objects.push(serde_json::json!({
                            "collection": doc.collection,
                            "key": doc.key,
                            "user_id": doc.user_id,
                            "value": value_str,
                            "version": doc.version,
                            "permission_read": doc.permission_read,
                            "permission_write": doc.permission_write,
                        }));
                    }
                }
            }

            Ok(serde_json::json!({ "objects": objects }).to_string())
        }
        ("GET" | "POST", _) if path.starts_with("/v2/rpc/") => {
            let rpc_id = path.trim_start_matches("/v2/rpc/").trim_end_matches('/');
            if rpc_id.is_empty() {
                return Err(MetaError::NotFound("Missing RPC id".to_string()));
            }

            let ctx = authenticate_rpc_caller(query, auth_header, &cfg.http_key, &cfg.auth_guard)?;
            let payload_arg = if method == "GET" { "" } else { body_str };
            let result_val = cfg.engine.invoke_rpc(&ctx, rpc_id, payload_arg)?;

            if has_query_flag(query, "unwrap") {
                serde_json::to_string(&result_val).map_err(|e| {
                    MetaError::Internal(format!("Failed to serialize RPC result: {e}"))
                })
            } else {
                let inner = serde_json::to_string(&result_val).map_err(|e| {
                    MetaError::Internal(format!("Failed to serialize RPC result: {e}"))
                })?;
                Ok(serde_json::json!({ "payload": inner }).to_string())
            }
        }
        _ => Err(MetaError::NotFound(format!(
            "Route {} {} not found",
            method, path
        ))),
    }
}

fn verify_basic_server_key(
    auth_header: Option<&str>,
    expected_server_key: &str,
) -> Result<(), MetaError> {
    let raw = auth_header
        .ok_or_else(|| MetaError::Unauthorized("Missing Authorization header".to_string()))?;
    let b64 = raw
        .strip_prefix("Basic ")
        .or_else(|| raw.strip_prefix("basic "))
        .ok_or_else(|| MetaError::Unauthorized("Expected Basic Authorization header".to_string()))?
        .trim();
    let decoded_bytes = decode_base64(b64)
        .ok_or_else(|| MetaError::Unauthorized("Malformed base64 Basic credentials".to_string()))?;
    let decoded = String::from_utf8(decoded_bytes)
        .map_err(|_| MetaError::Unauthorized("Invalid UTF-8 in Basic credentials".to_string()))?;
    let (user, _pass) = decoded.split_once(':').ok_or_else(|| {
        MetaError::Unauthorized("Basic credentials missing ':' separator".to_string())
    })?;
    if user != expected_server_key {
        return Err(MetaError::Unauthorized("Server key invalid".to_string()));
    }
    Ok(())
}

fn verify_bearer_token(
    auth_header: Option<&str>,
    auth_guard: &AuthGuard,
) -> Result<crate::auth::Claims, MetaError> {
    let raw = auth_header
        .ok_or_else(|| MetaError::Unauthorized("Missing Authorization header".to_string()))?;
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))
        .ok_or_else(|| MetaError::Unauthorized("Expected Bearer Authorization header".to_string()))?
        .trim();
    auth_guard
        .validate_token(token)
        .map_err(|e| MetaError::Unauthorized(e.to_string()))
}

fn authenticate_rpc_caller(
    query: &str,
    auth_header: Option<&str>,
    expected_http_key: &str,
    auth_guard: &AuthGuard,
) -> Result<RpcContext, MetaError> {
    if let Some(provided_key) = query_param(query, "http_key") {
        if provided_key != expected_http_key {
            return Err(MetaError::Unauthorized("HTTP key invalid".to_string()));
        }
        return Ok(RpcContext::s2s());
    }
    let claims = verify_bearer_token(auth_header, auth_guard)?;
    Ok(RpcContext::client(claims.sub, claims.username))
}

fn has_query_flag(query: &str, key: &str) -> bool {
    query.split('&').any(|pair| {
        if pair == key {
            return true;
        }
        if let Some((k, v)) = pair.split_once('=') {
            k == key && !matches!(v, "false" | "0")
        } else {
            false
        }
    })
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    fn val(b: u8) -> Option<u8> {
        match b {
            b'A'..=b'Z' => Some(b - b'A'),
            b'a'..=b'z' => Some(b - b'a' + 26),
            b'0'..=b'9' => Some(b - b'0' + 52),
            b'+' | b'-' => Some(62),
            b'/' | b'_' => Some(63),
            _ => None,
        }
    }

    let clean: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if clean.is_empty() {
        return Some(Vec::new());
    }
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut i = 0;
    while i < clean.len() {
        let b0 = *clean.get(i)?;
        let b1 = *clean.get(i + 1)?;
        let b2 = clean.get(i + 2).copied().unwrap_or(b'=');
        let b3 = clean.get(i + 3).copied().unwrap_or(b'=');

        let v0 = val(b0)?;
        let v1 = val(b1)?;
        out.push((v0 << 2) | (v1 >> 4));

        if b2 != b'=' {
            let v2 = val(b2)?;
            out.push(((v1 & 0x0f) << 4) | (v2 >> 2));
            if b3 != b'=' {
                let v3 = val(b3)?;
                out.push(((v2 & 0x03) << 6) | v3);
            }
        }
        i += 4;
    }
    Some(out)
}

async fn write_meta_error(stream: &mut TcpStream, err: &MetaError, origin: Option<&str>) {
    let payload = serde_json::json!({
        "error": err.message(),
        "message": err.message(),
        "code": err.grpc_code(),
    })
    .to_string();
    let (_, status_str) = err.http_status();
    write_http_response(stream, status_str, &payload, origin).await;
}

async fn write_http_response(
    stream: &mut TcpStream,
    status: &str,
    payload: &str,
    origin: Option<&str>,
) {
    let allow_origin = origin.unwrap_or("*");
    let cors = format!(
        "Access-Control-Allow-Origin: {allow_origin}\r\n\
         Vary: Origin\r\n\
         Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n\
         Access-Control-Allow-Headers: content-type, authorization, accept\r\n"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{cors}Connection: close\r\n\r\n{payload}",
        payload.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_decoder_handles_standard_basic_auth_headers() {
        // "defaultkey:" -> "ZGVmYXVsdGtleTo="
        let decoded = decode_base64("ZGVmYXVsdGtleTo=").unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), "defaultkey:");

        assert!(verify_basic_server_key(Some("Basic ZGVmYXVsdGtleTo="), "defaultkey").is_ok());
        assert!(verify_basic_server_key(Some("Basic ZGVmYXVsdGtleTo="), "wrongkey").is_err());
    }
}
