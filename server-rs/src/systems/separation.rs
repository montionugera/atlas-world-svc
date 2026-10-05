use crate::core::clock::SimClock;
use crate::ecs::components::{Health, MobTag, Position, Velocity};
use crate::spatial::grid::SpatialGrid;
use bevy_ecs::prelude::*;

pub fn separation_system(
    clock: Res<SimClock>,
    grid: Res<SpatialGrid>,
    mut query: Query<(Entity, &Position, &mut Velocity, &Health), With<MobTag>>,
) {
    let dt = clock.delta_seconds();
    let separation_radius = 23.0f32; // (radius 4 + radius 4 + 15)
    let min_separation_radius = 0.1f32;
    let inv_separation_radius = 1.0f32 / separation_radius;
    let speed = 6.0f32;
    let separation_weight_base = speed * 4.0f32;

    query
        .par_iter_mut()
        .for_each(|(entity, pos, mut vel, health)| {
            if !health.is_alive {
                return;
            }

            let mut sep_x = 0.0;
            let mut sep_y = 0.0;
            let mut count = 0;

            grid.for_each_mob_in_radius(
                pos.x,
                pos.y,
                separation_radius,
                |other_entity, dx, dy, dist_sq| {
                    if other_entity != entity && dist_sq > 0.0 {
                        let dist = dist_sq.sqrt().max(min_separation_radius);
                        let factor = separation_weight_base * (1.0 / dist - inv_separation_radius);
                        sep_x += dx * factor;
                        sep_y += dy * factor;
                        count += 1;
                    }
                },
            );

            if count > 0 {
                let inv_count = 1.0 / (count as f32);
                vel.vx += (sep_x * inv_count) * dt;
                vel.vy += (sep_y * inv_count) * dt;
            }
        });
}
