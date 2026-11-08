//! F-184/F-185: the player runs at 3 m/s (3 server units/s, 1 unit = 1 m) and every other speed keeps its
//! pre-rescale ratio to the player's.

use server_rs::content::bestiary::{derive_mob_stats, BestiaryEntry, MobTier};
use server_rs::content::map::MapConfig;
use server_rs::content::stats::derived_stats;
use server_rs::content::StaticObstacles;
use server_rs::ecs::components::{DashState, EquippedWeapon, PlayerAvatar, Position};
use server_rs::net::ClientPacket;
use server_rs::physics::world::PhysicsWorld;
use server_rs::protocol::{deserialize_client_input, serialize_client_input};
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use server_rs::storage::PrimaryStats;

/// Pre-rescale player run speed (old 0.1 m units/s) at level 1, 0 AGI, no race bonus.
const OLD_PLAYER: f32 = 200.0;

fn new_player_speed() -> f32 {
    let zero_agi = PrimaryStats {
        agi: 0,
        ..Default::default()
    };
    derived_stats(1, &zero_agi, None).max_move_speed
}

fn within_1pct(new_ratio: f32, old_ratio: f32) -> bool {
    (new_ratio / old_ratio - 1.0).abs() < 0.01
}

#[test]
fn level_1_player_with_zero_agi_runs_3_metres_per_second() {
    assert!((new_player_speed() - 3.0).abs() < 1e-3);
}

#[test]
fn mob_projectile_and_dash_keep_their_ratio_to_the_player() {
    let player = new_player_speed();

    // Mob: bestiary "high" speed was 110 u/s.
    let mob = derive_mob_stats(
        &BestiaryEntry {
            speed: "high".to_string(),
            ..Default::default()
        },
        MobTier::Route,
    );
    assert!(within_1pct(mob.speed / player, 110.0 / OLD_PLAYER));

    // Projectile: the bow flew at 250 u/s.
    assert!(within_1pct(
        EquippedWeapon::bow().projectile_speed / player,
        250.0 / OLD_PLAYER
    ));

    // Dash: 450 u/s against a 200 u/s run. Measured through the real skill path with the
    // avatar's own speed as the yardstick (default avatar has 1 AGI).
    let mut sim = AtlasSimulation::new(42, 120.0, 120.0);
    let e = sim.spawn_player_avatar("dasher", 10.0, 10.0);
    let run = sim.world.get::<PlayerAvatar>(e).unwrap().speed;
    let bytes = serialize_client_input(1, 1.0, 0.0, false, 5, 0);
    let input = deserialize_client_input(&bytes).unwrap();
    sim.apply_player_input("dasher", &input);
    sim.step();
    let dash = sim.world.get::<DashState>(e).unwrap().speed;
    assert!(
        within_1pct(dash / run, 450.0 / 202.0),
        "dash {dash} run {run}"
    );
}

/// Simulated seconds to walk the F-183 Maro Bell road from `playerSpawn` to its far end
/// (the bell terrace), steering at each road point in turn.
#[test]
fn maro_bell_road_walk_takes_45_to_65_seconds() {
    let cfg = MapConfig::load("maro-bell");
    let (sx, sy) = cfg.player_spawn.expect("maro-bell playerSpawn");
    let raw: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string("../content/maps/maro-bell.json").unwrap())
            .unwrap();
    let road = raw["routes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == "road-main")
        .expect("road-main");
    // Road points are metres relative to the map centre: x east, z south = server +y.
    let to_server = |p: &serde_json::Value| {
        (
            cfg.width / 2.0 + p[0].as_f64().unwrap() as f32,
            cfg.height / 2.0 + p[1].as_f64().unwrap() as f32,
        )
    };
    let path: Vec<(f32, f32)> = road["points"]
        .as_array()
        .unwrap()
        .iter()
        .map(to_server)
        // Start from the first road point north of the spawn.
        .filter(|&(_, y)| y < sy)
        .collect();

    let mut sim = AtlasSimulation::live(LiveConfig {
        bot_count: 0,
        mob_count: 0,
        map_id: Some("maro-bell".to_string()),
        ..Default::default()
    });
    // The map's static obstacles (resource + physics colliders).
    let obstacles = sim.world.resource::<StaticObstacles>().clone();
    let mut physics = PhysicsWorld::new(cfg.width, cfg.height);
    for o in &obstacles.obstacles {
        physics.add_static_box(
            (o.min_x + o.max_x) / 2.0,
            (o.min_y + o.max_y) / 2.0,
            (o.max_x - o.min_x) / 2.0,
            (o.max_y - o.min_y) / 2.0,
        );
    }
    sim.world.insert_resource(obstacles);
    sim.world.insert_resource(physics);
    let entity = sim.spawn_player_avatar("walker", sx, sy);
    assert_eq!(sim.clock.tick_step_ms, 50);

    let mut ticks = 0u32;
    for &(wx, wy) in &path {
        loop {
            let p = *sim.world.get::<Position>(entity).unwrap();
            let (dx, dy) = (wx - p.x, wy - p.y);
            let d = (dx * dx + dy * dy).sqrt();
            if d < 0.2 {
                break;
            }
            let held = ClientPacket {
                session_id: "walker".to_string(),
                room_id: "maro-bell".to_string(),
                payload: serialize_client_input(ticks + 1, dx / d, dy / d, false, 0, 0),
            };
            sim.live_tick(std::slice::from_ref(&held), &[]);
            ticks += 1;
            assert!(ticks < 20_000, "walker stuck before ({wx}, {wy}) at {p:?}");
        }
    }
    let secs = ticks as f32 * 0.05;
    println!("maro-bell walk: {secs} s");
    assert!((45.0..=65.0).contains(&secs), "walk took {secs} s");
}
