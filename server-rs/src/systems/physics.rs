use crate::core::clock::SimClock;
use crate::ecs::components::{Health, Position, Velocity};
use crate::physics::world::{PhysicsWorld, RapierBodyHandle};
use crate::systems::steering::ArenaBounds;
use bevy_ecs::prelude::*;
use rapier2d::prelude::*;

pub fn physics_step_system(
    clock: Res<SimClock>,
    bounds: Res<ArenaBounds>,
    mut physics_world: ResMut<PhysicsWorld>,
    mut query: Query<(
        &mut Position,
        &mut Velocity,
        &Health,
        Option<&RapierBodyHandle>,
    )>,
) {
    let dt = clock.delta_seconds();

    // Step the Rapier physics simulation
    physics_world.step(dt);

    let damping = 1.0 / (1.0 + dt * 0.1);

    for (mut pos, mut vel, health, body_handle) in &mut query {
        if !health.is_alive {
            vel.vx = 0.0;
            vel.vy = 0.0;
            if let Some(handle) = body_handle {
                if let Some(body) = physics_world.bodies.get_mut(handle.0) {
                    body.set_linvel(vector![0.0, 0.0], true);
                }
            }
            continue;
        }

        // Apply linear damping
        vel.vx *= damping;
        vel.vy *= damping;

        // Kinematic integration
        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;

        // Boundary clamping
        if pos.x < 0.0 {
            pos.x = 0.0;
            if vel.vx < 0.0 {
                vel.vx = 0.0;
            }
        } else if pos.x > bounds.width {
            pos.x = bounds.width;
            if vel.vx > 0.0 {
                vel.vx = 0.0;
            }
        }

        if pos.y < 0.0 {
            pos.y = 0.0;
            if vel.vy < 0.0 {
                vel.vy = 0.0;
            }
        } else if pos.y > bounds.height {
            pos.y = bounds.height;
            if vel.vy > 0.0 {
                vel.vy = 0.0;
            }
        }

        // Sync with Rapier rigid body if attached
        if let Some(handle) = body_handle {
            if let Some(body) = physics_world.bodies.get_mut(handle.0) {
                body.set_translation(vector![pos.x, pos.y], true);
                body.set_linvel(vector![vel.vx, vel.vy], true);
            }
        }
    }
}
