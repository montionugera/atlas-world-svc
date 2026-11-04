//! Integration tests for F-144 (E-005 Slice 7: Death, bind point, and travel).

use bevy_ecs::prelude::*;
use server_rs::ecs::components::{
    BindPoint, CombatStats, Health, PlayerProgression, Position, StatusEffects, Velocity,
};
use server_rs::systems::progression::{
    apply_death_penalty_and_bind_respawn, discover_waypoint, fast_travel_to_waypoint,
    set_bind_point,
};

#[test]
fn death_applies_xp_penalty_never_delevels_and_respawns_at_bind_point() {
    let mut world = World::new();
    let mut prog = PlayerProgression::new();
    // Level up to level 2 with 30 XP into level 2 (xp_to_next_level = 200, 10% penalty = 20 XP)
    prog.grant_xp(130);
    assert_eq!(prog.level, 2);
    assert_eq!(prog.xp, 30);

    let player = world
        .spawn((
            Position::new(1500.0, 2200.0),
            Velocity::new(10.0, -5.0),
            Health {
                current: 0.0,
                max: 120.0,
                is_alive: false,
                invulnerable: false,
            },
            CombatStats::default(),
            StatusEffects::default(),
            prog,
        ))
        .id();

    set_bind_point(
        &mut world,
        player,
        "town-hearthstone",
        Position::new(400.0, 500.0),
    );

    let deducted = apply_death_penalty_and_bind_respawn(&mut world, player);
    assert_eq!(deducted, 20, "10% of 200 xp_to_next_level is 20 XP");

    let prog_after = world.get::<PlayerProgression>(player).unwrap();
    assert_eq!(prog_after.level, 2, "player must never de-level on death");
    assert_eq!(prog_after.xp, 10);

    let hp_after = world.get::<Health>(player).unwrap();
    assert!(hp_after.is_alive);
    assert_eq!(hp_after.current, 120.0);

    let pos_after = world.get::<Position>(player).unwrap();
    assert_eq!(*pos_after, Position::new(400.0, 500.0));

    // A second death with only 10 XP remaining clamps XP at 0 without dropping below level 2
    world.get_mut::<Health>(player).unwrap().is_alive = false;
    world.get_mut::<Health>(player).unwrap().current = 0.0;
    let deducted_clamped = apply_death_penalty_and_bind_respawn(&mut world, player);
    assert_eq!(deducted_clamped, 10);
    let prog_floor = world.get::<PlayerProgression>(player).unwrap();
    assert_eq!(prog_floor.level, 2);
    assert_eq!(prog_floor.xp, 0);
}

#[test]
fn fast_travel_teleports_alive_player_to_discovered_waypoint_and_rejects_invalid_requests() {
    let mut world = World::new();
    let player = world
        .spawn((
            Position::new(100.0, 100.0),
            Velocity::new(5.0, 5.0),
            Health::new(100.0),
            BindPoint::default(),
        ))
        .id();

    // Undiscovered waypoint must be rejected
    let err = fast_travel_to_waypoint(&mut world, player, "region-ember-spire")
        .expect_err("undiscovered waypoint must fail");
    assert!(err.contains("has not been discovered"));

    // Discover waypoint and teleport
    discover_waypoint(
        &mut world,
        player,
        "region-ember-spire",
        Position::new(2800.0, 3100.0),
    );
    let dest = fast_travel_to_waypoint(&mut world, player, "region-ember-spire")
        .expect("discovered waypoint should succeed");
    assert_eq!(dest, Position::new(2800.0, 3100.0));
    assert_eq!(
        *world.get::<Position>(player).unwrap(),
        Position::new(2800.0, 3100.0)
    );
    assert_eq!(*world.get::<Velocity>(player).unwrap(), Velocity::zero());

    // Dead player cannot fast travel
    world.get_mut::<Health>(player).unwrap().is_alive = false;
    let dead_err = fast_travel_to_waypoint(&mut world, player, "region-ember-spire")
        .expect_err("dead player cannot fast travel");
    assert!(dead_err.contains("Dead players cannot fast travel"));
}
