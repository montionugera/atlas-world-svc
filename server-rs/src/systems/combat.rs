use crate::core::clock::SimClock;
use crate::ecs::components::{
    CombatStats, CooldownTracker, EntityId, Health, MobSpawnAnchor, PlayerAvatar, Position,
    StatusEffects,
};
use crate::spatial::grid::SpatialGrid;
use crate::storage::{MatchEvent, MatchEventQueue};
use bevy_ecs::prelude::*;

#[allow(clippy::type_complexity)]
pub fn combat_system(
    clock: Res<SimClock>,
    grid: Res<SpatialGrid>,
    mut event_queue: Option<ResMut<MatchEventQueue>>,
    mut params: ParamSet<(
        Query<(
            Entity,
            &Position,
            &mut CombatStats,
            &Health,
            Option<&EntityId>,
            Option<&PlayerAvatar>,
        )>,
        Query<(&mut Health, Option<&EntityId>, Option<&MobSpawnAnchor>)>,
    )>,
) {
    let dt = clock.delta_seconds();
    let mut attacks: Vec<(Option<String>, Entity, f32)> = Vec::new();

    {
        let mut attackers = params.p0();
        for (entity, pos, mut stats, health, entity_id, avatar) in &mut attackers {
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
                let player_user_id = if is_player {
                    entity_id
                        .map(|e| e.0.clone())
                        .or_else(|| avatar.map(|a| a.session_id.clone()))
                } else {
                    None
                };
                attacks.push((player_user_id, target_entity, stats.attack_power.max(1.0)));
            }
        }
    }

    if !attacks.is_empty() {
        let mut health_query = params.p1();
        for (attacker_user_id, target, damage) in attacks {
            if let Ok((mut target_health, target_id, target_anchor)) = health_query.get_mut(target)
            {
                let was_alive = target_health.is_alive && target_health.current > 0.0;
                target_health.take_damage(damage);
                if was_alive && (!target_health.is_alive || target_health.current <= 0.0) {
                    if let Some(user_id) = attacker_user_id {
                        if let Some(ref mut queue) = event_queue {
                            let mob_id = target_id
                                .map(|id| id.0.clone())
                                .or_else(|| target_anchor.map(|a| a.mob_id.clone()))
                                .unwrap_or_else(|| "mob".to_string());
                            queue.push(
                                user_id,
                                MatchEvent {
                                    event_type: "mob_kill".to_string(),
                                    target_id: mob_id.clone(),
                                    payload: serde_json::json!({ "mob_id": mob_id }),
                                },
                            );
                        }
                    }
                }
            }
        }
    }
}

pub fn cooldown_tick_system(clock: Res<SimClock>, mut query: Query<&mut CooldownTracker>) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    for mut tracker in &mut query {
        tracker.cooldowns.retain(|_, remaining| {
            *remaining -= dt;
            *remaining > 0.0
        });
    }
}

pub fn status_effect_tick_system(clock: Res<SimClock>, mut query: Query<&mut StatusEffects>) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    for mut effects in &mut query {
        if effects.freeze_timer > 0.0 {
            effects.freeze_timer = (effects.freeze_timer - dt).max(0.0);
            if effects.freeze_timer == 0.0 {
                effects.freeze_speed_multiplier = 1.0;
            }
        }
        if effects.stun_timer > 0.0 {
            effects.stun_timer = (effects.stun_timer - dt).max(0.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cooldown_tick_system_decrements_and_cleans_up() {
        let mut world = World::new();
        let clock = SimClock::new(50); // 50ms tick
        world.insert_resource(clock);

        let mut tracker = CooldownTracker::new();
        tracker.set_cooldown("skill_1", 0.08);
        tracker.set_cooldown("dash", 0.04);
        let entity = world.spawn(tracker).id();

        let mut schedule = Schedule::default();
        schedule.add_systems(cooldown_tick_system);

        // Run tick 1 (dt = 0.05s)
        schedule.run(&mut world);

        let t = world.get::<CooldownTracker>(entity).unwrap();
        // "dash" (0.04s) expired and removed
        assert!(t.can_perform(&["dash"]));
        // "skill_1" (0.08s - 0.05s = 0.03s) still active
        assert!(!t.can_perform(&["skill_1"]));
        assert!((t.get_remaining("skill_1") - 0.03).abs() < 1e-4);

        // Run tick 2 (dt = 0.05s)
        schedule.run(&mut world);

        let t = world.get::<CooldownTracker>(entity).unwrap();
        // "skill_1" expired and removed
        assert!(t.can_perform(&["skill_1"]));
        assert_eq!(t.get_remaining("skill_1"), 0.0);
    }

    #[test]
    fn test_status_effect_tick_system_expires_freeze_and_stun() {
        let mut world = World::new();
        let clock = SimClock::new(100); // 100ms tick
        world.insert_resource(clock);

        let mut effects = StatusEffects::default();
        effects.apply_freeze(0.25, 0.2);
        effects.apply_stun(0.15);
        let entity = world.spawn(effects).id();

        let mut schedule = Schedule::default();
        schedule.add_systems(status_effect_tick_system);

        // Initially stunned -> speed = 0.0
        let s0 = world.get::<StatusEffects>(entity).unwrap();
        assert!(s0.is_stunned());
        assert_eq!(s0.speed_multiplier(), 0.0);

        // Tick 1 (dt = 0.1s): stun remaining = 0.05s, freeze remaining = 0.15s
        schedule.run(&mut world);
        let s1 = world.get::<StatusEffects>(entity).unwrap();
        assert!(s1.is_stunned());
        assert_eq!(s1.speed_multiplier(), 0.0);

        // Tick 2 (dt = 0.1s): stun expired (0.0s), freeze remaining = 0.05s
        schedule.run(&mut world);
        let s2 = world.get::<StatusEffects>(entity).unwrap();
        assert!(!s2.is_stunned());
        assert_eq!(s2.speed_multiplier(), 0.2);

        // Tick 3 (dt = 0.1s): freeze expired (0.0s) -> speed reset to 1.0
        schedule.run(&mut world);
        let s3 = world.get::<StatusEffects>(entity).unwrap();
        assert!(!s3.is_stunned());
        assert_eq!(s3.speed_multiplier(), 1.0);
    }
}
