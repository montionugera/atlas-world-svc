use crate::core::clock::SimClock;
use crate::ecs::components::{CastingState, PlayerInputState, StatusEffects, Velocity};
use bevy_ecs::prelude::*;

pub fn player_input_system(
    clock: Res<SimClock>,
    mut query: Query<(
        &PlayerInputState,
        &mut Velocity,
        Option<&StatusEffects>,
        Option<&CastingState>,
    )>,
) {
    let current_time = clock.current_time_seconds();

    for (input, mut vel, status_opt, casting_opt) in &mut query {
        // 1. Check StatusEffects: stun locks movement
        if let Some(status) = status_opt {
            if status.is_stunned() {
                vel.vx = 0.0;
                vel.vy = 0.0;
                continue;
            }
        }

        // 2. Check CastingState: active casting locks movement
        if let Some(casting) = casting_opt {
            if casting.is_casting(current_time) {
                vel.vx = 0.0;
                vel.vy = 0.0;
                continue;
            }
        }

        // 3. Process movement input (respecting freeze speed multiplier if any)
        let speed_mult = status_opt.map_or(1.0, |s| s.speed_multiplier());
        let base_speed = 20.0;
        let speed = base_speed * speed_mult;

        let len_sq = input.move_x * input.move_x + input.move_y * input.move_y;
        if len_sq > 1e-4 {
            let len = len_sq.sqrt();
            vel.vx = (input.move_x / len) * speed;
            vel.vy = (input.move_y / len) * speed;
        } else {
            vel.vx = 0.0;
            vel.vy = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normal_movement_input() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let entity = world
            .spawn((PlayerInputState::new(1.0, 0.0, false, 0), Velocity::zero()))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 20.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_stun_locks_movement() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let mut status = StatusEffects::default();
        status.apply_stun(1.0);

        let entity = world
            .spawn((
                PlayerInputState::new(1.0, 1.0, false, 0),
                Velocity::new(5.0, 5.0),
                status,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 0.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_freeze_scales_movement_speed() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let mut status = StatusEffects::default();
        status.apply_freeze(5.0, 0.2); // 80% slow

        let entity = world
            .spawn((
                PlayerInputState::new(0.0, 1.0, false, 0),
                Velocity::zero(),
                status,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 0.0);
        // 20.0 * 0.2 = 4.0
        assert!((vel.vy - 4.0).abs() < 1e-4);
    }

    #[test]
    fn test_casting_locks_movement() {
        let mut world = World::new();
        let clock = SimClock::new(50);
        world.insert_resource(clock);

        let mut casting = CastingState::new();
        casting.start_cast("skill_1", 1.5, 0.0);

        let entity = world
            .spawn((
                PlayerInputState::new(1.0, 0.0, false, 0),
                Velocity::new(10.0, 0.0),
                casting,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 0.0);
        assert_eq!(vel.vy, 0.0);
    }
}
