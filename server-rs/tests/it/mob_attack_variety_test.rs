//! E-007 Slice 8 (`F-125`): Mob attack variety integration tests.
//!
//! Verifies that a mob configured with multiple attack abilities selects between at least
//! 2 distinct attacks depending on combat situation (target distance: close melee range vs
//! mid/far ranged distance).

use bevy_ecs::prelude::*;
use server_rs::ai::ThreatTable;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    CombatStats, Health, MobAi, MobAttackAbility, MobTag, PlayerTag, Position, Projectile, Velocity,
};
use server_rs::systems::mob_ai_system;

#[test]
fn mob_selects_between_close_melee_cleave_and_ranged_bolt_based_on_target_distance() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50));

    let abilities = vec![
        MobAttackAbility::melee_cleave(4.5),
        MobAttackAbility::ranged_bolt(4.501, 16.0),
    ];

    let mob = world
        .spawn((
            Position::new(10.0, 10.0),
            Velocity::zero(),
            Health::new(200.0),
            MobTag,
            CombatStats {
                attack_power: 20.0,
                defense: 2.0,
                attack_range: 16.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: false,
            },
            ThreatTable::new(),
            MobAi::new(Position::new(10.0, 10.0), 25.0, 16.0, false).with_abilities(abilities),
        ))
        .id();

    // Case 1: Player is at close melee range (dist = 2.5 <= 4.5)
    let player = world
        .spawn((Position::new(12.5, 10.0), Health::new(100.0), PlayerTag))
        .id();

    let mut schedule = Schedule::default();
    schedule.add_systems(mob_ai_system);
    schedule.run(&mut world);

    assert_eq!(
        world
            .get::<MobAi>(mob)
            .unwrap()
            .last_used_ability
            .as_deref(),
        Some("melee_cleave"),
        "mob must choose melee_cleave when target is within close melee band (25u)"
    );

    let mut proj_query = world.query::<(Entity, &Projectile)>();
    let spawned_close: Vec<(Entity, Projectile)> = proj_query
        .iter(&world)
        .map(|(e, p)| (e, p.clone()))
        .collect();
    assert_eq!(spawned_close.len(), 1);
    assert_eq!(spawned_close[0].1.skill_id.as_deref(), Some("melee_cleave"));
    assert_eq!(spawned_close[0].1.damage, 25.0); // 20.0 * 1.25 melee_cleave multiplier

    // Clear projectile and reset cooldown for Case 2
    world.despawn(spawned_close[0].0);
    world.get_mut::<CombatStats>(mob).unwrap().cooldown_timer = 0.0;

    // Case 2: Player moves out to mid/far range (dist = 12.0 in 4.501..=16.0)
    *world.get_mut::<Position>(player).unwrap() = Position::new(22.0, 10.0);
    schedule.run(&mut world);

    assert_eq!(
        world
            .get::<MobAi>(mob)
            .unwrap()
            .last_used_ability
            .as_deref(),
        Some("ranged_bolt"),
        "mob must choose ranged_bolt when target is in ranged band (120u)"
    );

    let spawned_ranged: Vec<(Entity, Projectile)> = proj_query
        .iter(&world)
        .map(|(e, p)| (e, p.clone()))
        .collect();
    assert_eq!(spawned_ranged.len(), 1);
    assert_eq!(spawned_ranged[0].1.skill_id.as_deref(), Some("ranged_bolt"));
    assert_eq!(spawned_ranged[0].1.damage, 20.0); // 20.0 * 1.0 ranged_bolt multiplier
}
