//! E-007 Slice 10 (`F-129`): Companion combat and respawn integration tests.
//!
//! Verifies that:
//! 1. An allied companion engages a hostile mob threatening its owner, closes into melee range,
//!    and deals damage.
//! 2. When a companion is defeated (`!health.is_alive`), it enters a respawn timer and revives
//!    at full health within follow distance (`<= 5.0` units) of its owner after the respawn delay.

use bevy_ecs::prelude::*;
use server_rs::ai::ThreatTable;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::*;
use server_rs::physics::world::PhysicsWorld;
use server_rs::systems::{
    companion_combat_system, companion_follow_system, companion_respawn_system,
    physics_step_system, spawn_companion, ArenaBounds,
};

fn setup_world_and_schedule() -> (World, Schedule) {
    let mut world = World::new();
    world.insert_resource(SimClock::new(100));
    world.insert_resource(ArenaBounds::default());
    world.insert_resource(PhysicsWorld::default());

    let mut schedule = Schedule::default();
    schedule.add_systems(
        (
            companion_respawn_system,
            companion_follow_system,
            companion_combat_system,
            physics_step_system,
        )
            .chain(),
    );
    (world, schedule)
}

#[test]
fn companion_engages_and_damages_hostile_mob_threatening_owner() {
    let (mut world, mut schedule) = setup_world_and_schedule();

    let player = world
        .spawn((
            EntityId("player-owner".to_string()),
            PlayerTag,
            Position::new(200.0, 200.0),
            Velocity::zero(),
            Health::new(200.0),
        ))
        .id();

    let companion = spawn_companion(
        &mut world,
        player,
        "companion-wolf",
        Position::new(202.0, 200.0),
    );

    let mob = world
        .spawn((
            EntityId("mob-raider".to_string()),
            MobTag,
            Position::new(290.0, 200.0),
            Velocity::zero(),
            Health::new(150.0),
            ElementalAttributes::default(),
            ThreatTable::new(),
        ))
        .id();

    // Advance 2.5 seconds (25 ticks at 100ms) so the companion closes from 202->290 and strikes.
    for _ in 0..25 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }

    let mob_hp = world.get::<Health>(mob).unwrap();
    let comp_pos = world.get::<Position>(companion).unwrap();
    let mob_pos = world.get::<Position>(mob).unwrap();
    let dist_to_mob = ((comp_pos.x - mob_pos.x).powi(2) + (comp_pos.y - mob_pos.y).powi(2)).sqrt();

    assert!(
        dist_to_mob <= 35.0,
        "Expected companion to close into attack range (<= 35.0), got dist={}",
        dist_to_mob
    );
    assert!(
        mob_hp.current < mob_hp.max,
        "Expected companion to deal damage to hostile mob, got hp {}/{}",
        mob_hp.current,
        mob_hp.max
    );
}

#[test]
fn defeated_companion_respawns_near_owner_after_respawn_delay() {
    let (mut world, mut schedule) = setup_world_and_schedule();

    let player = world
        .spawn((
            EntityId("player-owner".to_string()),
            PlayerTag,
            Position::new(400.0, 400.0),
            Velocity::zero(),
            Health::new(200.0),
        ))
        .id();

    let companion = spawn_companion(
        &mut world,
        player,
        "companion-hound",
        Position::new(250.0, 250.0),
    );

    // Configure a 2.0s respawn delay for deterministic fast verification (also checks default constant).
    assert_eq!(
        world
            .get::<CompanionAi>(companion)
            .unwrap()
            .respawn_delay_sec,
        COMPANION_RESPAWN_DELAY_SEC
    );
    world
        .get_mut::<CompanionAi>(companion)
        .unwrap()
        .respawn_delay_sec = 2.0;

    // Defeat the companion.
    world
        .get_mut::<Health>(companion)
        .unwrap()
        .take_damage(500.0);
    assert!(!world.get::<Health>(companion).unwrap().is_alive);

    // Step 1.0s (10 ticks): companion should still be dead and counting down respawn timer.
    for _ in 0..10 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    assert!(
        !world.get::<Health>(companion).unwrap().is_alive,
        "Companion should still be waiting to respawn at t=1.0s"
    );

    // Step another 1.1s (11 ticks): companion should respawn at full health near the owner!
    for _ in 0..11 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }

    let comp_hp = world.get::<Health>(companion).unwrap();
    assert!(
        comp_hp.is_alive,
        "Companion should be alive after respawn delay"
    );
    assert_eq!(comp_hp.current, comp_hp.max);

    let owner_pos = *world.get::<Position>(player).unwrap();
    let comp_pos = *world.get::<Position>(companion).unwrap();
    let dist = ((owner_pos.x - comp_pos.x).powi(2) + (owner_pos.y - comp_pos.y).powi(2)).sqrt();
    assert!(
        dist <= 5.0,
        "Respawned companion must be within <= 5.0 units of owner, got dist={}",
        dist
    );
}
