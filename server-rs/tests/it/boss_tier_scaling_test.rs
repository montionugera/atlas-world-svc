//! E-007 Slice 7 (`F-124`): Boss tier scaling at spawn integration tests.
//!
//! Verifies that spawning a mob with `MobTier::Boss` produces a boss entity with at least
//! 3x the max health (`3.5x`), higher attack damage (`2.5x`), larger collision radius, and
//! `BossTag` (`visual_scale = 1.5`) compared to a `MobTier::Route` mob of the same bestiary entry,
//! and that `mob_lifecycle_system` preserves boss tier scaling across respawns.

use bevy_ecs::prelude::*;
use server_rs::content::{
    derive_mob_stats, BestiaryCatalog, MobTier, BOSS_ATK_MULTIPLIER, BOSS_HP_MULTIPLIER,
};
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    BodyRadius, BossTag, CombatStats, DeadMobTracker, Health, MobSpawnAnchor, Position,
    BOSS_BODY_RADIUS, BOSS_VISUAL_SCALE, MOB_BODY_RADIUS,
};
use server_rs::systems::{mob_bundle, mob_lifecycle_system};

#[test]
fn boss_tier_spawn_has_at_least_three_times_health_and_higher_damage_than_route_mob() {
    let catalog = BestiaryCatalog::default();
    let entry = catalog
        .get_mob("mob-bramble-stalker")
        .expect("mob-bramble-stalker must exist");

    let route_stats = derive_mob_stats(entry, MobTier::Route);
    let boss_stats = derive_mob_stats(entry, MobTier::Boss);

    assert!(
        boss_stats.hp >= route_stats.hp * 3.0,
        "Boss tier HP ({}) must be at least 3x Route tier HP ({})",
        boss_stats.hp,
        route_stats.hp
    );
    assert_eq!(boss_stats.hp, (route_stats.hp * BOSS_HP_MULTIPLIER).round());
    assert!(
        boss_stats.p_atk > route_stats.p_atk,
        "Boss tier attack ({}) must exceed Route tier attack ({})",
        boss_stats.p_atk,
        route_stats.p_atk
    );
    assert_eq!(boss_stats.p_atk, route_stats.p_atk * BOSS_ATK_MULTIPLIER);

    let mut world = World::new();
    let route_anchor = MobSpawnAnchor::new(
        Position::new(100.0, 100.0),
        "mob-bramble-stalker",
        MobTier::Route,
        10.0,
    );
    let boss_anchor = MobSpawnAnchor::new(
        Position::new(200.0, 200.0),
        "mob-bramble-stalker",
        MobTier::Boss,
        30.0,
    );

    let route_entity = world
        .spawn(mob_bundle(&catalog, &route_anchor, "route-1".to_string()))
        .id();
    let boss_entity = world
        .spawn(mob_bundle(&catalog, &boss_anchor, "boss-1".to_string()))
        .id();

    let route_hp = world.get::<Health>(route_entity).unwrap();
    let boss_hp = world.get::<Health>(boss_entity).unwrap();
    assert!(boss_hp.max >= route_hp.max * 3.0);
    assert_eq!(boss_hp.current, boss_hp.max);

    let route_combat = world.get::<CombatStats>(route_entity).unwrap();
    let boss_combat = world.get::<CombatStats>(boss_entity).unwrap();
    assert!(boss_combat.attack_power > route_combat.attack_power);

    let route_tag = world.get::<BossTag>(route_entity).unwrap();
    let boss_tag = world.get::<BossTag>(boss_entity).unwrap();
    assert!(!route_tag.is_boss);
    assert_eq!(route_tag.visual_scale, 1.0);
    assert!(boss_tag.is_boss);
    assert_eq!(boss_tag.visual_scale, BOSS_VISUAL_SCALE);

    assert_eq!(
        world.get::<BodyRadius>(route_entity).unwrap().0,
        MOB_BODY_RADIUS
    );
    assert_eq!(
        world.get::<BodyRadius>(boss_entity).unwrap().0,
        BOSS_BODY_RADIUS
    );
}

#[test]
fn boss_mob_respawns_with_boss_tier_scaling_preserved() {
    let mut world = World::new();
    let mut clock = SimClock::default();
    clock.advance_by(31_000);
    world.insert_resource(clock);

    let boss_anchor = MobSpawnAnchor::new(
        Position::new(250.0, 250.0),
        "mob-thorncrown-drake",
        MobTier::Boss,
        30.0,
    );
    world.spawn(DeadMobTracker::new(0.0, 30.0, boss_anchor));

    let mut schedule = Schedule::default();
    schedule.add_systems(mob_lifecycle_system);
    schedule.run(&mut world);

    let mut query = world.query::<(&Health, &CombatStats, &BossTag, &MobSpawnAnchor)>();
    let spawned: Vec<_> = query.iter(&world).collect();
    assert_eq!(spawned.len(), 1);
    let (health, combat, boss_tag, anchor) = spawned[0];
    assert_eq!(anchor.tier, MobTier::Boss);
    assert!(boss_tag.is_boss);
    assert!(health.max >= 300.0);
    assert!(combat.attack_power >= 25.0);
}
