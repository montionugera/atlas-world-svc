use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

pub const SPAWN_AREAS_JSON: &str = include_str!("../../../content/generated/spawn-areas.json");
pub const TOWN_MILLCROSS_JSON: &str = include_str!("../../../content/towns/town-millcross.json");
pub const FREJA_SOUTH_GATE_JSON: &str = include_str!("../../../content/maps/freja-south-gate.json");

/// Maximum walkable terrain slope angle in degrees (38°).
/// Slopes steeper than 38° act as impassable cliff walls that slide movement along the contour tangent.
pub const MAX_WALKABLE_SLOPE_DEG: f32 = 38.0;

/// Every room the server runs. `ROOM_IDS[0]` is where unknown or missing ids land.
pub const ROOM_IDS: [&str; 5] = [
    "map-for-play",
    "map-for-test-projectile",
    "map-for-test-deflect",
    "map-for-test-terrain",
    "map-for-test-large",
];

/// The room a requested map id joins.
pub fn room_id_for(requested: &str) -> &'static str {
    ROOM_IDS
        .iter()
        .copied()
        .find(|id| *id == requested)
        .unwrap_or(ROOM_IDS[0])
}

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

/// Ground types a map can be painted with. Each scales voluntary movement speed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TerrainType {
    Road,
    Grass,
    Forest,
    Sand,
    Ice,
    Mud,
}

impl TerrainType {
    pub const ALL: [TerrainType; 6] = [
        TerrainType::Road,
        TerrainType::Grass,
        TerrainType::Forest,
        TerrainType::Sand,
        TerrainType::Ice,
        TerrainType::Mud,
    ];

    /// Multiplier on voluntary movement speed (walking, chasing, wandering). Dash and
    /// knockback impulses are not scaled.
    pub fn speed_multiplier(self) -> f32 {
        match self {
            TerrainType::Road => 1.3,
            TerrainType::Grass => 1.0,
            TerrainType::Forest => 0.8,
            TerrainType::Sand => 0.7,
            TerrainType::Ice => 0.6,
            TerrainType::Mud => 0.5,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TerrainZone {
    pub terrain: TerrainType,
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

impl TerrainZone {
    fn rect(terrain: TerrainType, x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            terrain,
            min_x: x,
            min_y: y,
            max_x: x + width,
            max_y: y + height,
        }
    }
}

/// Terrain zones of the room's map. Later zones paint over earlier ones (same as the
/// client's draw order); ground not covered by any zone is `Grass`.
#[derive(Resource, Debug, Clone, Default)]
pub struct TerrainZones {
    pub zones: Vec<TerrainZone>,
}

impl TerrainZones {
    pub fn terrain_at(&self, x: f32, y: f32) -> TerrainType {
        self.zones
            .iter()
            .rev()
            .find(|z| x >= z.min_x && x < z.max_x && y >= z.min_y && y < z.max_y)
            .map_or(TerrainType::Grass, |z| z.terrain)
    }

    pub fn speed_multiplier_at(&self, x: f32, y: f32) -> f32 {
        self.terrain_at(x, y).speed_multiplier()
    }
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

    /// Evaluates the exact terrain height `Y` in 3D world meters at world coordinate `(wx, wz)`.
    /// Mirrors `game-client/src/World/TerrainElevation.cs::SampleHeight(wx, wz)` 1:1.
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
            let gx =
                self.sample_height_world(wx + EPS, wz) - self.sample_height_world(wx - EPS, wz);
            let gz =
                self.sample_height_world(wx, wz + EPS) - self.sample_height_world(wx, wz - EPS);
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
    pub terrain_zones: Vec<TerrainZone>,
    /// Where joining players appear; `None` means the arena centre.
    pub player_spawn: Option<(f32, f32)>,
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
    fn default_play_terrain_zones() -> Vec<TerrainZone> {
        vec![
            TerrainZone::rect(TerrainType::Ice, 0.0, 0.0, 1000.0, 250.0),
            TerrainZone::rect(TerrainType::Forest, 680.0, 240.0, 320.0, 520.0),
            TerrainZone::rect(TerrainType::Sand, 540.0, 390.0, 150.0, 220.0),
            TerrainZone::rect(TerrainType::Mud, 390.0, 590.0, 230.0, 170.0),
            TerrainZone::rect(TerrainType::Road, 485.0, 0.0, 30.0, 390.0),
            TerrainZone::rect(TerrainType::Road, 485.0, 610.0, 30.0, 390.0),
            TerrainZone::rect(TerrainType::Road, 0.0, 485.0, 390.0, 30.0),
            TerrainZone::rect(TerrainType::Road, 610.0, 485.0, 390.0, 30.0),
            TerrainZone::rect(TerrainType::Road, 390.0, 390.0, 220.0, 220.0),
            // Town Trade Road and its bridge, painted over the Ice.
            TerrainZone::rect(TerrainType::Road, 0.0, 172.0, 195.0, 16.0),
            TerrainZone::rect(TerrainType::Road, 188.0, 170.0, 30.0, 20.0),
        ]
    }

    /// Scale-testing map, 4000 x 4000: three big zones of each slow terrain, a road cross
    /// through the centre plaza (the player spawn) plus a ring road, four clusters of
    /// blocks beside the ring's corners, and a 4 x 4 grid of mob camps (12 mobs each).
    fn large_test_map(map_id: &str) -> Self {
        use TerrainType::*;
        const MOB_TYPES: [&str; 6] = [
            "mob-bramble-stalker",
            "mob-veil-spearling",
            "mob-chaff-crawler",
            "mob-bramble-warden",
            "mob-veil-cub",
            "mob-bramble-drake",
        ];
        let mut spawn_areas = Vec::new();
        let mut static_obstacles = Vec::new();
        for row in 0..4 {
            for col in 0..4 {
                let n = row * 4 + col;
                spawn_areas.push(MapSpawnArea {
                    id: format!("large_camp_{n}"),
                    x: 350.0 + 1000.0 * col as f32,
                    y: 350.0 + 1000.0 * row as f32,
                    width: 300.0,
                    height: 300.0,
                    mob_type: MOB_TYPES[n % MOB_TYPES.len()].to_string(),
                    count: 12,
                });
            }
        }
        for (c, (cx, cy)) in [
            (1200.0, 1200.0),
            (2800.0, 1200.0),
            (1200.0, 2800.0),
            (2800.0, 2800.0),
        ]
        .into_iter()
        .enumerate()
        {
            for (b, (dx, dy)) in [(0.0, 0.0), (90.0, 20.0), (30.0, 100.0), (130.0, 110.0)]
                .into_iter()
                .enumerate()
            {
                static_obstacles.push(StaticObstacle {
                    id: format!("large_block_{c}_{b}"),
                    min_x: cx + dx,
                    min_y: cy + dy,
                    max_x: cx + dx + 40.0,
                    max_y: cy + dy + 40.0,
                });
            }
        }
        Self {
            map_id: map_id.to_string(),
            width: 4000.0,
            height: 4000.0,
            terrain_amplitude: 0.0,
            height_terraces: Vec::new(),
            spawn_areas,
            static_obstacles,
            terrain_zones: vec![
                TerrainZone::rect(Ice, 0.0, 0.0, 1400.0, 800.0),
                TerrainZone::rect(Ice, 2600.0, 3200.0, 1400.0, 800.0),
                TerrainZone::rect(Ice, 1500.0, 300.0, 900.0, 500.0),
                TerrainZone::rect(Forest, 2700.0, 100.0, 1200.0, 1100.0),
                TerrainZone::rect(Forest, 100.0, 2700.0, 1100.0, 1200.0),
                TerrainZone::rect(Forest, 1400.0, 3100.0, 900.0, 700.0),
                TerrainZone::rect(Sand, 100.0, 1100.0, 800.0, 1200.0),
                TerrainZone::rect(Sand, 3100.0, 1500.0, 800.0, 1300.0),
                TerrainZone::rect(Sand, 2200.0, 2200.0, 600.0, 600.0),
                TerrainZone::rect(Mud, 1200.0, 1200.0, 600.0, 600.0),
                TerrainZone::rect(Mud, 2200.0, 1100.0, 700.0, 500.0),
                TerrainZone::rect(Mud, 1100.0, 2200.0, 700.0, 700.0),
                // Roads paint over everything: the cross, the ring, the plaza.
                TerrainZone::rect(Road, 1970.0, 0.0, 60.0, 4000.0),
                TerrainZone::rect(Road, 0.0, 1970.0, 4000.0, 60.0),
                TerrainZone::rect(Road, 1000.0, 970.0, 2000.0, 60.0),
                TerrainZone::rect(Road, 1000.0, 2970.0, 2000.0, 60.0),
                TerrainZone::rect(Road, 970.0, 1000.0, 60.0, 2000.0),
                TerrainZone::rect(Road, 2970.0, 1000.0, 60.0, 2000.0),
                TerrainZone::rect(Road, 1850.0, 1850.0, 300.0, 300.0),
            ],
            player_spawn: Some((2000.0, 2000.0)),
        }
    }

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
            terrain_zones: Self::default_play_terrain_zones(),
            player_spawn: None,
        })
    }

    /// Loads or derives map configuration, dimensions, spawn areas, and static footprints.
    pub fn load(map_id: &str) -> Self {
        match map_id {
            "map-for-test-large" => Self::large_test_map(map_id),
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
                terrain_zones: Vec::new(),
                player_spawn: None,
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
                terrain_zones: Vec::new(),
                player_spawn: None,
            },
            // Hand-testing sandbox: every terrain type as a 150-wide strip (fastest to slowest,
            // west to east) so a run along +X from the west-edge spawn crosses them all. South
            // of the strips: two blocks to bump into and two slow melee mobs, out of aggro
            // range of the spawn, for knockback/AoE testing.
            "map-for-test-terrain" => Self {
                map_id: map_id.to_string(),
                width: 1000.0,
                height: 1000.0,
                terrain_amplitude: 0.0,
                height_terraces: Vec::new(),
                spawn_areas: vec![MapSpawnArea {
                    id: "terrain_sandbox_mobs".to_string(),
                    x: 450.0,
                    y: 880.0,
                    width: 100.0,
                    height: 60.0,
                    mob_type: "mob-chaff-crawler".to_string(),
                    count: 2,
                }],
                static_obstacles: vec![
                    StaticObstacle {
                        id: "terrain_sandbox_block_w".to_string(),
                        min_x: 300.0,
                        min_y: 760.0,
                        max_x: 340.0,
                        max_y: 800.0,
                    },
                    StaticObstacle {
                        id: "terrain_sandbox_block_e".to_string(),
                        min_x: 660.0,
                        min_y: 760.0,
                        max_x: 700.0,
                        max_y: 800.0,
                    },
                ],
                terrain_zones: TerrainType::ALL
                    .iter()
                    .enumerate()
                    .map(|(i, &terrain)| {
                        TerrainZone::rect(terrain, 50.0 + 150.0 * i as f32, 0.0, 150.0, 700.0)
                    })
                    .collect(),
                player_spawn: Some((25.0, 350.0)),
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
            terrain_zones: Self::default_play_terrain_zones(),
            player_spawn: None,
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
        assert!(cfg
            .static_obstacles
            .iter()
            .any(|o| o.id == "sanctuary_pillar_w"));
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
        assert!(
            pushed,
            "Entity on sheer cliff wall should be pushed back to walkable ground"
        );
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
        let cfg = MapConfig::from_unified_json("freja-expanded-2000", expanded_json)
            .expect("valid expanded map");
        assert_eq!(cfg.width, 2000.0);
        assert_eq!(cfg.height, 2000.0);
        assert_eq!(cfg.spawn_areas[0].x, 900.0);
    }
}
