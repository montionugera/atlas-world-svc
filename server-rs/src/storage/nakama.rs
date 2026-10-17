use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

fn default_stat_one() -> u32 {
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

/// Consolidated player loadout snapshot returned by Nakama `get_loadout` RPC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
}

impl Default for LoadoutSnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            profile: ProfileDoc::default(),
            equipped_item_ids: EquippedItemIds::default(),
            skill_loadout: Vec::new(),
            active_quest_ids: Vec::new(),
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

/// Abstract persistent storage interface for Nakama.
#[async_trait]
pub trait NakamaStorage: Send + Sync {
    async fn verify_session(&self, token: &str) -> Result<Option<String>, String>;
    async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String>;
    async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String>;
}

/// Production HTTP REST & RPC client for Nakama game server.
#[derive(Clone, Debug)]
pub struct NakamaClient {
    base_url: String,
    http_key: String,
    retries: u32,
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

        Self {
            base_url,
            http_key,
            retries,
            client,
        }
    }

    fn backoff_duration(attempt: u32) -> Duration {
        let factor = 1u64.checked_shl(attempt.min(6)).unwrap_or(64);
        Duration::from_millis(250 * factor)
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
                        let body: serde_json::Value = response
                            .json()
                            .await
                            .map_err(|e| format!("Failed to parse account JSON: {e}"))?;

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
                    if attempt >= self.retries {
                        return Err(format!("Nakama account check network error: {err}"));
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
                            format!("Failed to read get_loadout response text: {e}")
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
                    if attempt >= self.retries {
                        return Err(format!("Nakama get_loadout network error: {err}"));
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
        let payload = serde_json::to_string(batch)
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
                        return response
                            .text()
                            .await
                            .map_err(|e| format!("Failed to read report_match_events text: {e}"));
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
                    if attempt >= self.retries {
                        return Err(format!("Nakama report_match_events network error: {err}"));
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
}

/// Configurable in-memory mock client for tests and offline local development.
#[derive(Debug, Default, Clone)]
pub struct MockNakamaClient {
    sessions: Arc<RwLock<HashMap<String, Option<String>>>>,
    loadouts: Arc<RwLock<HashMap<String, Option<LoadoutSnapshot>>>>,
    events_response: Arc<RwLock<Option<Result<String, String>>>>,
    reported_batches: Arc<RwLock<Vec<MatchEventBatch>>>,
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
        if let Some(loadout) = loadouts.get(user_id) {
            Ok(loadout.clone())
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

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
