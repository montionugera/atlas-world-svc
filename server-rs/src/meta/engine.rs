use crate::auth::AuthGuard;
use crate::content::enchantment::{attempt_high_tier_enchant, ItemSocketState};
use crate::meta::catalogs::{ItemKind, MetaCatalogs};
use crate::meta::models::{
    default_character_state_doc, default_equipment_doc, default_inventory_doc, default_profile_doc,
    default_quests_doc, default_skills_doc, migrate_profile_value, parse_character_state_value,
    parse_equipment_value, parse_inventory_value, parse_quests_value, parse_skills_value,
    ActiveQuestEntry, CharacterStateDoc, CompletedQuestEntry, EquipmentDoc, InventoryDoc,
    MetaError, QuestObjectivesMap, QuestsDoc, QuestsSeqDoc, SkillsDoc, StackableEntry, UniqueEntry,
};
use crate::meta::store::{generate_uuid_v4, DocWrite, MetaDocStore, StoredDoc, UserAccount};
use crate::storage::{
    normalize_match_event_type, CharacterStateSnapshot, EquippedItemIds, LoadoutSnapshot,
    MatchEventBatch, NakamaStorage, PrimaryStats, ProfileDoc, DEFAULT_NAKAMA_MATCH_ID,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_SKILL_LOADOUT: usize = 4;
pub const MAX_NOTIFICATIONS_PER_USER: usize = 64;
const MAX_OCC_ATTEMPTS: usize = 2;

pub const COLLECTION_POC_MARO_10M: &str = "poc_maro_10m";
pub const KEY_POC_SESSION_STATE: &str = "session_state";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PocMaro10mSpawn {
    pub server_x: f32,
    pub server_y: f32,
    pub world_x: f32,
    pub world_z: f32,
    pub yaw_rad: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PocMaro10mState {
    pub map_id: String,
    pub class_id: String,
    pub active_beat: String,
    pub spawn: PocMaro10mSpawn,
    pub pip_greeted: bool,
    pub amber_errand_accepted: bool,
    pub amber_errand_completed: bool,
    pub lanterns_lit: Vec<String>,
    pub vermin_defeated: u32,
    pub soot_muncher_defeated: bool,
    pub parcel_recovered: bool,
    pub lantern_oil_count: u32,
    pub bram_parcel_delivered: bool,
    pub trace_glimpsed: bool,
    pub edda_spoken: bool,
    pub time_wound_triggered: bool,
    pub glade_hook_unlocked: bool,
    pub reset_count: u32,
}

impl Default for PocMaro10mState {
    fn default() -> Self {
        Self {
            map_id: "maro-bell".to_string(),
            class_id: "cl-vanguard".to_string(),
            active_beat: "POC-00".to_string(),
            spawn: PocMaro10mSpawn {
                server_x: 40.0,
                server_y: 151.0,
                world_x: 0.0,
                world_z: 71.0,
                yaw_rad: std::f32::consts::PI,
            },
            pip_greeted: false,
            amber_errand_accepted: false,
            amber_errand_completed: false,
            lanterns_lit: Vec::new(),
            vermin_defeated: 0,
            soot_muncher_defeated: false,
            parcel_recovered: false,
            lantern_oil_count: 0,
            bram_parcel_delivered: false,
            trace_glimpsed: false,
            edda_spoken: false,
            time_wound_triggered: false,
            glade_hook_unlocked: false,
            reset_count: 0,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RpcContext {
    pub user_id: Option<String>,
    pub username: Option<String>,
}

impl RpcContext {
    pub fn s2s() -> Self {
        Self {
            user_id: None,
            username: None,
        }
    }

    pub fn client(user_id: impl Into<String>, username: Option<String>) -> Self {
        Self {
            user_id: Some(user_id.into()),
            username,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MetaNotification {
    pub code: u32,
    pub subject: String,
    pub content: Value,
    pub persistent: bool,
}

pub fn xp_to_next(level: u32) -> u64 {
    100 * u64::from(level)
}

pub fn apply_xp(profile: &ProfileDoc, amount: u64) -> (ProfileDoc, u32) {
    let mut level = profile.level;
    let mut xp = profile.xp.saturating_add(amount);
    let mut stat_points = profile.stat_points;
    let mut leveled_up = 0u32;

    while xp >= xp_to_next(level) {
        xp -= xp_to_next(level);
        level = level.saturating_add(1);
        stat_points = stat_points.saturating_add(3);
        leveled_up = leveled_up.saturating_add(1);
    }

    (
        ProfileDoc {
            schema_version: 2,
            level,
            xp,
            stat_points,
            allocated: profile.allocated,
            race: profile.race.clone(),
        },
        leveled_up,
    )
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1)
        .max(1)
}

pub struct RustMetaEngine {
    store: Arc<dyn MetaDocStore>,
    catalogs: MetaCatalogs,
    auth_guard: Option<AuthGuard>,
    match_id: String,
    in_process_event_seq: AtomicU64,
    in_process_state_seq: AtomicU64,
    notifications: Mutex<HashMap<String, VecDeque<MetaNotification>>>,
}

impl RustMetaEngine {
    pub fn new(store: Arc<dyn MetaDocStore>) -> Result<Self, String> {
        let catalogs = MetaCatalogs::load_embedded()?;
        let seed_seq = now_epoch_ms();
        Ok(Self {
            store,
            catalogs,
            auth_guard: None,
            match_id: DEFAULT_NAKAMA_MATCH_ID.to_string(),
            in_process_event_seq: AtomicU64::new(seed_seq),
            in_process_state_seq: AtomicU64::new(seed_seq),
            notifications: Mutex::new(HashMap::new()),
        })
    }

    pub fn with_auth_guard(mut self, auth_guard: AuthGuard) -> Self {
        self.auth_guard = Some(auth_guard);
        self
    }

    pub fn with_match_id(mut self, match_id: impl Into<String>) -> Self {
        self.match_id = match_id.into();
        self
    }

    pub fn store(&self) -> &Arc<dyn MetaDocStore> {
        &self.store
    }

    pub fn catalogs(&self) -> &MetaCatalogs {
        &self.catalogs
    }

    pub fn authenticate_device(
        &self,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError> {
        self.store
            .authenticate_device(device_id, username_hint, create)
    }

    pub fn get_account(&self, user_id: &str) -> Result<Option<UserAccount>, MetaError> {
        self.store.get_account(user_id)
    }

    pub fn read_raw_doc(
        &self,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError> {
        self.store.read_doc(user_id, collection, key)
    }

    pub fn drain_notifications(&self, user_id: &str) -> Vec<MetaNotification> {
        if let Ok(mut map) = self.notifications.lock() {
            map.remove(user_id)
                .map(|dq| dq.into_iter().collect())
                .unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    fn push_notification(&self, user_id: &str, notif: MetaNotification) {
        if let Ok(mut map) = self.notifications.lock() {
            let queue = map.entry(user_id.to_string()).or_default();
            if queue.len() >= MAX_NOTIFICATIONS_PER_USER {
                queue.pop_front();
            }
            queue.push_back(notif);
        }
    }

    fn require_s2s(ctx: &RpcContext) -> Result<(), MetaError> {
        if ctx.user_id.is_some() {
            return Err(MetaError::Forbidden(
                "Server-to-server RPC only (client sessions rejected)".to_string(),
            ));
        }
        Ok(())
    }

    fn require_client(ctx: &RpcContext) -> Result<&str, MetaError> {
        match ctx.user_id.as_deref() {
            Some(uid) if !uid.trim().is_empty() => Ok(uid),
            _ => Err(MetaError::Unauthorized(
                "Client session required".to_string(),
            )),
        }
    }

    fn read_profile(&self, user_id: &str) -> Result<(ProfileDoc, String), MetaError> {
        match self.store.read_doc(user_id, "profile", "state")? {
            Some(stored) => {
                let doc = migrate_profile_value(&stored.value).unwrap_or_else(default_profile_doc);
                Ok((doc, stored.version))
            }
            None => Ok((default_profile_doc(), "*".to_string())),
        }
    }

    fn read_inventory(&self, user_id: &str) -> Result<(InventoryDoc, String), MetaError> {
        match self.store.read_doc(user_id, "inventory", "state")? {
            Some(stored) => {
                let doc =
                    parse_inventory_value(&stored.value).unwrap_or_else(default_inventory_doc);
                Ok((doc, stored.version))
            }
            None => Ok((default_inventory_doc(), "*".to_string())),
        }
    }

    fn read_equipment(&self, user_id: &str) -> Result<(EquipmentDoc, String), MetaError> {
        match self.store.read_doc(user_id, "equipment", "state")? {
            Some(stored) => {
                let doc =
                    parse_equipment_value(&stored.value).unwrap_or_else(default_equipment_doc);
                Ok((doc, stored.version))
            }
            None => Ok((default_equipment_doc(), "*".to_string())),
        }
    }

    fn read_skills(&self, user_id: &str) -> Result<(SkillsDoc, String), MetaError> {
        match self.store.read_doc(user_id, "skills", "state")? {
            Some(stored) => {
                let doc = parse_skills_value(&stored.value).unwrap_or_else(default_skills_doc);
                Ok((doc, stored.version))
            }
            None => Ok((default_skills_doc(), "*".to_string())),
        }
    }

    fn read_quests(&self, user_id: &str) -> Result<(QuestsDoc, String), MetaError> {
        match self.store.read_doc(user_id, "quests", "state")? {
            Some(stored) => {
                let doc = parse_quests_value(&stored.value).unwrap_or_else(default_quests_doc);
                Ok((doc, stored.version))
            }
            None => Ok((default_quests_doc(), "*".to_string())),
        }
    }

    fn read_character_state(
        &self,
        user_id: &str,
    ) -> Result<(CharacterStateDoc, String, bool), MetaError> {
        match self.store.read_doc(user_id, "character_state", "state")? {
            Some(stored) => match parse_character_state_value(&stored.value) {
                Some(doc) => Ok((doc, stored.version, true)),
                None => Ok((default_character_state_doc(), stored.version, false)),
            },
            None => Ok((default_character_state_doc(), "*".to_string(), false)),
        }
    }

    fn read_quests_seq(&self, user_id: &str) -> Result<(QuestsSeqDoc, String), MetaError> {
        match self.store.read_doc(user_id, "quests_seq", "state")? {
            Some(stored) => {
                let doc: QuestsSeqDoc = serde_json::from_value(stored.value).unwrap_or_default();
                Ok((doc, stored.version))
            }
            None => Ok((HashMap::new(), "*".to_string())),
        }
    }

    fn parse_json_payload(payload_raw: &str) -> Result<Value, MetaError> {
        let trimmed = payload_raw.trim();
        if trimmed.is_empty() {
            return Err(MetaError::BadRequest("Empty RPC payload".to_string()));
        }
        let val: Value = serde_json::from_str(trimmed)
            .map_err(|_| MetaError::BadRequest("Invalid JSON payload".to_string()))?;
        if let Some(inner_str) = val.as_str() {
            serde_json::from_str(inner_str)
                .map_err(|_| MetaError::BadRequest("Invalid inner JSON string payload".to_string()))
        } else {
            Ok(val)
        }
    }

    /// Dispatches any of the 10 gameplay RPCs or `healthcheck`.
    pub fn invoke_rpc(
        &self,
        ctx: &RpcContext,
        rpc_id: &str,
        payload_raw: &str,
    ) -> Result<Value, MetaError> {
        match rpc_id {
            "healthcheck" => Ok(json!({ "ok": true, "status": "ok" })),
            "get_loadout" => {
                Self::require_s2s(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                let user_id = body
                    .get("userId")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| {
                        MetaError::BadRequest("Invalid get_loadout payload".to_string())
                    })?;
                let snapshot = self.get_loadout_direct(user_id)?;
                serde_json::to_value(snapshot)
                    .map_err(|e| MetaError::Internal(format!("Serialize loadout error: {}", e)))
            }
            "save_character_state" => {
                Self::require_s2s(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_save_character_state(&body)
            }
            "report_match_events" => {
                Self::require_s2s(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_report_match_events(&body)
            }
            "grant_xp" => {
                Self::require_s2s(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_grant_xp(&body)
            }
            "grant_loot" => {
                Self::require_s2s(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_grant_loot(&body)
            }
            "equip_item" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_equip_item(uid, &body)
            }
            "allocate_stats" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_allocate_stats(uid, &body)
            }
            "set_skill_loadout" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_set_skill_loadout(uid, &body)
            }
            "accept_quest" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_accept_quest(uid, &body)
            }
            "claim_quest_reward" | "complete_quest" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_claim_quest_reward(uid, &body)
            }
            "enchant_equipment" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_enchant_equipment(uid, &body)
            }
            "socket_card" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_socket_card(uid, &body)
            }
            "reset_poc_maro_10m" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_reset_poc_maro_10m(uid)
            }
            "get_poc_maro_10m_state" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_get_poc_maro_10m_state(uid)
            }
            "update_poc_maro_10m_state" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_update_poc_maro_10m_state(uid, &body)
            }
            "accept_poc_amber_errand" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_accept_poc_amber_errand(uid)
            }
            "complete_poc_amber_errand" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_complete_poc_amber_errand(uid, &body)
            }
            "resolve_poc_vermin_combat" => {
                let uid = Self::require_client(ctx)?;
                let body = Self::parse_json_payload(payload_raw)?;
                self.rpc_resolve_poc_vermin_combat(uid, &body)
            }
            "recover_poc_parcel" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_recover_poc_parcel(uid)
            }
            "reset_poc_vermin_encounter" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_reset_poc_vermin_encounter(uid)
            }
            "inspect_poc_old_lantern" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_inspect_poc_old_lantern(uid)
            }
            "trigger_poc_time_wound" => {
                let uid = Self::require_client(ctx)?;
                self.rpc_trigger_poc_time_wound(uid)
            }
            other => Err(MetaError::NotFound(format!("Unknown RPC '{}'", other))),
        }
    }

    pub fn get_loadout_direct(&self, user_id: &str) -> Result<LoadoutSnapshot, MetaError> {
        if user_id.trim().is_empty() {
            return Err(MetaError::BadRequest(
                "Invalid get_loadout userId".to_string(),
            ));
        }
        let (profile, _) = self.read_profile(user_id)?;
        let (inventory, _) = self.read_inventory(user_id)?;
        let (equipment, _) = self.read_equipment(user_id)?;
        let (skills, _) = self.read_skills(user_id)?;
        let (quests, _) = self.read_quests(user_id)?;
        let (char_doc, _, has_char) = self.read_character_state(user_id)?;

        let mut instance_to_item = HashMap::new();
        for u in &inventory.uniques {
            instance_to_item.insert(u.instance_id.as_str(), u.item_id.clone());
        }

        let resolve_slot = |inst_opt: &Option<String>| -> Option<String> {
            inst_opt
                .as_deref()
                .and_then(|inst_id| instance_to_item.get(inst_id).cloned())
        };

        let character_state = if has_char
            && !char_doc.map_id.is_empty()
            && char_doc.x.is_finite()
            && char_doc.y.is_finite()
            && char_doc.health.is_finite()
        {
            Some(CharacterStateSnapshot {
                schema_version: 1,
                map_id: char_doc.map_id,
                x: char_doc.x,
                y: char_doc.y,
                health: char_doc.health,
                seq: char_doc.seq,
            })
        } else {
            None
        };

        Ok(LoadoutSnapshot {
            schema_version: 1,
            profile,
            equipped_item_ids: EquippedItemIds {
                weapon: resolve_slot(&equipment.slots.weapon),
                armor: resolve_slot(&equipment.slots.armor),
                accessory: resolve_slot(&equipment.slots.accessory),
            },
            skill_loadout: skills.loadout,
            active_quest_ids: quests.active.into_iter().map(|q| q.quest_id).collect(),
            character_state,
        })
    }

    fn rpc_save_character_state(&self, body: &Value) -> Result<Value, MetaError> {
        let user_id = body
            .get("userId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                MetaError::BadRequest("Invalid save_character_state payload".to_string())
            })?;
        let map_id = body
            .get("mapId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                MetaError::BadRequest("Invalid save_character_state payload".to_string())
            })?;
        let x = body
            .get("x")
            .and_then(|v| v.as_f64())
            .filter(|f| f.is_finite())
            .ok_or_else(|| MetaError::BadRequest("Invalid x coordinate".to_string()))?
            as f32;
        let y = body
            .get("y")
            .and_then(|v| v.as_f64())
            .filter(|f| f.is_finite())
            .ok_or_else(|| MetaError::BadRequest("Invalid y coordinate".to_string()))?
            as f32;
        let health = body
            .get("health")
            .and_then(|v| v.as_f64())
            .filter(|f| f.is_finite() && *f >= 0.0)
            .ok_or_else(|| MetaError::BadRequest("Invalid health value".to_string()))?
            as f32;
        let seq = body
            .get("seq")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| MetaError::BadRequest("Invalid seq value".to_string()))?;

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (current, version, _) = self.read_character_state(user_id)?;
            if seq <= current.seq {
                return Ok(json!({ "deduped": true, "seq": current.seq }));
            }
            let next_doc = CharacterStateDoc {
                schema_version: 1,
                map_id: map_id.to_string(),
                x,
                y,
                health,
                seq,
            };
            let val =
                serde_json::to_value(&next_doc).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "character_state".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val,
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => return Ok(json!({ "deduped": false, "seq": seq })),
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("save_character_state OCC retries exhausted".to_string())
        }))
    }

    fn rpc_report_match_events(&self, body: &Value) -> Result<Value, MetaError> {
        let user_id = body
            .get("userId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MetaError::BadRequest("Invalid match event batch".to_string()))?;
        let match_id = body
            .get("matchId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MetaError::BadRequest("Invalid match event batch".to_string()))?;
        let seq = body
            .get("seq")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| MetaError::BadRequest("Invalid match event batch seq".to_string()))?;
        let events = body
            .get("events")
            .and_then(|v| v.as_array())
            .ok_or_else(|| MetaError::BadRequest("Invalid match event batch events".to_string()))?;

        for ev in events {
            if let Some(ev_uid) = ev.get("userId").and_then(|v| v.as_str()) {
                if ev_uid != user_id {
                    return Err(MetaError::BadRequest(
                        "Attribution mismatch: event.userId does not match batch.userId"
                            .to_string(),
                    ));
                }
            }
        }

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (mut seq_doc, seq_ver) = self.read_quests_seq(user_id)?;
            if let Some(&last_seq) = seq_doc.get(match_id) {
                if seq <= last_seq {
                    return Ok(json!({ "deduped": true }));
                }
            }

            let (mut quests_doc, quests_ver) = self.read_quests(user_id)?;
            let mut progressed: Vec<String> = Vec::new();
            let mut completed_now: Vec<String> = Vec::new();

            for ev in events {
                let raw_type = ev
                    .get("type")
                    .or_else(|| ev.get("eventType"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let norm_type = normalize_match_event_type(raw_type);
                let target_id = match norm_type {
                    "MOB_KILLED" => ev
                        .get("mobType")
                        .or_else(|| ev.get("targetId"))
                        .and_then(|v| v.as_str()),
                    "ITEM_PICKED_UP" => ev
                        .get("itemId")
                        .or_else(|| ev.get("targetId"))
                        .and_then(|v| v.as_str()),
                    "ZONE_ENTERED" => ev
                        .get("zoneId")
                        .or_else(|| ev.get("targetId"))
                        .and_then(|v| v.as_str()),
                    _ => None,
                };
                let Some(target_id) = target_id else {
                    continue;
                };
                let delta = ev
                    .get("count")
                    .or_else(|| ev.get("payload").and_then(|p| p.get("count")))
                    .and_then(|v| v.as_u64())
                    .map(|c| (c as u32).max(1))
                    .unwrap_or(1);

                for active_quest in &mut quests_doc.active {
                    let Some(def) = self.catalogs.quests.get(&active_quest.quest_id) else {
                        continue;
                    };
                    for def_obj in &def.objectives {
                        if def_obj.objective_type != norm_type || def_obj.target_id != target_id {
                            continue;
                        }
                        let current = active_quest
                            .objectives
                            .get(&def_obj.id)
                            .copied()
                            .unwrap_or(0);
                        let next_val = current.saturating_add(delta).min(def_obj.required);
                        if next_val != current {
                            active_quest.objectives.insert(def_obj.id.clone(), next_val);
                            if !progressed.contains(&active_quest.quest_id) {
                                progressed.push(active_quest.quest_id.clone());
                            }
                        }
                    }
                }
            }

            let now = now_epoch_ms();
            let mut still_active = Vec::with_capacity(quests_doc.active.len());
            for active_quest in quests_doc.active.drain(..) {
                let all_done = self
                    .catalogs
                    .quests
                    .get(&active_quest.quest_id)
                    .is_some_and(|def| {
                        def.objectives.iter().all(|def_obj| {
                            active_quest
                                .objectives
                                .get(&def_obj.id)
                                .copied()
                                .unwrap_or(0)
                                >= def_obj.required
                        })
                    });
                if all_done {
                    completed_now.push(active_quest.quest_id.clone());
                    quests_doc.completed.push(CompletedQuestEntry {
                        quest_id: active_quest.quest_id,
                        completed_at: now,
                        claimed: false,
                    });
                } else {
                    still_active.push(active_quest);
                }
            }
            quests_doc.active = still_active;
            seq_doc.insert(match_id.to_string(), seq);

            let quests_val = serde_json::to_value(&quests_doc)
                .map_err(|e| MetaError::Internal(e.to_string()))?;
            let seq_val =
                serde_json::to_value(&seq_doc).map_err(|e| MetaError::Internal(e.to_string()))?;

            match self.store.write_batch(&[
                DocWrite {
                    collection: "quests".to_string(),
                    key: "state".to_string(),
                    user_id: user_id.to_string(),
                    value: quests_val,
                    expected_version: Some(quests_ver),
                    permission_read: 2,
                    permission_write: 0,
                },
                DocWrite {
                    collection: "quests_seq".to_string(),
                    key: "state".to_string(),
                    user_id: user_id.to_string(),
                    value: seq_val,
                    expected_version: Some(seq_ver),
                    permission_read: 0,
                    permission_write: 0,
                },
            ]) {
                Ok(_) => {
                    for qid in &progressed {
                        let objectives = quests_doc
                            .active
                            .iter()
                            .find(|q| &q.quest_id == qid)
                            .map(|q| json!(q.objectives))
                            .unwrap_or_else(|| json!({}));
                        self.push_notification(
                            user_id,
                            MetaNotification {
                                code: 1,
                                subject: "quest_progress".to_string(),
                                content: json!({ "questId": qid, "objectives": objectives }),
                                persistent: false,
                            },
                        );
                    }
                    for qid in &completed_now {
                        self.push_notification(
                            user_id,
                            MetaNotification {
                                code: 2,
                                subject: "quest_progress".to_string(),
                                content: json!({ "questId": qid }),
                                persistent: true,
                            },
                        );
                    }
                    return Ok(json!({
                        "deduped": false,
                        "progressed": progressed,
                        "completedNow": completed_now,
                    }));
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }

        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("report_match_events OCC retries exhausted".to_string())
        }))
    }

    fn rpc_grant_xp(&self, body: &Value) -> Result<Value, MetaError> {
        let user_id = body
            .get("userId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MetaError::BadRequest("Invalid grant_xp payload".to_string()))?;
        let amount = body
            .get("amount")
            .or_else(|| body.get("xp"))
            .and_then(|v| v.as_u64())
            .filter(|&a| a > 0)
            .ok_or_else(|| MetaError::BadRequest("Invalid grant_xp payload".to_string()))?;

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (profile, version) = self.read_profile(user_id)?;
            let (updated, leveled_up) = apply_xp(&profile, amount);
            let val =
                serde_json::to_value(&updated).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "profile".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val.clone(),
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    let mut out = val;
                    if let Some(obj) = out.as_object_mut() {
                        obj.insert(
                            "profile".to_string(),
                            serde_json::to_value(&updated).unwrap_or(Value::Null),
                        );
                        obj.insert("leveledUp".to_string(), json!(leveled_up));
                    }
                    return Ok(out);
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("grant_xp failed after 2 OCC attempts".to_string())
        }))
    }

    fn rpc_grant_loot(&self, body: &Value) -> Result<Value, MetaError> {
        let user_id = body
            .get("userId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MetaError::BadRequest("Invalid grant_loot payload".to_string()))?;

        // Support both Nakama single-item `{ userId, itemId, qty }` and batch `{ userId, items: [...] }`
        let single_item_vec;
        let items: &[Value] = if let Some(arr) = body.get("items").and_then(|v| v.as_array()) {
            if arr.is_empty() {
                return Err(MetaError::BadRequest(
                    "Invalid grant_loot payload: empty items".to_string(),
                ));
            }
            arr.as_slice()
        } else if body.get("itemId").is_some() {
            single_item_vec = vec![json!({
                "itemId": body.get("itemId").cloned().unwrap_or(Value::Null),
                "qty": body.get("qty").cloned().unwrap_or(Value::Null),
            })];
            single_item_vec.as_slice()
        } else {
            return Err(MetaError::BadRequest(
                "Invalid grant_loot payload".to_string(),
            ));
        };

        let mut parsed_grants = Vec::with_capacity(items.len());
        for entry in items {
            let item_id = entry
                .get("itemId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| MetaError::BadRequest("Missing itemId in grant_loot".to_string()))?;
            let qty_i64 = entry
                .get("qty")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| MetaError::BadRequest("Invalid qty in grant_loot".to_string()))?;
            if qty_i64 <= 0 {
                return Err(MetaError::BadRequest(format!(
                    "Invalid qty for item: {}",
                    item_id
                )));
            }
            let def = self
                .catalogs
                .items
                .get(item_id)
                .ok_or_else(|| MetaError::BadRequest(format!("Unknown itemId: {}", item_id)))?
                .clone();
            parsed_grants.push((def, qty_i64 as u32));
        }

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (mut inv, version) = self.read_inventory(user_id)?;
            let mut granted = Vec::new();

            for (def, qty) in &parsed_grants {
                if def.stackable {
                    if let Some(existing) = inv.stackables.iter_mut().find(|s| s.item_id == def.id)
                    {
                        existing.qty = existing.qty.saturating_add(*qty);
                    } else {
                        inv.stackables.push(StackableEntry {
                            item_id: def.id.clone(),
                            qty: *qty,
                        });
                    }
                    granted.push(json!({ "itemId": def.id, "qty": qty }));
                } else {
                    for _ in 0..*qty {
                        let instance_id = generate_uuid_v4();
                        inv.uniques.push(UniqueEntry {
                            instance_id: instance_id.clone(),
                            item_id: def.id.clone(),
                        });
                        granted.push(json!({
                            "itemId": def.id,
                            "qty": 1,
                            "instanceId": instance_id,
                        }));
                    }
                }
            }

            let val = serde_json::to_value(&inv).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "inventory".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val.clone(),
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    let mut out = val;
                    if let Some(obj) = out.as_object_mut() {
                        obj.insert(
                            "inventory".to_string(),
                            serde_json::to_value(&inv).unwrap_or(Value::Null),
                        );
                        obj.insert("granted".to_string(), Value::Array(granted));
                    }
                    return Ok(out);
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("grant_loot failed after 2 OCC attempts".to_string())
        }))
    }

    fn rpc_equip_item(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        let slot = body
            .get("slot")
            .and_then(|v| v.as_str())
            .filter(|s| matches!(*s, "weapon" | "armor" | "accessory"))
            .ok_or_else(|| MetaError::BadRequest("Invalid equipment slot".to_string()))?;

        let instance_id_opt: Option<String> = match body.get("instanceId") {
            None | Some(Value::Null) => None,
            Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
            _ => return Err(MetaError::BadRequest("Invalid instanceId".to_string())),
        };

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (inv, _) = self.read_inventory(user_id)?;
            let (mut equip, version) = self.read_equipment(user_id)?;

            if let Some(ref inst_id) = instance_id_opt {
                let owned = inv
                    .uniques
                    .iter()
                    .find(|u| &u.instance_id == inst_id)
                    .ok_or_else(|| {
                        MetaError::BadRequest("Item instance not found in inventory".to_string())
                    })?;
                let def = self.catalogs.items.get(&owned.item_id).ok_or_else(|| {
                    MetaError::BadRequest(format!("Unknown catalog item: {}", owned.item_id))
                })?;
                let kind_matches = matches!(
                    (&def.kind, slot),
                    (ItemKind::Weapon, "weapon")
                        | (ItemKind::Armor, "armor")
                        | (ItemKind::Accessory, "accessory")
                );
                if !kind_matches {
                    return Err(MetaError::BadRequest(format!(
                        "Cannot equip {:?} in slot {}",
                        def.kind, slot
                    )));
                }
                match slot {
                    "weapon" => equip.slots.weapon = Some(inst_id.clone()),
                    "armor" => equip.slots.armor = Some(inst_id.clone()),
                    "accessory" => equip.slots.accessory = Some(inst_id.clone()),
                    _ => unreachable!(),
                }
            } else {
                match slot {
                    "weapon" => equip.slots.weapon = None,
                    "armor" => equip.slots.armor = None,
                    "accessory" => equip.slots.accessory = None,
                    _ => unreachable!(),
                }
            }

            let val =
                serde_json::to_value(&equip).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "equipment".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val.clone(),
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    let mut out = val;
                    if let Some(obj) = out.as_object_mut() {
                        obj.insert(
                            "equipment".to_string(),
                            serde_json::to_value(&equip).unwrap_or(Value::Null),
                        );
                    }
                    return Ok(out);
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("equip_item OCC retries exhausted".to_string())
        }))
    }

    fn rpc_enchant_equipment(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        let instance_id = body
            .get("instanceId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| MetaError::BadRequest("Missing instanceId".to_string()))?;

        let is_blessed = body
            .get("isBlessed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let has_protection_stone = body
            .get("hasProtectionStone")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let roll_bps = if let Some(r) = body.get("rollBps").and_then(|v| v.as_u64()) {
            r as u32
        } else {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(1337);
            nanos % 10_000
        };

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (inv, _) = self.read_inventory(user_id)?;
            let _owned = inv
                .uniques
                .iter()
                .find(|u| u.instance_id == instance_id)
                .ok_or_else(|| {
                    MetaError::BadRequest("Item instance not found in inventory".to_string())
                })?;

            let (current_tier, doc_version) =
                match self.store.read_doc(user_id, "item_enchant", instance_id)? {
                    Some(stored) => {
                        let tier = stored
                            .value
                            .get("tier")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        (tier, stored.version)
                    }
                    None => (0, "*".to_string()),
                };

            let outcome =
                attempt_high_tier_enchant(current_tier, roll_bps, is_blessed, has_protection_stone);

            let new_val = json!({
                "instanceId": instance_id,
                "tier": outcome.new_tier,
                "glow": outcome.glow,
                "crystalsYielded": outcome.crystals_yielded,
            });

            match self.store.write_batch(&[DocWrite {
                collection: "item_enchant".to_string(),
                key: instance_id.to_string(),
                user_id: user_id.to_string(),
                value: new_val.clone(),
                expected_version: Some(doc_version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    return Ok(json!({
                        "ok": true,
                        "instanceId": instance_id,
                        "result": outcome.result,
                        "previousTier": outcome.previous_tier,
                        "newTier": outcome.new_tier,
                        "glow": outcome.glow,
                        "crystalsYielded": outcome.crystals_yielded,
                    }));
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }

        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("enchant_equipment OCC retries exhausted".to_string())
        }))
    }

    fn rpc_socket_card(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        let instance_id = body
            .get("instanceId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| MetaError::BadRequest("Missing instanceId".to_string()))?;

        let card_id = body
            .get("cardId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| MetaError::BadRequest("Missing cardId".to_string()))?;

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (inv, _) = self.read_inventory(user_id)?;
            let _owned = inv
                .uniques
                .iter()
                .find(|u| u.instance_id == instance_id)
                .ok_or_else(|| {
                    MetaError::BadRequest("Item instance not found in inventory".to_string())
                })?;

            let (mut socket_state, doc_version) =
                match self.store.read_doc(user_id, "item_sockets", instance_id)? {
                    Some(stored) => {
                        let st: ItemSocketState =
                            serde_json::from_value(stored.value).unwrap_or_default();
                        (st, stored.version)
                    }
                    None => (ItemSocketState::with_max_sockets(3), "*".to_string()),
                };

            socket_state
                .insert_card(card_id)
                .map_err(|e| MetaError::BadRequest(e.to_string()))?;

            let new_val = serde_json::to_value(&socket_state)
                .map_err(|e| MetaError::Internal(e.to_string()))?;

            match self.store.write_batch(&[DocWrite {
                collection: "item_sockets".to_string(),
                key: instance_id.to_string(),
                user_id: user_id.to_string(),
                value: new_val.clone(),
                expected_version: Some(doc_version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    return Ok(json!({
                        "ok": true,
                        "instanceId": instance_id,
                        "socketedCardIds": socket_state.socketed_card_ids,
                    }));
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }

        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("socket_card OCC retries exhausted".to_string())
        }))
    }

    fn rpc_allocate_stats(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        // Support both Nakama's top-level `{ str, agi, int, vit, dex }` and nested `{ spend: { ... } }`
        let spend = if let Some(s) = body.get("spend").and_then(|v| v.as_object()) {
            s
        } else if let Some(root) = body.as_object() {
            root
        } else {
            return Err(MetaError::BadRequest(
                "Invalid allocate_stats payload".to_string(),
            ));
        };

        let parse_delta = |key: &str| -> Result<u32, MetaError> {
            match spend.get(key) {
                None | Some(Value::Null) => Ok(0),
                Some(v) => {
                    if let Some(i) = v.as_i64() {
                        if i < 0 || i > i64::from(u32::MAX) {
                            return Err(MetaError::BadRequest(format!(
                                "Invalid spend for {}",
                                key
                            )));
                        }
                        Ok(i as u32)
                    } else {
                        Err(MetaError::BadRequest(format!("Invalid spend for {}", key)))
                    }
                }
            }
        };

        let d_str = parse_delta("str")?;
        let d_agi = parse_delta("agi")?;
        let d_int = parse_delta("int")?;
        let d_vit = parse_delta("vit")?;
        let d_dex = parse_delta("dex")?;
        let d_luk = parse_delta("luk")?;
        let total = d_str
            .saturating_add(d_agi)
            .saturating_add(d_int)
            .saturating_add(d_vit)
            .saturating_add(d_dex)
            .saturating_add(d_luk);

        if total == 0 {
            return Err(MetaError::BadRequest(
                "Must spend at least 1 stat point".to_string(),
            ));
        }

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (mut profile, version) = self.read_profile(user_id)?;
            if total > profile.stat_points {
                return Err(MetaError::BadRequest("Insufficient statPoints".to_string()));
            }
            profile.stat_points -= total;
            profile.allocated = PrimaryStats {
                str: profile.allocated.str.saturating_add(d_str),
                agi: profile.allocated.agi.saturating_add(d_agi),
                int: profile.allocated.int.saturating_add(d_int),
                vit: profile.allocated.vit.saturating_add(d_vit),
                dex: profile.allocated.dex.saturating_add(d_dex),
                luk: profile.allocated.luk.saturating_add(d_luk),
            };

            let val =
                serde_json::to_value(&profile).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "profile".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val.clone(),
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    let mut out = val;
                    if let Some(obj) = out.as_object_mut() {
                        obj.insert(
                            "profile".to_string(),
                            serde_json::to_value(&profile).unwrap_or(Value::Null),
                        );
                    }
                    return Ok(out);
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("allocate_stats OCC retries exhausted".to_string())
        }))
    }

    fn rpc_set_skill_loadout(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        let arr = body
            .get("loadout")
            .and_then(|v| v.as_array())
            .ok_or_else(|| MetaError::BadRequest("loadout must be an array".to_string()))?;
        if arr.len() > MAX_SKILL_LOADOUT {
            return Err(MetaError::BadRequest(format!(
                "Loadout cannot exceed {} skills",
                MAX_SKILL_LOADOUT
            )));
        }
        let mut loadout = Vec::with_capacity(arr.len());
        for entry in arr {
            let skill_id = entry
                .as_str()
                .ok_or_else(|| MetaError::BadRequest("Invalid skillId in loadout".to_string()))?;
            if !self.catalogs.skills.contains_key(skill_id) {
                return Err(MetaError::BadRequest(format!(
                    "Unknown skillId: {}",
                    skill_id
                )));
            }
            loadout.push(skill_id.to_string());
        }

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (mut skills, version) = self.read_skills(user_id)?;
            for skill_id in &loadout {
                let unlocked = skills
                    .unlocked
                    .iter()
                    .any(|u| &u.skill_id == skill_id && u.level > 0);
                if !unlocked {
                    return Err(MetaError::BadRequest(format!(
                        "Skill not unlocked: {}",
                        skill_id
                    )));
                }
            }
            skills.loadout = loadout.clone();
            let val =
                serde_json::to_value(&skills).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "skills".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val.clone(),
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    let mut out = val;
                    if let Some(obj) = out.as_object_mut() {
                        obj.insert(
                            "skills".to_string(),
                            serde_json::to_value(&skills).unwrap_or(Value::Null),
                        );
                    }
                    return Ok(out);
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("set_skill_loadout OCC retries exhausted".to_string())
        }))
    }

    fn rpc_accept_quest(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        let quest_id = body
            .get("questId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MetaError::BadRequest("Missing questId".to_string()))?;
        let def = self
            .catalogs
            .quests
            .get(quest_id)
            .ok_or_else(|| MetaError::BadRequest(format!("Unknown questId: {}", quest_id)))?
            .clone();

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (mut quests, version) = self.read_quests(user_id)?;
            if quests.active.iter().any(|q| q.quest_id == quest_id) {
                return Err(MetaError::BadRequest("Quest already active".to_string()));
            }
            if quests.completed.iter().any(|q| q.quest_id == quest_id) {
                return Err(MetaError::BadRequest("Quest already completed".to_string()));
            }

            let mut objectives: QuestObjectivesMap = HashMap::new();
            for o in &def.objectives {
                objectives.insert(o.id.clone(), 0);
            }

            quests.active.push(ActiveQuestEntry {
                quest_id: def.id.clone(),
                started_at: now_epoch_ms(),
                objectives,
            });

            let val =
                serde_json::to_value(&quests).map_err(|e| MetaError::Internal(e.to_string()))?;
            match self.store.write_batch(&[DocWrite {
                collection: "quests".to_string(),
                key: "state".to_string(),
                user_id: user_id.to_string(),
                value: val.clone(),
                expected_version: Some(version),
                permission_read: 2,
                permission_write: 0,
            }]) {
                Ok(_) => {
                    let mut out = val;
                    if let Some(obj) = out.as_object_mut() {
                        obj.insert(
                            "quests".to_string(),
                            serde_json::to_value(&quests).unwrap_or(Value::Null),
                        );
                    }
                    return Ok(out);
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("accept_quest OCC retries exhausted".to_string())
        }))
    }

    fn rpc_claim_quest_reward(&self, user_id: &str, body: &Value) -> Result<Value, MetaError> {
        let quest_id = body
            .get("questId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MetaError::BadRequest("Missing questId".to_string()))?;
        let def = self
            .catalogs
            .quests
            .get(quest_id)
            .ok_or_else(|| MetaError::BadRequest(format!("Unknown questId: {}", quest_id)))?
            .clone();

        let mut last_err = None;
        for _ in 0..MAX_OCC_ATTEMPTS {
            let (mut quests, quests_ver) = self.read_quests(user_id)?;
            let completed_entry = quests
                .completed
                .iter_mut()
                .find(|q| q.quest_id == quest_id)
                .ok_or_else(|| MetaError::BadRequest("Quest is not completed".to_string()))?;
            if completed_entry.claimed {
                return Err(MetaError::BadRequest(
                    "Quest reward already claimed".to_string(),
                ));
            }
            completed_entry.claimed = true;

            let (profile, profile_ver) = self.read_profile(user_id)?;
            let (mut inventory, inventory_ver) = self.read_inventory(user_id)?;

            let (updated_profile, leveled_up) = if def.rewards.xp > 0 {
                apply_xp(&profile, u64::from(def.rewards.xp))
            } else {
                (profile, 0)
            };

            for reward in &def.rewards.items {
                let item_def = self.catalogs.items.get(&reward.item_id).ok_or_else(|| {
                    MetaError::BadRequest(format!("Unknown reward itemId: {}", reward.item_id))
                })?;
                if item_def.stackable {
                    if let Some(existing) = inventory
                        .stackables
                        .iter_mut()
                        .find(|s| s.item_id == item_def.id)
                    {
                        existing.qty = existing.qty.saturating_add(reward.qty);
                    } else {
                        inventory.stackables.push(StackableEntry {
                            item_id: item_def.id.clone(),
                            qty: reward.qty,
                        });
                    }
                } else {
                    for _ in 0..reward.qty {
                        inventory.uniques.push(UniqueEntry {
                            instance_id: generate_uuid_v4(),
                            item_id: item_def.id.clone(),
                        });
                    }
                }
            }

            let profile_val = serde_json::to_value(&updated_profile)
                .map_err(|e| MetaError::Internal(e.to_string()))?;
            let inv_val =
                serde_json::to_value(&inventory).map_err(|e| MetaError::Internal(e.to_string()))?;
            let quests_val =
                serde_json::to_value(&quests).map_err(|e| MetaError::Internal(e.to_string()))?;

            match self.store.write_batch(&[
                DocWrite {
                    collection: "profile".to_string(),
                    key: "state".to_string(),
                    user_id: user_id.to_string(),
                    value: profile_val,
                    expected_version: Some(profile_ver),
                    permission_read: 2,
                    permission_write: 0,
                },
                DocWrite {
                    collection: "inventory".to_string(),
                    key: "state".to_string(),
                    user_id: user_id.to_string(),
                    value: inv_val,
                    expected_version: Some(inventory_ver),
                    permission_read: 2,
                    permission_write: 0,
                },
                DocWrite {
                    collection: "quests".to_string(),
                    key: "state".to_string(),
                    user_id: user_id.to_string(),
                    value: quests_val,
                    expected_version: Some(quests_ver),
                    permission_read: 2,
                    permission_write: 0,
                },
            ]) {
                Ok(_) => {
                    return Ok(json!({
                        "profile": updated_profile,
                        "inventory": inventory,
                        "quests": quests,
                        "leveledUp": leveled_up,
                    }));
                }
                Err(e @ MetaError::VersionConflict(_)) => last_err = Some(e),
                Err(e) => return Err(e),
            }
        }
        Err(last_err.unwrap_or_else(|| {
            MetaError::VersionConflict("claim_quest_reward OCC retries exhausted".to_string())
        }))
    }

    fn rpc_reset_poc_maro_10m(&self, user_id: &str) -> Result<Value, MetaError> {
        let prev_reset_count =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => serde_json::from_value::<PocMaro10mState>(stored.value)
                    .map(|s| s.reset_count)
                    .unwrap_or(0),
                None => 0,
            };
        let state = PocMaro10mState {
            reset_count: prev_reset_count + 1,
            ..PocMaro10mState::default()
        };
        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;
        Ok(val)
    }

    fn rpc_get_poc_maro_10m_state(&self, user_id: &str) -> Result<Value, MetaError> {
        let state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };
        serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))
    }

    fn rpc_update_poc_maro_10m_state(
        &self,
        user_id: &str,
        body: &Value,
    ) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        if let Some(v) = body.get("activeBeat").and_then(|v| v.as_str()) {
            state.active_beat = v.to_string();
        }
        if let Some(v) = body.get("pipGreeted").and_then(|v| v.as_bool()) {
            state.pip_greeted = v;
        }
        if let Some(v) = body.get("amberErrandAccepted").and_then(|v| v.as_bool()) {
            state.amber_errand_accepted = v;
        }
        if let Some(v) = body.get("amberErrandCompleted").and_then(|v| v.as_bool()) {
            state.amber_errand_completed = v;
        }
        if let Some(arr) = body.get("lanternsLit").and_then(|v| v.as_array()) {
            for x in arr.iter().filter_map(|x| x.as_str()) {
                if !state.lanterns_lit.iter().any(|s| s == x) {
                    state.lanterns_lit.push(x.to_string());
                }
            }
        }
        if let Some(v) = body.get("verminDefeated").and_then(|v| v.as_u64()) {
            state.vermin_defeated = v as u32;
        }
        if let Some(v) = body.get("sootMuncherDefeated").and_then(|v| v.as_bool()) {
            state.soot_muncher_defeated = v;
        }
        if let Some(v) = body.get("parcelRecovered").and_then(|v| v.as_bool()) {
            state.parcel_recovered = v;
        }
        if let Some(v) = body.get("lanternOilCount").and_then(|v| v.as_u64()) {
            state.lantern_oil_count = v as u32;
        }
        if let Some(v) = body.get("bramParcelDelivered").and_then(|v| v.as_bool()) {
            state.bram_parcel_delivered = v;
        }
        if let Some(v) = body.get("traceGlimpsed").and_then(|v| v.as_bool()) {
            state.trace_glimpsed = v;
        }
        if let Some(v) = body.get("eddaSpoken").and_then(|v| v.as_bool()) {
            state.edda_spoken = v;
        }
        if let Some(v) = body.get("timeWoundTriggered").and_then(|v| v.as_bool()) {
            state.time_wound_triggered = v;
        }
        if let Some(v) = body.get("gladeHookUnlocked").and_then(|v| v.as_bool()) {
            state.glade_hook_unlocked = v;
        }

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;
        Ok(val)
    }

    fn rpc_accept_poc_amber_errand(&self, user_id: &str) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };
        state.amber_errand_accepted = true;
        if state.active_beat == "POC-00" || state.active_beat == "POC-01" {
            state.active_beat = "POC-02".to_string();
        }
        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;
        Ok(val)
    }

    fn rpc_complete_poc_amber_errand(
        &self,
        user_id: &str,
        body: &Value,
    ) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        let target_lantern = body
            .get("lanternId")
            .and_then(|v| v.as_str())
            .unwrap_or("lantern-06")
            .to_string();

        let already_completed = state.amber_errand_completed;
        if !already_completed {
            state.amber_errand_accepted = true;
            state.amber_errand_completed = true;
            state.active_beat = "POC-02".to_string();
            state.lantern_oil_count = state.lantern_oil_count.saturating_add(1);
            if !state.lanterns_lit.contains(&target_lantern) {
                state.lanterns_lit.push(target_lantern);
            }
        }

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;

        let mut res = serde_json::Map::new();
        res.insert("state".to_string(), val);
        res.insert(
            "alreadyCompleted".to_string(),
            Value::Bool(already_completed),
        );
        res.insert("rewardGranted".to_string(), Value::Bool(!already_completed));
        Ok(Value::Object(res))
    }

    fn rpc_resolve_poc_vermin_combat(
        &self,
        user_id: &str,
        body: &Value,
    ) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        let player_dist = body
            .get("playerDistance")
            .and_then(|v| v.as_f64())
            .unwrap_or(999.0) as f32;
        let attack_power = body
            .get("attackPower")
            .and_then(|v| v.as_f64())
            .unwrap_or(35.0) as f32;

        const MAX_MELEE_RANGE: f32 = 3.0; // metres-v1 authoritative melee attack range
        let mut res = serde_json::Map::new();

        if player_dist > MAX_MELEE_RANGE {
            res.insert("inRange".to_string(), Value::Bool(false));
            res.insert("hit".to_string(), Value::Bool(false));
            res.insert("damage".to_string(), serde_json::json!(0.0));
            res.insert(
                "defeated".to_string(),
                Value::Bool(state.soot_muncher_defeated),
            );
            return Ok(Value::Object(res));
        }

        let damage = attack_power.max(10.0);
        state.vermin_defeated = state.vermin_defeated.saturating_add(1);
        state.soot_muncher_defeated = true;

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;

        res.insert("inRange".to_string(), Value::Bool(true));
        res.insert("hit".to_string(), Value::Bool(true));
        res.insert("damage".to_string(), serde_json::json!(damage));
        res.insert("defeated".to_string(), Value::Bool(true));
        res.insert("state".to_string(), val);
        Ok(Value::Object(res))
    }

    fn rpc_recover_poc_parcel(&self, user_id: &str) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        if !state.soot_muncher_defeated {
            let mut res = serde_json::Map::new();
            res.insert("ok".to_string(), Value::Bool(false));
            res.insert(
                "reason".to_string(),
                serde_json::json!("Soot Muncher must be defeated before parcel can be recovered"),
            );
            return Ok(Value::Object(res));
        }

        let already_recovered = state.parcel_recovered;
        if !already_recovered {
            state.parcel_recovered = true;
            if state.active_beat == "POC-00"
                || state.active_beat == "POC-01"
                || state.active_beat == "POC-02"
            {
                state.active_beat = "POC-03".to_string();
            }
        }

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;

        let mut res = serde_json::Map::new();
        res.insert("ok".to_string(), Value::Bool(true));
        res.insert(
            "alreadyRecovered".to_string(),
            Value::Bool(already_recovered),
        );
        res.insert("state".to_string(), val);
        Ok(Value::Object(res))
    }

    fn rpc_reset_poc_vermin_encounter(&self, user_id: &str) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        state.vermin_defeated = 0;
        state.soot_muncher_defeated = false;
        state.parcel_recovered = false;

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;

        let mut res = serde_json::Map::new();
        res.insert("ok".to_string(), Value::Bool(true));
        res.insert("state".to_string(), val);
        Ok(Value::Object(res))
    }

    fn rpc_inspect_poc_old_lantern(&self, user_id: &str) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        let already_glimpsed = state.trace_glimpsed;
        if !already_glimpsed {
            state.trace_glimpsed = true;
            if state.active_beat == "POC-00"
                || state.active_beat == "POC-01"
                || state.active_beat == "POC-02"
                || state.active_beat == "POC-03"
            {
                state.active_beat = "POC-04".to_string();
            }
        }

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;

        let mut res = serde_json::Map::new();
        res.insert("ok".to_string(), Value::Bool(true));
        res.insert("alreadyGlimpsed".to_string(), Value::Bool(already_glimpsed));
        res.insert("state".to_string(), val);
        Ok(Value::Object(res))
    }

    fn rpc_trigger_poc_time_wound(&self, user_id: &str) -> Result<Value, MetaError> {
        let mut state =
            match self
                .store
                .read_doc(user_id, COLLECTION_POC_MARO_10M, KEY_POC_SESSION_STATE)?
            {
                Some(stored) => {
                    serde_json::from_value::<PocMaro10mState>(stored.value).unwrap_or_default()
                }
                None => PocMaro10mState::default(),
            };

        let already_triggered = state.time_wound_triggered;
        if !already_triggered {
            state.edda_spoken = true;
            state.time_wound_triggered = true;
            state.glade_hook_unlocked = true;
            state.active_beat = "POC-05".to_string();
        }

        let val = serde_json::to_value(&state).map_err(|e| MetaError::Internal(e.to_string()))?;
        self.store.write_batch(&[DocWrite {
            collection: COLLECTION_POC_MARO_10M.to_string(),
            key: KEY_POC_SESSION_STATE.to_string(),
            user_id: user_id.to_string(),
            value: val.clone(),
            expected_version: None,
            permission_read: 2,
            permission_write: 0,
        }])?;

        let mut res = serde_json::Map::new();
        res.insert("ok".to_string(), Value::Bool(true));
        res.insert(
            "alreadyTriggered".to_string(),
            Value::Bool(already_triggered),
        );
        res.insert("state".to_string(), val);
        Ok(Value::Object(res))
    }
}

#[async_trait]
impl NakamaStorage for RustMetaEngine {
    async fn verify_session(&self, token: &str) -> Result<Option<String>, String> {
        if let Some(ref guard) = self.auth_guard {
            match guard.validate_token(token) {
                Ok(claims) => Ok(Some(claims.sub)),
                Err(_) => Ok(None),
            }
        } else {
            let guard = AuthGuard::from_env();
            match guard.validate_token(token) {
                Ok(claims) => Ok(Some(claims.sub)),
                Err(_) => Ok(None),
            }
        }
    }

    async fn report_match_events(&self, batch: &MatchEventBatch) -> Result<String, String> {
        let seq = self.in_process_event_seq.fetch_add(1, Ordering::Relaxed) + 1;
        let payload = batch.to_rpc_payload(&self.match_id, seq);
        let val = self
            .rpc_report_match_events(&payload)
            .map_err(|e| e.to_string())?;
        serde_json::to_string(&val).map_err(|e| e.to_string())
    }

    async fn get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String> {
        self.get_loadout_direct(user_id)
            .map(Some)
            .map_err(|e| e.to_string())
    }

    async fn save_character_state(
        &self,
        user_id: &str,
        state: &CharacterStateSnapshot,
    ) -> Result<String, String> {
        let seq = if state.seq == 0 {
            self.in_process_state_seq.fetch_add(1, Ordering::Relaxed) + 1
        } else {
            state.seq
        };
        let map_id = if state.map_id.is_empty() {
            "map-for-play"
        } else {
            state.map_id.as_str()
        };
        let payload = json!({
            "userId": user_id,
            "mapId": map_id,
            "x": state.x,
            "y": state.y,
            "health": state.health,
            "seq": seq,
        });
        let val = self
            .rpc_save_character_state(&payload)
            .map_err(|e| e.to_string())?;
        serde_json::to_string(&val).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meta::store::{InMemoryMetaStore, SqliteMetaStore};
    use crate::storage::{MatchEvent, SkillUnlock};

    fn test_engine() -> RustMetaEngine {
        RustMetaEngine::new(Arc::new(InMemoryMetaStore::new())).expect("engine init")
    }

    #[test]
    fn grant_xp_and_allocate_stats_enforce_level_curve_and_points() {
        let engine = test_engine();
        let uid = generate_uuid_v4();

        let res = engine
            .invoke_rpc(
                &RpcContext::s2s(),
                "grant_xp",
                &json!({ "userId": uid, "amount": 250 }).to_string(),
            )
            .expect("grant_xp should succeed");
        assert_eq!(res["level"], 2);
        assert_eq!(res["xp"], 150);
        assert_eq!(res["statPoints"], 3);
        assert_eq!(res["leveledUp"], 1);
        assert_eq!(res["profile"]["level"], 2);

        let forbidden = engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "grant_xp",
                &json!({ "userId": uid, "amount": 100 }).to_string(),
            )
            .expect_err("client calling grant_xp must fail");
        assert!(matches!(forbidden, MetaError::Forbidden(_)));

        let overspend = engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "allocate_stats",
                &json!({ "str": 4, "agi": 0, "int": 0, "vit": 0, "dex": 0 }).to_string(),
            )
            .expect_err("overspending statPoints must fail");
        assert!(matches!(overspend, MetaError::BadRequest(_)));

        // Top-level Nakama shape `{ str, agi, int, vit, dex }` works and returns root ProfileDoc fields + `profile`
        let alloc = engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "allocate_stats",
                &json!({ "str": 2, "agi": 0, "int": 0, "vit": 0, "dex": 1 }).to_string(),
            )
            .expect("valid allocate_stats");
        assert_eq!(alloc["statPoints"], 0);
        assert_eq!(alloc["allocated"]["str"], 3);
        assert_eq!(alloc["allocated"]["dex"], 2);
        assert_eq!(alloc["profile"]["allocated"]["str"], 3);
    }

    #[test]
    fn grant_loot_equip_item_and_get_loadout_resolve_instance_ids() {
        let engine = test_engine();
        let uid = generate_uuid_v4();

        // Single-item Nakama shape `{ userId, itemId, qty }`
        let loot = engine
            .invoke_rpc(
                &RpcContext::s2s(),
                "grant_loot",
                &json!({
                    "userId": uid,
                    "itemId": "basic_sword",
                    "qty": 1
                })
                .to_string(),
            )
            .expect("grant_loot");
        let sword_inst = loot["uniques"][0]["instanceId"]
            .as_str()
            .expect("minted instanceId")
            .to_string();

        assert!(engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "equip_item",
                &json!({ "slot": "armor", "instanceId": sword_inst }).to_string(),
            )
            .is_err());

        let eq_res = engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "equip_item",
                &json!({ "slot": "weapon", "instanceId": sword_inst }).to_string(),
            )
            .expect("equip weapon");
        assert_eq!(eq_res["slots"]["weapon"], sword_inst);

        let loadout = engine.get_loadout_direct(&uid).expect("get_loadout");
        assert_eq!(
            loadout.equipped_item_ids.weapon.as_deref(),
            Some("basic_sword")
        );
    }

    #[test]
    fn set_skill_loadout_enforces_unlocks_and_max_four_slots() {
        let engine = test_engine();
        let uid = generate_uuid_v4();

        assert!(engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "set_skill_loadout",
                &json!({ "loadout": ["power_strike"] }).to_string(),
            )
            .is_err());

        let skills_doc = SkillsDoc {
            schema_version: 1,
            unlocked: vec![
                SkillUnlock {
                    skill_id: "power_strike".to_string(),
                    level: 1,
                },
                SkillUnlock {
                    skill_id: "fireball".to_string(),
                    level: 2,
                },
            ],
            loadout: vec![],
        };
        engine
            .store()
            .write_batch(&[DocWrite {
                collection: "skills".to_string(),
                key: "state".to_string(),
                user_id: uid.clone(),
                value: serde_json::to_value(&skills_doc).unwrap(),
                expected_version: Some("*".to_string()),
                permission_read: 2,
                permission_write: 0,
            }])
            .unwrap();

        assert!(engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "set_skill_loadout",
                &json!({ "loadout": ["power_strike", "fireball", "power_strike", "fireball", "power_strike"] }).to_string(),
            )
            .is_err());

        let res = engine
            .invoke_rpc(
                &RpcContext::client(&uid, None),
                "set_skill_loadout",
                &json!({ "loadout": ["power_strike", "fireball"] }).to_string(),
            )
            .expect("set_skill_loadout");
        assert_eq!(res["loadout"], json!(["power_strike", "fireball"]));
    }

    #[tokio::test]
    async fn quest_lifecycle_attribution_guard_and_restart_monotonic_seq() {
        let temp_dir =
            std::env::temp_dir().join(format!("atlas_engine_test_{}", generate_uuid_v4()));
        let db_path = temp_dir.join("meta.db");
        let uid = generate_uuid_v4();

        {
            let store = Arc::new(SqliteMetaStore::open(&db_path).unwrap());
            let engine = RustMetaEngine::new(store).unwrap();

            let accepted = engine
                .invoke_rpc(
                    &RpcContext::client(&uid, None),
                    "accept_quest",
                    &json!({ "questId": "q_boar_5" }).to_string(),
                )
                .expect("accept q_boar_5");
            assert_eq!(accepted["active"][0]["objectives"]["kill_boars"], 0);

            let bad_attr = engine
                .invoke_rpc(
                    &RpcContext::s2s(),
                    "report_match_events",
                    &json!({
                        "userId": uid,
                        "matchId": "server-rs-live",
                        "seq": 1,
                        "events": [{ "type": "MOB_KILLED", "userId": "other-user", "mobType": "boar", "count": 2 }]
                    })
                    .to_string(),
                )
                .expect_err("mismatched event.userId must fail");
            assert!(matches!(bad_attr, MetaError::BadRequest(_)));

            let batch1 = MatchEventBatch {
                user_id: uid.clone(),
                events: vec![MatchEvent {
                    event_type: "MOB_KILLED".to_string(),
                    target_id: "boar".to_string(),
                    payload: json!({ "count": 3 }),
                }],
            };
            let out1: Value = serde_json::from_str(
                &NakamaStorage::report_match_events(&engine, &batch1)
                    .await
                    .unwrap(),
            )
            .unwrap();
            assert_eq!(out1["deduped"], false);
            assert_eq!(out1["progressed"], json!(["q_boar_5"]));
            assert_eq!(out1["completedNow"], json!([]));
        }

        std::thread::sleep(std::time::Duration::from_millis(2));
        {
            let store = Arc::new(SqliteMetaStore::open(&db_path).unwrap());
            let engine = RustMetaEngine::new(store).unwrap();

            let batch2 = MatchEventBatch {
                user_id: uid.clone(),
                events: vec![MatchEvent {
                    event_type: "MOB_KILLED".to_string(),
                    target_id: "boar".to_string(),
                    payload: json!({ "count": 2 }),
                }],
            };
            let out2: Value = serde_json::from_str(
                &NakamaStorage::report_match_events(&engine, &batch2)
                    .await
                    .unwrap(),
            )
            .unwrap();
            assert_eq!(out2["deduped"], false);
            assert_eq!(out2["completedNow"], json!(["q_boar_5"]));

            let notifs = engine.drain_notifications(&uid);
            assert!(notifs
                .iter()
                .any(|n| n.code == 2 && n.subject == "quest_progress"));

            let claim = engine
                .invoke_rpc(
                    &RpcContext::client(&uid, None),
                    "claim_quest_reward",
                    &json!({ "questId": "q_boar_5" }).to_string(),
                )
                .expect("claim_quest_reward");
            assert_eq!(claim["leveledUp"], 1);
            assert_eq!(claim["profile"]["level"], 2);
            assert_eq!(
                claim["inventory"]["stackables"][0]["itemId"],
                "potion_minor"
            );
            assert_eq!(claim["quests"]["completed"][0]["claimed"], true);

            assert!(engine
                .invoke_rpc(
                    &RpcContext::client(&uid, None),
                    "claim_quest_reward",
                    &json!({ "questId": "q_boar_5" }).to_string(),
                )
                .is_err());
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn poc_maro_10m_state_resets_reproducibly_without_leaking_into_canonical_saves() {
        let engine = test_engine();
        let uid = generate_uuid_v4();
        let ctx = RpcContext::client(&uid, None);

        // 1. Initial state is default
        let initial = engine
            .invoke_rpc(&ctx, "get_poc_maro_10m_state", "{}")
            .expect("get initial poc state");
        assert_eq!(initial["mapId"], "maro-bell");
        assert_eq!(initial["classId"], "cl-vanguard");
        assert_eq!(initial["activeBeat"], "POC-00");
        assert_eq!(initial["spawn"]["serverX"], 40.0);
        assert_eq!(initial["spawn"]["serverY"], 151.0);
        assert_eq!(initial["spawn"]["worldX"], 0.0);
        assert_eq!(initial["spawn"]["worldZ"], 71.0);
        assert_eq!(initial["resetCount"], 0);
        assert_eq!(initial["traceGlimpsed"], false);

        // 2. Update state (progressing the POC beat and story flags)
        let updated = engine
            .invoke_rpc(
                &ctx,
                "update_poc_maro_10m_state",
                &json!({
                    "activeBeat": "POC-03",
                    "traceGlimpsed": true,
                    "verminDefeated": 3,
                    "lanternsLit": ["lantern-01", "lantern-02"],
                })
                .to_string(),
            )
            .expect("update poc state");
        assert_eq!(updated["activeBeat"], "POC-03");
        assert_eq!(updated["traceGlimpsed"], true);
        assert_eq!(updated["verminDefeated"], 3);
        assert_eq!(updated["lanternsLit"], json!(["lantern-01", "lantern-02"]));

        // 3. Reset state
        let reset = engine
            .invoke_rpc(&ctx, "reset_poc_maro_10m", "{}")
            .expect("reset poc state");
        assert_eq!(reset["mapId"], "maro-bell");
        assert_eq!(reset["activeBeat"], "POC-00");
        assert_eq!(reset["traceGlimpsed"], false);
        assert_eq!(reset["verminDefeated"], 0);
        assert_eq!(reset["lanternsLit"], json!([]));
        assert_eq!(reset["resetCount"], 1);

        // 4. Verify canonical saves (quest_progress and character_progress/inventory) are completely untouched
        let loadout = engine.get_loadout_direct(&uid).expect("get loadout");
        assert!(loadout.active_quest_ids.is_empty());
        let (quests, _) = engine.read_quests(&uid).expect("read quests");
        assert!(quests.active.is_empty());
        assert!(quests.completed.is_empty());
        assert!(!quests
            .completed
            .iter()
            .any(|q| q.quest_id.starts_with("q-maro-")));
        let (inv, _) = engine.read_inventory(&uid).expect("read inventory");
        assert!(!inv.uniques.iter().any(|u| u.item_id == "it-key-sun-shard"));
        assert!(!inv
            .stackables
            .iter()
            .any(|s| s.item_id == "it-key-sun-shard"));
        assert_eq!(
            engine
                .store()
                .read_doc(&uid, "quest_progress", "state")
                .unwrap(),
            None
        );
        assert_eq!(
            engine
                .store()
                .read_doc(&uid, "character_progress", "state")
                .unwrap(),
            None
        );
    }

    #[test]
    fn poc_maro_10m_amber_errand_authoritative_and_idempotent() {
        let engine = test_engine();
        let uid = generate_uuid_v4();
        let ctx = RpcContext::client(&uid, None);

        // 1. Accept errand
        let accepted = engine
            .invoke_rpc(&ctx, "accept_poc_amber_errand", "{}")
            .expect("accept amber errand");
        assert_eq!(accepted["amberErrandAccepted"], true);
        assert_eq!(accepted["activeBeat"], "POC-02");

        // 2. Complete errand (lights lantern-06 and grants 1 lantern oil)
        let completed = engine
            .invoke_rpc(
                &ctx,
                "complete_poc_amber_errand",
                &json!({ "lanternId": "lantern-06" }).to_string(),
            )
            .expect("complete amber errand");
        assert_eq!(completed["alreadyCompleted"], false);
        assert_eq!(completed["rewardGranted"], true);
        assert_eq!(completed["state"]["amberErrandCompleted"], true);
        assert_eq!(completed["state"]["lanternOilCount"], 1);
        assert_eq!(completed["state"]["lanternsLit"], json!(["lantern-06"]));

        // 3. Reconnect / retry attempt (must be idempotent, no duplicate reward or double lanterns)
        let retry = engine
            .invoke_rpc(
                &ctx,
                "complete_poc_amber_errand",
                &json!({ "lanternId": "lantern-06" }).to_string(),
            )
            .expect("retry complete amber errand");
        assert_eq!(retry["alreadyCompleted"], true);
        assert_eq!(retry["rewardGranted"], false);
        assert_eq!(retry["state"]["amberErrandCompleted"], true);
        assert_eq!(retry["state"]["lanternOilCount"], 1);
        assert_eq!(retry["state"]["lanternsLit"], json!(["lantern-06"]));

        // 4. Verify canonical saves remain untouched
        let (quests, _) = engine.read_quests(&uid).expect("read quests");
        assert!(quests.active.is_empty());
        assert!(quests.completed.is_empty());
    }

    #[test]
    fn poc_maro_10m_vermin_combat_and_parcel_recovery() {
        let engine = test_engine();
        let uid = generate_uuid_v4();
        let ctx = RpcContext::client(&uid, None);

        // 1. Out-of-range attack check (> 3.0m)
        let out_of_range = engine
            .invoke_rpc(
                &ctx,
                "resolve_poc_vermin_combat",
                &json!({
                    "targetId": "mon-soot-muncher",
                    "playerDistance": 5.2,
                    "attackPower": 35.0,
                })
                .to_string(),
            )
            .expect("resolve out of range attack");
        assert_eq!(out_of_range["inRange"], false);
        assert_eq!(out_of_range["hit"], false);
        assert_eq!(out_of_range["defeated"], false);

        // 2. Parcel recovery before defeat must fail
        let early_parcel = engine
            .invoke_rpc(&ctx, "recover_poc_parcel", "{}")
            .expect("early recover parcel");
        assert_eq!(early_parcel["ok"], false);

        // 3. In-range attack defeats Soot Muncher (<= 3.0m)
        let in_range = engine
            .invoke_rpc(
                &ctx,
                "resolve_poc_vermin_combat",
                &json!({
                    "targetId": "mon-soot-muncher",
                    "playerDistance": 1.8,
                    "attackPower": 35.0,
                })
                .to_string(),
            )
            .expect("resolve in range attack");
        assert_eq!(in_range["inRange"], true);
        assert_eq!(in_range["hit"], true);
        assert_eq!(in_range["defeated"], true);
        assert_eq!(in_range["state"]["sootMuncherDefeated"], true);
        assert_eq!(in_range["state"]["verminDefeated"], 1);

        // 4. Parcel recovery after defeat succeeds and updates beat to POC-03
        let parcel = engine
            .invoke_rpc(&ctx, "recover_poc_parcel", "{}")
            .expect("recover parcel");
        assert_eq!(parcel["ok"], true);
        assert_eq!(parcel["alreadyRecovered"], false);
        assert_eq!(parcel["state"]["parcelRecovered"], true);

        // 5. Repeatable reset restores encounter state
        let reset = engine
            .invoke_rpc(&ctx, "reset_poc_vermin_encounter", "{}")
            .expect("reset vermin encounter");
        assert_eq!(reset["ok"], true);
        assert_eq!(reset["state"]["sootMuncherDefeated"], false);
        assert_eq!(reset["state"]["parcelRecovered"], false);
        assert_eq!(reset["state"]["verminDefeated"], 0);
    }

    #[test]
    fn poc_maro_10m_bram_and_old_lantern_inspect_authoritative_and_idempotent() {
        let engine = test_engine();
        let uid = generate_uuid_v4();
        let ctx = RpcContext::client(&uid, None);

        // 1. Initial inspect marks trace_glimpsed and advances beat to POC-04
        let inspect1 = engine
            .invoke_rpc(&ctx, "inspect_poc_old_lantern", "{}")
            .expect("inspect old lantern");
        assert_eq!(inspect1["ok"], true);
        assert_eq!(inspect1["alreadyGlimpsed"], false);
        assert_eq!(inspect1["state"]["traceGlimpsed"], true);
        assert_eq!(inspect1["state"]["activeBeat"], "POC-04");

        // 2. Repeated inspect is idempotent
        let inspect2 = engine
            .invoke_rpc(&ctx, "inspect_poc_old_lantern", "{}")
            .expect("repeat inspect");
        assert_eq!(inspect2["ok"], true);
        assert_eq!(inspect2["alreadyGlimpsed"], true);
        assert_eq!(inspect2["state"]["traceGlimpsed"], true);
        assert_eq!(inspect2["state"]["activeBeat"], "POC-04");
    }

    #[test]
    fn poc_maro_10m_edda_and_time_wound_event_authoritative_and_idempotent() {
        let engine = test_engine();
        let uid = generate_uuid_v4();
        let ctx = RpcContext::client(&uid, None);

        // 1. Initial trigger marks time wound flags and advances beat to POC-05
        let trigger1 = engine
            .invoke_rpc(&ctx, "trigger_poc_time_wound", "{}")
            .expect("trigger time wound");
        assert_eq!(trigger1["ok"], true);
        assert_eq!(trigger1["alreadyTriggered"], false);
        assert_eq!(trigger1["state"]["eddaSpoken"], true);
        assert_eq!(trigger1["state"]["timeWoundTriggered"], true);
        assert_eq!(trigger1["state"]["gladeHookUnlocked"], true);
        assert_eq!(trigger1["state"]["activeBeat"], "POC-05");

        // 2. Repeated trigger is idempotent
        let trigger2 = engine
            .invoke_rpc(&ctx, "trigger_poc_time_wound", "{}")
            .expect("repeat trigger");
        assert_eq!(trigger2["ok"], true);
        assert_eq!(trigger2["alreadyTriggered"], true);
        assert_eq!(trigger2["state"]["timeWoundTriggered"], true);
        assert_eq!(trigger2["state"]["activeBeat"], "POC-05");
    }
}
