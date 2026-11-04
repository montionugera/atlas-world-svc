//! E-007 Slice 6 (`F-122`): Healing in a fight integration tests.
//!
//! Verifies that:
//! 1. Passive `HealthRegen` (and active `StatusEffects::apply_regen`) raises a damaged combatant's
//!    health over time via `health_regen_system`, clamped at `Health::max`.
//! 2. Triggering the active in-combat heal skill (`skill_heal`, slot 6) immediately restores health
//!    during a fight and enforces its cooldown.

use bevy_ecs::prelude::*;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    CastingState, CooldownTracker, Health, HealthRegen, PlayerInputState, PlayerTag, Position,
    Velocity,
};
use server_rs::systems::{health_regen_system, skill_execution_system};

#[test]
fn health_regen_raises_damaged_player_health_over_time_clamped_to_max() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50)); // 20 Hz = 0.05s per tick

    let mut health = Health::new(100.0);
    health.take_damage(40.0); // 60.0 / 100.0 HP
    assert_eq!(health.current, 60.0);

    let player = world
        .spawn((
            Position::new(0.0, 0.0),
            health,
            HealthRegen::new(10.0), // 10 HP/s
            PlayerTag,
        ))
        .id();

    let mut schedule = Schedule::default();
    schedule.add_systems(health_regen_system);

    // Tick 20 times (1.0s): +10 HP -> 70.0 HP
    for _ in 0..20 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    let hp_1s = world.get::<Health>(player).unwrap().current;
    assert!(
        (hp_1s - 70.0).abs() < 1e-2,
        "expected 70.0 HP after 1s of 10 HP/s regeneration, got {}",
        hp_1s
    );

    // Tick another 100 times (5.0s more): would add +50 HP, clamped to max 100.0 HP
    for _ in 0..100 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    let hp_6s = world.get::<Health>(player).unwrap().current;
    assert_eq!(
        hp_6s, 100.0,
        "health regeneration must clamp at Health::max (100.0)"
    );
}

#[test]
fn active_in_combat_heal_skill_restores_health_immediately_and_sets_cooldown() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50));

    let mut health = Health::new(100.0);
    health.take_damage(50.0); // 50.0 / 100.0 HP during combat
    assert_eq!(health.current, 50.0);

    // Slot 6 = skill_heal ("Second Wind", instant +35 HP heal, 8.0s cooldown)
    let player = world
        .spawn((
            Position::new(0.0, 0.0),
            PlayerInputState::new(0.0, 0.0, false, 6),
            CooldownTracker::new(),
            CastingState::new(),
            Velocity::zero(),
            health,
            PlayerTag,
        ))
        .id();

    let mut schedule = Schedule::default();
    schedule.add_systems(skill_execution_system);
    schedule.run(&mut world);

    // Health immediately raised from 50.0 -> 85.0
    let healed_hp = world.get::<Health>(player).unwrap().current;
    assert_eq!(
        healed_hp, 85.0,
        "skill_heal (slot 6) must immediately restore 35 HP in combat"
    );

    // Cooldown is active so spamming slot 6 on the next tick does not heal again
    let cd = world.get::<CooldownTracker>(player).unwrap();
    assert!(!cd.can_perform(&["skill_heal"]));

    world
        .get_mut::<PlayerInputState>(player)
        .unwrap()
        .skill_slot = 6;
    schedule.run(&mut world);
    assert_eq!(
        world.get::<Health>(player).unwrap().current,
        85.0,
        "skill_heal must not fire while on cooldown"
    );
}
