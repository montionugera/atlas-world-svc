use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::warn;

/// Default startup retry window (~60 seconds) for `NakamaClient::probe()`.
pub const PROBE_RETRY_WINDOW: Duration = Duration::from_secs(60);

/// Default `matchId` sent to Nakama's `report_match_events` RPC for idempotency tracking.
pub const DEFAULT_NAKAMA_MATCH_ID: &str = "server-rs-live";

/// Normalizes internal `server-rs` match event names (e.g. `"mob_kill"`) to the
/// canonical `@atlas/contracts` `MatchEventType` expected by Nakama (`"MOB_KILLED"`).
pub fn normalize_match_event_type(raw: &str) -> &str {
    match raw {
        "mob_kill" | "MOB_KILLED" => "MOB_KILLED",
        "item_picked_up" | "ITEM_PICKED_UP" => "ITEM_PICKED_UP",
        "zone_entered" | "ZONE_ENTERED" => "ZONE_ENTERED",
        other => other,
    }
}

/// Environment configuration for connecting `server-rs` to Nakama.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NakamaConfig {
    pub base_url: String,
    pub http_key: String,
}

impl NakamaConfig {
    /// Pure parser for `NAKAMA_URL` and `NAKAMA_HTTP_KEY`.
    /// - Both absent or empty -> `Ok(None)` (offline mode)
    /// - Both set -> `Ok(Some(NakamaConfig))` with trailing slashes stripped from `base_url`
    /// - Only one set -> `Err` describing the incomplete Nakama configuration
    pub fn from_vars(url: Option<&str>, key: Option<&str>) -> Result<Option<Self>, String> {
        let clean_url = url.map(str::trim).filter(|s| !s.is_empty());
        let clean_key = key.map(str::trim).filter(|s| !s.is_empty());

        match (clean_url, clean_key) {
            (None, None) => Ok(None),
            (Some(u), Some(k)) => {
                let base_url = u.trim_end_matches('/').to_string();
                if base_url.is_empty() {
                    return Err(
                        "Invalid Nakama configuration: NAKAMA_URL must not be only slashes"
                            .to_string(),
                    );
                }
                Ok(Some(Self {
                    base_url,
                    http_key: k.to_string(),
                }))
            }
            (Some(_), None) => Err(
                "Incomplete Nakama configuration: NAKAMA_URL is set but NAKAMA_HTTP_KEY is missing"
                    .to_string(),
            ),
            (None, Some(_)) => Err(
                "Incomplete Nakama configuration: NAKAMA_HTTP_KEY is set but NAKAMA_URL is missing"
                    .to_string(),
            ),
        }
    }

    /// Reads `NAKAMA_URL` and `NAKAMA_HTTP_KEY` from the process environment.
    pub fn from_env() -> Result<Option<Self>, String> {
        let url = std::env::var("NAKAMA_URL").ok();
        let key = std::env::var("NAKAMA_HTTP_KEY").ok();
        Self::from_vars(url.as_deref(), key.as_deref())
    }
}

fn default_stat_one() -> u32 {
    1
}

fn default_schema_version_one() -> u32 {
    1
}

/// Primary player attributes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PrimaryStats {
    #[serde(default = "default_stat_one")]
    pub str: u32,
    #[serde(default = "default_stat_one")]
    pub agi: u32,
    #[serde(default = "default_stat_one")]
    pub int: u32,
    #[serde(default = "default_stat_one")]
    pub vit: u32,
    #[serde(default = "default_stat_one")]
    pub dex: u32,
}

impl Default for PrimaryStats {
    fn default() -> Self {
        Self {
            str: 1,
            agi: 1,
            int: 1,
            vit: 1,
            dex: 1,
        }
    }
}

/// Persisted player profile document stored in Nakama storage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDoc {
    #[serde(alias = "schema_version")]
    pub schema_version: u32,
    pub level: u32,
    pub xp: u64,
    #[serde(alias = "stat_points")]
    pub stat_points: u32,
    pub allocated: PrimaryStats,
}

impl Default for ProfileDoc {
    fn default() -> Self {
        Self {
            schema_version: 2,
            level: 1,
            xp: 0,
            stat_points: 0,
            allocated: PrimaryStats::default(),
        }
    }
}

/// Equipped item IDs across active equipment slots.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquippedItemIds {
    #[serde(default)]
    pub weapon: Option<String>,
    #[serde(default)]
    pub armor: Option<String>,
    #[serde(default)]
    pub accessory: Option<String>,
}

/// Persisted world position and current health for a player's character.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterStateSnapshot {
    #[serde(alias = "schema_version", default = "default_schema_version_one")]
    pub schema_version: u32,
    #[serde(alias = "map_id", default)]
    pub map_id: String,
    pub x: f32,
    pub y: f32,
    pub health: f32,
    #[serde(default)]
    pub seq: u64,
}

impl Default for CharacterStateSnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            map_id: "map-for-play".to_string(),
            x: 500.0,
            y: 500.0,
            health: 110.0,
            seq: 0,
        }
    }
}

/// Consolidated player loadout snapshot returned by Nakama `get_loadout` RPC.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadoutSnapshot {
    #[serde(alias = "schema_version")]
    pub schema_version: u32,
    pub profile: ProfileDoc,
    #[serde(alias = "equipped_item_ids")]
    pub equipped_item_ids: EquippedItemIds,
    #[serde(alias = "skill_loadout", default)]
    pub skill_loadout: Vec<String>,
    #[serde(alias = "active_quest_ids", default)]
    pub active_quest_ids: Vec<String>,
    #[serde(
        alias = "character_state",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub character_state: Option<CharacterStateSnapshot>,
}

impl Default for LoadoutSnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            profile: ProfileDoc::default(),
            equipped_item_ids: EquippedItemIds::default(),
            skill_loadout: Vec::new(),
            active_quest_ids: Vec::new(),
            character_state: None,
        }
    }
}

/// Individual match event payload for quest progress and analytics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchEvent {
    #[serde(alias = "type", alias = "event_type")]
    pub event_type: String,
    #[serde(alias = "target_id")]
    pub target_id: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

/// Batch of match events associated with a specific user.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchEventBatch {
    #[serde(alias = "user_id")]
    pub user_id: String,
    pub events: Vec<MatchEvent>,
}

impl MatchEventBatch {
    /// Builds the JSON payload expected by Nakama's `report_match_events` RPC
    /// (`{ userId, matchId, seq, events: [{ type, eventType, userId, targetId, count, payload }] }`).
    pub fn to_rpc_payload(&self, default_match_id: &str, seq: u64) -> serde_json::Value {
        let match_id = self
            .events
            .iter()
            .find_map(|e| e.payload.get("matchId").and_then(|v| v.as_str()))
            .filter(|s| !s.is_empty())
            .unwrap_or(default_match_id);
        let events: Vec<serde_json::Value> = self
            .events
            .iter()
            .map(|ev| {
                let normalized_type = normalize_match_event_type(&ev.event_type);
                let count = ev
                    .payload
                    .get("count")
                    .and_then(|v| v.as_u64())
                    .filter(|&c| c > 0)
                    .unwrap_or(1);
                serde_json::json!({
                    "type": normalized_type,
                    "eventType": ev.event_type,
                    "userId": self.user_id,
                    "targetId": ev.target_id,
                    "count": count,
                    "payload": ev.payload,
                })
            })
            .collect();
        serde_json::json!({
            "userId": self.user_id,
            "matchId": match_id,
            "seq": seq,
            "events": events,
        })
    }
}

/// Abstract persistent storage interface for Nakama.
#[async_trait]
pub trait NakamaStorage: Send + Sync {
    async fn verify_session(&self, token: &str) -> Result<Option<String>, String>;
    async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String>;
    async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String>;
    async fn save_character_state(
        &self,
        user_id: &str,
        state: &CharacterStateSnapshot,
    ) -> Result<String, String> {
        let _ = (user_id, state);
        Ok(r#"{"deduped":false}"#.to_string())
    }
}

/// Production HTTP REST & RPC client for Nakama game server.
#[derive(Clone, Debug)]
pub struct NakamaClient {
    base_url: String,
    http_key: String,
    retries: u32,
    probe_window: Duration,
    match_id: String,
    seq_counter: Arc<AtomicU64>,
    state_seq_counter: Arc<AtomicU64>,
    client: reqwest::Client,
}

impl NakamaClient {
    pub fn new(base_url: String, http_key: String, timeout_ms: u64, retries: u32) -> Self {
        let base_url = base_url.trim_end_matches('/').to_string();
        let timeout = if timeout_ms > 0 {
            Duration::from_millis(timeout_ms)
        } else {
            Duration::from_millis(5000)
        };

        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let initial_state_seq = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(1)
            .max(1);

        Self {
            base_url,
            http_key,
            retries,
            probe_window: std::env::var("NAKAMA_PROBE_RETRY_SECS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .map(Duration::from_secs)
                .unwrap_or(PROBE_RETRY_WINDOW),
            match_id: std::env::var("NAKAMA_MATCH_ID")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| DEFAULT_NAKAMA_MATCH_ID.to_string()),
            seq_counter: Arc::new(AtomicU64::new(0)),
            state_seq_counter: Arc::new(AtomicU64::new(initial_state_seq)),
            client,
        }
    }

    pub fn with_probe_window(mut self, probe_window: Duration) -> Self {
        self.probe_window = probe_window;
        self
    }

    pub fn with_match_id(mut self, match_id: impl Into<String>) -> Self {
        self.match_id = match_id.into();
        self
    }

    fn backoff_duration(attempt: u32) -> Duration {
        let factor = 1u64.checked_shl(attempt.min(6)).unwrap_or(64);
        Duration::from_millis(250 * factor)
    }

    /// Probes `{base}/v2/rpc/healthcheck?http_key={key}` at startup.
    /// Retries transient/network/5xx failures across `self.probe_window` (~60s) before
    /// returning `Err`. Fast-fails on 4xx client errors (such as 401 Unauthorized)
    /// and strips the request URL (`err.without_url()`) so `http_key` never leaks.
    pub async fn probe(&self) -> Result<(), String> {
        let url = format!(
            "{}/v2/rpc/healthcheck?http_key={}",
            self.base_url, self.http_key
        );
        let start = tokio::time::Instant::now();
        let mut attempt = 0u32;

        loop {
            let res = self.client.get(&url).send().await;

            let last_err = match res {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        return Ok(());
                    }

                    if status.is_client_error() && status != reqwest::StatusCode::TOO_MANY_REQUESTS
                    {
                        return Err(format!("Nakama healthcheck probe client error: {status}"));
                    }

                    format!("Nakama healthcheck probe exhausted retries with status: {status}")
                }
                Err(err) => {
                    let clean_err = err.without_url();
                    format!("Nakama healthcheck probe network error: {clean_err}")
                }
            };

            let elapsed = start.elapsed();
            if elapsed >= self.probe_window {
                return Err(last_err);
            }

            let remaining = self.probe_window - elapsed;
            let sleep_dur = Self::backoff_duration(attempt).min(remaining);
            warn!(
                attempt = attempt + 1,
                retry_in_ms = sleep_dur.as_millis() as u64,
                "Nakama startup probe failed ({}); retrying...",
                last_err
            );
            tokio::time::sleep(sleep_dur).await;
            attempt += 1;
        }
    }

    /// Verifies session JWT with Nakama `GET /v2/account`.
    /// Returns `Ok(Some(user_id))` if valid, `Ok(None)` if unauthorized/expired,
    /// or `Err` if server error persists.
    pub async fn verify_session(&self, token: &str) -> Result<Option<String>, String> {
        let url = format!("{}/v2/account", self.base_url);

        let mut attempt = 0;
        loop {
            let res = self
                .client
                .get(&url)
                .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
                .send()
                .await;

            match res {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        let body: serde_json::Value = response.json().await.map_err(|e| {
                            format!("Failed to parse account JSON: {}", e.without_url())
                        })?;

                        let user_id = body
                            .get("user")
                            .and_then(|u| u.get("id"))
                            .and_then(|id| id.as_str())
                            .or_else(|| body.get("id").and_then(|id| id.as_str()))
                            .or_else(|| body.get("userId").and_then(|id| id.as_str()))
                            .map(|s| s.to_string());

                        return Ok(user_id);
                    }

                    // Fast-fail on auth errors or not found
                    if status == reqwest::StatusCode::UNAUTHORIZED
                        || status == reqwest::StatusCode::FORBIDDEN
                        || status == reqwest::StatusCode::NOT_FOUND
                    {
                        return Ok(None);
                    }

                    // Fast-fail on other 4xx (except 429 Too Many Requests)
                    if status.is_client_error() && status != reqwest::StatusCode::TOO_MANY_REQUESTS
                    {
                        return Err(format!("Nakama account check client error: {status}"));
                    }

                    // 429 or 5xx: retryable
                    if attempt >= self.retries {
                        return Err(format!(
                            "Nakama account check exhausted retries with status: {status}"
                        ));
                    }
                }
                Err(err) => {
                    let clean_err = err.without_url();
                    if attempt >= self.retries {
                        return Err(format!("Nakama account check network error: {clean_err}"));
                    }
                }
            }

            tokio::time::sleep(Self::backoff_duration(attempt)).await;
            attempt += 1;
        }
    }

    /// Fetches player loadout snapshot via Nakama `POST /v2/rpc/get_loadout?http_key=...&unwrap`.
    /// Returns `Ok(Some(LoadoutSnapshot))` if found, `Ok(None)` if 404, or `Err` on failure.
    pub async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String> {
        let url = format!(
            "{}/v2/rpc/get_loadout?http_key={}&unwrap",
            self.base_url, self.http_key
        );
        let payload = serde_json::json!({ "userId": user_id }).to_string();

        let mut attempt = 0;
        loop {
            let res = self
                .client
                .post(&url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(payload.clone())
                .send()
                .await;

            match res {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        let text = response.text().await.map_err(|e| {
                            format!(
                                "Failed to read get_loadout response text: {}",
                                e.without_url()
                            )
                        })?;

                        // Try direct deserialization
                        if let Ok(snapshot) = serde_json::from_str::<LoadoutSnapshot>(&text) {
                            return Ok(Some(snapshot));
                        }

                        // Try unwrapping if Nakama returned {"payload": "..."}
                        if let Ok(wrapper) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(payload_str) =
                                wrapper.get("payload").and_then(|p| p.as_str())
                            {
                                let snapshot = serde_json::from_str::<LoadoutSnapshot>(payload_str)
                                    .map_err(|e| {
                                        format!("Failed to parse unwrapped LoadoutSnapshot: {e}")
                                    })?;
                                return Ok(Some(snapshot));
                            }
                        }

                        return serde_json::from_str::<LoadoutSnapshot>(&text)
                            .map(Some)
                            .map_err(|e| {
                                format!(
                                    "Failed to parse LoadoutSnapshot: {e}. Response body: {text}"
                                )
                            });
                    }

                    if status == reqwest::StatusCode::NOT_FOUND {
                        return Ok(None);
                    }

                    if status.is_client_error() && status != reqwest::StatusCode::TOO_MANY_REQUESTS
                    {
                        return Err(format!("Nakama get_loadout client error: {status}"));
                    }

                    if attempt >= self.retries {
                        return Err(format!(
                            "Nakama get_loadout exhausted retries with status: {status}"
                        ));
                    }
                }
                Err(err) => {
                    let clean_err = err.without_url();
                    if attempt >= self.retries {
                        return Err(format!("Nakama get_loadout network error: {clean_err}"));
                    }
                }
            }

            tokio::time::sleep(Self::backoff_duration(attempt)).await;
            attempt += 1;
        }
    }

    /// Reports batch of match events via Nakama `POST /v2/rpc/report_match_events?http_key=...&unwrap`.
    pub async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String> {
        let url = format!(
            "{}/v2/rpc/report_match_events?http_key={}&unwrap",
            self.base_url, self.http_key
        );
        let seq = self.seq_counter.fetch_add(1, Ordering::Relaxed);
        let rpc_payload = batch.to_rpc_payload(&self.match_id, seq);
        let payload = serde_json::to_string(&rpc_payload)
            .map_err(|e| format!("Failed to serialize MatchEventBatch: {e}"))?;

        let mut attempt = 0;
        loop {
            let res = self
                .client
                .post(&url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(payload.clone())
                .send()
                .await;

            match res {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        return response.text().await.map_err(|e| {
                            format!(
                                "Failed to read report_match_events text: {}",
                                e.without_url()
                            )
                        });
                    }

                    if status.is_client_error() && status != reqwest::StatusCode::TOO_MANY_REQUESTS
                    {
                        let err_text = response.text().await.unwrap_or_default();
                        return Err(format!(
                            "Nakama report_match_events client error ({status}): {err_text}"
                        ));
                    }

                    if attempt >= self.retries {
                        return Err(format!(
                            "Nakama report_match_events exhausted retries with status: {status}"
                        ));
                    }
                }
                Err(err) => {
                    let clean_err = err.without_url();
                    if attempt >= self.retries {
                        return Err(format!(
                            "Nakama report_match_events network error: {clean_err}"
                        ));
                    }
                }
            }

            tokio::time::sleep(Self::backoff_duration(attempt)).await;
            attempt += 1;
        }
    }

    /// Persists player world position and health via Nakama `POST /v2/rpc/save_character_state?http_key=...&unwrap`.
    pub async fn save_character_state(
        &self,
        user_id: &str,
        state: &CharacterStateSnapshot,
    ) -> Result<String, String> {
        let url = format!(
            "{}/v2/rpc/save_character_state?http_key={}&unwrap",
            self.base_url, self.http_key
        );
        let seq = if state.seq > 0 {
            state.seq
        } else {
            self.state_seq_counter.fetch_add(1, Ordering::Relaxed)
        };
        let map_id = if state.map_id.is_empty() {
            "map-for-play"
        } else {
            state.map_id.as_str()
        };
        let rpc_payload = serde_json::json!({
            "userId": user_id,
            "mapId": map_id,
            "x": state.x,
            "y": state.y,
            "health": state.health,
            "seq": seq,
        });
        let payload = serde_json::to_string(&rpc_payload)
            .map_err(|e| format!("Failed to serialize CharacterStateSnapshot: {e}"))?;

        let mut attempt = 0;
        loop {
            let res = self
                .client
                .post(&url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(payload.clone())
                .send()
                .await;

            match res {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        return response.text().await.map_err(|e| {
                            format!(
                                "Failed to read save_character_state text: {}",
                                e.without_url()
                            )
                        });
                    }

                    if status.is_client_error() && status != reqwest::StatusCode::TOO_MANY_REQUESTS
                    {
                        let err_text = response.text().await.unwrap_or_default();
                        return Err(format!(
                            "Nakama save_character_state client error ({status}): {err_text}"
                        ));
                    }

                    if attempt >= self.retries {
                        return Err(format!(
                            "Nakama save_character_state exhausted retries with status: {status}"
                        ));
                    }
                }
                Err(err) => {
                    let clean_err = err.without_url();
                    if attempt >= self.retries {
                        return Err(format!(
                            "Nakama save_character_state network error: {clean_err}"
                        ));
                    }
                }
            }

            tokio::time::sleep(Self::backoff_duration(attempt)).await;
            attempt += 1;
        }
    }
}

#[async_trait]
impl NakamaStorage for NakamaClient {
    async fn verify_session(&self, token: &str) -> Result<Option<String>, String> {
        self.verify_session(token).await
    }

    async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String> {
        self.get_loadout(user_id).await
    }

    async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String> {
        self.report_match_events(batch).await
    }

    async fn save_character_state(
        &self,
        user_id: &str,
        state: &CharacterStateSnapshot,
    ) -> Result<String, String> {
        self.save_character_state(user_id, state).await
    }
}

/// Configurable in-memory mock client for tests and offline local development.
#[derive(Debug, Default, Clone)]
pub struct MockNakamaClient {
    sessions: Arc<RwLock<HashMap<String, Option<String>>>>,
    loadouts: Arc<RwLock<HashMap<String, Option<LoadoutSnapshot>>>>,
    events_response: Arc<RwLock<Option<Result<String, String>>>>,
    reported_batches: Arc<RwLock<Vec<MatchEventBatch>>>,
    saved_states: Arc<RwLock<Vec<(String, CharacterStateSnapshot)>>>,
    latest_states: Arc<RwLock<HashMap<String, CharacterStateSnapshot>>>,
}

impl MockNakamaClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_session_user(&self, token: &str, user_id: Option<String>) {
        let mut sessions = self.sessions.write().unwrap();
        sessions.insert(token.to_string(), user_id);
    }

    pub fn set_loadout(&self, user_id: &str, loadout: Option<LoadoutSnapshot>) {
        let mut loadouts = self.loadouts.write().unwrap();
        loadouts.insert(user_id.to_string(), loadout);
    }

    pub fn set_events_response(&self, response: Result<String, String>) {
        let mut res = self.events_response.write().unwrap();
        *res = Some(response);
    }

    pub fn get_reported_batches(&self) -> Vec<MatchEventBatch> {
        self.reported_batches.read().unwrap().clone()
    }

    pub fn get_saved_states(&self) -> Vec<(String, CharacterStateSnapshot)> {
        self.saved_states.read().unwrap().clone()
    }

    pub fn get_latest_character_state(&self, user_id: &str) -> Option<CharacterStateSnapshot> {
        self.latest_states.read().unwrap().get(user_id).cloned()
    }

    pub async fn verify_session(&self, token: &str) -> Result<Option<String>, String> {
        let sessions = self.sessions.read().unwrap();
        if let Some(user_id) = sessions.get(token) {
            Ok(user_id.clone())
        } else {
            Ok(None)
        }
    }

    pub async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String> {
        let loadouts = self.loadouts.read().unwrap();
        let latest_cs = self.latest_states.read().unwrap().get(user_id).cloned();
        if let Some(loadout_opt) = loadouts.get(user_id) {
            let mut snapshot = loadout_opt.clone();
            if let (Some(ref mut s), Some(cs)) = (&mut snapshot, latest_cs) {
                s.character_state = Some(cs);
            }
            Ok(snapshot)
        } else if let Some(cs) = latest_cs {
            Ok(Some(LoadoutSnapshot {
                character_state: Some(cs),
                ..Default::default()
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String> {
        {
            let mut batches = self.reported_batches.write().unwrap();
            batches.push(batch.clone());
        }
        let res = self.events_response.read().unwrap();
        if let Some(ref r) = *res {
            r.clone()
        } else {
            Ok(r#"{"deduped":false}"#.to_string())
        }
    }

    pub async fn save_character_state(
        &self,
        user_id: &str,
        state: &CharacterStateSnapshot,
    ) -> Result<String, String> {
        let mut latest = self.latest_states.write().unwrap();
        if let Some(existing) = latest.get(user_id) {
            if state.seq > 0 && state.seq <= existing.seq {
                return Ok(serde_json::json!({ "deduped": true, "seq": existing.seq }).to_string());
            }
        }
        latest.insert(user_id.to_string(), state.clone());
        drop(latest);

        self.saved_states
            .write()
            .unwrap()
            .push((user_id.to_string(), state.clone()));

        if let Some(Some(ref mut loadout)) = self.loadouts.write().unwrap().get_mut(user_id) {
            loadout.character_state = Some(state.clone());
        }

        Ok(serde_json::json!({ "deduped": false, "seq": state.seq }).to_string())
    }
}

#[async_trait]
impl NakamaStorage for MockNakamaClient {
    async fn verify_session(&self, token: &str) -> Result<Option<String>, String> {
        self.verify_session(token).await
    }

    async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String> {
        self.get_loadout(user_id).await
    }

    async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String> {
        self.report_match_events(batch).await
    }

    async fn save_character_state(
        &self,
        user_id: &str,
        state: &CharacterStateSnapshot,
    ) -> Result<String, String> {
        self.save_character_state(user_id, state).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn nakama_config_from_vars_absent_and_empty_return_none() {
        assert_eq!(NakamaConfig::from_vars(None, None), Ok(None));
        assert_eq!(NakamaConfig::from_vars(Some(""), None), Ok(None));
        assert_eq!(NakamaConfig::from_vars(None, Some("   ")), Ok(None));
        assert_eq!(NakamaConfig::from_vars(Some(""), Some("")), Ok(None));
    }

    #[test]
    fn nakama_config_from_vars_both_set_and_strips_trailing_slash() {
        let cfg = NakamaConfig::from_vars(Some("http://nakama:7350/"), Some("atlas_dev_http_key"))
            .unwrap()
            .unwrap();
        assert_eq!(cfg.base_url, "http://nakama:7350");
        assert_eq!(cfg.http_key, "atlas_dev_http_key");

        let cfg2 =
            NakamaConfig::from_vars(Some("  http://localhost:7350/// "), Some("  secret_key  "))
                .unwrap()
                .unwrap();
        assert_eq!(cfg2.base_url, "http://localhost:7350");
        assert_eq!(cfg2.http_key, "secret_key");
    }

    #[test]
    fn nakama_config_from_vars_partial_returns_err() {
        let missing_key = NakamaConfig::from_vars(Some("http://nakama:7350"), None);
        assert!(missing_key.is_err());
        assert!(missing_key.unwrap_err().contains("NAKAMA_HTTP_KEY"));

        let empty_key = NakamaConfig::from_vars(Some("http://nakama:7350"), Some("  "));
        assert!(empty_key.is_err());
        assert!(empty_key.unwrap_err().contains("NAKAMA_HTTP_KEY"));

        let missing_url = NakamaConfig::from_vars(None, Some("atlas_dev_http_key"));
        assert!(missing_url.is_err());
        assert!(missing_url.unwrap_err().contains("NAKAMA_URL"));

        let empty_url = NakamaConfig::from_vars(Some(""), Some("atlas_dev_http_key"));
        assert!(empty_url.is_err());
        assert!(empty_url.unwrap_err().contains("NAKAMA_URL"));
    }

    #[test]
    fn test_primary_stats_default_and_serialization() {
        let def = PrimaryStats::default();
        assert_eq!(def.str, 1);
        assert_eq!(def.agi, 1);
        assert_eq!(def.int, 1);
        assert_eq!(def.vit, 1);
        assert_eq!(def.dex, 1);

        let json = serde_json::to_string(&def).unwrap();
        let parsed: PrimaryStats = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, def);

        // Deserializing empty object falls back to all 1s
        let empty_parsed: PrimaryStats = serde_json::from_str("{}").unwrap();
        assert_eq!(empty_parsed, def);
    }

    #[test]
    fn test_profile_doc_camel_case_parity() {
        let raw = r#"{
            "schemaVersion": 2,
            "level": 5,
            "xp": 1250,
            "statPoints": 3,
            "allocated": {
                "str": 10,
                "agi": 5,
                "int": 1,
                "vit": 8,
                "dex": 2
            }
        }"#;

        let doc: ProfileDoc = serde_json::from_str(raw).unwrap();
        assert_eq!(doc.schema_version, 2);
        assert_eq!(doc.level, 5);
        assert_eq!(doc.xp, 1250);
        assert_eq!(doc.stat_points, 3);
        assert_eq!(doc.allocated.str, 10);
        assert_eq!(doc.allocated.agi, 5);
        assert_eq!(doc.allocated.vit, 8);

        let serialized = serde_json::to_string(&doc).unwrap();
        assert!(serialized.contains(r#""schemaVersion":2"#));
        assert!(serialized.contains(r#""statPoints":3"#));
    }

    #[test]
    fn test_loadout_snapshot_serialization() {
        let snapshot = LoadoutSnapshot {
            schema_version: 1,
            profile: ProfileDoc::default(),
            equipped_item_ids: EquippedItemIds {
                weapon: Some("basic_sword".to_string()),
                armor: Some("leather_armor".to_string()),
                accessory: None,
            },
            skill_loadout: vec!["meteor_strike".to_string()],
            active_quest_ids: vec!["q_intro".to_string()],
            character_state: None,
        };

        let json = serde_json::to_string(&snapshot).unwrap();
        let parsed: LoadoutSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, snapshot);
        assert_eq!(
            parsed.equipped_item_ids.weapon.as_deref(),
            Some("basic_sword")
        );
    }

    #[test]
    fn test_match_event_and_batch_serialization() {
        let batch = MatchEventBatch {
            user_id: "user_42".to_string(),
            events: vec![MatchEvent {
                event_type: "MOB_KILLED".to_string(),
                target_id: "veil_spearling".to_string(),
                payload: serde_json::json!({ "count": 1 }),
            }],
        };

        let json = serde_json::to_string(&batch).unwrap();
        assert!(json.contains(r#""userId":"user_42""#));
        assert!(json.contains(r#""eventType":"MOB_KILLED""#));

        let parsed: MatchEventBatch = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.user_id, "user_42");
        assert_eq!(parsed.events.len(), 1);
        assert_eq!(parsed.events[0].event_type, "MOB_KILLED");
        assert_eq!(parsed.events[0].target_id, "veil_spearling");

        let rpc = batch.to_rpc_payload("match-99", 7);
        assert_eq!(rpc["userId"], "user_42");
        assert_eq!(rpc["matchId"], "match-99");
        assert_eq!(rpc["seq"], 7);
        assert_eq!(rpc["events"][0]["type"], "MOB_KILLED");
        assert_eq!(rpc["events"][0]["userId"], "user_42");
        assert_eq!(rpc["events"][0]["targetId"], "veil_spearling");
        assert_eq!(rpc["events"][0]["count"], 1);
    }

    #[tokio::test]
    async fn test_mock_nakama_client_roundtrip() {
        let mock = MockNakamaClient::new();
        mock.set_session_user("token_valid", Some("user_100".to_string()));

        let user = mock.verify_session("token_valid").await.unwrap();
        assert_eq!(user, Some("user_100".to_string()));

        let invalid = mock.verify_session("token_invalid").await.unwrap();
        assert_eq!(invalid, None);

        let mut loadout = LoadoutSnapshot::default();
        loadout.profile.level = 10;
        mock.set_loadout("user_100", Some(loadout.clone()));

        let fetched = mock.get_loadout("user_100").await.unwrap();
        assert_eq!(fetched, Some(loadout));

        let missing = mock.get_loadout("user_unknown").await.unwrap();
        assert_eq!(missing, None);

        let batch = MatchEventBatch {
            user_id: "user_100".to_string(),
            events: vec![MatchEvent {
                event_type: "MOB_KILLED".to_string(),
                target_id: "bramble_drake".to_string(),
                payload: serde_json::Value::Null,
            }],
        };

        let res = mock.report_match_events(&batch).await.unwrap();
        assert!(res.contains("deduped"));
        assert_eq!(mock.get_reported_batches().len(), 1);
    }

    #[tokio::test]
    async fn test_nakama_client_http_verify_session_and_error_handling() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            // First request: 200 OK with valid user account
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
                let body = r#"{"user":{"id":"user_from_http"}}"#;
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }

            // Second request: 401 Unauthorized
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
                let resp = "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n";
                let _ = stream.write_all(resp.as_bytes()).await;
            }
        });

        let client = NakamaClient::new(format!("http://{addr}"), "defaultkey".to_string(), 1000, 1);

        let res = client.verify_session("valid_tok").await.unwrap();
        assert_eq!(res, Some("user_from_http".to_string()));

        let unauth = client.verify_session("bad_tok").await.unwrap();
        assert_eq!(unauth, None);
    }

    #[tokio::test]
    async fn test_nakama_client_get_loadout_and_report_events() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            // 1. get_loadout -> 200 OK
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
                let body = serde_json::to_string(&LoadoutSnapshot::default()).unwrap();
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }

            // 2. report_match_events -> 200 OK
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
                let body = r#"{"deduped":false,"progressed":["quest_1"]}"#;
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }
        });

        let client = NakamaClient::new(format!("http://{addr}"), "defaultkey".to_string(), 1000, 1);

        let loadout = client.get_loadout("user_abc").await.unwrap();
        assert!(loadout.is_some());
        assert_eq!(loadout.unwrap().schema_version, 1);

        let batch = MatchEventBatch {
            user_id: "user_abc".to_string(),
            events: vec![MatchEvent {
                event_type: "MOB_KILLED".to_string(),
                target_id: "mob_1".to_string(),
                payload: serde_json::Value::Null,
            }],
        };
        let rep = client.report_match_events(&batch).await.unwrap();
        assert!(rep.contains("progressed"));
    }
}
