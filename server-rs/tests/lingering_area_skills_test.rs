//! E-007 Slice 4 (`F-118`): Lingering area skills integration tests.
//!
//! Verifies that casting `Blizzard` (`skill_3`) or `Meteor Strike` (`skill_1`) leaves a
//! `LingeringZone` ground field that ticks damage across 3 distinct intervals during its
//! 3.0-second lifetime before expiring.

use bevy_ecs::prelude::*;
use server_rs::combat::Element;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    CastingState, CooldownTracker, ElementalAttributes, Health, LingeringZone, MobTag,
    PlayerInputState, PlayerTag, Position, StatusEffects, Velocity, LINGERING_ZONE_DURATION_SEC,
    LINGERING_ZONE_MAX_TICKS, LINGERING_ZONE_TICK_INTERVAL_SEC,
};
use server_rs::systems::{lingering_zone_system, skill_execution_system};

#[test]
fn standing_in_blizzard_field_takes_damage_across_three_distinct_intervals() {
    let mut world = World::new();
    let mut clock = SimClock::new(50); // 20 Hz = 0.05s per tick
    clock.elapsed_ms = 1000;
    world.insert_resource(clock);

    // Player completes casting Blizzard (`skill_3`, 1.0s cast, 30 base Water damage, radius 5.0 -> 50.0 AoE)
    let mut casting = CastingState::new();
    casting.start_cast("skill_3", 1.0, 0.0);

    let _player = world
        .spawn((
            Position::new(0.0, 0.0),
            PlayerInputState::new(0.0, 0.0, false, 0).with_target_pos(100.0, 0.0),
            CooldownTracker::new(),
            casting,
            Velocity::zero(),
            PlayerTag,
        ))
        .id();

    // Mob standing inside the Blizzard field at (100, 0), plus a distant mob outside at (250, 0)
    let mob_inside = world
        .spawn((
            Position::new(110.0, 0.0),
            Health::new(200.0),
            ElementalAttributes::new(Element::Neutral, 0.0, 0.0, 0.0),
            StatusEffects::default(),
            MobTag,
        ))
        .id();

    let mob_outside = world
        .spawn((
            Position::new(250.0, 0.0),
            Health::new(200.0),
            ElementalAttributes::new(Element::Neutral, 0.0, 0.0, 0.0),
            StatusEffects::default(),
            MobTag,
        ))
        .id();

    // Run skill_execution_system once to complete the cast and spawn the LingeringZone
    let mut cast_schedule = Schedule::default();
    cast_schedule.add_systems(skill_execution_system);
    cast_schedule.run(&mut world);

    let mut zone_query = world.query::<(Entity, &Position, &LingeringZone)>();
    let zones: Vec<(Entity, Position, LingeringZone)> = zone_query
        .iter(&world)
        .map(|(e, p, z)| (e, *p, z.clone()))
        .collect();
    assert_eq!(
        zones.len(),
        1,
        "casting Blizzard must spawn 1 LingeringZone"
    );
    assert_eq!(zones[0].1, Position::new(100.0, 0.0));
    assert_eq!(zones[0].2.remaining_duration_sec, LINGERING_ZONE_DURATION_SEC);
    assert_eq!(
        zones[0].2.tick_interval_sec,
        LINGERING_ZONE_TICK_INTERVAL_SEC
    );
    assert_eq!(zones[0].2.max_ticks, LINGERING_ZONE_MAX_TICKS);

    let mut zone_schedule = Schedule::default();
    zone_schedule.add_systems(lingering_zone_system);

    // Interval 1: Advance 20 ticks (1.0s)
    for _ in 0..20 {
        world.resource_mut::<SimClock>().advance();
        zone_schedule.run(&mut world);
    }
    let hp_after_interval_1 = world.get::<Health>(mob_inside).unwrap().current;
    assert!(
        (hp_after_interval_1 - 170.0).abs() < 1e-3,
        "expected mob inside Blizzard to take 30 damage on interval 1 (hp=170), got {}",
        hp_after_interval_1
    );
    assert_eq!(
        world.get::<StatusEffects>(mob_inside).unwrap().speed_multiplier(),
        0.2,
        "Blizzard lingering zone must apply freeze slow to mob inside"
    );

    // Interval 2: Advance another 20 ticks (2.0s total)
    for _ in 0..20 {
        world.resource_mut::<SimClock>().advance();
        zone_schedule.run(&mut world);
    }
    let hp_after_interval_2 = world.get::<Health>(mob_inside).unwrap().current;
    assert!(
        (hp_after_interval_2 - 140.0).abs() < 1e-3,
        "expected mob inside Blizzard to take 30 damage on interval 2 (hp=140), got {}",
        hp_after_interval_2
    );

    // Interval 3: Advance final 20 ticks (3.0s total)
    for _ in 0..20 {
        world.resource_mut::<SimClock>().advance();
        zone_schedule.run(&mut world);
    }
    let hp_after_interval_3 = world.get::<Health>(mob_inside).unwrap().current;
    assert!(
        (hp_after_interval_3 - 110.0).abs() < 1e-3,
        "expected mob inside Blizzard to take 30 damage on interval 3 (hp=110), got {}",
        hp_after_interval_3
    );

    // Zone must expire and despawn after 3 intervals (3.0s)
    assert_eq!(
        zone_query.iter(&world).count(),
        0,
        "LingeringZone must despawn after completing its 3 intervals"
    );

    // Mob outside the field radius took zero damage
    assert_eq!(world.get::<Health>(mob_outside).unwrap().current, 200.0);
}

#[test]
fn meteor_strike_lingering_zone_ticks_three_times_and_stops_after_expiry() {
    let mut world = World::new();
    let mut clock = SimClock::new(50);
    clock.elapsed_ms = 1500;
    world.insert_resource(clock);

    let mut casting = CastingState::new();
    casting.start_cast("skill_1", 1.5, 0.0); // Meteor Strike (20 Fire damage per tick, radius 60)

    let _player = world
        .spawn((
            Position::new(0.0, 0.0),
            PlayerInputState::new(0.0, 0.0, false, 0).with_target_pos(80.0, 0.0),
            CooldownTracker::new(),
            casting,
            Velocity::zero(),
            PlayerTag,
        ))
        .id();

    let mob = world
        .spawn((
            Position::new(80.0, 0.0),
            Health::new(150.0),
            ElementalAttributes::new(Element::Neutral, 0.0, 0.0, 0.0),
            MobTag,
        ))
        .id();

    let mut schedule = Schedule::default();
    schedule.add_systems((skill_execution_system, lingering_zone_system).chain());

    // Run 1 tick to complete the cast, then 80 more ticks (4.0s total > 3.0s lifetime)
    let mut observed_hp_steps = Vec::new();
    let mut last_hp = 150.0_f32;
    for _ in 0..80 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
        let hp = world.get::<Health>(mob).unwrap().current;
        if (hp - last_hp).abs() > 1e-3 {
            observed_hp_steps.push(hp);
            last_hp = hp;
        }
    }

    assert_eq!(
        observed_hp_steps,
        vec![130.0, 110.0, 90.0],
        "Meteor Strike lingering zone must tick across 3 distinct intervals (130 -> 110 -> 90)"
    );
}
