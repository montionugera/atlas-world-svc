use bevy_ecs::prelude::*;
use server_rs::{
    combat_system, projectile_collision_system, projectile_kinematics_system,
    spatial_grid_rebuild_system, CombatStats, EquippedWeapon, Health, MobTag, PlayerAvatar,
    PlayerInputState, PlayerTag, Position, Projectile, SimClock, SpatialGrid, Velocity, WeaponKind,
};

fn build_ranged_world(
    weapon: EquippedWeapon,
    mob_pos: Position,
    aim_target_pos: Position,
) -> (World, Schedule, Entity) {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50));
    world.insert_resource(SpatialGrid::new(50.0));

    world.spawn((
        Position::new(100.0, 100.0),
        Velocity::zero(),
        Health::new(100.0),
        PlayerTag,
        PlayerAvatar::new("p1", 200.0),
        PlayerInputState::new(0.0, 0.0, true, 0)
            .with_target_pos(aim_target_pos.x, aim_target_pos.y),
        CombatStats {
            attack_power: 25.0,
            defense: 5.0,
            attack_range: 40.0,
            attack_cooldown: 0.8,
            cooldown_timer: 0.0,
            is_player: true,
        },
        weapon,
    ));

    let mob = world
        .spawn((mob_pos, Velocity::zero(), Health::new(100.0), MobTag))
        .id();

    let mut schedule = Schedule::default();
    schedule.add_systems(
        (
            spatial_grid_rebuild_system,
            combat_system,
            projectile_kinematics_system,
            projectile_collision_system,
        )
            .chain(),
    );

    (world, schedule, mob)
}

#[test]
fn bow_shot_fired_45_degrees_away_from_mob_travels_in_aimed_direction_and_misses() {
    // Mob sits due East at (200, 100), while player at (100, 100) aims 45 degrees North-East (200, 200).
    let (mut world, mut schedule, mob) = build_ranged_world(
        EquippedWeapon::bow(),
        Position::new(200.0, 100.0),
        Position::new(200.0, 200.0),
    );

    // Tick 1: Bow fires a projectile along the 45-degree vector (+0.7071, +0.7071)
    schedule.run(&mut world);

    let mut proj_q = world.query::<(&Position, &Velocity, &Projectile)>();
    let projs: Vec<_> = proj_q.iter(&world).collect();
    assert_eq!(projs.len(), 1, "bow attack must spawn an aimed projectile");
    let (_, vel, proj) = projs[0];
    assert_eq!(proj.skill_id.as_deref(), Some("bow_shot"));
    assert!(proj.target.is_none(), "bow projectile must not auto-home");
    let diag = 250.0 * std::f32::consts::FRAC_1_SQRT_2;
    assert!((vel.vx - diag).abs() < 0.5);
    assert!((vel.vy - diag).abs() < 0.5);

    // Run 30 more ticks until projectile reaches max range and despawns
    for _ in 0..30 {
        schedule.run(&mut world);
    }

    assert_eq!(
        world.get::<Health>(mob).unwrap().current,
        100.0,
        "bow shot aimed 45 degrees away from the mob must miss completely"
    );
}

#[test]
fn bow_and_staff_shots_aimed_at_mob_travel_and_hit_target() {
    for weapon in [EquippedWeapon::bow(), EquippedWeapon::staff()] {
        assert!(matches!(weapon.kind, WeaponKind::Bow | WeaponKind::Staff));
        let (mut world, mut schedule, mob) = build_ranged_world(
            weapon,
            Position::new(200.0, 100.0),
            Position::new(200.0, 100.0),
        );

        for _ in 0..15 {
            schedule.run(&mut world);
            if world.get::<Health>(mob).unwrap().current < 100.0 {
                break;
            }
        }

        assert!(
            world.get::<Health>(mob).unwrap().current < 100.0,
            "aimed ranged shot on target vector must hit and damage the mob"
        );
    }
}
