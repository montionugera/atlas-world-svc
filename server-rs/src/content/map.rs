use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

pub const SPAWN_AREAS_JSON: &str = include_str!("../../../content/generated/spawn-areas.json");
pub const TOWN_MILLCROSS_JSON: &str = include_str!("../../../content/towns/town-millcross.json");
pub const FREJA_SOUTH_GATE_JSON: &str = include_str!("../../../content/maps/freja-south-gate.json");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MapSpawnArea {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(alias = "mobType")]
    pub mob_type: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StaticObstacle {
    pub id: String,
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

#[derive(Resource, Debug, Clone, Default)]
pub struct StaticObstacles {
    pub obstacles: Vec<StaticObstacle>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MapConfig {
    pub map_id: String,
    pub width: f32,
    pub height: f32,
    pub spawn_areas: Vec<MapSpawnArea>,
    pub static_obstacles: Vec<StaticObstacle>,
}

#[derive(Deserialize)]
struct UnifiedMapDoc {
    #[serde(rename = "mapId", default)]
    map_id: String,
    #[serde(default = "default_map_dim")]
    width: f32,
    #[serde(default = "default_map_dim")]
    height: f32,
    #[serde(rename = "spawnAreas", default)]
    spawn_areas: Vec<MapSpawnArea>,
    #[serde(rename = "staticObstacles", default)]
    static_obstacles: Vec<StaticObstacle>,
}

fn default_map_dim() -> f32 {
    1000.0
}

#[derive(Deserialize)]
struct SpawnAreaJsonEntry {
    id: String,
    #[serde(rename = "mobType")]
    mob_type: String,
    count: usize,
}

#[derive(Deserialize)]
struct SpawnAreasJsonDoc {
    areas: Vec<SpawnAreaJsonEntry>,
}

#[derive(Deserialize)]
struct TownFootprintJson {
    id: String,
    rect: Vec<f32>,
}

#[derive(Deserialize)]
struct TownPlanJson {
    footprints: Vec<TownFootprintJson>,
}

impl MapConfig {
    /// Loads a unified map document (created by the Mac Map Builder) from disk or embedded JSON.
    pub fn from_unified_json(map_id_fallback: &str, raw_json: &str) -> Option<Self> {
        let doc = serde_json::from_str::<UnifiedMapDoc>(raw_json).ok()?;
        if doc.spawn_areas.is_empty() && doc.static_obstacles.is_empty() {
            return None;
        }
        Some(Self {
            map_id: if doc.map_id.is_empty() {
                map_id_fallback.to_string()
            } else {
                doc.map_id
            },
            width: doc.width,
            height: doc.height,
            spawn_areas: doc.spawn_areas,
            static_obstacles: doc.static_obstacles,
        })
    }

    /// Loads or derives map configuration, dimensions, spawn areas, and static footprints.
    pub fn load(map_id: &str) -> Self {
        match map_id {
            "map-for-test-deflect" => Self {
                map_id: map_id.to_string(),
                width: 100.0,
                height: 100.0,
                spawn_areas: vec![MapSpawnArea {
                    id: "deflect_single_mob".to_string(),
                    x: 30.0,
                    y: 30.0,
                    width: 40.0,
                    height: 40.0,
                    mob_type: "mob-veil-spearling".to_string(),
                    count: 1,
                }],
                static_obstacles: Vec::new(),
            },
            "map-for-test-projectile" => Self {
                map_id: map_id.to_string(),
                width: 1000.0,
                height: 1000.0,
                spawn_areas: vec![MapSpawnArea {
                    id: "proj_spear_thrower_area".to_string(),
                    x: 400.0,
                    y: 400.0,
                    width: 200.0,
                    height: 200.0,
                    mob_type: "mob-veil-spearling".to_string(),
                    count: 6,
                }],
                static_obstacles: Vec::new(),
            },
            "freja-south-gate" => {
                for candidate in [
                    format!("content/maps/{map_id}.json"),
                    format!("../content/maps/{map_id}.json"),
                ] {
                    if let Ok(raw) = std::fs::read_to_string(&candidate) {
                        if let Some(cfg) = Self::from_unified_json(map_id, &raw) {
                            return cfg;
                        }
                    }
                }
                if let Some(cfg) = Self::from_unified_json(map_id, FREJA_SOUTH_GATE_JSON) {
                    return cfg;
                }
                Self::load_legacy_default(map_id)
            }
            _ => {
                // Any custom map saved in content/maps/<map_id>.json is loaded automatically
                for candidate in [
                    format!("content/maps/{map_id}.json"),
                    format!("../content/maps/{map_id}.json"),
                ] {
                    if let Ok(raw) = std::fs::read_to_string(&candidate) {
                        if let Some(cfg) = Self::from_unified_json(map_id, &raw) {
                            return cfg;
                        }
                    }
                }
                Self::load_legacy_default(map_id)
            }
        }
    }

    fn load_legacy_default(map_id: &str) -> Self {
        // Default frontier world map:
        // Load spawn areas from content/generated/spawn-areas.json with geometry from legacy mapConfig
        let mut spawn_areas = Vec::new();
        if let Ok(doc) = serde_json::from_str::<SpawnAreasJsonDoc>(SPAWN_AREAS_JSON) {
            for entry in doc.areas {
                let (x, y, width, height) = match entry.id.as_str() {
                    "boss_area" => (450.0, 450.0, 100.0, 100.0),
                    "center_courtyard" => (400.0, 400.0, 200.0, 200.0),
                    "east_dunes" => (550.0, 400.0, 150.0, 200.0),
                    "north_ice_fields" => (400.0, 250.0, 200.0, 150.0),
                    "south_mud_pit" => (400.0, 600.0, 200.0, 150.0),
                    "thornveil_route_stalkers" => (700.0, 300.0, 150.0, 200.0),
                    "thornveil_route_spearlings" => (700.0, 550.0, 150.0, 200.0),
                    "thornveil_interior" => (820.0, 420.0, 150.0, 150.0),
                    _ => (400.0, 400.0, 200.0, 200.0),
                };
                let resolved_mob_type = match entry.mob_type.as_str() {
                    "balanced" | "bramble_stalker" => "mob-bramble-stalker",
                    "aggressive" => "mob-bramble-stalker",
                    "defensive" => "mob-bramble-warden",
                    "spear_thrower" | "veil_spearling" => "mob-veil-spearling",
                    "bramble_drake" => "mob-bramble-drake",
                    "thorncrown_drake" => "mob-thorncrown-drake",
                    other => other,
                };
                spawn_areas.push(MapSpawnArea {
                    id: entry.id,
                    x,
                    y,
                    width,
                    height,
                    mob_type: resolved_mob_type.to_string(),
                    count: entry.count,
                });
            }
        }

        // Load town static obstacles from content/towns/town-millcross.json
        let mut static_obstacles = Vec::new();
        if let Ok(town) = serde_json::from_str::<TownPlanJson>(TOWN_MILLCROSS_JSON) {
            let origin_x = 100.0;
            let origin_y = 100.0;
            for fp in town.footprints {
                if fp.rect.len() >= 4 {
                    let x0 = fp.rect[0] + origin_x;
                    let y0 = fp.rect[1] + origin_y;
                    let x1 = fp.rect[2] + origin_x;
                    let y1 = fp.rect[3] + origin_y;
                    static_obstacles.push(StaticObstacle {
                        id: fp.id,
                        min_x: x0.min(x1),
                        min_y: y0.min(y1),
                        max_x: x0.max(x1),
                        max_y: y0.max(y1),
                    });
                }
            }
        }

        Self {
            map_id: map_id.to_string(),
            width: 1000.0,
            height: 1000.0,
            spawn_areas,
            static_obstacles,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_unified_freja_south_gate_map_with_props_and_spawn_areas() {
        let cfg = MapConfig::load("freja-south-gate");
        assert_eq!(cfg.map_id, "freja-south-gate");
        assert_eq!(cfg.width, 1000.0);
        assert_eq!(cfg.height, 1000.0);
        assert_eq!(cfg.spawn_areas.len(), 8);
        assert_eq!(cfg.static_obstacles.len(), 12);
        assert!(cfg.static_obstacles.iter().any(|o| o.id == "sanctuary_pillar_w"));
    }

    #[test]
    fn supports_expanded_map_dimensions_in_unified_json() {
        let expanded_json = r#"{
            "mapId": "freja-expanded-2000",
            "width": 2000.0,
            "height": 2000.0,
            "spawnAreas": [
                { "id": "center_courtyard", "x": 900.0, "y": 900.0, "width": 200.0, "height": 200.0, "mobType": "mob-bramble-stalker", "count": 8 }
            ],
            "staticObstacles": [
                { "id": "pillar_center", "min_x": 994.0, "min_y": 994.0, "max_x": 1006.0, "max_y": 1006.0 }
            ]
        }"#;
        let cfg = MapConfig::from_unified_json("freja-expanded-2000", expanded_json).expect("valid expanded map");
        assert_eq!(cfg.width, 2000.0);
        assert_eq!(cfg.height, 2000.0);
        assert_eq!(cfg.spawn_areas[0].x, 900.0);
    }
}
