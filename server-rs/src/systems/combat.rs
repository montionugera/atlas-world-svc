use crate::ai::ThreatTable;
use crate::combat::buffs::{AuraEmitter, BuffContainer};
use crate::combat::damage::{DamageCalculator, DamageOptions};
use crate::combat::{DamageType, Element};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    knockback_speed, CastingState, CombatStats, CooldownTracker, ElementalAttributes, EntityId, EquippedWeapon,
    Health, HealthRegen, HitLog, HitRecord, Mass, MobAi, MobSpawnAnchor, ParryState, PlayerAvatar,
    PlayerInputState, Position, Projectile, StatusEffects, Velocity, WeaponKind,
};
use crate::spatial::grid::SpatialGrid;
use crate::storage::{MatchEvent, MatchEventQueue};
use bevy_ecs::prelude::*;

#[allow(clippy::type_complexity)]
pub fn combat_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    grid: Res<SpatialGrid>,
    mut event_queue: Option<ResMut<MatchEventQueue>>,
    mut hit_log: Option<ResMut<HitLog>>,
    toggles: Option<Res<crate::debug::DebugToggles>>,
    mut params: ParamSet<(
        Query<
            (
                Entity,
                &Position,
                &mut CombatStats,
                &Health,
                Option<&EntityId>,
                Option<&PlayerAvatar>,
                Option<&mut PlayerInputState>,
                Option<&ElementalAttributes>,
                Option<&mut ParryState>,
                Option<&EquippedWeapon>,
            ),
            Without<MobAi>,
        >,
        Query<(
            &mut Health,
            Option<&EntityId>,
            Option<&MobSpawnAnchor>,
            Option<&mut ThreatTable>,
            Option<&ElementalAttributes>,
            Option<&Position>,
            Option<&mut Velocity>,
            Option<&Mass>,
            Option<&mut StatusEffects>,
            Option<&mut CastingState>,
        )>,
    )>,
) {
    let dt = clock.delta_seconds();
    let now = clock.current_time_seconds();
    let mut attacks: Vec<(Option<String>, Entity, f32, f32, Entity, f32, Element)> = Vec::new();

    {
        // Mobs with MobAi are excluded: mob_ai_system owns their attacks and their single
        // per-tick cooldown decrement.
        let mut attackers = params.p0();
        for (
            entity,
            pos,
            mut stats,
            health,
            entity_id,
            avatar,
            mut input,
            attrs,
            mut opt_parry,
            opt_weapon,
        ) in &mut attackers
        {
            // Consume the attack latch every tick, whether or not a swing happens. Clearing
            // it only on a landed swing left a released tap armed forever when nothing was in
            // reach, and projectile_collision_system reads that flag as "parrying".
            let wants_attack = input.as_ref().is_some_and(|i| i.attack);
            let holding_attack = input.as_ref().is_some_and(|i| i.attack || i.attack_held);
            if let Some(ref mut parry) = opt_parry {
                parry.tick_hold(dt, holding_attack);
            }
            if let Some(ref mut inp) = input {
                inp.attack = inp.attack_held;
            }

            if !health.is_alive {
                continue;
            }

            if stats.cooldown_timer > 0.0 {
                stats.cooldown_timer -= dt;
            }

            if stats.cooldown_timer > 0.0 {
                continue;
            }

            // Legacy attackQueue: a human avatar only swings while attack is held.
            // Bots (no PlayerAvatar) keep auto-attacking.
            if avatar.is_some() && !wants_attack {
                continue;
            }
            if avatar.is_none()
                && stats.is_player
                && toggles.as_ref().is_some_and(|t| t.bots_paused)
            {
                continue;
            }

            let is_player = stats.is_player;
            if let Some(weapon) = opt_weapon.filter(|w| w.is_ranged()) {
                stats.cooldown_timer = stats.attack_cooldown;
                let (aim_x, aim_y) = input
                    .as_ref()
                    .map_or((1.0, 0.0), |inp| inp.aim_direction(*pos));
                let attacker_elem = attrs.map(|a| a.element).unwrap_or(Element::Neutral);
                let (damage_type, skill_id) = match weapon.kind {
                    WeaponKind::Bow => (DamageType::Physical, "bow_shot"),
                    WeaponKind::Staff => (DamageType::Magical, "staff_bolt"),
                    WeaponKind::Melee => (DamageType::Physical, "melee"),
                };
                let speed = weapon.projectile_speed.max(150.0);
                let max_range = weapon.projectile_range.max(150.0);
                let radius = weapon.projectile_radius.max(3.0);
                commands.spawn((
                    Position::new(pos.x, pos.y),
                    Velocity::new(aim_x * speed, aim_y * speed),
                    Projectile {
                        owner: entity,
                        target: None,
                        damage: stats.attack_power.max(1.0),
                        damage_type,
                        element: attacker_elem,
                        speed,
                        radius,
                        max_range,
                        traveled_distance: 0.0,
                        lifetime: (max_range / speed) + 0.5,
                        effects: Vec::new(),
                        is_player_projectile: is_player,
                        aoe_radius: 0.0,
                        skill_id: Some(skill_id.to_string()),
                        detonated: false,
                    },
                ));
                continue;
            }
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
                let attacker_elem = attrs.map(|a| a.element).unwrap_or(Element::Neutral);
                attacks.push((
                    player_user_id,
                    entity,
                    pos.x,
                    pos.y,
                    target_entity,
                    stats.attack_power.max(1.0),
                    attacker_elem,
                ));
            }
        }
    }

    if !attacks.is_empty() {
        let mut health_query = params.p1();
        let default_attrs = ElementalAttributes::default();
        for (
            attacker_user_id,
            attacker,
            attacker_x,
            attacker_y,
            target,
            base_damage,
            attacker_elem,
        ) in attacks
        {
            if let Ok((
                mut target_health,
                target_id,
                target_anchor,
                threat,
                target_attrs,
                target_pos,
                mut target_vel,
                target_mass,
                mut target_status,
                mut target_casting,
            )) = health_query.get_mut(target)
            {
                let was_alive = target_health.is_alive && target_health.current > 0.0;
                let def_attrs = target_attrs.unwrap_or(&default_attrs);
                let damage_opts = DamageOptions {
                    base_damage,
                    damage_type: DamageType::Physical,
                    attack_element: attacker_elem,
                    defense_element: def_attrs.element,
                    p_def: def_attrs.p_def,
                    m_def: def_attrs.m_def,
                    armor: def_attrs.armor,
                };
                let damage = DamageCalculator::calculate(&damage_opts);
                target_health.take_damage(damage);
                if let Some(ref mut casting) = target_casting {
                    if !casting.uninterruptible {
                        casting.finish_or_cancel();
                    }
                }
                if let Some(mut threat) = threat {
                    threat.add_threat(attacker, damage, now);
                }

                // Knockback: replace the victim's velocity with a shove away from the attacker
                // (adding to it left a running victim still drifting toward the attacker).
                let victim_mass = target_mass.map(|m| m.value()).unwrap_or(25.0);
                let impulse_mag = knockback_speed(damage, victim_mass);

                if let (Some(t_pos), Some(ref mut t_vel)) = (target_pos, target_vel.as_mut()) {
                    let dx = t_pos.x - attacker_x;
                    let dy = t_pos.y - attacker_y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    let (nx, ny) = if dist > 1e-4 {
                        (dx / dist, dy / dist)
                    } else {
                        (1.0, 0.0)
                    };
                    t_vel.vx = nx * impulse_mag;
                    t_vel.vy = ny * impulse_mag;
                }
                if let Some(ref mut status) = target_status {
                    status.apply_knockback(0.2);
                }
                let killed = was_alive && (!target_health.is_alive || target_health.current <= 0.0);
                if let Some(ref mut log) = hit_log {
                    log.0.push(HitRecord {
                        attacker,
                        target,
                        amount: damage,
                        killed,
                    });
                }
                if killed {
                    if let Some(user_id) = attacker_user_id {
                        if let Some(ref mut queue) = event_queue {
                            let mob_id = target_anchor
                                .map(|a| a.mob_id.clone())
                                .or_else(|| target_id.map(|id| id.0.clone()))
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

pub fn parry_tick_system(
    clock: Res<SimClock>,
    mut query: Query<(&PlayerInputState, &mut ParryState)>,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    for (input, mut parry) in &mut query {
        parry.tick_hold(dt, input.attack || input.attack_held);
    }
}

pub fn status_effect_tick_system(
    clock: Res<SimClock>,
    mut query: Query<(&mut StatusEffects, Option<&mut Health>)>,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    for (mut effects, mut opt_health) in &mut query {
        if effects.freeze_timer > 0.0 {
            effects.freeze_timer = (effects.freeze_timer - dt).max(0.0);
            if effects.freeze_timer == 0.0 {
                effects.freeze_speed_multiplier = 1.0;
            }
        }
        if effects.stun_timer > 0.0 {
            effects.stun_timer = (effects.stun_timer - dt).max(0.0);
        }
        if effects.knockback_timer > 0.0 {
            effects.knockback_timer = (effects.knockback_timer - dt).max(0.0);
        }
        if effects.burn_timer > 0.0 {
            let active_dt = dt.min(effects.burn_timer);
            if let Some(ref mut health) = opt_health {
                if effects.burn_dps > 0.0 {
                    health.take_damage(effects.burn_dps * active_dt);
                }
            }
            effects.burn_timer = (effects.burn_timer - dt).max(0.0);
            if effects.burn_timer <= 1e-4 {
                effects.burn_timer = 0.0;
                effects.burn_dps = 0.0;
            }
        }
        if effects.poison_timer > 0.0 {
            let active_dt = dt.min(effects.poison_timer);
            if let Some(ref mut health) = opt_health {
                if effects.poison_dps > 0.0 {
                    health.take_damage(effects.poison_dps * active_dt);
                }
            }
            effects.poison_timer = (effects.poison_timer - dt).max(0.0);
            if effects.poison_timer <= 1e-4 {
                effects.poison_timer = 0.0;
                effects.poison_dps = 0.0;
            }
        }
        if effects.regen_timer > 0.0 {
            let active_dt = dt.min(effects.regen_timer);
            if let Some(ref mut health) = opt_health {
                if effects.regen_hps > 0.0 {
                    health.heal(effects.regen_hps * active_dt);
                }
            }
            effects.regen_timer = (effects.regen_timer - dt).max(0.0);
            if effects.regen_timer <= 1e-4 {
                effects.regen_timer = 0.0;
                effects.regen_hps = 0.0;
            }
        }
    }
}

/// Regenerates health over time for alive entities with `HealthRegen` or active regeneration status (E-007 Slice 6).
pub fn health_regen_system(
    clock: Res<SimClock>,
    mut query: Query<(
        &mut Health,
        Option<&HealthRegen>,
        Option<&mut StatusEffects>,
    )>,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    for (mut health, opt_regen, mut opt_status) in &mut query {
        if !health.is_alive {
            continue;
        }
        if let Some(regen) = opt_regen {
            if regen.hp_per_sec > 0.0 {
                health.heal(regen.hp_per_sec * dt);
            }
        }
        if let Some(ref mut status) = opt_status {
            if status.regen_timer > 0.0 {
                let active_dt = dt.min(status.regen_timer);
                if status.regen_hps > 0.0 {
                    health.heal(status.regen_hps * active_dt);
                }
                status.regen_timer = (status.regen_timer - dt).max(0.0);
                if status.regen_timer <= 1e-4 {
                    status.regen_timer = 0.0;
                    status.regen_hps = 0.0;
                }
            }
        }
    }
}

/// Advances tick-based buff and debuff timers on entities with `BuffContainer`
/// and periodically radiates active buffs from `AuraEmitter` components within radius.
pub fn buff_and_aura_tick_system(
    clock: Res<SimClock>,
    mut receivers: Query<(Entity, &Position, &mut BuffContainer, Option<&PlayerAvatar>)>,
    mut auras: Query<(&Position, &mut AuraEmitter)>,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }

    // 1. Advance individual buff timers on all receivers
    for (_, _, mut container, _) in &mut receivers {
        container.tick(dt);
    }

    // 2. Pulse auras to entities in radius
    for (aura_pos, mut emitter) in &mut auras {
        emitter.pulse_timer -= dt;
        if emitter.pulse_timer <= 0.0 {
            emitter.pulse_timer = emitter.pulse_interval_sec;

            let radius_sq = emitter.radius_m * emitter.radius_m;
            let buff_to_apply = emitter.aura_buff.clone();

            for (_, receiver_pos, mut container, opt_avatar) in &mut receivers {
                // If affects_allies is true, affect players
                if emitter.affects_allies && opt_avatar.is_none() {
                    continue;
                }
                let dx = receiver_pos.x - aura_pos.x;
                let dy = receiver_pos.y - aura_pos.y;
                if dx * dx + dy * dy <= radius_sq {
                    container.apply_buff(buff_to_apply.clone());
                }
            }
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

    #[test]
    fn test_combat_system_applies_knockback_impulse_to_victim() {
        use crate::{Mass, MobTag, PlayerTag, Velocity};

        let mut world = World::new();
        let clock = SimClock::new(50);
        world.insert_resource(clock);
        let mut grid = SpatialGrid::new(50.0);

        let player = world
            .spawn((
                EntityId("player-1".to_string()),
                Position::new(100.0, 100.0),
                Velocity::zero(),
                Health::new(100.0),
                PlayerTag,
                PlayerAvatar::new("player-1", 200.0),
                PlayerInputState {
                    attack: true,
                    ..Default::default()
                },
                CombatStats {
                    attack_power: 25.0,
                    defense: 5.0,
                    attack_range: 40.0,
                    attack_cooldown: 0.8,
                    cooldown_timer: 0.0,
                    is_player: true,
                },
                Mass(15.0),
            ))
            .id();

        let mob = world
            .spawn((
                EntityId("mob-1".to_string()),
                Position::new(120.0, 100.0),
                Velocity::zero(),
                Health::new(100.0),
                MobTag,
                Mass(25.0),
                CombatStats {
                    attack_power: 10.0,
                    defense: 2.0,
                    attack_range: 20.0,
                    attack_cooldown: 1.0,
                    cooldown_timer: 0.0,
                    is_player: false,
                },
            ))
            .id();

        grid.insert(player, 100.0, 100.0, true);
        grid.insert(mob, 120.0, 100.0, false);
        grid.finish_build();
        world.insert_resource(grid);

        let mut schedule = Schedule::default();
        schedule.add_systems(combat_system);
        schedule.run(&mut world);

        // Mob should have taken damage
        let mob_health = world.get::<Health>(mob).unwrap();
        assert!(mob_health.current < 100.0);

        // Mob velocity should have received knockback impulse along +X axis
        let mob_vel = world.get::<Velocity>(mob).unwrap();
        assert!(
            mob_vel.vx > 10.0,
            "expected mob velocity vx > 10.0 from impulse, got {}",
            mob_vel.vx
        );
        assert_eq!(mob_vel.vy, 0.0);
    }

    #[test]
    fn test_paused_bots_do_not_swing_until_resumed() {
        use crate::debug::DebugToggles;
        use crate::MobTag;

        let mut world = World::new();
        world.insert_resource(SimClock::new(50));
        world.insert_resource(DebugToggles {
            bots_paused: true,
            ..Default::default()
        });
        let mut grid = SpatialGrid::new(50.0);
        // A bot: a player-side attacker with no PlayerAvatar, so it swings on its own.
        let bot = world
            .spawn((
                Position::new(100.0, 100.0),
                Health::new(100.0),
                CombatStats {
                    attack_power: 25.0,
                    defense: 5.0,
                    attack_range: 40.0,
                    attack_cooldown: 0.8,
                    cooldown_timer: 0.0,
                    is_player: true,
                },
            ))
            .id();
        let mob = world
            .spawn((Position::new(120.0, 100.0), Health::new(100.0), MobTag))
            .id();
        grid.insert(bot, 100.0, 100.0, true);
        grid.insert(mob, 120.0, 100.0, false);
        grid.finish_build();
        world.insert_resource(grid);

        let mut schedule = Schedule::default();
        schedule.add_systems(combat_system);
        schedule.run(&mut world);
        assert_eq!(
            world.get::<Health>(mob).unwrap().current,
            100.0,
            "a paused bot attacked"
        );

        world.resource_mut::<DebugToggles>().bots_paused = false;
        schedule.run(&mut world);
        assert!(
            world.get::<Health>(mob).unwrap().current < 100.0,
            "a resumed bot never attacked"
        );
    }

    /// Spawns a non-AI melee attacker at (100,100) and a human player at (130,100) who is
    /// moving toward it (-X) with `vel`, then returns (world, player).
    fn knockback_world(
        vel: crate::Velocity,
        dash: crate::ecs::components::DashState,
    ) -> (World, Entity) {
        use crate::{Mass, PlayerTag};

        let mut world = World::new();
        world.insert_resource(SimClock::new(50));
        let mut grid = SpatialGrid::new(50.0);

        let attacker = world
            .spawn((
                Position::new(100.0, 100.0),
                Health::new(100.0),
                CombatStats {
                    attack_power: 10.0,
                    defense: 2.0,
                    attack_range: 40.0,
                    attack_cooldown: 5.0,
                    cooldown_timer: 0.0,
                    is_player: false,
                },
            ))
            .id();
        let player = world
            .spawn((
                Position::new(130.0, 100.0),
                vel,
                Health::new(100.0),
                PlayerTag,
                PlayerAvatar::new("player-1", 200.0),
                PlayerInputState::new(-1.0, 0.0, false, 0), // holding toward the attacker
                Mass(15.0),
                StatusEffects::default(),
                dash,
            ))
            .id();

        grid.insert(attacker, 100.0, 100.0, false);
        grid.insert(player, 130.0, 100.0, true);
        grid.finish_build();
        world.insert_resource(grid);
        (world, player)
    }

    #[test]
    fn test_hit_while_running_toward_attacker_shoves_player_away_then_returns_control() {
        use crate::ecs::components::DashState;
        use crate::systems::player_input_system;
        use crate::Velocity;

        let (mut world, player) = knockback_world(Velocity::new(-200.0, 0.0), DashState::new());

        let mut hit = Schedule::default();
        hit.add_systems(combat_system);
        hit.run(&mut world);
        assert!(world.get::<Health>(player).unwrap().current < 100.0);
        let mut prev = world.get::<Velocity>(player).unwrap().vx;
        assert!(
            prev > 0.0,
            "hit must push the player away from the attacker, got vx {prev}"
        );

        // Following ticks with the movement key still held toward the attacker.
        let mut tick = Schedule::default();
        tick.add_systems((status_effect_tick_system, player_input_system).chain());
        loop {
            tick.run(&mut world);
            if !world
                .get::<StatusEffects>(player)
                .unwrap()
                .is_knocked_back()
            {
                break;
            }
            let vx = world.get::<Velocity>(player).unwrap().vx;
            assert!(vx > 0.0, "knockback must keep pointing away, got vx {vx}");
            assert!(vx < prev, "knockback must ease out, got {vx} after {prev}");
            prev = vx;
        }
        // Shove distance is asserted on the real mob-melee path in
        // tests/live_runtime.rs (row2_mob_melee_hit_shoves_player_a_short_step).

        // Timer expired: control returns to the held input.
        let vel = world.get::<Velocity>(player).unwrap();
        assert_eq!(vel.vx, -200.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_hit_mid_dash_does_not_leave_dash_speed_slide() {
        use crate::ecs::components::DashState;
        use crate::systems::player_input_system;
        use crate::Velocity;

        let mut dash = DashState::new();
        dash.remaining_sec = 0.22;
        dash.dir_x = -1.0;
        dash.dir_y = 0.0;
        dash.speed = 450.0;
        let (mut world, player) = knockback_world(Velocity::new(-450.0, 0.0), dash);

        let mut hit = Schedule::default();
        hit.add_systems(combat_system);
        hit.run(&mut world);

        let mut tick = Schedule::default();
        tick.add_systems((status_effect_tick_system, player_input_system).chain());
        loop {
            tick.run(&mut world);
            if !world
                .get::<StatusEffects>(player)
                .unwrap()
                .is_knocked_back()
            {
                break;
            }
            let vx = world.get::<Velocity>(player).unwrap().vx;
            assert!(
                vx > 0.0,
                "dash velocity must not survive the hit, got vx {vx}"
            );
            assert!(
                vx < 450.0,
                "knockback must not be a dash-speed slide, got vx {vx}"
            );
            assert!(!world.get::<DashState>(player).unwrap().is_dashing());
        }

        assert_eq!(world.get::<Velocity>(player).unwrap().vx, -200.0);
    }
}
