use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

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
    #[serde(default = "default_stat_one")]
    pub luk: u32,
}

impl Default for PrimaryStats {
    fn default() -> Self {
        Self {
            str: 1,
            agi: 1,
            int: 1,
            vit: 1,
            dex: 1,
            luk: 1,
        }
    }
}

impl PrimaryStats {
    pub fn new(str: u32, agi: u32, int: u32, vit: u32, dex: u32, luk: u32) -> Self {
        Self {
            str,
            agi,
            int,
            vit,
            dex,
            luk,
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
    #[serde(alias = "race", default, skip_serializing_if = "Option::is_none")]
    pub race: Option<String>,
}

impl Default for ProfileDoc {
    fn default() -> Self {
        Self {
            schema_version: 2,
            level: 1,
            xp: 0,
            stat_points: 0,
            allocated: PrimaryStats::default(),
            race: None,
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

/// Unlocked skill entry stored in a player's skills document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUnlock {
    #[serde(alias = "skill_id")]
    pub skill_id: String,
    pub level: u32,
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
}
