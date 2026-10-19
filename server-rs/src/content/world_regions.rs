use crate::content::map::{room_id_for, MapConfig};

pub const MILLCROSS_FORD_JSON: &str = include_str!("../../../content/maps/millcross-ford.json");
pub const THORNVEIL_JSON: &str = include_str!("../../../content/maps/thornveil.json");
pub const ASHVALE_FRONT_JSON: &str = include_str!("../../../content/maps/ashvale-front.json");
pub const NORTHERN_ICEFIELD_JSON: &str =
    include_str!("../../../content/maps/northern-icefield.json");
pub const CINDERVAST_JSON: &str = include_str!("../../../content/maps/cindervast.json");
pub const EMBERDOWN_JSON: &str = include_str!("../../../content/maps/emberdown.json");
pub const GILDMARK_HEAD_JSON: &str = include_str!("../../../content/maps/gildmark-head.json");
pub const HOLLOWMARCH_JSON: &str = include_str!("../../../content/maps/hollowmarch.json");
pub const ROOKTIDE_REACH_JSON: &str = include_str!("../../../content/maps/rooktide-reach.json");

/// Canonical Wealdmarch (`c02`) generated-world regions compiled from the World Spine (`F-002`).
pub const GENERATED_REGION_IDS: [&str; 9] = [
    "millcross-ford",
    "thornveil",
    "ashvale-front",
    "northern-icefield",
    "cindervast",
    "emberdown",
    "gildmark-head",
    "hollowmarch",
    "rooktide-reach",
];

/// Returns the embedded JSON string for a compiled Wealdmarch region, if known.
pub fn embedded_region_json(region_id: &str) -> Option<&'static str> {
    match region_id {
        "millcross-ford" => Some(MILLCROSS_FORD_JSON),
        "thornveil" => Some(THORNVEIL_JSON),
        "ashvale-front" => Some(ASHVALE_FRONT_JSON),
        "northern-icefield" => Some(NORTHERN_ICEFIELD_JSON),
        "cindervast" => Some(CINDERVAST_JSON),
        "emberdown" => Some(EMBERDOWN_JSON),
        "gildmark-head" => Some(GILDMARK_HEAD_JSON),
        "hollowmarch" => Some(HOLLOWMARCH_JSON),
        "rooktide-reach" => Some(ROOKTIDE_REACH_JSON),
        _ => None,
    }
}

/// Resolves a requested `?map=` identifier to either a generated-world region ID
/// (`GENERATED_REGION_IDS`) or one of the legacy/test rooms (`room_id_for`).
pub fn resolve_room_or_region_id(requested: &str) -> &'static str {
    if let Some(&region) = GENERATED_REGION_IDS.iter().find(|&&id| id == requested) {
        return region;
    }
    room_id_for(requested)
}

/// Loads a compiled generated-world region into a `MapConfig` with center spawn `(width/2, height/2)`.
pub fn load_generated_region_config(region_id: &str) -> Option<MapConfig> {
    if let Some(raw) = embedded_region_json(region_id) {
        if let Some(mut cfg) = MapConfig::from_unified_json(region_id, raw) {
            if cfg.player_spawn.is_none() {
                cfg.player_spawn = Some((cfg.width * 0.5, cfg.height * 0.5));
            }
            return Some(cfg);
        }
    }
    for candidate in [
        format!("content/maps/{region_id}.json"),
        format!("../content/maps/{region_id}.json"),
    ] {
        if let Ok(raw) = std::fs::read_to_string(&candidate) {
            if let Some(mut cfg) = MapConfig::from_unified_json(region_id, &raw) {
                if cfg.player_spawn.is_none() {
                    cfg.player_spawn = Some((cfg.width * 0.5, cfg.height * 0.5));
                }
                return Some(cfg);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::map::{MapSpawnArea, StaticObstacle};
    use crate::simulation::AtlasSimulation;
    use serde::Deserialize;
    use std::collections::HashMap;

    const CLIENT_GENERATED_WORLD_MAPS_JSON: &str =
        include_str!("../../../client/react-client/src/data/generatedWorldMaps.json");

    #[derive(Deserialize)]
    struct ClientWorldMapsManifest {
        #[serde(rename = "millcrossTownFootprints")]
        millcross_town_footprints: Vec<StaticObstacle>,
        #[serde(rename = "playMapSpawnAreas")]
        play_map_spawn_areas: Vec<MapSpawnArea>,
        regions: HashMap<String, ClientRegionManifest>,
    }

    #[derive(Deserialize)]
    struct ClientRegionManifest {
        width: f32,
        height: f32,
        #[serde(rename = "playerSpawn")]
        player_spawn: ClientSpawnPoint,
        #[serde(rename = "staticObstacles")]
        static_obstacles: Vec<StaticObstacle>,
        #[serde(rename = "spawnAreas")]
        spawn_areas: Vec<MapSpawnArea>,
    }

    #[derive(Deserialize)]
    struct ClientSpawnPoint {
        x: f32,
        y: f32,
    }

    #[test]
    fn resolves_and_loads_generated_world_regions_with_authored_spawns_and_obstacles() {
        for &region_id in &GENERATED_REGION_IDS {
            assert_eq!(resolve_room_or_region_id(region_id), region_id);
            let cfg = load_generated_region_config(region_id)
                .unwrap_or_else(|| panic!("failed to load region {region_id}"));
            assert_eq!(cfg.map_id, region_id);
            assert_eq!(cfg.width, 4000.0);
            assert_eq!(cfg.height, 4000.0);
            assert!(
                !cfg.spawn_areas.is_empty(),
                "{region_id} missing spawn_areas"
            );
            assert!(
                !cfg.static_obstacles.is_empty(),
                "{region_id} missing static_obstacles"
            );
            assert_eq!(cfg.player_spawn, Some((2000.0, 2000.0)));
        }

        // Unknown map still falls back to map-for-play
        assert_eq!(resolve_room_or_region_id("unknown-map"), "map-for-play");

        // Millcross Ford simulation initializes on 4000x4000 with authored mobs
        let mut sim =
            AtlasSimulation::from_generated_region("millcross-ford", 0x1337_c0de).unwrap();
        let frame = sim.live_tick(&[], &[]);
        assert!(
            frame.entities.len() >= 10,
            "expected millcross-ford mobs to spawn, got {}",
            frame.entities.len()
        );
    }

    #[test]
    fn client_manifest_matches_server_obstacles_and_spawns_with_zero_diff() {
        let client_manifest: ClientWorldMapsManifest =
            serde_json::from_str(CLIENT_GENERATED_WORLD_MAPS_JSON).unwrap();

        let play_cfg = MapConfig::load("map-for-play");
        assert_eq!(
            client_manifest.millcross_town_footprints,
            play_cfg.static_obstacles
        );
        assert_eq!(client_manifest.play_map_spawn_areas, play_cfg.spawn_areas);

        for &region_id in &GENERATED_REGION_IDS {
            let server_cfg = MapConfig::load(region_id);
            let client_reg = client_manifest
                .regions
                .get(region_id)
                .unwrap_or_else(|| panic!("client manifest missing region {region_id}"));
            assert_eq!(client_reg.width, server_cfg.width);
            assert_eq!(client_reg.height, server_cfg.height);
            assert_eq!(
                Some((client_reg.player_spawn.x, client_reg.player_spawn.y)),
                server_cfg.player_spawn
            );
            assert_eq!(client_reg.static_obstacles, server_cfg.static_obstacles);
            assert_eq!(client_reg.spawn_areas, server_cfg.spawn_areas);
        }
    }
}
