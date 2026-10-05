use crate::combat::Element;
use bevy_ecs::prelude::Resource;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Embedded compile-time copy of `content/bestiary/bestiary.json`.
pub const BESTIARY_JSON: &str = include_str!("../../../content/bestiary/bestiary.json");

/// Base attack power for unpromoted mobs in server-rs (matching CombatStats baseline).
pub const BASE_MOB_ATK: f32 = 10.0;

/// A raw entry in the bestiary catalog.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BestiaryEntry {
    pub id: String,
    pub name: String,
    pub family: String,
    pub body_plan: String,
    pub level_band: String,
    pub element: Element,
    pub archetype: String,
    pub threat: String,
    pub durability: String,
    pub speed: String,
    pub region: String,
    pub faction: String,
    #[serde(default)]
    pub lore: String,
    #[serde(default)]
    pub visual_brief: String,
}

impl Default for BestiaryEntry {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            family: String::new(),
            body_plan: String::new(),
            level_band: String::new(),
            element: Element::Neutral,
            archetype: String::new(),
            threat: String::new(),
            durability: String::new(),
            speed: String::new(),
            region: String::new(),
            faction: String::new(),
            lore: String::new(),
            visual_brief: String::new(),
        }
    }
}

/// Catalog indexing all bestiary mob entries by id.
#[derive(Resource, Debug, Clone)]
pub struct BestiaryCatalog {
    entries: HashMap<String, BestiaryEntry>,
}

impl BestiaryCatalog {
    /// Loads and parses entries from the compile-time embedded `BESTIARY_JSON`.
    pub fn new() -> Result<Self, serde_json::Error> {
        Self::from_json(BESTIARY_JSON)
    }

    /// Loads and parses entries from a JSON string.
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        let list: Vec<BestiaryEntry> = serde_json::from_str(json_str)?;
        let mut entries = HashMap::with_capacity(list.len());
        for entry in list {
            entries.insert(entry.id.clone(), entry);
        }
        Ok(Self { entries })
    }

    /// Retrieves an entry by its bestiary design ID (e.g. `mob-bramble-stalker`).
    pub fn get_mob(&self, id: &str) -> Option<&BestiaryEntry> {
        self.entries.get(id)
    }

    /// Number of indexed entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns true if the catalog is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Iterator over all bestiary entries.
    pub fn entries(&self) -> impl Iterator<Item = &BestiaryEntry> {
        self.entries.values()
    }
}

impl Default for BestiaryCatalog {
    fn default() -> Self {
        Self::new().expect("Embedded bestiary catalog must be valid JSON")
    }
}

/// Power tier corresponding to spawn regions / risk bands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MobTier {
    #[serde(alias = "Verge")]
    Verge,
    #[serde(alias = "Route")]
    Route,
    #[serde(alias = "Interior")]
    Interior,
    #[serde(alias = "Heart")]
    Heart,
}

impl MobTier {
    /// Multiplier factor applied to baseline stats.
    pub fn factor(&self) -> f32 {
        match self {
            MobTier::Verge => 0.75,
            MobTier::Route => 1.0,
            MobTier::Interior => 1.75,
            MobTier::Heart => 2.5,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            MobTier::Verge => "verge",
            MobTier::Route => "route",
            MobTier::Interior => "interior",
            MobTier::Heart => "heart",
        }
    }
}

/// Derived runtime combat and movement stats for a mob.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DerivedMobStats {
    pub hp: f32,
    pub p_atk: f32,
    pub p_def: f32,
    pub m_def: f32,
    pub armor: f32,
    pub speed: f32,
    pub radius: f32,
    pub chase_range: f32,
    pub element: Element,
    pub is_ranged: bool,
}

impl DerivedMobStats {
    pub fn move_speed(&self) -> f32 {
        self.speed
    }

    pub fn attack_range(&self) -> f32 {
        if self.is_ranged {
            150.0
        } else {
            20.0
        }
    }
}

/// Derives runtime mob stats from bestiary metadata and the designated power tier (F-031 rule).
pub fn derive_mob_stats(entry: &BestiaryEntry, tier: MobTier) -> DerivedMobStats {
    let f = tier.factor();
    let durability_hp = match entry.durability.as_str() {
        "low" => 70.0,
        "mid" => 100.0,
        "high" => 150.0,
        _ => 100.0,
    };
    let hp = (durability_hp * f).round();

    let base_atk = BASE_MOB_ATK;
    let p_atk = base_atk * f;

    let speed = match entry.speed.as_str() {
        "low" => 5.0,
        "mid" => 8.0,
        "high" => 11.0,
        _ => 8.0,
    } * 10.0;

    let (radius, p_def, armor, chase_range) = match entry.archetype.as_str() {
        "skirmisher" => (3.0, 1.0, 1.0, 20.0 * 10.0),
        "bruiser" => (5.0, 3.0, 2.0, 25.0 * 10.0),
        "tank" => (5.0, 4.0, 3.0, 15.0 * 10.0),
        _ => (4.0, 2.0, 1.0, 20.0 * 10.0),
    };

    let is_ranged = entry.threat == "ranged";
    let m_def = 1.0;

    DerivedMobStats {
        hp,
        p_atk,
        p_def,
        m_def,
        armor,
        speed,
        radius,
        chase_range,
        element: entry.element,
        is_ranged,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_parses_30_plus_entries() {
        let catalog = BestiaryCatalog::new().expect("Failed to parse embedded bestiary");
        assert!(
            catalog.len() >= 30,
            "Expected at least 30 entries, got {}",
            catalog.len()
        );
        // The embedded bestiary currently contains 116 entries
        assert_eq!(catalog.len(), 116);
        assert!(!catalog.is_empty());
    }

    #[test]
    fn test_f031_parity_bramble_stalker() {
        let catalog = BestiaryCatalog::new().expect("Catalog should load");
        let stalker = catalog
            .get_mob("mob-bramble-stalker")
            .expect("mob-bramble-stalker must exist in catalog");

        assert_eq!(stalker.name, "Bramble Stalker");
        assert_eq!(stalker.family, "plant");
        assert_eq!(stalker.element, Element::Earth);
        assert_eq!(stalker.archetype, "skirmisher");
        assert_eq!(stalker.threat, "melee");
        assert_eq!(stalker.durability, "mid");
        assert_eq!(stalker.speed, "high");

        let stats = derive_mob_stats(stalker, MobTier::Route);
        assert_eq!(stats.hp, 100.0);
        assert_eq!(stats.p_atk, 10.0);
        assert_eq!(stats.p_def, 1.0);
        assert_eq!(stats.m_def, 1.0);
        assert_eq!(stats.armor, 1.0);
        assert_eq!(stats.speed, 110.0);
        assert_eq!(stats.radius, 3.0);
        assert_eq!(stats.chase_range, 200.0);
        assert_eq!(stats.element, Element::Earth);
        assert!(!stats.is_ranged);
    }

    #[test]
    fn test_f031_parity_veil_spearling() {
        let catalog = BestiaryCatalog::new().expect("Catalog should load");
        let spearling = catalog
            .get_mob("mob-veil-spearling")
            .expect("mob-veil-spearling must exist in catalog");

        assert_eq!(spearling.name, "Veil Spearling");
        assert_eq!(spearling.family, "raider");
        assert_eq!(spearling.element, Element::Wind);
        assert_eq!(spearling.archetype, "skirmisher");
        assert_eq!(spearling.threat, "ranged");
        assert_eq!(spearling.durability, "low");
        assert_eq!(spearling.speed, "high");

        let stats = derive_mob_stats(spearling, MobTier::Route);
        assert_eq!(stats.hp, 70.0);
        assert_eq!(stats.p_atk, 10.0);
        assert_eq!(stats.p_def, 1.0);
        assert_eq!(stats.m_def, 1.0);
        assert_eq!(stats.armor, 1.0);
        assert_eq!(stats.speed, 110.0);
        assert_eq!(stats.radius, 3.0);
        assert_eq!(stats.chase_range, 200.0);
        assert_eq!(stats.element, Element::Wind);
        assert!(stats.is_ranged);
    }

    #[test]
    fn test_f031_parity_bramble_drake() {
        let catalog = BestiaryCatalog::new().expect("Catalog should load");
        let drake = catalog
            .get_mob("mob-bramble-drake")
            .expect("mob-bramble-drake must exist in catalog");

        assert_eq!(drake.name, "Bramble Drake");
        assert_eq!(drake.family, "drake");
        assert_eq!(drake.element, Element::Earth);
        assert_eq!(drake.archetype, "bruiser");
        assert_eq!(drake.threat, "melee");
        assert_eq!(drake.durability, "high");
        assert_eq!(drake.speed, "mid");

        let stats = derive_mob_stats(drake, MobTier::Interior);
        // Durability high (150) * Interior (1.75) = 262.5 -> round = 263.0
        assert_eq!(stats.hp, 263.0);
        assert_eq!(stats.p_atk, 17.5);
        assert_eq!(stats.p_def, 3.0);
        assert_eq!(stats.m_def, 1.0);
        assert_eq!(stats.armor, 2.0);
        assert_eq!(stats.speed, 80.0);
        assert_eq!(stats.radius, 5.0);
        assert_eq!(stats.chase_range, 250.0);
        assert_eq!(stats.element, Element::Earth);
        assert!(!stats.is_ranged);
    }

    #[test]
    fn test_tier_scaling() {
        let entry = BestiaryEntry {
            durability: "mid".to_string(), // 100
            speed: "low".to_string(),      // 5
            archetype: "tank".to_string(), // 5.0, 4.0, 3.0, 15.0
            ..Default::default()
        };

        let verge_stats = derive_mob_stats(&entry, MobTier::Verge);
        assert_eq!(verge_stats.hp, 75.0);
        assert_eq!(verge_stats.p_atk, 7.5);

        let heart_stats = derive_mob_stats(&entry, MobTier::Heart);
        assert_eq!(heart_stats.hp, 250.0);
        assert_eq!(heart_stats.p_atk, 25.0);
    }
}
