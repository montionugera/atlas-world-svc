use crate::ai::ThreatTable;
use crate::combat::damage::{DamageCalculator, DamageOptions};
use crate::combat::DamageType;
use crate::core::clock::SimClock;
use crate::ecs::components::*;
use bevy_ecs::prelude::*;

/// Spawns an allied companion entity bound to `owner` at `pos` (E-007 Slice 9).
pub fn spawn_companion(
    world: &mut World,
    owner: Entity,
    companion_id: impl Into<String>,
    pos: Position,
) -> Entity {
    world
        .spawn((
            EntityId(companion_id.into()),
            CompanionTag,
            CompanionAi::new(owner),
            pos,
            Velocity::zero(),
            Health::new(120.0),
            CombatStats {
                attack_power: 16.0,
                defense: 4.0,
                attack_range: 35.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: true,
            },
            ElementalAttributes::default(),
            StatusEffects::default(),
            Mass::new(15.0),
            BodyRadius(PLAYER_BODY_RADIUS),
        ))
        .id()
}

/// Steers alive companions so they follow their owner across the region and settle within
/// `follow_distance` (`<= 5.0` units) when out of combat (E-007 Slice 9).
#[allow(clippy::type_complexity)]
pub fn companion_follow_system(
    clock: Res<SimClock>,
    owners: Query<&Position, (With<PlayerTag>, Without<CompanionTag>)>,
    mobs: Query<(&Position, &Health), (With<MobTag>, Without<CompanionTag>)>,
    mut companions: Query<
        (
            &Position,
            &mut Velocity,
            &Health,
            &CompanionAi,
            Option<&StatusEffects>,
        ),
        With<CompanionTag>,
    >,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }

    for (comp_pos, mut vel, health, ai, opt_status) in companions.iter_mut() {
        if !health.is_alive {
            vel.vx = 0.0;
            vel.vy = 0.0;
            continue;
        }

        let speed_mult = opt_status.map(|s| s.speed_multiplier()).unwrap_or(1.0);
        if speed_mult <= 0.0 {
            vel.vx = 0.0;
            vel.vy = 0.0;
            continue;
        }

        let Ok(owner_pos) = owners.get(ai.owner) else {
            vel.vx = 0.0;
            vel.vy = 0.0;
            continue;
        };

        // If a hostile mob is within aggro_range of the owner or companion, yield steering to companion_combat_system.
        let has_combat_target = mobs.iter().any(|(m_pos, m_hp)| {
            if !m_hp.is_alive {
                return false;
            }
            let d_owner =
                ((m_pos.x - owner_pos.x).powi(2) + (m_pos.y - owner_pos.y).powi(2)).sqrt();
            let d_comp = ((m_pos.x - comp_pos.x).powi(2) + (m_pos.y - comp_pos.y).powi(2)).sqrt();
            d_owner <= ai.aggro_range || d_comp <= ai.aggro_range
        });
        if has_combat_target {
            continue;
        }

        let dx = owner_pos.x - comp_pos.x;
        let dy = owner_pos.y - comp_pos.y;
        let dist = (dx * dx + dy * dy).sqrt();

        if dist <= ai.follow_distance {
            vel.vx = 0.0;
            vel.vy = 0.0;
        } else {
            // Move toward the follow perimeter without overshooting in a single tick.
            let needed = (dist - ai.follow_distance * 0.5).max(0.0);
            let max_step_speed = if dt > 1e-4 {
                needed / dt
            } else {
                ai.move_speed
            };
            let speed = (ai.move_speed * speed_mult).min(max_step_speed);
            vel.vx = (dx / dist) * speed;
            vel.vy = (dy / dist) * speed;
        }
    }
}

/// Companion combat system: acquires the nearest alive hostile mob threatening the owner
/// (or within `aggro_range`), closes into melee attack range, and strikes on cooldown (E-007 Slice 10).
#[allow(clippy::type_complexity)]
pub fn companion_combat_system(
    clock: Res<SimClock>,
    owners: Query<&Position, (With<PlayerTag>, Without<CompanionTag>, Without<MobTag>)>,
    mut companions: Query<
        (
            Entity,
            &Position,
            &mut Velocity,
            &Health,
            &CompanionAi,
            &mut CombatStats,
            Option<&ElementalAttributes>,
            Option<&StatusEffects>,
        ),
        (With<CompanionTag>, Without<MobTag>),
    >,
    mut mobs: Query<
        (
            Entity,
            &Position,
            &mut Health,
            Option<&ElementalAttributes>,
            Option<&mut ThreatTable>,
        ),
        (With<MobTag>, Without<CompanionTag>),
    >,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    let current_time = (clock.elapsed_ms as f32) / 1000.0;

    for (comp_entity, comp_pos, mut vel, comp_hp, ai, mut stats, opt_comp_elem, opt_status) in
        companions.iter_mut()
    {
        if !comp_hp.is_alive {
            continue;
        }

        if stats.cooldown_timer > 0.0 {
            stats.cooldown_timer = (stats.cooldown_timer - dt).max(0.0);
        }

        let speed_mult = opt_status.map(|s| s.speed_multiplier()).unwrap_or(1.0);
        if speed_mult <= 0.0 {
            vel.vx = 0.0;
            vel.vy = 0.0;
            continue;
        }

        let owner_pos = owners.get(ai.owner).copied().unwrap_or(*comp_pos);

        // Find nearest alive mob within aggro_range of owner or companion.
        let mut nearest_mob: Option<(Entity, Position, f32)> = None;
        for (mob_entity, mob_pos, mob_hp, _, _) in mobs.iter() {
            if !mob_hp.is_alive {
                continue;
            }
            let d_owner =
                ((mob_pos.x - owner_pos.x).powi(2) + (mob_pos.y - owner_pos.y).powi(2)).sqrt();
            let d_comp =
                ((mob_pos.x - comp_pos.x).powi(2) + (mob_pos.y - comp_pos.y).powi(2)).sqrt();
            if (d_owner <= ai.aggro_range || d_comp <= ai.aggro_range)
                && nearest_mob
                    .as_ref()
                    .map(|(_, _, best_d)| d_comp < *best_d)
                    .unwrap_or(true)
            {
                nearest_mob = Some((mob_entity, *mob_pos, d_comp));
            }
        }

        let Some((target_entity, target_pos, dist_to_mob)) = nearest_mob else {
            continue;
        };

        if dist_to_mob <= stats.attack_range {
            vel.vx = 0.0;
            vel.vy = 0.0;
            if stats.cooldown_timer <= 0.0 {
                if let Ok((_, _, mut mob_hp, opt_mob_elem, opt_threat)) =
                    mobs.get_mut(target_entity)
                {
                    let comp_elem = opt_comp_elem.copied().unwrap_or_default();
                    let mob_elem = opt_mob_elem.copied().unwrap_or_default();
                    let dmg = DamageCalculator::calculate(&DamageOptions {
                        base_damage: stats.attack_power,
                        damage_type: DamageType::Physical,
                        attack_element: comp_elem.element,
                        defense_element: mob_elem.element,
                        p_def: mob_elem.p_def,
                        m_def: mob_elem.m_def,
                        armor: mob_elem.armor,
                    });
                    mob_hp.take_damage(dmg);
                    if let Some(mut threat) = opt_threat {
                        threat.add_threat(comp_entity, dmg, current_time);
                    }
                    stats.cooldown_timer = stats.attack_cooldown;
                }
            }
        } else {
            let dx = target_pos.x - comp_pos.x;
            let dy = target_pos.y - comp_pos.y;
            let needed = (dist_to_mob - stats.attack_range * 0.8).max(0.0);
            let max_step_speed = if dt > 1e-4 {
                needed / dt
            } else {
                ai.move_speed
            };
            let speed = (ai.move_speed * speed_mult).min(max_step_speed);
            vel.vx = (dx / dist_to_mob) * speed;
            vel.vy = (dy / dist_to_mob) * speed;
        }
    }
}

/// Companion respawn system: when a companion dies (`!health.is_alive`), counts down
/// `respawn_delay_sec` and revives the companion at full health near its owner (E-007 Slice 10).
#[allow(clippy::type_complexity)]
pub fn companion_respawn_system(
    clock: Res<SimClock>,
    owners: Query<&Position, (With<PlayerTag>, Without<CompanionTag>)>,
    mut companions: Query<
        (
            &mut Position,
            &mut Velocity,
            &mut Health,
            &mut CompanionAi,
            Option<&mut StatusEffects>,
        ),
        With<CompanionTag>,
    >,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }

    for (mut comp_pos, mut vel, mut health, mut ai, opt_status) in companions.iter_mut() {
        if health.is_alive {
            ai.respawn_timer_sec = 0.0;
            continue;
        }

        vel.vx = 0.0;
        vel.vy = 0.0;

        if ai.respawn_timer_sec <= 0.0 {
            ai.respawn_timer_sec = ai.respawn_delay_sec.max(0.1);
        }

        ai.respawn_timer_sec = (ai.respawn_timer_sec - dt).max(0.0);
        if ai.respawn_timer_sec <= 0.0 {
            health.current = health.max;
            health.is_alive = true;
            if let Some(mut status) = opt_status {
                *status = StatusEffects::default();
            }
            if let Ok(owner_pos) = owners.get(ai.owner) {
                comp_pos.x = owner_pos.x + ai.follow_distance * 0.5;
                comp_pos.y = owner_pos.y;
            }
        }
    }
}
