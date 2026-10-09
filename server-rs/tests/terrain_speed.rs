//! Terrain speed: the same held input covers measurably different ground on different
//! terrain, through the live movement path (`AtlasSimulation::live` + `live_tick`).

use bevy_ecs::prelude::*;
use server_rs::content::StaticObstacles;
use server_rs::content::{TerrainType, TerrainZones};
use server_rs::ecs::components::{MobAi, MobTag, PlayerAvatar, Position};
use server_rs::net::ClientPacket;
use server_rs::protocol::serialize_client_input;
use server_rs::simulation::{AtlasSimulation, LiveConfig};

const TICKS: usize = 16;

fn play_map() -> AtlasSimulation {
    AtlasSimulation::live(LiveConfig {
        bot_count: 0,
        mob_count: 0,
        map_id: Some("map-for-play".to_string()),
        ..Default::default()
    })
}

/// Distance a fresh avatar covers holding +X for `TICKS` ticks from (x, y); every tick of
/// the run must be on `terrain`.
fn run_distance(session: &str, x: f32, y: f32, terrain: TerrainType) -> f32 {
    let mut sim = play_map();
    let entity = sim.spawn_player_avatar(session, x, y);
    let held = ClientPacket {
        session_id: session.to_string(),
        room_id: "map-for-play".to_string(),
        payload: serialize_client_input(1, 1.0, 0.0, false, 0, 0),
    };
    let mut end = Position::new(x, y);
    for tick in 0..TICKS {
        let zones = sim.world.resource::<TerrainZones>();
        assert_eq!(zones.terrain_at(end.x, end.y), terrain, "tick {tick}");
        sim.live_tick(std::slice::from_ref(&held), &[]);
        end = *sim.world.get::<Position>(entity).unwrap();
    }
    assert!((end.y - y).abs() < 1e-3, "ran straight along +X");
    end.x - x
}

#[test]
fn held_input_covers_terrain_scaled_distance() {
    let grass = run_distance("p-grass", 50.0, 850.0, TerrainType::Grass);
    let mud = run_distance("p-mud", 520.0, 700.0, TerrainType::Mud);
    let road = run_distance("p-road", 50.0, 500.0, TerrainType::Road);
    let ice = run_distance("p-ice", 50.0, 50.0, TerrainType::Ice);

    assert!(grass > 150.0, "grass run actually moved, got {grass}");
    for (name, dist, terrain) in [
        ("mud", mud, TerrainType::Mud),
        ("road", road, TerrainType::Road),
        ("ice", ice, TerrainType::Ice),
    ] {
        let ratio = dist / grass;
        let want = terrain.speed_multiplier();
        assert!(
            (ratio - want).abs() < 0.02,
            "{name}/grass distance ratio {ratio}, want {want}"
        );
    }
    assert!(
        mud / grass <= 0.6,
        "mud must feel slow, got {}",
        mud / grass
    );
    assert!(
        road / grass >= 1.2,
        "road must feel fast, got {}",
        road / grass
    );
}

#[test]
fn terrain_test_room_has_every_terrain_and_a_straight_run_crosses_them_all() {
    let room = "map-for-test-terrain";
    let mut sim = AtlasSimulation::live(LiveConfig {
        bot_count: 0,
        mob_count: 2,
        map_id: Some(room.to_string()),
        ..Default::default()
    });

    let zones = sim.world.resource::<TerrainZones>().clone();
    for terrain in TerrainType::ALL {
        assert!(
            zones.zones.iter().any(|z| z.terrain == terrain),
            "{terrain:?} strip missing"
        );
    }
    assert!(!sim.world.resource::<StaticObstacles>().obstacles.is_empty());

    // A player joining over the wire spawns at the west end and, holding +X, crosses every
    // strip in multiplier order (fastest first).
    let held = ClientPacket {
        session_id: "tester".to_string(),
        room_id: room.to_string(),
        payload: serialize_client_input(1, 1.0, 0.0, false, 0, 0),
    };
    sim.live_tick(std::slice::from_ref(&held), &[]);
    let mut players = sim.world.query::<(Entity, &PlayerAvatar)>();
    let (player, _) = players.single(&sim.world);
    let spawn = sim.player_spawn;
    assert!(spawn.x < 50.0, "spawns at the west end, got {}", spawn.x);

    // The sandbox mobs stand off to the side: nowhere near the spawn or its aggro range.
    let mut mobs = sim
        .world
        .query_filtered::<(&Position, &MobAi), With<MobTag>>();
    let mob_list: Vec<_> = mobs
        .iter(&sim.world)
        .map(|(p, ai)| (*p, ai.chase_range))
        .collect();
    assert_eq!(mob_list.len(), 2);
    for (pos, chase_range) in &mob_list {
        let d = ((pos.x - spawn.x).powi(2) + (pos.y - spawn.y).powi(2)).sqrt();
        assert!(d > chase_range + 100.0, "mob {d} from spawn");
    }

    let mut crossed = Vec::new();
    for _ in 0..200 {
        sim.live_tick(std::slice::from_ref(&held), &[]);
        let p = *sim.world.get::<Position>(player).unwrap();
        let terrain = zones.terrain_at(p.x, p.y);
        if crossed.last() != Some(&terrain) {
            crossed.push(terrain);
        }
    }
    // Grass margin at the spawn, the six strips, grass margin at the far edge.
    let mut want = vec![TerrainType::Grass];
    want.extend(TerrainType::ALL);
    want.push(TerrainType::Grass);
    assert_eq!(crossed, want);
}

#[test]
fn overlapping_zones_resolve_to_the_later_painted_one() {
    let sim = play_map();
    let zones = sim.world.resource::<TerrainZones>();
    // plaza over mud, arm over forest, trade road over ice, bridge over ice
    assert_eq!(zones.terrain_at(500.0, 600.0), TerrainType::Road);
    assert_eq!(zones.terrain_at(700.0, 500.0), TerrainType::Road);
    assert_eq!(zones.terrain_at(100.0, 180.0), TerrainType::Road);
    assert_eq!(zones.terrain_at(200.0, 180.0), TerrainType::Road);
    // beside the trade road is still ice
    assert_eq!(zones.terrain_at(100.0, 160.0), TerrainType::Ice);
}

#[test]
fn a_map_without_map_id_has_no_terrain() {
    let sim = AtlasSimulation::live(LiveConfig {
        bot_count: 0,
        mob_count: 0,
        map_id: None,
        ..Default::default()
    });
    assert!(sim.world.get_resource::<TerrainZones>().is_none());
}
