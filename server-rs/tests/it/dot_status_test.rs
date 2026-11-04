//! E-007 Slice 5 (`F-121`): Damage-over-time statuses integration tests.
//!
//! Verifies that `burn` and `poison` statuses deal periodic damage over time across
//! 5.0 seconds (`DOT_DEFAULT_DURATION_SEC = 5.0`) without reapplying the initial attack
//! before expiring cleanly.

use bevy_ecs::prelude::*;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    Health, MobTag, StatusEffects, DOT_DEFAULT_DPS, DOT_DEFAULT_DURATION_SEC,
};
use server_rs::systems::status_effect_tick_system;

#[test]
fn burn_affliction_deals_damage_over_five_seconds_and_expires_cleanly() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50)); // 20 Hz = 0.05s per tick

    let mut status = StatusEffects::default();
    status.apply_default_burn(10.0); // 10 DPS over 5.0s = 50 total damage
    assert!(status.is_burning());
    assert_eq!(status.burn_timer, DOT_DEFAULT_DURATION_SEC);

    let mob = world.spawn((Health::new(150.0), status, MobTag)).id();

    let mut schedule = Schedule::default();
    schedule.add_systems(status_effect_tick_system);

    // Advance 20 ticks (1.0s): mob takes 10 damage -> 140 HP
    for _ in 0..20 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    let hp_1s = world.get::<Health>(mob).unwrap().current;
    assert!(
        (hp_1s - 140.0).abs() < 1e-2,
        "expected 140 HP after 1s of 10 DPS burn, got {}",
        hp_1s
    );
    assert!(world.get::<StatusEffects>(mob).unwrap().is_burning());

    // Advance another 80 ticks (4.0s more = 5.0s total): mob takes 40 more damage -> 100 HP
    for _ in 0..80 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    let hp_5s = world.get::<Health>(mob).unwrap().current;
    assert!(
        (hp_5s - 100.0).abs() < 1e-2,
        "expected 100 HP after full 5s of 10 DPS burn, got {}",
        hp_5s
    );
    assert!(
        !world.get::<StatusEffects>(mob).unwrap().is_burning(),
        "burn must expire after 5.0 seconds"
    );

    // Advance another 40 ticks (2.0s after expiry): no further damage
    for _ in 0..40 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    let hp_7s = world.get::<Health>(mob).unwrap().current;
    assert!(
        (hp_7s - 100.0).abs() < 1e-2,
        "expected no further burn damage after expiry, got {}",
        hp_7s
    );
}

#[test]
fn poison_affliction_deals_damage_over_five_seconds_and_expires_cleanly() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50));

    let mut status = StatusEffects::default();
    status.apply_default_poison(DOT_DEFAULT_DPS); // 8.0 DPS over 5.0s = 40 total damage
    assert!(status.is_poisoned());
    assert_eq!(status.poison_timer, DOT_DEFAULT_DURATION_SEC);

    let mob = world.spawn((Health::new(120.0), status, MobTag)).id();

    let mut schedule = Schedule::default();
    schedule.add_systems(status_effect_tick_system);

    // Tick 100 times (5.0s) without reapplying any attack
    for _ in 0..100 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }

    let hp_5s = world.get::<Health>(mob).unwrap().current;
    assert!(
        (hp_5s - 80.0).abs() < 1e-2,
        "expected 80 HP after 5s of 8 DPS poison, got {}",
        hp_5s
    );
    assert!(!world.get::<StatusEffects>(mob).unwrap().is_poisoned());
}
