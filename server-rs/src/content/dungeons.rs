use bevy_ecs::prelude::Resource;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Compile-time embedded catalog of all 60 authoritatively compiled dungeons.
pub const DUNGEON_CATALOG_JSON: &str =
    include_str!("../../../content/dungeons/_compiled_catalog.json");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonCatalogEntry {
    pub id: String,
    pub title: String,
    pub family: Option<String>,
    pub entrance_type: String,
    pub floors: u32,
    pub level_min: u32,
    pub level_max: u32,
    pub hazards: Vec<String>,
    pub lore: String,
    pub map_id: String,
    pub region_id: String,
    pub portal_x: f32,
    pub portal_y: f32,
    pub portal_radius: f32,
    pub mvp_boss_id: String,
    pub mvp_boss_name: String,
    pub mvp_boss_hp: u64,
    pub boss_enrage_secs: u64,
    pub mobs_per_floor: u32,
}

#[derive(Resource, Debug, Clone)]
pub struct DungeonCatalog {
    entries: HashMap<String, DungeonCatalogEntry>,
    by_map: HashMap<String, Vec<DungeonCatalogEntry>>,
}

impl Default for DungeonCatalog {
    fn default() -> Self {
        Self::new().expect("Failed to load compiled dungeon catalog")
    }
}

impl DungeonCatalog {
    pub fn new() -> Result<Self, serde_json::Error> {
        let list: Vec<DungeonCatalogEntry> = serde_json::from_str(DUNGEON_CATALOG_JSON)?;
        let mut entries = HashMap::with_capacity(list.len());
        let mut by_map: HashMap<String, Vec<DungeonCatalogEntry>> = HashMap::new();

        for entry in list {
            by_map
                .entry(entry.map_id.clone())
                .or_default()
                .push(entry.clone());
            entries.insert(entry.id.clone(), entry);
        }

        Ok(Self { entries, by_map })
    }

    pub fn get(&self, id: &str) -> Option<&DungeonCatalogEntry> {
        self.entries.get(id)
    }

    pub fn for_map(&self, map_id: &str) -> &[DungeonCatalogEntry] {
        self.by_map.get(map_id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn all_entries(&self) -> impl Iterator<Item = &DungeonCatalogEntry> {
        self.entries.values()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dungeon_catalog_loads_all_60_entries() {
        let catalog = DungeonCatalog::new().unwrap();
        assert_eq!(catalog.len(), 60);

        // Check canonical Wealdmarch dungeons
        let millcross = catalog
            .get("dungeon-millcross-race-tunnels")
            .expect("millcross tunnels should exist");
        assert_eq!(millcross.map_id, "millcross-ford");
        assert_eq!(millcross.floors, 2);
        assert_eq!(millcross.level_min, 1);
        assert_eq!(millcross.level_max, 10);
        assert!(millcross.mvp_boss_hp > 0);

        let cindervast = catalog
            .get("dungeon-cindervast-under-city")
            .expect("cindervast under-city should exist");
        assert_eq!(cindervast.floors, 12);
        assert_eq!(cindervast.level_min, 16);
        assert_eq!(cindervast.level_max, 34);

        // Check map lookup
        let millcross_dungeons = catalog.for_map("millcross-ford");
        assert!(!millcross_dungeons.is_empty());
    }
}
