use bevy_ecs::prelude::*;

use crate::ecs::components::{PlayerAvatar, PlayerInputState, Velocity};

/// System that applies player movement inputs to velocities.
pub fn player_input_system(mut query: Query<(&PlayerAvatar, &PlayerInputState, &mut Velocity)>) {
    for (avatar, input, mut vel) in &mut query {
        let len_sq = input.move_x * input.move_x + input.move_y * input.move_y;
        if len_sq > 0.0001 {
            let inv_len = 1.0 / len_sq.sqrt().max(1.0);
            vel.vx = input.move_x * inv_len * avatar.speed;
            vel.vy = input.move_y * inv_len * avatar.speed;
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
    fn test_player_input_system_updates_velocity() {
        let mut world = World::new();
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
}
