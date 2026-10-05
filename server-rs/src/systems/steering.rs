use crate::core::clock::SimClock;
use crate::core::prng::Mulberry32;
use crate::ecs::components::{BotAgent, EntityId, Health, Position, Velocity};
use bevy_ecs::prelude::*;

#[derive(Resource, Debug, Clone, Copy)]
pub struct ArenaBounds {
    pub width: f32,
    pub height: f32,
    pub margin: f32,
}

impl Default for ArenaBounds {
    fn default() -> Self {
        Self {
            width: 1200.0,
            height: 1200.0,
            margin: 25.0,
        }
    }
}

impl ArenaBounds {
    pub fn new(width: f32, height: f32) -> Self {
        Self {
            width,
            height,
            margin: 25.0,
        }
    }
}

pub fn bot_steering_system(
    clock: Res<SimClock>,
    mut prng: ResMut<Mulberry32>,
    bounds: Res<ArenaBounds>,
    mut query: Query<(&EntityId, &Position, &mut BotAgent, &mut Velocity, &Health)>,
) {
    let dt = clock.delta_seconds();
    let margin = bounds.margin;
    let width = bounds.width;
    let height = bounds.height;
    let tick = clock.tick();
    let max_linear_speed = 20.0;
    let accel_gain = 15.0;

    // Only sort on ticks where wander turn occurs (1 out of every 50 ticks)
    if tick > 0 && tick.is_multiple_of(50) {
        let mut entries: Vec<_> = query.iter_mut().collect();
        entries.sort_by(|(id_a, _, _, _, _), (id_b, _, _, _, _)| id_a.0.cmp(&id_b.0));

        for (_id, pos, mut bot, mut vel, health) in entries {
            if !health.is_alive {
                continue;
            }

            if (pos.x <= margin && bot.vx < 0.0) || (pos.x >= width - margin && bot.vx > 0.0) {
                bot.vx = -bot.vx;
            }
            if (pos.y <= margin && bot.vy < 0.0) || (pos.y >= height - margin && bot.vy > 0.0) {
                bot.vy = -bot.vy;
            }

            let turn_angle = prng.as_mut().range(-0.5, 0.5);
            let current_angle = bot.vy.atan2(bot.vx) + turn_angle;
            bot.vx = current_angle.cos();
            bot.vy = current_angle.sin();

            let desired_vx = bot.vx * max_linear_speed;
            let desired_vy = bot.vy * max_linear_speed;

            vel.vx += accel_gain * (desired_vx - vel.vx) * dt;
            vel.vy += accel_gain * (desired_vy - vel.vy) * dt;
        }
    } else {
        for (_id, pos, mut bot, mut vel, health) in &mut query {
            if !health.is_alive {
                continue;
            }

            if (pos.x <= margin && bot.vx < 0.0) || (pos.x >= width - margin && bot.vx > 0.0) {
                bot.vx = -bot.vx;
            }
            if (pos.y <= margin && bot.vy < 0.0) || (pos.y >= height - margin && bot.vy > 0.0) {
                bot.vy = -bot.vy;
            }

            let desired_vx = bot.vx * max_linear_speed;
            let desired_vy = bot.vy * max_linear_speed;

            vel.vx += accel_gain * (desired_vx - vel.vx) * dt;
            vel.vy += accel_gain * (desired_vy - vel.vy) * dt;
        }
    }
}
