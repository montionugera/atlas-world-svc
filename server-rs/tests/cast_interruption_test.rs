use bevy_ecs::prelude::*;
use server_rs::combat::buffs::BuffContainer;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    CastingState, CombatStats, ElementalAttributes, EntityId, Health, Mass, MobTag, PlayerAvatar,
    PlayerInputState, PlayerTag, Position, StatusEffects, Velocity,
};
use server_rs::spatial::grid::SpatialGrid;
use server_rs::systems::combat::combat_system;

#[test]
fn test_taking_damage_interrupts_active_spell_channeling() {
    let mut world = World::new();

    let clock = SimClock::new(50);
    world.insert_resource(clock);
    let mut grid = SpatialGrid::new(50.0);

    // Attacker (Player attacking with attack=true)
    let attacker = world
        .spawn((
            EntityId("player-attacker".to_string()),
            Position::new(100.0, 100.0),
            Velocity::zero(),
            Health::new(100.0),
            PlayerTag,
            PlayerAvatar::new("player-attacker", 200.0),
            PlayerInputState {
                attack: true,
                ..Default::default()
            },
            CombatStats {
                attack_power: 35.0,
                defense: 5.0,
                attack_range: 40.0,
                attack_cooldown: 0.8,
                cooldown_timer: 0.0,
                is_player: true,
            },
            Mass(15.0),
            BuffContainer::default(),
            StatusEffects::default(),
        ))
        .id();

    // Target (Mob with CastingState channeling a spell)
    let mut cast_state = CastingState::new();
    cast_state.start_cast("meteor_strike", 3.0, 1.0);
    assert!(cast_state.is_casting(1.5));

    let victim = world
        .spawn((
            EntityId("mob-victim".to_string()),
            Position::new(120.0, 100.0), // In attack range (dist = 20.0 <= 40.0)
            Velocity::zero(),
            Health::new(100.0),
            MobTag,
            Mass(25.0),
            ElementalAttributes::default(),
            CombatStats {
                attack_power: 10.0,
                defense: 2.0,
                attack_range: 20.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: false,
            },
            cast_state,
            BuffContainer::default(),
            StatusEffects::default(),
        ))
        .id();

    grid.insert(attacker, 100.0, 100.0, true);
    grid.insert(victim, 120.0, 100.0, false);
    grid.finish_build();
    world.insert_resource(grid);

    // Run combat system
    let mut schedule = Schedule::default();
    schedule.add_systems(combat_system);
    schedule.run(&mut world);

    // Verify victim took damage
    let victim_health = world.get::<Health>(victim).unwrap();
    assert!(
        victim_health.current < 100.0,
        "Victim should have taken damage from attack"
    );

    // Verify active spell channeling was cancelled by damage
    let victim_cast = world.get::<CastingState>(victim).unwrap();
    assert!(
        !victim_cast.is_casting(1.5),
        "Active spell cast should have been cancelled by incoming damage"
    );
    assert_eq!(victim_cast.skill_id, None);
}
