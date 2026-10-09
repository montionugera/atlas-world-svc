use crate::core::clock::SimClock;
use crate::ecs::components::{
    CastingState, DashState, Health, PlayerAvatar, PlayerInputState, StatusEffects, Velocity,
};
use bevy_ecs::prelude::*;

/// System that applies player movement inputs to velocities,
/// respecting avatar speed, status effects (stun, freeze), active casting, and dash impulses.
#[allow(clippy::type_complexity)]
pub fn player_input_system(
    clock: Res<SimClock>,
    mut query: Query<(
        Option<&PlayerAvatar>,
        &PlayerInputState,
        &mut Velocity,
        Option<&StatusEffects>,
        Option<&CastingState>,
        Option<&Health>,
        Option<&mut DashState>,
    )>,
) {
    let current_time = clock.current_time_seconds();
    let dt = clock.delta_seconds();

    for (avatar_opt, input, mut vel, status_opt, casting_opt, health, mut dash_opt) in &mut query {
        // 0. The dead do not move.
        if health.is_some_and(|h| !h.is_alive) {
            vel.vx = 0.0;
            vel.vy = 0.0;
            if let Some(ref mut dash) = dash_opt {
                dash.remaining_sec = 0.0;
            }
            continue;
        }

        // 1. Check StatusEffects: stun locks movement
        if let Some(status) = status_opt {
            if status.is_stunned() {
                vel.vx = 0.0;
                vel.vy = 0.0;
                if let Some(ref mut dash) = dash_opt {
                    dash.remaining_sec = 0.0;
                }
                continue;
            }
        }

        // 2. Check CastingState: active casting locks movement
        if let Some(casting) = casting_opt {
            if casting.is_casting(current_time) {
                vel.vx = 0.0;
                vel.vy = 0.0;
                if let Some(ref mut dash) = dash_opt {
                    dash.remaining_sec = 0.0;
                }
                continue;
            }
        }

        // 2b. Knocked back: keep the impulse velocity; input (and any dash) must not overwrite it
        if status_opt.is_some_and(|s| s.is_knocked_back()) {
            if let Some(ref mut dash) = dash_opt {
                dash.remaining_sec = 0.0;
            }
            continue;
        }

        // 3. Check DashState: active dash impulse overrides normal movement
        if let Some(ref mut dash) = dash_opt {
            if dash.is_dashing() {
                dash.remaining_sec -= dt;
                if dash.remaining_sec > 0.0 {
                    let base_speed = avatar_opt.map_or(20.0, |a| a.speed);
                    let dash_progress = (dash.remaining_sec / 0.22).clamp(0.0, 1.0);
                    let current_speed = base_speed + (dash.speed - base_speed) * dash_progress;
                    vel.vx = dash.dir_x * current_speed;
                    vel.vy = dash.dir_y * current_speed;
                    continue;
                } else {
                    dash.remaining_sec = 0.0;
                }
            }
        }

        // 4. Process movement input (respecting avatar speed and freeze multiplier)
        let base_speed = avatar_opt.map_or(20.0, |a| a.speed);
        let speed_mult = status_opt.map_or(1.0, |s| s.speed_multiplier());
        let speed = base_speed * speed_mult;

        let len_sq = input.move_x * input.move_x + input.move_y * input.move_y;
        if len_sq > 0.0001 {
            let inv_len = 1.0 / len_sq.sqrt().max(1.0);
            vel.vx = input.move_x * inv_len * speed;
            vel.vy = input.move_y * inv_len * speed;
        } else {
            vel.vx = 0.0;
            vel.vy = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ecs::components::Position;

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
    fn test_player_input_system_updates_velocity_with_avatar() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));
        let entity = world
            .spawn((
                PlayerAvatar::new("p1", 100.0),
                PlayerInputState {
                    move_x: 1.0,
                    move_y: 0.0,
                    ..Default::default()
                },
                Position::new(0.0, 0.0),
                Velocity::zero(),
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 100.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_player_input_system_normalizes_diagonal() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));
        let entity = world
            .spawn((
                PlayerAvatar::new("p1", 100.0),
                PlayerInputState {
                    move_x: 1.0,
                    move_y: 1.0,
                    ..Default::default()
                },
                Position::new(0.0, 0.0),
                Velocity::zero(),
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        let speed = (vel.vx * vel.vx + vel.vy * vel.vy).sqrt();
        assert!((speed - 100.0).abs() < 1e-4);
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
                PlayerAvatar::new("p1", 100.0),
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
        // 100.0 * 0.2 = 20.0
        assert!((vel.vy - 20.0).abs() < 1e-4);
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

    #[test]
    fn test_knockback_velocity_survives_held_movement_input() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let mut status = StatusEffects::default();
        status.apply_knockback(0.2);

        let entity = world
            .spawn((
                PlayerAvatar::new("p1", 200.0),
                PlayerInputState::new(1.0, 0.0, false, 0), // holding +X
                Velocity::new(-80.0, 30.0),                // knocked back toward -X
                status,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, -80.0, "movement input must not erase knockback");
        assert_eq!(vel.vy, 30.0);

        // Knockback ends: normal movement control resumes.
        world.get_mut::<StatusEffects>(entity).unwrap().knockback_timer = 0.0;
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 200.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_dash_overrides_movement_and_decelerates() {
        let mut world = World::new();
        let clock = SimClock::new(50); // dt = 0.05s
        world.insert_resource(clock);

        let mut dash = DashState::new();
        dash.remaining_sec = 0.22;
        dash.dir_x = 1.0;
        dash.dir_y = 0.0;
        dash.speed = 450.0;

        let entity = world
            .spawn((
                PlayerAvatar::new("p1", 200.0),
                PlayerInputState::new(0.0, 1.0, false, 0), // input moving down
                Velocity::zero(),
                dash,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(player_input_system);

        // Tick 1 (dt = 0.05s): remaining = 0.17s. Dash overrides downward movement with +X dash
        schedule.run(&mut world);
        let vel = world.get::<Velocity>(entity).unwrap();
        assert!(vel.vx > 300.0, "expected dash speed > 300, got {}", vel.vx);
        assert_eq!(vel.vy, 0.0, "dash overrides WASD input during dash window");
    }
}
