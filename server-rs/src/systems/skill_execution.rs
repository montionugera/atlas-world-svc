use crate::ai::ThreatTable;
use crate::combat::{get_skill, DamageCalculator, DamageOptions, SkillEffect};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    CastingState, CooldownTracker, DashState, ElementalAttributes, Health, HitLog, HitRecord,
    LingeringZone, MobTag, PlayerInputState, PlayerTag, Position, Projectile, StatusEffects,
    Velocity,
};
use bevy_ecs::prelude::*;

#[allow(clippy::type_complexity)]
pub fn skill_execution_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    mut query: Query<(
        Entity,
        &Position,
        &mut PlayerInputState,
        &mut CooldownTracker,
        &mut CastingState,
        &mut Velocity,
        Has<PlayerTag>,
        Option<&Health>,
        Option<&mut DashState>,
        Option<&StatusEffects>,
    )>,
    enemies: Query<(Entity, &Position, &Health, Has<MobTag>, Has<PlayerTag>)>,
) {
    let current_time = clock.current_time_seconds();

    for (
        entity,
        pos,
        mut input,
        mut cooldown_tracker,
        mut casting,
        mut vel,
        is_player,
        health,
        mut dash_opt,
        status_opt,
    ) in &mut query
    {
        // The dead cannot cast: drop any in-flight cast and swallow skill presses.
        if health.is_some_and(|h| !h.is_alive) {
            casting.finish_or_cancel();
            input.skill_slot = 0;
            continue;
        }

        // 1. Process completed casts
        if let Some(skill_id) = casting.skill_id.clone() {
            if current_time >= casting.casting_until {
                casting.finish_or_cancel();

                if let Some(skill) = get_skill(&skill_id) {
                    let mut dir_x = 0.0;
                    let mut dir_y = 0.0;
                    let mut has_dir = false;
                    let mut target_entity = None;

                    // Option A: Explicit input target entity
                    if let Some(target_e) = input.target_entity {
                        if let Ok((_, t_pos, t_health, _, _)) = enemies.get(target_e) {
                            if t_health.is_alive {
                                let dx = t_pos.x - pos.x;
                                let dy = t_pos.y - pos.y;
                                let dist = (dx * dx + dy * dy).sqrt();
                                if dist > 1e-4 {
                                    dir_x = dx / dist;
                                    dir_y = dy / dist;
                                    has_dir = true;
                                    target_entity = Some(target_e);
                                }
                            }
                        }
                    }

                    // Option B: Explicit input target position
                    if !has_dir {
                        if let Some(t_pos) = input.target_pos {
                            let dx = t_pos.x - pos.x;
                            let dy = t_pos.y - pos.y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            if dist > 1e-4 {
                                dir_x = dx / dist;
                                dir_y = dy / dist;
                                has_dir = true;
                            }
                        }
                    }

                    // Option C: Nearest enemy in range
                    if !has_dir {
                        let mut nearest = None;
                        let mut min_dist_sq = f32::MAX;
                        for (e_ent, e_pos, e_health, is_mob, is_player_enemy) in &enemies {
                            if e_ent == entity || !e_health.is_alive {
                                continue;
                            }
                            if (is_player && is_mob) || (!is_player && is_player_enemy) {
                                let dx = e_pos.x - pos.x;
                                let dy = e_pos.y - pos.y;
                                let dist_sq = dx * dx + dy * dy;
                                if dist_sq < min_dist_sq {
                                    min_dist_sq = dist_sq;
                                    nearest = Some((e_ent, dx, dy, dist_sq.sqrt()));
                                }
                            }
                        }

                        if let Some((e_ent, dx, dy, dist)) = nearest {
                            if dist > 1e-4 {
                                dir_x = dx / dist;
                                dir_y = dy / dist;
                                has_dir = true;
                                target_entity = Some(e_ent);
                            }
                        }
                    }

                    // Option D: Fallback facing direction
                    if !has_dir {
                        let input_len =
                            (input.move_x * input.move_x + input.move_y * input.move_y).sqrt();
                        if input_len > 1e-4 {
                            dir_x = input.move_x / input_len;
                            dir_y = input.move_y / input_len;
                        } else {
                            let vel_len = (vel.vx * vel.vx + vel.vy * vel.vy).sqrt();
                            if vel_len > 1e-4 {
                                dir_x = vel.vx / vel_len;
                                dir_y = vel.vy / vel_len;
                            } else {
                                dir_x = 1.0;
                                dir_y = 0.0;
                            }
                        }
                    }

                    let is_aoe = skill.radius > 2.5;
                    let aoe_radius = if is_aoe { skill.radius * 10.0 } else { 0.0 };

                    let (proj_pos, proj_vel, speed, max_range, lifetime) = if is_aoe {
                        // Ground-targeted AoE skill (Meteor, Blizzard, Thunder):
                        // Detonates directly at the aimed target location!
                        let max_cast_range = 200.0;
                        let (impact_x, impact_y) = if let Some(t_pos) = input.target_pos {
                            let dx = t_pos.x - pos.x;
                            let dy = t_pos.y - pos.y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            if dist <= max_cast_range {
                                (t_pos.x, t_pos.y)
                            } else if dist > 1e-4 {
                                (
                                    pos.x + (dx / dist) * max_cast_range,
                                    pos.y + (dy / dist) * max_cast_range,
                                )
                            } else {
                                (pos.x, pos.y)
                            }
                        } else if let Some(target_e) = target_entity {
                            if let Ok((_, t_pos, _, _, _)) = enemies.get(target_e) {
                                let dx = t_pos.x - pos.x;
                                let dy = t_pos.y - pos.y;
                                let dist = (dx * dx + dy * dy).sqrt();
                                if dist <= max_cast_range {
                                    (t_pos.x, t_pos.y)
                                } else if dist > 1e-4 {
                                    (
                                        pos.x + (dx / dist) * max_cast_range,
                                        pos.y + (dy / dist) * max_cast_range,
                                    )
                                } else {
                                    (pos.x, pos.y)
                                }
                            } else {
                                (pos.x + dir_x * 80.0, pos.y + dir_y * 80.0)
                            }
                        } else {
                            (pos.x + dir_x * 80.0, pos.y + dir_y * 80.0)
                        };

                        (
                            Position::new(impact_x, impact_y),
                            Velocity::new(0.0, 0.0),
                            0.0,
                            aoe_radius,
                            0.5,
                        )
                    } else {
                        // Directional projectile / skillshot (Precision Strike, Spear, etc.)
                        let speed = 150.0;
                        let max_range = 300.0;
                        let lifetime = 5.0;
                        (
                            Position::new(pos.x, pos.y),
                            Velocity::new(dir_x * speed, dir_y * speed),
                            speed,
                            max_range,
                            lifetime,
                        )
                    };

                    let projectile = Projectile {
                        owner: entity,
                        target: target_entity,
                        damage: skill.base_damage(),
                        damage_type: skill.damage_type,
                        element: skill.element,
                        speed,
                        radius: skill.radius,
                        max_range,
                        traveled_distance: 0.0,
                        lifetime,
                        effects: skill.effects.clone(),
                        is_player_projectile: is_player,
                        aoe_radius,
                        skill_id: Some(skill.id.clone()),
                        detonated: false,
                    };

                    commands.spawn((proj_pos, proj_vel, projectile));

                    // E-007 Slice 4: Meteor Strike (skill_1) and Blizzard (skill_3) leave a
                    // lingering ground hazard field at the target location that ticks damage
                    // across 3 distinct intervals over 3.0 seconds.
                    if skill.id == "skill_1" || skill.id == "skill_3" {
                        commands.spawn((
                            proj_pos,
                            LingeringZone::new(
                                entity,
                                &skill.id,
                                aoe_radius,
                                skill.base_damage(),
                                skill.damage_type,
                                skill.element,
                                skill.effects.clone(),
                                is_player,
                            ),
                        ));
                    }
                }
            }
        }

        // 2. Process player input skill_slot.
        // Skill presses are edge-triggered: the slot is consumed on the tick it is
        // seen. Without this, PlayerInputState keeps the last slot until the next
        // client packet, so one key press re-cast the skill every cooldown and the
        // cast lock froze movement indefinitely.
        let slot = input.skill_slot;
        if slot > 0 {
            input.skill_slot = 0;
        }
        if slot > 0 && !casting.is_casting(current_time) {
            let skill_id_str = match slot {
                1 => "skill_1",
                2 => "skill_2",
                3 => "skill_3",
                4 => "skill_4",
                5 => "skill_dash",
                6 => "skill_heal",
                _ => "",
            };

            if let Some(skill) = get_skill(skill_id_str) {
                let can_perform = if skill.id == "skill_dash" {
                    // No dashing out of a knockback: it must neither fire nor spend cooldown.
                    !status_opt.is_some_and(|s| s.is_knocked_back())
                        && cooldown_tracker.can_perform(&[skill.id.as_str()])
                } else if skill.heal_amount().is_some() {
                    cooldown_tracker.can_perform(&[skill.id.as_str()])
                } else {
                    cooldown_tracker.can_perform(&[skill.id.as_str(), "global_magic_cd"])
                };

                if can_perform {
                    if skill.id == "skill_dash" {
                        // Impulse direction
                        let input_len =
                            (input.move_x * input.move_x + input.move_y * input.move_y).sqrt();
                        let (dir_x, dir_y) = if input_len > 1e-4 {
                            (input.move_x / input_len, input.move_y / input_len)
                        } else {
                            let vel_len = (vel.vx * vel.vx + vel.vy * vel.vy).sqrt();
                            if vel_len > 1e-4 {
                                (vel.vx / vel_len, vel.vy / vel_len)
                            } else {
                                input.last_facing
                            }
                        };

                        let dash_speed = 450.0;
                        let dash_duration = 0.22;
                        if let Some(ref mut dash) = dash_opt {
                            dash.remaining_sec = dash_duration;
                            dash.dir_x = dir_x;
                            dash.dir_y = dir_y;
                            dash.speed = dash_speed;
                        }
                        vel.vx = dir_x * dash_speed;
                        vel.vy = dir_y * dash_speed;
                        cooldown_tracker.set_cooldown(&skill.id, skill.cooldown_sec);
                    } else if let Some(heal_amt) = skill.heal_amount() {
                        commands.queue(move |world: &mut World| {
                            if let Some(mut h) = world.get_mut::<Health>(entity) {
                                h.heal(heal_amt);
                            }
                        });
                        cooldown_tracker.set_cooldown(&skill.id, skill.cooldown_sec);
                        if skill.gcd_sec > 0.0 {
                            cooldown_tracker.set_cooldown("global_magic_cd", skill.gcd_sec);
                        }
                    } else {
                        // Start casting
                        casting.start_cast(&skill.id, skill.casting_time_sec, current_time);
                        cooldown_tracker.set_cooldown(&skill.id, skill.cooldown_sec);
                        if skill.gcd_sec > 0.0 {
                            cooldown_tracker.set_cooldown("global_magic_cd", skill.gcd_sec);
                        }
                        // A cast must not cancel a knockback in progress.
                        if !status_opt.is_some_and(|s| s.is_knocked_back()) {
                            vel.vx = 0.0;
                            vel.vy = 0.0;
                        }
                    }
                }
            }
        }
    }
}

/// Ticks active `LingeringZone` ground fields (`Blizzard`, `Meteor Strike`) across 3 distinct
/// intervals over their lifetime, damaging and applying elemental effects to hostile targets
/// standing inside the field radius (E-007 Slice 4).
#[allow(clippy::type_complexity)]
pub fn lingering_zone_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    mut hit_log: Option<ResMut<HitLog>>,
    mut zones: Query<(Entity, &Position, &mut LingeringZone)>,
    mut targets: Query<
        (
            Entity,
            &Position,
            &mut Health,
            Option<&ElementalAttributes>,
            Option<&mut StatusEffects>,
            Has<PlayerTag>,
            Has<MobTag>,
            Option<&mut ThreatTable>,
        ),
        Without<LingeringZone>,
    >,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    let now = clock.current_time_seconds();
    let default_attrs = ElementalAttributes::default();

    for (zone_entity, zone_pos, mut zone) in &mut zones {
        zone.remaining_duration_sec -= dt;
        zone.tick_accumulator_sec += dt;

        while zone.tick_accumulator_sec + 1e-4 >= zone.tick_interval_sec
            && zone.ticks_applied < zone.max_ticks
        {
            zone.tick_accumulator_sec =
                (zone.tick_accumulator_sec - zone.tick_interval_sec).max(0.0);
            zone.ticks_applied += 1;

            let r_sq = zone.radius * zone.radius;
            for (
                t_entity,
                t_pos,
                mut t_health,
                opt_attrs,
                mut opt_status,
                is_player,
                is_mob,
                opt_threat,
            ) in &mut targets
            {
                if t_entity == zone.owner || !t_health.is_alive {
                    continue;
                }
                let is_valid_victim =
                    (zone.is_player_zone && is_mob) || (!zone.is_player_zone && is_player);
                if !is_valid_victim {
                    continue;
                }

                let dx = t_pos.x - zone_pos.x;
                let dy = t_pos.y - zone_pos.y;
                if dx * dx + dy * dy > r_sq {
                    continue;
                }

                let attrs = opt_attrs.unwrap_or(&default_attrs);
                let damage_opts = DamageOptions {
                    base_damage: zone.damage_per_tick,
                    damage_type: zone.damage_type,
                    attack_element: zone.element,
                    defense_element: attrs.element,
                    p_def: attrs.p_def,
                    m_def: attrs.m_def,
                    armor: attrs.armor,
                };
                let damage = DamageCalculator::calculate(&damage_opts);
                t_health.take_damage(damage);

                if let Some(ref mut log) = hit_log {
                    log.0.push(HitRecord {
                        attacker: zone.owner,
                        target: t_entity,
                        amount: damage,
                        killed: !t_health.is_alive || t_health.current <= 0.0,
                    });
                }

                if let Some(mut threat) = opt_threat {
                    threat.add_threat(zone.owner, damage, now);
                }

                if let Some(ref mut status) = opt_status {
                    for effect in &zone.effects {
                        match effect {
                            SkillEffect::Freeze {
                                duration_sec,
                                speed_multiplier,
                            } => {
                                status.apply_freeze(*duration_sec, *speed_multiplier);
                            }
                            SkillEffect::Stun { duration_sec } => {
                                status.apply_stun(*duration_sec);
                            }
                            _ => {}
                        }
                    }
                } else {
                    let mut status = StatusEffects::default();
                    let mut applied = false;
                    for effect in &zone.effects {
                        match effect {
                            SkillEffect::Freeze {
                                duration_sec,
                                speed_multiplier,
                            } => {
                                status.apply_freeze(*duration_sec, *speed_multiplier);
                                applied = true;
                            }
                            SkillEffect::Stun { duration_sec } => {
                                status.apply_stun(*duration_sec);
                                applied = true;
                            }
                            _ => {}
                        }
                    }
                    if applied {
                        commands.entity(t_entity).insert(status);
                    }
                }
            }
        }

        if zone.remaining_duration_sec <= 1e-4 || zone.ticks_applied >= zone.max_ticks {
            commands.entity(zone_entity).despawn();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::Element;

    #[test]
    fn test_skill_press_is_edge_triggered_and_does_not_recast() {
        // Regression: a single press of skill_1 used to stay in PlayerInputState,
        // re-casting every cooldown and freezing movement via the cast lock.
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));
        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                PlayerInputState::new(1.0, 0.0, false, 1),
                CooldownTracker::new(),
                CastingState::new(),
                Velocity::zero(),
                PlayerTag,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        assert_eq!(world.get::<PlayerInputState>(entity).unwrap().skill_slot, 0);
        assert_eq!(
            world
                .get::<CastingState>(entity)
                .unwrap()
                .skill_id
                .as_deref(),
            Some("skill_1")
        );
        // Movement input is preserved, only the one-shot skill press is consumed.
        assert_eq!(world.get::<PlayerInputState>(entity).unwrap().move_x, 1.0);

        // Expire cast + cooldowns; with no new press nothing should be re-cast.
        {
            let mut clock = world.resource_mut::<SimClock>();
            for _ in 0..200 {
                clock.advance();
            }
        }
        world
            .get_mut::<CooldownTracker>(entity)
            .unwrap()
            .cooldowns
            .clear();
        schedule.run(&mut world);
        schedule.run(&mut world);
        let casting = world.get::<CastingState>(entity).unwrap();
        assert!(casting.skill_id.is_none(), "skill must not auto re-cast");
    }

    #[test]
    fn test_dash_applies_impulse_and_sets_cooldown() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let input = PlayerInputState::new(0.0, 1.0, false, 5); // Slot 5 = Dash, facing up
        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                input,
                CooldownTracker::new(),
                CastingState::new(),
                Velocity::zero(),
                PlayerTag,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 0.0);
        assert_eq!(vel.vy, 450.0);

        let cd = world.get::<CooldownTracker>(entity).unwrap();
        assert_eq!(cd.get_remaining("skill_dash"), 0.5);
        assert!(!cd.can_perform(&["skill_dash"]));
    }

    #[test]
    fn test_dash_while_knocked_back_does_not_fire_or_spend_cooldown() {
        use crate::ecs::components::StatusEffects;

        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let mut status = StatusEffects::default();
        status.apply_knockback(0.2);

        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                PlayerInputState::new(1.0, 0.0, false, 5), // Slot 5 = Dash
                CooldownTracker::new(),
                CastingState::new(),
                Velocity::new(-80.0, 0.0), // being knocked back toward -X
                PlayerTag,
                DashState::new(),
                status,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, -80.0, "dash must not overwrite knockback velocity");
        assert_eq!(vel.vy, 0.0);
        assert!(!world.get::<DashState>(entity).unwrap().is_dashing());
        assert!(world
            .get::<CooldownTracker>(entity)
            .unwrap()
            .can_perform(&["skill_dash"]));
    }

    #[test]
    fn test_dash_default_stationary_facing_impulse() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        // Stationary with no movement input
        let input = PlayerInputState::new(0.0, 0.0, false, 5);
        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                input,
                CooldownTracker::new(),
                CastingState::new(),
                Velocity::zero(),
                PlayerTag,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        let vel = world.get::<Velocity>(entity).unwrap();
        // Default facing (1.0, 0.0) -> vel.vx = 450.0, vel.vy = 0.0
        assert_eq!(vel.vx, 450.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_magic_skill_starts_casting_and_triggers_gcd() {
        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let input = PlayerInputState::new(0.0, 0.0, false, 1); // Slot 1 = Meteor Strike (cast 1.5s, cd 5s, gcd 5s)
        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                input,
                CooldownTracker::new(),
                CastingState::new(),
                Velocity::new(10.0, 10.0),
                PlayerTag,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        let casting = world.get::<CastingState>(entity).unwrap();
        assert!(casting.is_casting(0.0));
        assert_eq!(casting.skill_id.as_deref(), Some("skill_1"));
        assert_eq!(casting.casting_until, 1.5);

        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(vel.vx, 0.0);
        assert_eq!(vel.vy, 0.0);

        let cd = world.get::<CooldownTracker>(entity).unwrap();
        assert_eq!(cd.get_remaining("skill_1"), 5.0);
        assert_eq!(cd.get_remaining("global_magic_cd"), 5.0);
        assert!(!cd.can_perform(&["skill_1"]));
        assert!(!cd.can_perform(&["skill_2", "global_magic_cd"])); // blocked by global_magic_cd
        assert!(!cd.can_perform(&get_skill("skill_2").unwrap().considering_cooldowns()));
    }

    #[test]
    fn test_cast_completion_spawns_aoe_projectile_at_target_position() {
        let mut world = World::new();
        let mut clock = SimClock::new(50);
        // Advance clock past cast duration
        clock.elapsed_ms = 1500;
        world.insert_resource(clock);

        let mut casting = CastingState::new();
        casting.start_cast("skill_1", 1.5, 0.0); // was casting until 1.5s

        let mob = world
            .spawn((Position::new(100.0, 0.0), Health::new(100.0), MobTag))
            .id();

        let player = world
            .spawn((
                Position::new(0.0, 0.0),
                PlayerInputState::new(0.0, 0.0, false, 0),
                CooldownTracker::new(),
                casting,
                Velocity::zero(),
                PlayerTag,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        // Player is no longer casting
        let player_casting = world.get::<CastingState>(player).unwrap();
        assert!(!player_casting.is_casting(1.5));
        assert!(player_casting.skill_id.is_none());

        // A ground AoE projectile entity was spawned at the mob's location (100.0, 0.0) with zero velocity
        let mut proj_query = world.query::<(&Position, &Velocity, &Projectile)>();
        let mut found = false;
        for (p_pos, p_vel, proj) in proj_query.iter(&world) {
            assert_eq!(proj.owner, player);
            assert_eq!(proj.target, Some(mob));
            assert_eq!(proj.damage, 20.0);
            assert_eq!(proj.element, Element::Fire);
            assert_eq!(p_pos.x, 100.0);
            assert_eq!(p_pos.y, 0.0);
            assert_eq!(p_vel.vx, 0.0);
            assert_eq!(p_vel.vy, 0.0);
            assert_eq!(proj.aoe_radius, 60.0);
            found = true;
        }
        assert!(
            found,
            "Ground AoE projectile should have been spawned at target position on cast completion"
        );
    }

    #[test]
    fn test_cast_start_while_knocked_back_keeps_knockback_velocity() {
        use crate::ecs::components::StatusEffects;

        let mut world = World::new();
        world.insert_resource(SimClock::new(50));

        let mut status = StatusEffects::default();
        status.apply_knockback(0.2);

        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                PlayerInputState::new(0.0, 0.0, false, 1), // Slot 1 = cast skill
                CooldownTracker::new(),
                CastingState::new(),
                Velocity::new(-80.0, 0.0), // being knocked back toward -X
                PlayerTag,
                DashState::new(),
                status,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(skill_execution_system);
        schedule.run(&mut world);

        assert!(world
            .get::<CastingState>(entity)
            .unwrap()
            .skill_id
            .is_some());
        let vel = world.get::<Velocity>(entity).unwrap();
        assert_eq!(
            vel.vx, -80.0,
            "cast start must not cancel knockback velocity"
        );
    }
}
