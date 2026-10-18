use crate::storage::{PrimaryStats, ProfileDoc, SkillUnlock};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fmt;

/// Typed domain and HTTP error for the Rust Meta Engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MetaError {
    Unauthorized(String),
    Forbidden(String),
    BadRequest(String),
    NotFound(String),
    VersionConflict(String),
    Internal(String),
}

impl MetaError {
    pub fn http_status(&self) -> (u16, &'static str) {
        match self {
            Self::Unauthorized(_) => (401, "401 Unauthorized"),
            Self::Forbidden(_) => (403, "403 Forbidden"),
            Self::BadRequest(_) => (400, "400 Bad Request"),
            Self::NotFound(_) => (404, "404 Not Found"),
            Self::VersionConflict(_) => (409, "409 Conflict"),
            Self::Internal(_) => (500, "500 Internal Server Error"),
        }
    }

    pub fn grpc_code(&self) -> u8 {
        match self {
            Self::Unauthorized(_) => 16,
            Self::Forbidden(_) => 7,
            Self::BadRequest(_) => 3,
            Self::NotFound(_) => 5,
            Self::VersionConflict(_) => 6,
            Self::Internal(_) => 13,
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Unauthorized(m)
            | Self::Forbidden(m)
            | Self::BadRequest(m)
            | Self::NotFound(m)
            | Self::VersionConflict(m)
            | Self::Internal(m) => m.as_str(),
        }
    }
}

impl fmt::Display for MetaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for MetaError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackableEntry {
    pub item_id: String,
    pub qty: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UniqueEntry {
    pub instance_id: String,
    pub item_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryDoc {
    pub schema_version: u32,
    pub stackables: Vec<StackableEntry>,
    pub uniques: Vec<UniqueEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentSlotsDoc {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub armor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessory: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentDoc {
    pub schema_version: u32,
    pub slots: EquipmentSlotsDoc,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsDoc {
    pub schema_version: u32,
    pub unlocked: Vec<SkillUnlock>,
    pub loadout: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveObjectiveProgress {
    pub id: String,
    pub current: u32,
    pub required: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveQuestEntry {
    pub quest_id: String,
    pub started_at: u64,
    pub objectives: Vec<ActiveObjectiveProgress>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedQuestEntry {
    pub quest_id: String,
    pub completed_at: u64,
    pub claimed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestsDoc {
    pub schema_version: u32,
    pub active: Vec<ActiveQuestEntry>,
    pub completed: Vec<CompletedQuestEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterStateDoc {
    pub schema_version: u32,
    pub map_id: String,
    pub x: f32,
    pub y: f32,
    pub health: f32,
    pub seq: u64,
}

pub type QuestsSeqDoc = HashMap<String, u64>;

pub fn default_profile_doc() -> ProfileDoc {
    ProfileDoc::default()
}

pub fn default_inventory_doc() -> InventoryDoc {
    InventoryDoc {
        schema_version: 1,
        stackables: Vec::new(),
        uniques: Vec::new(),
    }
}

pub fn default_equipment_doc() -> EquipmentDoc {
    EquipmentDoc {
        schema_version: 1,
        slots: EquipmentSlotsDoc::default(),
    }
}

pub fn default_skills_doc() -> SkillsDoc {
    SkillsDoc {
        schema_version: 1,
        unlocked: Vec::new(),
        loadout: Vec::new(),
    }
}

pub fn default_quests_doc() -> QuestsDoc {
    QuestsDoc {
        schema_version: 1,
        active: Vec::new(),
        completed: Vec::new(),
    }
}

pub fn default_character_state_doc() -> CharacterStateDoc {
    CharacterStateDoc {
        schema_version: 1,
        map_id: String::new(),
        x: 0.0,
        y: 0.0,
        health: 100.0,
        seq: 0,
    }
}

fn require_u32_field(obj: &serde_json::Map<String, Value>, key: &str) -> Option<u32> {
    let val = obj.get(key)?;
    if let Some(u) = val.as_u64() {
        u32::try_from(u).ok()
    } else if let Some(f) = val.as_f64() {
        if f.is_finite() && f >= 0.0 && f.fract() == 0.0 && f <= u32::MAX as f64 {
            Some(f as u32)
        } else {
            None
        }
    } else {
        None
    }
}

/// Validates a v2 profile or migrates a v1 profile (`schemaVersion == 1`) to v2 by defaulting `allocated.dex` to `1`.
/// Returns `None` if `raw` is corrupt or has an unsupported `schemaVersion`.
pub fn migrate_profile_value(raw: &Value) -> Option<ProfileDoc> {
    let obj = raw.as_object()?;
    let ver = require_u32_field(obj, "schemaVersion")?;
    let level = require_u32_field(obj, "level")?;
    let xp = require_u32_field(obj, "xp")?;
    let stat_points = require_u32_field(obj, "statPoints")?;
    let allocated = obj.get("allocated")?.as_object()?;
    let str_val = require_u32_field(allocated, "str")?;
    let agi_val = require_u32_field(allocated, "agi")?;
    let int_val = require_u32_field(allocated, "int")?;
    let vit_val = require_u32_field(allocated, "vit")?;

    match ver {
        2 => {
            let dex_val = require_u32_field(allocated, "dex")?;
            Some(ProfileDoc {
                schema_version: 2,
                level,
                xp: u64::from(xp),
                stat_points,
                allocated: PrimaryStats {
                    str: str_val,
                    agi: agi_val,
                    int: int_val,
                    vit: vit_val,
                    dex: dex_val,
                },
            })
        }
        1 => {
            let dex_val = require_u32_field(allocated, "dex").unwrap_or(1);
            Some(ProfileDoc {
                schema_version: 2,
                level,
                xp: u64::from(xp),
                stat_points,
                allocated: PrimaryStats {
                    str: str_val,
                    agi: agi_val,
                    int: int_val,
                    vit: vit_val,
                    dex: dex_val,
                },
            })
        }
        _ => None,
    }
}

pub fn parse_inventory_value(raw: &Value) -> Option<InventoryDoc> {
    if raw.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
        return None;
    }
    serde_json::from_value(raw.clone()).ok()
}

pub fn parse_equipment_value(raw: &Value) -> Option<EquipmentDoc> {
    if raw.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
        return None;
    }
    serde_json::from_value(raw.clone()).ok()
}

pub fn parse_skills_value(raw: &Value) -> Option<SkillsDoc> {
    if raw.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
        return None;
    }
    serde_json::from_value(raw.clone()).ok()
}

pub fn parse_quests_value(raw: &Value) -> Option<QuestsDoc> {
    if raw.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
        return None;
    }
    serde_json::from_value(raw.clone()).ok()
}

pub fn parse_character_state_value(raw: &Value) -> Option<CharacterStateDoc> {
    if raw.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
        return None;
    }
    let doc: CharacterStateDoc = serde_json::from_value(raw.clone()).ok()?;
    if !doc.x.is_finite() || !doc.y.is_finite() || !doc.health.is_finite() {
        return None;
    }
    Some(doc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn migrates_profile_v1_to_v2_adding_default_dex() {
        let v1 = json!({
            "schemaVersion": 1,
            "level": 3,
            "xp": 50,
            "statPoints": 6,
            "allocated": { "str": 4, "agi": 2, "int": 1, "vit": 3 }
        });
        let doc = migrate_profile_value(&v1).expect("should migrate v1 profile");
        assert_eq!(doc.schema_version, 2);
        assert_eq!(doc.level, 3);
        assert_eq!(doc.xp, 50);
        assert_eq!(doc.stat_points, 6);
        assert_eq!(doc.allocated.str, 4);
        assert_eq!(doc.allocated.agi, 2);
        assert_eq!(doc.allocated.int, 1);
        assert_eq!(doc.allocated.vit, 3);
        assert_eq!(doc.allocated.dex, 1);
    }

    #[test]
    fn preserves_v2_profile_when_valid() {
        let v2 = json!({
            "schemaVersion": 2,
            "level": 5,
            "xp": 120,
            "statPoints": 9,
            "allocated": { "str": 5, "agi": 4, "int": 2, "vit": 3, "dex": 6 }
        });
        let doc = migrate_profile_value(&v2).expect("valid v2 profile");
        assert_eq!(doc.schema_version, 2);
        assert_eq!(doc.allocated.dex, 6);
    }

    #[test]
    fn corrupt_schema_version_returns_none_for_fallback() {
        let bad = json!({ "schemaVersion": 0, "level": 99 });
        assert!(migrate_profile_value(&bad).is_none());
        assert!(parse_inventory_value(&bad).is_none());
        assert!(parse_equipment_value(&bad).is_none());
        assert!(parse_skills_value(&bad).is_none());
        assert!(parse_quests_value(&bad).is_none());
        assert!(parse_character_state_value(&bad).is_none());
    }
}
