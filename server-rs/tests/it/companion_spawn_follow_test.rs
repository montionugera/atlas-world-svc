use bevy_ecs::prelude::*;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::*;
use server_rs::physics::world::PhysicsWorld;
use server_rs::systems::{
    companion_follow_system, physics_step_system, spawn_companion, ArenaBounds,
};

fn setup_world_and_schedule() -> (World, Schedule) {
    let mut world = World::new();
    world.insert_resource(SimClock::new(100));
    world.insert_resource(ArenaBounds::default());
    world.insert_resource(PhysicsWorld::default());

    let mut schedule = Schedule::default();
    schedule.add_systems((companion_follow_system, physics_step_system).chain());
    (world, schedule)
}

#[test]
fn spawned_companion_follows_owner_across_region_and_settles_within_five_units() {
    let (mut world, mut schedule) = setup_world_and_schedule();

    let player = world
        .spawn((
            EntityId("player-owner".to_string()),
            PlayerTag,
            Position::new(10.0, 10.0),
            Velocity::zero(),
            Health::new(200.0),
        ))
        .id();

    let companion = spawn_companion(
        &mut world,
        player,
        "companion-wolf",
        Position::new(10.0, 10.0),
    );

    let comp_ai = world.get::<CompanionAi>(companion).unwrap();
    assert!(
        comp_ai.follow_distance <= 0.5,
        "Companion follow_distance ({}) must be <= 0.5 units",
        comp_ai.follow_distance
    );

    // Move the player across the region to (34.0, 28.0) (30 m away).
    *world.get_mut::<Position>(player).expect("player position") = Position::new(34.0, 28.0);

    // Step simulation for 17 seconds (170 ticks at 100ms; F-184 pace needs 1/0.15 the ticks).
    for _ in 0..170 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }

    let owner_pos = *world.get::<Position>(player).unwrap();
    let comp_pos = *world.get::<Position>(companion).unwrap();
    let comp_vel = *world.get::<Velocity>(companion).unwrap();

    let dx = owner_pos.x - comp_pos.x;
    let dy = owner_pos.y - comp_pos.y;
    let dist = (dx * dx + dy * dy).sqrt();

    assert!(
        dist <= 0.5,
        "Expected companion to settle within <= 0.5 units of owner, got dist={} (comp={:?}, owner={:?})",
        dist,
        comp_pos,
        owner_pos
    );
    assert_eq!(comp_vel, Velocity::zero());
}

#[test]
fn companion_stops_when_already_within_follow_distance() {
    let (mut world, mut schedule) = setup_world_and_schedule();

    let player = world
        .spawn((
            EntityId("player-owner".to_string()),
            PlayerTag,
            Position::new(20.0, 20.0),
            Velocity::zero(),
            Health::new(200.0),
        ))
        .id();

    let companion = spawn_companion(
        &mut world,
        player,
        "companion-owl",
        Position::new(20.3, 20.0),
    );

    for _ in 0..5 {
        world.resource_mut::<SimClock>().advance();
        schedule.run(&mut world);
    }

    let comp_pos = *world.get::<Position>(companion).unwrap();
    let comp_vel = *world.get::<Velocity>(companion).unwrap();
    assert_eq!(comp_pos, Position::new(20.3, 20.0));
    assert_eq!(comp_vel, Velocity::zero());
}
