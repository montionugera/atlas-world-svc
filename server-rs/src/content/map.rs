use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

pub const SPAWN_AREAS_JSON: &str = include_str!("../../../content/generated/spawn-areas.json");
pub const TOWN_MILLCROSS_JSON: &str = include_str!("../../../content/towns/town-millcross.json");
pub const FREJA_SOUTH_GATE_JSON: &str = include_str!("../../../content/maps/freja-south-gate.json");

/// Maximum walkable terrain slope angle in degrees (38°).
/// Slopes steeper than 38° act as impassable cliff walls that slide movement along the contour tangent.
pub const MAX_WALKABLE_SLOPE_DEG: f32 = 38.0;

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeightTerrace {
    pub id: String,
    pub x: f32,
    pub z: f32,
    pub radius: f32,
    pub height: f32,
    #[serde(default = "default_terrace_falloff")]
    pub falloff: f32,
}

fn default_terrace_falloff() -> f32 {
    0.45
}

fn default_terrain_amplitude() -> f32 {
    1.0
}

#[derive(Resource, Debug, Clone, Default)]
pub struct StaticObstacles {
    pub obstacles: Vec<StaticObstacle>,
}

/// Authoritative 3D heightfield & steep-cliff collision solver shared between `server-rs` and `game-client`.
#[derive(Resource, Debug, Clone)]
pub struct TerrainHeightfield {
    pub arena_width: f32,
    pub arena_height: f32,
    pub coord_scale: f32,
    pub terrain_amplitude: f32,
    pub height_terraces: Vec<HeightTerrace>,
    pub max_walkable_slope_deg: f32,
}

impl Default for TerrainHeightfield {
    fn default() -> Self {
        Self {
            arena_width: 1000.0,
            arena_height: 1000.0,
            coord_scale: 0.1,
            terrain_amplitude: 0.0,
            height_terraces: Vec::new(),
            max_walkable_slope_deg: MAX_WALKABLE_SLOPE_DEG,
        }
    }
}

impl TerrainHeightfield {
    pub fn from_map_config(cfg: &MapConfig) -> Self {
        Self {
            arena_width: cfg.width,
            arena_height: cfg.height,
            coord_scale: 0.1,
            terrain_amplitude: cfg.terrain_amplitude,
            height_terraces: cfg.height_terraces.clone(),
            max_walkable_slope_deg: MAX_WALKABLE_SLOPE_DEG,
        }
    }

    #[inline]
    pub fn server_to_world(&self, sx: f32, sy: f32) -> (f32, f32) {
        let cx = self.arena_width * 0.5;
        let cy = self.arena_height * 0.5;
        ((sx - cx) * self.coord_scale, (sy - cy) * self.coord_scale)
    }

    #[inline]
    pub fn world_to_server(&self, wx: f32, wz: f32) -> (f32, f32) {
        let cx = self.arena_width * 0.5;
        let cy = self.arena_height * 0.5;
        (cx + wx / self.coord_scale, cy + wz / self.coord_scale)
    }

    /// Evaluates the exact 3D terrain elevation Y (in meters) at world coordinate `(wx, wz)`.
    /// Identical formula to `TerrainElevation.SampleHeight` in C# and `stylized_grass_floor.gdshader`.
    pub fn sample_height_world(&self, wx: f32, wz: f32) -> f32 {
        if self.terrain_amplitude <= 0.001 && self.height_terraces.is_empty() {
            return 0.0;
        }

        let dist_origin = (wx * wx + wz * wz).sqrt();
        let outer_mask = smooth_step(9.0, 22.0, dist_origin);

        let wave_a = (wx * 0.085 + 0.4).sin() * (wz * 0.075 - 0.3).cos() * 2.15;
        let wave_b = ((wx * 0.7 - wz * 0.7) * 0.14 + 1.1).sin() * 0.85;

        let north_ramp = smooth_step(-9.5, -20.0, wz);
        let north_plateau = north_ramp * 1.65 * smooth_step(28.0, 8.0, wx.abs());

        let road_carve = 1.0 - 0.55 * smooth_step(4.5, 1.8, wx.abs());

        let proc_y = (wave_a + wave_b) * outer_mask * road_carve + north_plateau;
        let mut total_y = proc_y * self.terrain_amplitude;

        for t in &self.height_terraces {
            let dx = wx - t.x;
            let dz = wz - t.z;
            let d = (dx * dx + dz * dz).sqrt();
            let outer_r = t.radius.max(1.0);
            if d >= outer_r {
                continue;
            }
            let inner_r = outer_r * (1.0 - t.falloff).clamp(0.08, 0.92);
            let weight = 1.0 - smooth_step(inner_r, outer_r, d);
            total_y += t.height * weight;
        }

        total_y
    }

    /// Returns the local 3D surface normal `(nx, ny, nz)` at world coordinate `(wx, wz)`.
    pub fn sample_normal_world(&self, wx: f32, wz: f32) -> (f32, f32, f32) {
        const EPS: f32 = 0.25;
        let h_l = self.sample_height_world(wx - EPS, wz);
        let h_r = self.sample_height_world(wx + EPS, wz);
        let h_d = self.sample_height_world(wx, wz - EPS);
        let h_u = self.sample_height_world(wx, wz + EPS);
        let vx = h_l - h_r;
        let vy = 2.0 * EPS;
        let vz = h_d - h_u;
        let len = (vx * vx + vy * vy + vz * vz).sqrt().max(1e-6);
        (vx / len, vy / len, vz / len)
    }

    /// Returns the local terrain slope inclination angle in degrees (`0°` = flat, `90°` = vertical cliff).
    pub fn sample_slope_deg_world(&self, wx: f32, wz: f32) -> f32 {
        let (_, ny, _) = self.sample_normal_world(wx, wz);
        ny.clamp(-1.0, 1.0).acos().to_degrees()
    }

    /// Pushes an entity in server coordinates `(sx, sy)` out of any impassable sheer cliff wall (`slope > 38°`).
    pub fn resolve_against_cliffs(&self, sx: &mut f32, sy: &mut f32) -> bool {
        if self.height_terraces.is_empty() && self.terrain_amplitude <= 0.001 {
            return false;
        }
        let (mut wx, mut wz) = self.server_to_world(*sx, *sy);
        let slope = self.sample_slope_deg_world(wx, wz);
        if slope <= self.max_walkable_slope_deg {
            return false;
        }

        // Push downhill/outward along the height gradient until on walkable ground (<= 38°)
        const EPS: f32 = 0.25;
        let mut moved = false;
        for _ in 0..8 {
            let cur_slope = self.sample_slope_deg_world(wx, wz);
            if cur_slope <= self.max_walkable_slope_deg {
                break;
            }
            let gx = self.sample_height_world(wx + EPS, wz) - self.sample_height_world(wx - EPS, wz);
            let gz = self.sample_height_world(wx, wz + EPS) - self.sample_height_world(wx, wz - EPS);
            let glen = (gx * gx + gz * gz).sqrt();
            if glen <= 1e-4 {
                break;
            }
            // Step downhill away from the sheer cliff face
            wx -= (gx / glen) * 0.45;
            wz -= (gz / glen) * 0.45;
            moved = true;
        }

        if moved {
            let (nsx, nsy) = self.world_to_server(wx, wz);
            *sx = nsx;
            *sy = nsy;
        }
        moved
    }
}

fn smooth_step(edge0: f32, edge1: f32, x: f32) -> f32 {
    if (edge0 - edge1).abs() < 1e-6 {
        return if x >= edge1 { 1.0 } else { 0.0 };
    }
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[derive(Debug, Clone, PartialEq)]
pub struct MapConfig {
    pub map_id: String,
    pub width: f32,
    pub height: f32,
    pub terrain_amplitude: f32,
    pub height_terraces: Vec<HeightTerrace>,
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
    #[serde(rename = "terrainAmplitude", default = "default_terrain_amplitude")]
    terrain_amplitude: f32,
    #[serde(rename = "heightTerraces", default)]
    height_terraces: Vec<HeightTerrace>,
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
            terrain_amplitude: doc.terrain_amplitude,
            height_terraces: doc.height_terraces,
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
                terrain_amplitude: 0.0,
                height_terraces: Vec::new(),
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
                terrain_amplitude: 0.0,
                height_terraces: Vec::new(),
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
            terrain_amplitude: 0.0,
            height_terraces: Vec::new(),
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
        assert_eq!(cfg.height_terraces.len(), 5);
        assert!(cfg.static_obstacles.iter().any(|o| o.id == "sanctuary_pillar_w"));
    }

    #[test]
    fn supports_3d_heightfield_and_blocks_steep_cliff_slopes() {
        let cfg = MapConfig::load("freja-south-gate");
        let hf = TerrainHeightfield::from_map_config(&cfg);

        // Central combat plaza (0,0) is flat (0m, 0 deg)
        assert!(hf.sample_height_world(0.0, 0.0).abs() < 0.05);
        assert!(hf.sample_slope_deg_world(0.0, 0.0) < 2.0);

        // Sanctuary north acropolis (0, -18) is elevated (> 3.0m) and its ramp at (0, -10.5) is walkable (<= 38 deg)
        assert!(hf.sample_height_world(0.0, -18.0) > 3.0);
        assert!(hf.sample_slope_deg_world(0.0, -10.5) <= MAX_WALKABLE_SLOPE_DEG);

        // Northwest sheer cliff mesa (-29, -22, r=9.5, falloff=0.16) has a sheer cliff wall around d=8.7m (> 50 deg)
        let cliff_rim_x = -29.0 + 8.7;
        let cliff_rim_z = -22.0;
        let rim_slope = hf.sample_slope_deg_world(cliff_rim_x, cliff_rim_z);
        assert!(
            rim_slope > MAX_WALKABLE_SLOPE_DEG,
            "Expected sheer cliff rim slope > 38 deg, got {rim_slope}"
        );

        let (mut sx, mut sy) = hf.world_to_server(cliff_rim_x, cliff_rim_z);
        let pushed = hf.resolve_against_cliffs(&mut sx, &mut sy);
        assert!(pushed, "Entity on sheer cliff wall should be pushed back to walkable ground");
        let (resolved_wx, resolved_wz) = hf.server_to_world(sx, sy);
        assert!(hf.sample_slope_deg_world(resolved_wx, resolved_wz) <= MAX_WALKABLE_SLOPE_DEG);
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
