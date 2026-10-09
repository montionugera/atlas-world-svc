//! Terrain speed: the same held input covers measurably different ground on different
//! terrain, through the live movement path (`AtlasSimulation::live` + `live_tick`).

use server_rs::content::{TerrainType, TerrainZones};
use server_rs::ecs::components::Position;
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
