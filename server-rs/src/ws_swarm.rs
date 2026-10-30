//! Headless WebSocket load swarm harness for server-rs.
//!
//! Spawns real WebSocket client sockets over tokio, connecting to a running
//! WsServer, authenticating, and streaming move-input intents while capturing
//! snapshot arrival timings and bandwidth metrics.

use crate::protocol::serialize_client_input;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, warn};

/// Configuration for running a headless WebSocket swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmConfig {
    pub addr: String,
    pub clients: usize,
    pub duration: Duration,
    pub input_hz: u32,
    pub token: String,
}

impl SwarmConfig {
    pub fn new(
        addr: impl Into<String>,
        clients: usize,
        duration: Duration,
        input_hz: u32,
        token: impl Into<String>,
    ) -> Self {
        Self {
            addr: addr.into(),
            clients,
            duration,
            input_hz,
            token: token.into(),
        }
    }
}

/// Aggregated metrics report from a WebSocket swarm run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SwarmReport {
    pub clients_connected: usize,
    pub clients_failed: usize,
    pub clients_panicked: usize,
    pub clients_starved: usize,
    pub snapshots_received: usize,
    pub per_client_snapshots: Vec<usize>,
    pub min_snapshots_per_client: usize,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub max_ms: f64,
    pub bytes_per_client_per_sec: f64,
    pub server_rate_limited_drops: Option<usize>,
}

impl SwarmReport {
    /// Formats the report as a Markdown table.
    pub fn to_markdown_table(&self) -> String {
        let mut out = String::new();
        out.push_str("| Metric | Value |\n");
        out.push_str("|:---|---:|\n");
        out.push_str(&format!("| Clients Connected | {} |\n", self.clients_connected));
        out.push_str(&format!("| Clients Failed | {} |\n", self.clients_failed));
        out.push_str(&format!("| Clients Panicked | {} |\n", self.clients_panicked));
        out.push_str(&format!("| Clients Starved | {} |\n", self.clients_starved));
        out.push_str(&format!("| Snapshots Received | {} |\n", self.snapshots_received));
        out.push_str(&format!(
            "| Min Snapshots / Client | {} |\n",
            self.min_snapshots_per_client
        ));
        out.push_str(&format!("| Inter-Snapshot Gap p50 (ms) | {:.2} |\n", self.p50_ms));
        out.push_str(&format!("| Inter-Snapshot Gap p95 (ms) | {:.2} |\n", self.p95_ms));
        out.push_str(&format!("| Inter-Snapshot Gap max (ms) | {:.2} |\n", self.max_ms));
        out.push_str(&format!(
            "| Bandwidth (Bytes/client/sec) | {:.2} |\n",
            self.bytes_per_client_per_sec
        ));
        match self.server_rate_limited_drops {
            Some(drops) => out.push_str(&format!("| Server Rate Limited Drops | {} |\n", drops)),
            None => out.push_str("| Server Rate Limited Drops | n/a |\n"),
        }
        out
    }
}

/// Helper to normalize base address into a valid WebSocket URL for client `client_idx`.
fn build_ws_url(base_addr: &str, client_idx: usize, token_template: &str) -> (String, String) {
    let session_id = format!("swarm_client_{:03}", client_idx);

    let token = if token_template.contains("{}") {
        token_template.replace("{}", &session_id)
    } else if token_template.contains("{session_id}") {
        token_template.replace("{session_id}", &session_id)
    } else if token_template.contains("{client_idx}") {
        token_template.replace("{client_idx}", &client_idx.to_string())
    } else if token_template == "dev-token" {
        format!("dev-token:{}", session_id)
    } else if token_template.is_empty() {
        format!("dev-token:{}", session_id)
    } else {
        token_template.to_string()
    };

    let mut raw = base_addr.trim().to_string();
    if !raw.starts_with("ws://") && !raw.starts_with("wss://") {
        if let Some(rest) = raw.strip_prefix("http://") {
            raw = format!("ws://{}", rest);
        } else if let Some(rest) = raw.strip_prefix("https://") {
            raw = format!("wss://{}", rest);
        } else {
            raw = format!("ws://{}", raw);
        }
    }

    let (path_part, query_part) = match raw.split_once('?') {
        Some((p, q)) => (p.to_string(), Some(q.to_string())),
        None => (raw, None),
    };

    let ws_path = if path_part.ends_with("/ws") {
        path_part
    } else if let Some(stripped) = path_part.strip_suffix('/') {
        format!("{}/ws", stripped)
    } else {
        format!("{}/ws", path_part)
    };

    let mut params = Vec::new();
    if let Some(q) = query_part {
        for part in q.split('&') {
            if !part.is_empty()
                && !part.starts_with("token=")
                && !part.starts_with("proto=")
                && !part.starts_with("map=")
            {
                params.push(part.to_string());
            }
        }
    }
    params.push(format!("token={}", token));
    params.push(format!("proto={}", crate::protocol::PROTOCOL_VERSION));
    params.push("map=map-for-play".to_string());

    let url = format!("{}?{}", ws_path, params.join("&"));
    (url, session_id)
}

/// Helper to parse host and port from `addr` to query `/metrics`.
fn parse_host_port(addr: &str) -> String {
    let clean = addr
        .trim()
        .strip_prefix("ws://")
        .or_else(|| addr.trim().strip_prefix("wss://"))
        .or_else(|| addr.trim().strip_prefix("http://"))
        .or_else(|| addr.trim().strip_prefix("https://"))
        .unwrap_or(addr.trim());

    clean
        .split('/')
        .next()
        .unwrap_or("127.0.0.1:2567")
        .to_string()
}

/// Fetches `rate_limited_drops` from `http://{host_port}/metrics`.
async fn fetch_server_rate_limited_drops(host_port: &str) -> Option<usize> {
    let metrics_url = format!("http://{}/metrics", host_port);
    match reqwest::get(&metrics_url).await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(drops) = json.get("rate_limited_drops").and_then(|d| d.as_u64()) {
                    return Some(drops as usize);
                }
            }
            None
        }
        Err(e) => {
            debug!("Could not query {} for metrics: {}", metrics_url, e);
            None
        }
    }
}

struct ClientRunResult {
    connected: bool,
    snapshots_received: usize,
    bytes_received: usize,
    inter_snapshot_gaps: Vec<f64>,
}

/// Runs a single headless client task.
async fn run_single_client(
    base_addr: String,
    client_idx: usize,
    duration: Duration,
    input_hz: u32,
    token_template: String,
) -> ClientRunResult {
    let (url, _session_id) = build_ws_url(&base_addr, client_idx, &token_template);

    let ws_stream = match connect_async(&url).await {
        Ok((stream, _resp)) => stream,
        Err(e) => {
            warn!("Client {} failed to connect to {}: {}", client_idx, url, e);
            return ClientRunResult {
                connected: false,
                snapshots_received: 0,
                bytes_received: 0,
                inter_snapshot_gaps: Vec::new(),
            };
        }
    };

    let (mut ws_write, mut ws_read) = ws_stream.split();

    let input_period = Duration::from_secs_f64(1.0 / (input_hz.max(1) as f64));
    let mut ticker = tokio::time::interval(input_period);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let start = Instant::now();
    let deadline = start + duration;

    let mut client_tick: u32 = 0;
    let mut last_snapshot_instant: Option<Instant> = None;
    let mut inter_snapshot_gaps = Vec::new();
    let mut snapshots_received = 0usize;
    let mut bytes_received = 0usize;

    while Instant::now() < deadline {
        tokio::select! {
            _ = ticker.tick() => {
                if Instant::now() >= deadline {
                    break;
                }
                client_tick = client_tick.wrapping_add(1);

                // Move-input intents only (server-authoritative: never position)
                let angle = (client_idx as f32 * 0.25) + (client_tick as f32 * 0.05);
                let (sin, cos) = angle.sin_cos();
                let payload = serialize_client_input(client_tick, cos, sin, false, 0, 0);

                if let Err(e) = ws_write.send(Message::Binary(payload.into())).await {
                    debug!("Client {} send error: {}", client_idx, e);
                    break;
                }
            }
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Binary(bin))) => {
                        let now = Instant::now();
                        if let Some(prev) = last_snapshot_instant {
                            let gap_ms = now.duration_since(prev).as_secs_f64() * 1000.0;
                            inter_snapshot_gaps.push(gap_ms);
                        }
                        last_snapshot_instant = Some(now);
                        snapshots_received += 1;
                        bytes_received += bin.len();
                    }
                    Some(Ok(Message::Close(_))) => {
                        debug!("Client {} received Close frame", client_idx);
                        break;
                    }
                    Some(Err(e)) => {
                        debug!("Client {} read error: {}", client_idx, e);
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    let _ = ws_write.close().await;

    ClientRunResult {
        connected: true,
        snapshots_received,
        bytes_received,
        inter_snapshot_gaps,
    }
}

/// Runs a real-socket headless WebSocket swarm load test according to `config`.
pub async fn run_swarm(config: SwarmConfig) -> SwarmReport {
    let clients = config.clients;
    let duration = config.duration;
    let input_hz = config.input_hz;
    let token_template = config.token.clone();
    let addr = config.addr.clone();
    let host_port = parse_host_port(&addr);

    let mut handles = Vec::with_capacity(clients);
    for client_idx in 0..clients {
        let base_addr = addr.clone();
        let tok = token_template.clone();
        handles.push(tokio::spawn(async move {
            run_single_client(base_addr, client_idx, duration, input_hz, tok).await
        }));
    }

    let mut clients_connected = 0usize;
    let mut clients_failed = 0usize;
    let mut clients_panicked = 0usize;
    let mut clients_starved = 0usize;
    let mut total_snapshots = 0usize;
    let mut total_bytes = 0usize;
    let mut all_gaps = Vec::new();
    let mut per_client_snapshots = Vec::with_capacity(clients);

    for handle in handles {
        match handle.await {
            Ok(res) => {
                per_client_snapshots.push(res.snapshots_received);
                if res.connected {
                    clients_connected += 1;
                    if res.snapshots_received == 0 {
                        clients_starved += 1;
                    }
                    total_snapshots += res.snapshots_received;
                    total_bytes += res.bytes_received;
                    all_gaps.extend(res.inter_snapshot_gaps);
                } else {
                    clients_failed += 1;
                }
            }
            Err(e) => {
                warn!("Client task panicked or join error: {}", e);
                clients_panicked += 1;
                per_client_snapshots.push(0);
            }
        }
    }

    let min_snapshots_per_client = per_client_snapshots
        .iter()
        .copied()
        .min()
        .unwrap_or(0);

    all_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let (p50_ms, p95_ms, max_ms) = if all_gaps.is_empty() {
        (0.0, 0.0, 0.0)
    } else {
        let at = |pct: usize| all_gaps[(all_gaps.len() * pct / 100).min(all_gaps.len() - 1)];
        (at(50), at(95), all_gaps[all_gaps.len() - 1])
    };

    let dur_secs = duration.as_secs_f64();
    let bytes_per_client_per_sec = if clients_connected > 0 && dur_secs > 0.0 {
        (total_bytes as f64) / (clients_connected as f64 * dur_secs)
    } else {
        0.0
    };

    let server_rate_limited_drops = fetch_server_rate_limited_drops(&host_port).await;

    SwarmReport {
        clients_connected,
        clients_failed,
        clients_panicked,
        clients_starved,
        snapshots_received: total_snapshots,
        per_client_snapshots,
        min_snapshots_per_client,
        p50_ms,
        p95_ms,
        max_ms,
        bytes_per_client_per_sec,
        server_rate_limited_drops,
    }
}
