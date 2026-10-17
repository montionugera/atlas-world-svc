//! `map-for-test-large`: a 4000 x 4000 room, through the live path, with nothing in the
//! simulation or on the wire still assuming a 1000 x 1000 world.

use bevy_ecs::prelude::*;
use server_rs::content::map::{room_id_for, ROOM_IDS};
use server_rs::content::{StaticObstacles, TerrainType, TerrainZones};
use server_rs::ecs::components::{BotAgent, MobTag, PlayerAvatar, Position};
use server_rs::net::ClientPacket;
use server_rs::protocol::{root_as_world_snapshot, serialize_client_input, SnapshotBuilder};
use server_rs::simulation::{AtlasSimulation, LiveConfig};

const ROOM: &str = "map-for-test-large";

fn large_room() -> AtlasSimulation {
    AtlasSimulation::live(LiveConfig {
        bot_count: 10,
        mob_count: 200,
        map_id: Some(ROOM.to_string()),
        ..Default::default()
    })
}

#[test]
fn the_room_is_routable_and_initialises_spread_over_the_whole_map() {
    assert!(ROOM_IDS.contains(&ROOM));
    assert_eq!(room_id_for(ROOM), ROOM);
    assert_eq!(room_id_for("no-such-map"), "map-for-play");
    assert_eq!(room_id_for(""), "map-for-play");

    let mut sim = large_room();
    assert_eq!((sim.arena_width, sim.arena_height), (4000.0, 4000.0));
    assert_eq!(sim.player_spawn, Position::new(2000.0, 2000.0));
    assert_eq!(sim.world.resource::<StaticObstacles>().obstacles.len(), 16);

    let world = &mut sim.world;
    let mobs: Vec<Position> = world
        .query_filtered::<&Position, With<MobTag>>()
        .iter(world)
        .copied()
        .collect();
    let bots = world
        .query_filtered::<(), With<BotAgent>>()
        .iter(world)
        .count();
    assert_eq!((mobs.len(), bots), (200, 10));
    assert!(mobs
        .iter()
        .all(|p| (0.0..=4000.0).contains(&p.x) && (0.0..=4000.0).contains(&p.y)));
    // Every 1000 x 1000 quarter-row cell holds a camp: the far corners are populated.
    for (cx, cy) in [
        (500.0, 500.0),
        (3500.0, 500.0),
        (500.0, 3500.0),
        (3500.0, 3500.0),
    ] {
        let near = mobs
            .iter()
            .filter(|p| (p.x - cx).abs() < 200.0 && (p.y - cy).abs() < 200.0);
        assert!(near.count() >= 12, "no camp around {cx},{cy}");
    }
    // Nothing is camped on the spawn plaza.
    assert!(mobs
        .iter()
        .all(|p| (p.x - 2000.0).hypot(p.y - 2000.0) > 150.0));
}

#[test]
fn every_terrain_type_covers_real_ground() {
    let sim = large_room();
    let zones = sim.world.resource::<TerrainZones>();
    let mut cells = std::collections::HashMap::new();
    for gx in 0..80 {
        for gy in 0..80 {
            let terrain = zones.terrain_at(25.0 + 50.0 * gx as f32, 25.0 + 50.0 * gy as f32);
            *cells.entry(terrain).or_insert(0usize) += 1;
        }
    }
    for terrain in TerrainType::ALL {
        // 100 sampled cells = 250,000 square units.
        let n = cells.get(&terrain).copied().unwrap_or(0);
        assert!(
            n >= 100,
            "{terrain:?} covers only {n} of 6400 sampled cells"
        );
    }
    assert_eq!(
        zones.terrain_at(2000.0, 2000.0),
        TerrainType::Road,
        "spawn plaza"
    );
}

#[test]
fn a_player_walks_into_the_far_corner_without_being_clamped_at_1000() {
    let mut sim = AtlasSimulation::live(LiveConfig {
        bot_count: 0,
        mob_count: 0,
        map_id: Some(ROOM.to_string()),
        ..Default::default()
    });
    let held = ClientPacket {
        session_id: "walker".to_string(),
        room_id: ROOM.to_string(),
        payload: serialize_client_input(1, 1.0, 1.0, false, 0, 0),
    };
    sim.live_tick(std::slice::from_ref(&held), &[]);
    let world = &mut sim.world;
    let player = world
        .query_filtered::<Entity, With<PlayerAvatar>>()
        .single(world);
    let joined = *sim.world.get::<Position>(player).unwrap();
    assert!((joined.x - 2000.0).abs() < 20.0 && (joined.y - 2000.0).abs() < 20.0);

    *sim.world.get_mut::<Position>(player).unwrap() = Position::new(3900.0, 3900.0);
    let mut last = Position::new(0.0, 0.0);
    for _ in 0..200 {
        let frame = sim.live_tick(std::slice::from_ref(&held), &[]);
        last = *sim.world.get::<Position>(player).unwrap();
        // The wire frame carries the same position the simulation holds.
        let on_wire = frame
            .entities
            .iter()
            .find(|e| e.x == last.x && e.y == last.y);
        assert!(on_wire.is_some(), "frame lost the player at {last:?}");
    }
    assert!(
        last.x > 3990.0 && last.y > 3990.0,
        "stopped short at {last:?}"
    );
    assert!(
        last.x <= 4000.0 && last.y <= 4000.0,
        "left the arena at {last:?}"
    );
}

#[test]
fn positions_near_4000_round_trip_through_the_snapshot_encoding() {
    let mut sim = AtlasSimulation::live(LiveConfig {
        bot_count: 0,
        mob_count: 0,
        map_id: Some(ROOM.to_string()),
        ..Default::default()
    });
    let avatar = sim.spawn_player_avatar("edge", 3999.25, 3999.75);
    let other = sim.spawn_player_avatar("fine", 3999.9, 0.1);
    let frame = sim.live_tick(&[], &[]);
    let bytes = SnapshotBuilder::new()
        .build_frame(
            frame.tick,
            0,
            &frame.entities,
            &frame.removed_ids,
            &frame.events,
        )
        .to_vec();
    let snapshot = root_as_world_snapshot(&bytes).expect("valid snapshot");
    let decoded: Vec<(f32, f32)> = snapshot
        .entities()
        .expect("entities")
        .iter()
        .map(|e| {
            let pos = e.pos().expect("position");
            (pos.x(), pos.y())
        })
        .collect();
    for entity in [avatar, other] {
        let held = *sim.world.get::<Position>(entity).unwrap();
        assert!(held.x > 3999.0, "clamped or moved: {held:?}");
        // f32 on the wire: bit-exact, and still finer than 1/1000 of a unit at 4000.
        assert!(
            decoded.contains(&(held.x, held.y)),
            "{held:?} not in {decoded:?}"
        );
    }
    let at_edge = std::hint::black_box(3999.25f32);
    assert!(at_edge + 0.001 > at_edge);
}
