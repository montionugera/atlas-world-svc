use crate::core::clock::SimClock;
use crate::ecs::components::{CombatStats, Health, Position};
use crate::spatial::grid::SpatialGrid;
use bevy_ecs::prelude::*;

#[allow(clippy::type_complexity)]
pub fn combat_system(
    clock: Res<SimClock>,
    grid: Res<SpatialGrid>,
    mut params: ParamSet<(
        Query<(Entity, &Position, &mut CombatStats, &Health)>,
        Query<&mut Health>,
    )>,
) {
    let dt = clock.delta_seconds();
    let mut attacks: Vec<(Entity, Entity, f32)> = Vec::new();

    {
        let mut attackers = params.p0();
        for (entity, pos, mut stats, health) in &mut attackers {
            if !health.is_alive {
                continue;
            }

            if stats.cooldown_timer > 0.0 {
                stats.cooldown_timer -= dt;
            }

            if stats.cooldown_timer > 0.0 {
                continue;
            }

            let is_player = stats.is_player;
            let attack_range = stats.attack_range;
            let mut nearest_target = None;
            let mut nearest_dist_sq = attack_range * attack_range;

            if is_player {
                grid.for_each_mob_in_radius(
                    pos.x,
                    pos.y,
                    attack_range,
                    |other_entity, _dx, _dy, dist_sq| {
                        if other_entity != entity && dist_sq <= nearest_dist_sq {
                            nearest_dist_sq = dist_sq;
                            nearest_target = Some(other_entity);
                        }
                    },
                );
            } else {
                grid.for_each_player_in_radius(
                    pos.x,
                    pos.y,
                    attack_range,
                    |other_entity, _dx, _dy, dist_sq| {
                        if other_entity != entity && dist_sq <= nearest_dist_sq {
                            nearest_dist_sq = dist_sq;
                            nearest_target = Some(other_entity);
                        }
                    },
                );
            }

            if let Some(target_entity) = nearest_target {
                stats.cooldown_timer = stats.attack_cooldown;
                attacks.push((entity, target_entity, stats.attack_power.max(1.0)));
            }
        }
    }

    if !attacks.is_empty() {
        let mut health_query = params.p1();
        for (_attacker, target, damage) in attacks {
            if let Ok(mut target_health) = health_query.get_mut(target) {
                target_health.take_damage(damage);
            }
        }
    }
}
