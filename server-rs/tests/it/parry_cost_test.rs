use bevy_ecs::prelude::*;
use server_rs::{
    parry_tick_system, projectile_collision_system, DamageType, Element, ElementalAttributes,
    Health, Mass, MobTag, Parried, ParryState, PlayerInputState, PlayerTag, Position, Projectile,
    SimClock, SpatialGrid, StatusEffects, Velocity, MAX_PARRY_CHARGES, MAX_PARRY_HOLD_WINDOW_SEC,
    PARRY_COOLDOWN_SEC, PARRY_REFLECT_STAGGER_SEC,
};

fn spawn_enemy_projectile(world: &mut World, target: Entity) -> Entity {
    world
        .spawn((
            Position::new(60.0, 50.0),
            Velocity::new(-200.0, 0.0),
            Projectile {
                owner: Entity::PLACEHOLDER,
                target: Some(target),
                damage: 20.0,
                damage_type: DamageType::Physical,
                element: Element::Neutral,
                speed: 200.0,
                radius: 4.0,
                max_range: 300.0,
                traveled_distance: 0.0,
                lifetime: 1.5,
                effects: vec![],
                is_player_projectile: false,
                aoe_radius: 0.0,
                skill_id: Some("spear".to_string()),
                detonated: false,
            },
        ))
        .id()
}

#[test]
fn holding_attack_past_parry_window_fatigues_parry_and_lets_projectile_hit() {
    assert!((MAX_PARRY_HOLD_WINDOW_SEC - 0.4).abs() < 1e-6);
    assert_eq!(MAX_PARRY_CHARGES, 2);
    assert!((PARRY_COOLDOWN_SEC - 1.5).abs() < 1e-6);

    let mut world = World::new();
    world.insert_resource(SimClock::new(50)); // 50ms tick
    world.insert_resource(SpatialGrid::default());

    let player = world
        .spawn((
            Position::new(50.0, 50.0),
            Velocity::zero(),
            Health::new(100.0),
            ElementalAttributes::default(),
            StatusEffects::default(),
            Mass(20.0),
            PlayerTag,
            PlayerInputState {
                attack: true,
                attack_held: true,
                ..Default::default()
            },
            ParryState::new(),
        ))
        .id();

    let mut tick_schedule = Schedule::default();
    tick_schedule.add_systems(parry_tick_system);

    // Hold attack continuously for 9 ticks (450 ms > 400 ms MAX_PARRY_HOLD_WINDOW_SEC)
    for _ in 0..9 {
        tick_schedule.run(&mut world);
    }

    let parry = world.get::<ParryState>(player).unwrap();
    assert!(
        !parry.can_parry(),
        "holding attack beyond 0.4s must disable parry and start cooldown"
    );
    assert!(parry.cooldown_timer > 0.0);

    // Now an enemy projectile arrives while the player is still holding attack: it must NOT parry!
    let proj = spawn_enemy_projectile(&mut world, player);
    let mut collision_schedule = Schedule::default();
    collision_schedule.add_systems(projectile_collision_system);
    collision_schedule.run(&mut world);

    assert!(
        world.get_entity(proj).is_err(),
        "unparried projectile should hit and despawn"
    );
    assert!(
        world.get::<Health>(player).unwrap().current < 100.0,
        "player holding attack past the parry window must take projectile damage"
    );

    // Release attack and wait 1.5s (30 ticks) for recovery cooldown -> parry becomes available again.
    {
        let mut inp = world.get_mut::<PlayerInputState>(player).unwrap();
        inp.attack = false;
        inp.attack_held = false;
    }
    for _ in 0..31 {
        tick_schedule.run(&mut world);
    }
    assert!(
        world.get::<ParryState>(player).unwrap().can_parry(),
        "releasing attack and waiting out cooldown must restore parry"
    );
}

#[test]
fn parry_charges_cap_consecutive_deflections_and_reflected_projectile_staggers_mob() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50));
    world.insert_resource(SpatialGrid::default());

    let player = world
        .spawn((
            Position::new(50.0, 50.0),
            Velocity::zero(),
            Health::new(100.0),
            ElementalAttributes::default(),
            StatusEffects::default(),
            Mass(20.0),
            PlayerTag,
            PlayerInputState {
                attack: true,
                attack_held: true,
                ..Default::default()
            },
            ParryState::new(),
        ))
        .id();

    let mob = world
        .spawn((
            Position::new(80.0, 50.0),
            Velocity::zero(),
            Health::new(100.0),
            ElementalAttributes::default(),
            StatusEffects::default(),
            Mass(25.0),
            MobTag,
        ))
        .id();

    let mut collision_schedule = Schedule::default();
    collision_schedule.add_systems(projectile_collision_system);

    // Projectile 1: parried (charges 2 -> 1), reflected back toward the mob at (80, 50).
    let proj1 = spawn_enemy_projectile(&mut world, player);
    collision_schedule.run(&mut world);
    assert!(world.get::<Parried>(proj1).is_some());
    assert_eq!(world.get::<ParryState>(player).unwrap().charges, 1);
    assert_eq!(world.get::<Health>(player).unwrap().current, 100.0);

    // Move reflected proj1 onto the mob so it strikes the mob and staggers it.
    *world.get_mut::<Position>(proj1).unwrap() = Position::new(80.0, 50.0);
    collision_schedule.run(&mut world);
    assert!(world.get::<Health>(mob).unwrap().current < 100.0);
    let mob_status = world.get::<StatusEffects>(mob).unwrap();
    assert!(
        mob_status.is_stunned(),
        "mob struck by reflected Parried projectile must be staggered"
    );
    assert!((mob_status.stun_timer - PARRY_REFLECT_STAGGER_SEC).abs() < 1e-4);

    // Projectile 2: parried (charges 1 -> 0, cooldown triggered).
    let proj2 = spawn_enemy_projectile(&mut world, player);
    collision_schedule.run(&mut world);
    assert!(world.get::<Parried>(proj2).is_some());
    assert_eq!(world.get::<ParryState>(player).unwrap().charges, 0);
    assert!(!world.get::<ParryState>(player).unwrap().can_parry());
    world.despawn(proj2);

    // Projectile 3: charges exhausted -> cannot parry, hits and damages player!
    let proj3 = spawn_enemy_projectile(&mut world, player);
    collision_schedule.run(&mut world);
    assert!(world.get_entity(proj3).is_err());
    assert!(
        world.get::<Health>(player).unwrap().current < 100.0,
        "third projectile after exhausting 2 parry charges must hit and damage the player"
    );
}
