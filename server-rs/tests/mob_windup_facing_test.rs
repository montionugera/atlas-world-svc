use bevy_ecs::prelude::*;
use server_rs::{
    mob_ai_system, projectile_collision_system, projectile_kinematics_system,
    spatial_grid_rebuild_system, AiState, CombatStats, Health, MobAi, MobTag, PlayerTag, Position,
    Projectile, SimClock, SpatialGrid, ThreatTable, Velocity, MOB_WINDUP_DURATION_SEC,
};

fn build_windup_world(player_pos: Position) -> (World, Schedule, Entity, Entity) {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50)); // 50ms tick -> 16 ticks = 800ms
    world.insert_resource(SpatialGrid::new(50.0));

    let mob = world
        .spawn((
            Position::new(100.0, 100.0),
            Velocity::zero(),
            MobAi::new(Position::new(100.0, 100.0), 200.0, 40.0, false).with_default_windup(),
            ThreatTable::new(),
            CombatStats {
                attack_power: 25.0,
                attack_range: 40.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: false,
                ..Default::default()
            },
            Health::new(100.0),
            MobTag,
        ))
        .id();

    let player = world
        .spawn((
            player_pos,
            Velocity::zero(),
            Health::new(100.0),
            PlayerTag,
        ))
        .id();

    world
        .get_mut::<ThreatTable>(mob)
        .unwrap()
        .add_threat(player, 100.0, 0.0);

    let mut schedule = Schedule::default();
    schedule.add_systems(
        (
            spatial_grid_rebuild_system,
            mob_ai_system,
            projectile_kinematics_system,
            projectile_collision_system,
        )
            .chain(),
    );

    (world, schedule, mob, player)
}

#[test]
fn mob_attack_shows_800ms_windup_tell_and_hits_player_in_facing_cone() {
    assert!((MOB_WINDUP_DURATION_SEC - 0.8).abs() < 1e-6);
    let (mut world, mut schedule, mob, player) = build_windup_world(Position::new(125.0, 100.0));

    // Tick 1: Mob initiates 800 ms wind-up tell facing +X toward the player; no projectile yet.
    world.resource_mut::<SimClock>().advance();
    schedule.run(&mut world);

    let ai = world.get::<MobAi>(mob).unwrap();
    assert_eq!(ai.state, AiState::Attack);
    assert!(ai.is_winding_up(), "mob must show wind-up tell");
    assert!((ai.windup_timer - 0.8).abs() < 1e-4);
    assert!((ai.windup_facing.0 - 1.0).abs() < 1e-4);
    assert!(ai.windup_facing.1.abs() < 1e-4);
    assert_eq!(world.query::<&Projectile>().iter(&world).count(), 0);
    assert_eq!(world.get::<Health>(player).unwrap().current, 100.0);

    // Ticks 2..=16 (750 ms elapsed): still winding up, zero damage dealt.
    for _ in 0..15 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
        assert!(
            world.get::<MobAi>(mob).unwrap().is_winding_up(),
            "mob must remain in wind-up tell for full 800 ms"
        );
        assert_eq!(world.get::<Health>(player).unwrap().current, 100.0);
    }

    // Tick 17 (800 ms elapsed): wind-up finishes, attack lands on player inside facing cone.
    world.resource_mut::<SimClock>().advance();
    schedule.run(&mut world);

    assert!(!world.get::<MobAi>(mob).unwrap().is_winding_up());
    assert!(
        world.get::<Health>(player).unwrap().current < 100.0,
        "player remaining inside the facing cone after 800 ms wind-up must take damage"
    );
}

#[test]
fn mob_attack_misses_when_player_moves_out_of_facing_cone_before_800ms_tell_ends() {
    let (mut world, mut schedule, mob, player) = build_windup_world(Position::new(125.0, 100.0));

    // Tick 1: Mob starts 800 ms wind-up locked toward +X (east).
    world.resource_mut::<SimClock>().advance();
    schedule.run(&mut world);
    assert!(world.get::<MobAi>(mob).unwrap().is_winding_up());

    // Mid-wind-up (after 400 ms = 8 ticks), the player sidesteps behind/perpendicular to the mob
    // (still within 25 units of the mob, but at 90+ degrees outside the 60-degree half-angle cone!).
    for _ in 0..8 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }
    *world.get_mut::<Position>(player).unwrap() = Position::new(80.0, 100.0); // West of mob (-X)

    // Finish the remaining 400 ms (8 ticks) + extra ticks for any projectile lifetime.
    for _ in 0..12 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }

    assert!(!world.get::<MobAi>(mob).unwrap().is_winding_up());
    assert_eq!(
        world.get::<Health>(player).unwrap().current,
        100.0,
        "player who moved out of the mob's facing cone before 800 ms must avoid the attack completely"
    );
}
