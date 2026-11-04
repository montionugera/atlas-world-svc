//! E-005 Slice 1 (`F-131`): Experience and levels integration tests.
//!
//! Verifies that:
//! 1. Killing mobs grants experience to the killer, advances player levels on thresholds,
//!    and scales player stats (`Health::max` and `CombatStats::attack_power`).
//! 2. `EntityDelta` on the wire carries `level` and `xp` so clients receive synchronized
//!    level and experience updates on every snapshot frame.

use bevy_ecs::prelude::*;
use server_rs::content::MobTier;
use server_rs::ecs::components::*;
use server_rs::protocol::{
    root_as_world_snapshot, serialize_snapshot, EntitySnapshotData, EntityType,
};
use server_rs::systems::{experience_on_kill_system, ATK_GAIN_PER_LEVEL, HP_GAIN_PER_LEVEL};

#[test]
fn mob_kills_grant_experience_advance_level_and_scale_player_stats() {
    let mut world = World::new();

    let player = world
        .spawn((
            EntityId("player-hero".to_string()),
            PlayerTag,
            Position::new(100.0, 100.0),
            Velocity::zero(),
            Health::new(100.0),
            CombatStats {
                attack_power: 10.0,
                defense: 2.0,
                attack_range: 35.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: true,
            },
            PlayerProgression::new(),
        ))
        .id();

    let mob_route = world
        .spawn((
            EntityId("mob-route-1".to_string()),
            MobTag,
            Position::new(120.0, 100.0),
            Velocity::zero(),
            Health {
                current: 0.0,
                max: 60.0,
                is_alive: false,
                invulnerable: false,
            },
            MobSpawnAnchor::new(
                Position::new(120.0, 100.0),
                "mob-gnawer",
                MobTier::Route,
                10.0,
            ),
        ))
        .id();

    let mob_interior = world
        .spawn((
            EntityId("mob-interior-1".to_string()),
            MobTag,
            Position::new(130.0, 100.0),
            Velocity::zero(),
            Health {
                current: 0.0,
                max: 80.0,
                is_alive: false,
                invulnerable: false,
            },
            MobSpawnAnchor::new(
                Position::new(130.0, 100.0),
                "mob-stalker",
                MobTier::Interior,
                12.0,
            ),
        ))
        .id();

    // Record both kills in HitLog (Route = 40 XP, Interior = 65 XP -> 105 XP total, crossing 100 XP threshold for Level 2).
    world.insert_resource(HitLog(vec![
        HitRecord {
            attacker: player,
            target: mob_route,
            amount: 60.0,
            killed: true,
        },
        HitRecord {
            attacker: player,
            target: mob_interior,
            amount: 80.0,
            killed: true,
        },
    ]));

    let mut schedule = Schedule::default();
    schedule.add_systems(experience_on_kill_system);
    schedule.run(&mut world);

    let prog = world.get::<PlayerProgression>(player).unwrap();
    assert_eq!(
        prog.level, 2,
        "Player should advance from level 1 to level 2"
    );
    assert_eq!(
        prog.xp, 5,
        "Remaining XP in level 2 should be 105 - 100 = 5"
    );
    assert_eq!(
        prog.xp_to_next_level, 200,
        "Level 2 threshold should be 200 XP"
    );
    assert_eq!(prog.total_xp, 105);

    let hp = world.get::<Health>(player).unwrap();
    assert_eq!(hp.max, 100.0 + HP_GAIN_PER_LEVEL);
    assert_eq!(hp.current, hp.max);

    let stats = world.get::<CombatStats>(player).unwrap();
    assert_eq!(stats.attack_power, 10.0 + ATK_GAIN_PER_LEVEL);
}

#[test]
fn wire_entity_delta_synchronizes_player_level_and_experience() {
    let entities = vec![EntitySnapshotData {
        id: 777,
        entity_type: EntityType::Player,
        x: 250.0,
        y: 300.0,
        health: 140.0,
        max_health: 140.0,
        level: 3,
        xp: 145,
        ..Default::default()
    }];

    let bytes = serialize_snapshot(12, 600, &entities, &[]);
    let snapshot = root_as_world_snapshot(&bytes).expect("valid WorldSnapshot");
    let decoded = snapshot.entities().expect("entities present").get(0);

    assert_eq!(decoded.id(), 777);
    assert_eq!(decoded.level(), 3);
    assert_eq!(decoded.xp(), 145);
}
