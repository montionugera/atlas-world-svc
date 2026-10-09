use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

pub const SPAWN_AREAS_JSON: &str = include_str!("../../../content/generated/spawn-areas.json");
pub const TOWN_MILLCROSS_JSON: &str = include_str!("../../../content/towns/town-millcross.json");

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

#[derive(Debug, Clone, PartialEq)]
pub struct MapConfig {
    pub map_id: String,
    pub width: f32,
    pub height: f32,
    pub spawn_areas: Vec<MapSpawnArea>,
    pub static_obstacles: Vec<StaticObstacle>,
    pub terrain_zones: Vec<TerrainZone>,
    /// Where joining players appear; `None` means the arena centre.
    pub player_spawn: Option<(f32, f32)>,
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

    /// Loads or derives map configuration, dimensions, spawn areas, and static footprints.
    pub fn load(map_id: &str) -> Self {
        match map_id {
            "map-for-test-large" => Self::large_test_map(map_id),
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
                terrain_zones: Vec::new(),
                player_spawn: None,
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
            _ => {
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
                    // Same rects, in the same paint order, as the biomes the client draws
                    // (client/react-client/src/renderers/terrainRenderer.ts).
                    terrain_zones: vec![
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
                    ],
                    player_spawn: None,
                }
            }
        }
    }
}
