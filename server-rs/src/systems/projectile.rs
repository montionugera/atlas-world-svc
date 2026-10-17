use crate::ai::ThreatTable;
use crate::combat::{DamageCalculator, DamageOptions, SkillEffect};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    knockback_speed, ElementalAttributes, Health, HitLog, HitRecord, Mass, MobTag, Parried,
    PlayerInputState, PlayerTag, Position, Projectile, StatusEffects, Velocity,
};
use crate::spatial::grid::SpatialGrid;
use bevy_ecs::prelude::*;

pub fn projectile_kinematics_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    mut query: Query<(Entity, &mut Position, &Velocity, &mut Projectile)>,
) {
    let dt = clock.delta_seconds();
    if dt <= 0.0 {
        return;
    }
    for (entity, mut pos, vel, mut proj) in &mut query {
        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;
        proj.traveled_distance += proj.speed * dt;
        proj.lifetime -= dt;
        if proj.traveled_distance >= proj.max_range || proj.lifetime <= 0.0 {
            commands.entity(entity).despawn();
        }
    }
}

#[allow(clippy::type_complexity)]
pub fn projectile_collision_system(
    mut commands: Commands,
    grid: Res<SpatialGrid>,
    clock: Option<Res<SimClock>>,
    mut hit_log: Option<ResMut<HitLog>>,
    mut proj_query: Query<(
        Entity,
        &Position,
        Option<&mut Velocity>,
        &mut Projectile,
        Has<Parried>,
    )>,
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
            Option<&mut Velocity>,
            Option<&Mass>,
            Option<&PlayerInputState>,
        ),
        Without<Projectile>,
    >,
) {
    let now = clock.map_or(0.0, |c| c.current_time_seconds());
    let default_attrs = ElementalAttributes::default();

    for (proj_entity, pos, mut proj_vel_opt, mut proj, already_parried) in &mut proj_query {
        let hit_radius = if proj.aoe_radius > 0.0 {
            proj.aoe_radius
        } else {
            proj.radius + 20.0
        };
        let hit_radius_sq = hit_radius * hit_radius;
        let mut hit_target = None;

        // Query spatial grid first
        if proj.is_player_projectile {
            grid.for_each_mob_in_radius(
                pos.x,
                pos.y,
                hit_radius,
                |candidate, _dx, _dy, dist_sq| {
                    if hit_target.is_none() && candidate != proj.owner && dist_sq <= hit_radius_sq {
                        hit_target = Some(candidate);
                    }
                },
            );
        } else {
            grid.for_each_player_in_radius(
                pos.x,
                pos.y,
                hit_radius,
                |candidate, _dx, _dy, dist_sq| {
                    if hit_target.is_none() && candidate != proj.owner && dist_sq <= hit_radius_sq {
                        hit_target = Some(candidate);
                    }
                },
            );
        }

        // Fallback for isolated tests where spatial grid was not rebuilt
        if hit_target.is_none() {
            for (t_entity, t_pos, t_health, _, _, is_player, is_mob, _, _, _, _) in &targets {
                if t_entity == proj.owner || !t_health.is_alive {
                    continue;
                }
                if (proj.is_player_projectile && is_mob)
                    || (!proj.is_player_projectile && is_player)
                {
                    let dx = pos.x - t_pos.x;
                    let dy = pos.y - t_pos.y;
                    let dist_sq = dx * dx + dy * dy;
                    if dist_sq <= hit_radius_sq {
                        hit_target = Some(t_entity);
                        break;
                    }
                }
            }
        }

        if let Some(target_entity) = hit_target {
            if let Ok((
                _,
                t_pos,
                mut health,
                opt_attrs,
                mut opt_status,
                is_player,
                _is_mob,
                threat,
                mut opt_vel,
                opt_mass,
                opt_input,
            )) = targets.get_mut(target_entity)
            {
                if !health.is_alive {
                    continue;
                }

                // Check for Melee Attack Parry / Deflection:
                // If projectile is an enemy projectile and target is a player swinging an attack:
                let is_parry = if !proj.is_player_projectile && is_player {
                    if let Some(input) = opt_input {
                        if input.attack {
                            let dx = pos.x - t_pos.x;
                            let dy = pos.y - t_pos.y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            if dist <= 55.0 {
                                let has_move = input.move_x * input.move_x
                                    + input.move_y * input.move_y
                                    > 1e-4;
                                if has_move {
                                    let h_len = (input.move_x * input.move_x
                                        + input.move_y * input.move_y)
                                        .sqrt();
                                    let (hx, hy) = (input.move_x / h_len, input.move_y / h_len);
                                    let dot = if dist > 1e-4 {
                                        (dx / dist) * hx + (dy / dist) * hy
                                    } else {
                                        1.0
                                    };
                                    dot >= 0.5 // 60 degree deflection cone
                                } else {
                                    true // Stationary swing faces into incoming threat
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                if is_parry && already_parried {
                    // Second parry: destroy it, so it can never bounce a third time
                    commands.entity(proj_entity).despawn();
                    continue;
                }

                if is_parry {
                    commands.entity(proj_entity).insert(Parried);

                    let dx = pos.x - t_pos.x;
                    let dy = pos.y - t_pos.y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    let (nx, ny) = if dist > 1e-4 {
                        (dx / dist, dy / dist)
                    } else {
                        (1.0, 0.0)
                    };

                    let speed = proj_vel_opt.as_ref().map_or(proj.speed, |v| {
                        (v.vx * v.vx + v.vy * v.vy).sqrt().max(proj.speed)
                    });

                    // Geometric reflection across normal
                    let (mut new_vx, mut new_vy) = if let Some(ref v) = proj_vel_opt {
                        let dot = v.vx * nx + v.vy * ny;
                        if dot < 0.0 {
                            (v.vx - 2.0 * dot * nx, v.vy - 2.0 * dot * ny)
                        } else {
                            (nx * speed, ny * speed)
                        }
                    } else {
                        (nx * speed, ny * speed)
                    };

                    let new_len = (new_vx * new_vx + new_vy * new_vy).sqrt();
                    if new_len > 1e-4 {
                        new_vx = (new_vx / new_len) * speed;
                        new_vy = (new_vy / new_len) * speed;
                    }

                    if let Some(ref mut p_vel) = proj_vel_opt {
                        p_vel.vx = new_vx;
                        p_vel.vy = new_vy;
                    }

                    // Flip projectile ownership & properties
                    proj.is_player_projectile = true;
                    proj.owner = target_entity;
                    proj.target = None;
                    proj.damage = (proj.damage * 1.2).max(1.0);
                    proj.traveled_distance = 0.0;
                    proj.lifetime = 4.0;

                    // Apply 20% recoil impulse to player
                    let raw_impulse = (proj.damage * 20.0).clamp(1.0, 2000.0);
                    let victim_mass = opt_mass.map(|m| m.value()).unwrap_or(25.0);
                    let recoil_mag = (raw_impulse / victim_mass) * 0.2;
                    if let Some(ref mut t_vel) = opt_vel {
                        t_vel.vx -= nx * recoil_mag;
                        t_vel.vy -= ny * recoil_mag;
                    }

                    if let Some(ref mut log) = hit_log {
                        log.0.push(HitRecord {
                            attacker: target_entity,
                            target: proj_entity,
                            amount: 0.0,
                            killed: false,
                        });
                    }

                    // Parry successful: projectile redirected, no damage to player
                    continue;
                }

                // If not parried: resolve damage!
                if proj.aoe_radius > 0.0 {
                    if proj.detonated {
                        continue;
                    }
                    proj.detonated = true;

                    // Detonate AoE!
                    let aoe_r = proj.aoe_radius;
                    let aoe_r_sq = aoe_r * aoe_r;
                    let mut aoe_victims = Vec::new();

                    if proj.is_player_projectile {
                        grid.for_each_mob_in_radius(pos.x, pos.y, aoe_r, |cand, _, _, dist_sq| {
                            if cand != proj.owner && dist_sq <= aoe_r_sq {
                                aoe_victims.push(cand);
                            }
                        });
                    } else {
                        grid.for_each_player_in_radius(
                            pos.x,
                            pos.y,
                            aoe_r,
                            |cand, _, _, dist_sq| {
                                if cand != proj.owner && dist_sq <= aoe_r_sq {
                                    aoe_victims.push(cand);
                                }
                            },
                        );
                    }

                    if aoe_victims.is_empty() {
                        for (v_entity, v_pos, v_health, _, _, is_p, is_m, _, _, _, _) in
                            targets.iter()
                        {
                            if v_entity == proj.owner || !v_health.is_alive {
                                continue;
                            }
                            if (proj.is_player_projectile && is_m)
                                || (!proj.is_player_projectile && is_p)
                            {
                                let dx = pos.x - v_pos.x;
                                let dy = pos.y - v_pos.y;
                                if dx * dx + dy * dy <= aoe_r_sq {
                                    aoe_victims.push(v_entity);
                                }
                            }
                        }
                    }

                    if !aoe_victims.contains(&target_entity) {
                        aoe_victims.push(target_entity);
                    }

                    for victim in aoe_victims {
                        if let Ok((
                            _,
                            v_pos,
                            mut v_health,
                            v_attrs,
                            mut v_status,
                            _,
                            _,
                            v_threat,
                            mut v_vel,
                            v_mass,
                            _,
                        )) = targets.get_mut(victim)
                        {
                            if !v_health.is_alive {
                                continue;
                            }

                            let attrs = v_attrs.unwrap_or(&default_attrs);
                            let damage_opts = DamageOptions {
                                base_damage: proj.damage,
                                damage_type: proj.damage_type,
                                attack_element: proj.element,
                                defense_element: attrs.element,
                                p_def: attrs.p_def,
                                m_def: attrs.m_def,
                                armor: attrs.armor,
                            };
                            let damage = DamageCalculator::calculate(&damage_opts);
                            v_health.take_damage(damage);

                            // Radial impulse directed outward from explosion center
                            let dx = v_pos.x - pos.x;
                            let dy = v_pos.y - pos.y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            let (nx, ny) = if dist > 1e-4 {
                                (dx / dist, dy / dist)
                            } else {
                                (1.0, 0.0)
                            };

                            let victim_mass = v_mass.map(|m| m.value()).unwrap_or(25.0);
                            let impulse_mag = knockback_speed(damage, victim_mass);

                            if let Some(ref mut vel) = v_vel {
                                vel.vx = nx * impulse_mag;
                                vel.vy = ny * impulse_mag;
                            }

                            if let Some(ref mut log) = hit_log {
                                log.0.push(HitRecord {
                                    attacker: proj.owner,
                                    target: victim,
                                    amount: damage,
                                    killed: !v_health.is_alive || v_health.current <= 0.0,
                                });
                            }

                            if let Some(mut threat) = v_threat {
                                threat.add_threat(proj.owner, damage, now);
                            }

                            if let Some(ref mut status) = v_status {
                                status.apply_knockback(0.2);
                                for effect in &proj.effects {
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
                                status.apply_knockback(0.2);
                                for effect in &proj.effects {
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
                                commands.entity(victim).insert(status);
                            }
                        }
                    }

                    if proj.speed == 0.0 {
                        proj.lifetime = 0.3;
                    } else {
                        commands.entity(proj_entity).despawn();
                    }
                } else {
                    let attrs = opt_attrs.unwrap_or(&default_attrs);
                    let damage_opts = DamageOptions {
                        base_damage: proj.damage,
                        damage_type: proj.damage_type,
                        attack_element: proj.element,
                        defense_element: attrs.element,
                        p_def: attrs.p_def,
                        m_def: attrs.m_def,
                        armor: attrs.armor,
                    };
                    let damage = DamageCalculator::calculate(&damage_opts);
                    health.take_damage(damage);

                    let victim_mass = opt_mass.map(|m| m.value()).unwrap_or(25.0);
                    let impulse_mag = knockback_speed(damage, victim_mass);

                    let (nx, ny) = if let Some(ref p_vel) = proj_vel_opt {
                        let speed = (p_vel.vx * p_vel.vx + p_vel.vy * p_vel.vy).sqrt();
                        if speed > 1e-4 {
                            (p_vel.vx / speed, p_vel.vy / speed)
                        } else {
                            let dx = t_pos.x - pos.x;
                            let dy = t_pos.y - pos.y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            if dist > 1e-4 {
                                (dx / dist, dy / dist)
                            } else {
                                (1.0, 0.0)
                            }
                        }
                    } else {
                        let dx = t_pos.x - pos.x;
                        let dy = t_pos.y - pos.y;
                        let dist = (dx * dx + dy * dy).sqrt();
                        if dist > 1e-4 {
                            (dx / dist, dy / dist)
                        } else {
                            (1.0, 0.0)
                        }
                    };

                    if let Some(ref mut t_vel) = opt_vel {
                        t_vel.vx = nx * impulse_mag;
                        t_vel.vy = ny * impulse_mag;
                    }

                    if let Some(ref mut log) = hit_log {
                        log.0.push(HitRecord {
                            attacker: proj.owner,
                            target: target_entity,
                            amount: damage,
                            killed: !health.is_alive || health.current <= 0.0,
                        });
                    }

                    if let Some(mut threat) = threat {
                        threat.add_threat(proj.owner, damage, now);
                    }

                    if let Some(ref mut status) = opt_status {
                        status.apply_knockback(0.2);
                        for effect in &proj.effects {
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
                        status.apply_knockback(0.2);
                        for effect in &proj.effects {
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
                        commands.entity(target_entity).insert(status);
                    }

                    commands.entity(proj_entity).despawn();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::{DamageType, Element};

    #[test]
    fn test_projectile_movement_and_max_range_despawn() {
        let mut world = World::new();
        let clock = SimClock::new(50); // 50ms tick
        world.insert_resource(clock);

        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                Velocity::new(100.0, 0.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: None,
                    damage: 20.0,
                    damage_type: DamageType::Magical,
                    element: Element::Fire,
                    speed: 100.0,
                    radius: 2.0,
                    max_range: 15.0,
                    traveled_distance: 0.0,
                    lifetime: 5.0,
                    effects: vec![],
                    is_player_projectile: true,
                    aoe_radius: 0.0,
                    skill_id: None,
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_kinematics_system);

        // Tick 1 (dt = 0.05s): moved 5.0 units, traveled = 5.0
        schedule.run(&mut world);
        assert!(world.get_entity(entity).is_ok());
        let pos = world.get::<Position>(entity).unwrap();
        assert!((pos.x - 5.0).abs() < 1e-4);

        // Tick 2 (dt = 0.05s): moved 10.0 units, traveled = 10.0
        schedule.run(&mut world);
        assert!(world.get_entity(entity).is_ok());

        // Tick 3 (dt = 0.05s): moved 15.0 units, traveled = 15.0 >= max_range (15.0) -> despawns!
        schedule.run(&mut world);
        assert!(world.get_entity(entity).is_err());
    }

    #[test]
    fn test_projectile_lifetime_despawn() {
        let mut world = World::new();
        let clock = SimClock::new(100); // 100ms tick
        world.insert_resource(clock);

        let entity = world
            .spawn((
                Position::new(0.0, 0.0),
                Velocity::new(0.0, 0.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: None,
                    damage: 10.0,
                    damage_type: DamageType::Physical,
                    element: Element::Neutral,
                    speed: 0.0,
                    radius: 1.0,
                    max_range: 1000.0,
                    traveled_distance: 0.0,
                    lifetime: 0.15,
                    effects: vec![],
                    is_player_projectile: true,
                    aoe_radius: 0.0,
                    skill_id: None,
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_kinematics_system);

        // Tick 1: lifetime = 0.05
        schedule.run(&mut world);
        assert!(world.get_entity(entity).is_ok());

        // Tick 2: lifetime = -0.05 <= 0.0 -> despawned
        schedule.run(&mut world);
        assert!(world.get_entity(entity).is_err());
    }

    #[test]
    fn test_projectile_collision_damages_mob_and_applies_freeze() {
        let mut world = World::new();
        let grid = SpatialGrid::new_with_bounds(25.0, 500.0, 500.0);
        world.insert_resource(grid);

        let mob = world
            .spawn((
                Position::new(50.0, 50.0),
                Health::new(100.0),
                ElementalAttributes::new(Element::Fire, 0.0, 0.0, 0.0),
                StatusEffects::default(),
                MobTag,
            ))
            .id();

        // Blizzard projectile (Water element vs Fire mob = 2.0x multiplier!)
        let proj = world
            .spawn((
                Position::new(50.0, 50.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: Some(mob),
                    damage: 30.0,
                    damage_type: DamageType::Magical,
                    element: Element::Water,
                    speed: 150.0,
                    radius: 5.0,
                    max_range: 300.0,
                    traveled_distance: 0.0,
                    lifetime: 5.0,
                    effects: vec![
                        SkillEffect::Damage(30.0),
                        SkillEffect::Freeze {
                            duration_sec: 5.0,
                            speed_multiplier: 0.2,
                        },
                    ],
                    is_player_projectile: true,
                    aoe_radius: 0.0,
                    skill_id: Some("skill_3".to_string()),
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        // Projectile should be despawned
        assert!(world.get_entity(proj).is_err());

        // Mob took 30 * 2.0 = 60 damage -> health = 40.0
        let health = world.get::<Health>(mob).unwrap();
        assert_eq!(health.current, 40.0);

        // Mob has freeze applied
        let status = world.get::<StatusEffects>(mob).unwrap();
        assert_eq!(status.freeze_timer, 5.0);
        assert_eq!(status.speed_multiplier(), 0.2);
    }

    #[test]
    fn test_projectile_collision_applies_stun() {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let mob = world
            .spawn((
                Position::new(10.0, 10.0),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                MobTag,
            ))
            .id();

        let proj = world
            .spawn((
                Position::new(10.0, 10.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: None,
                    damage: 25.0,
                    damage_type: DamageType::Magical,
                    element: Element::Wind,
                    speed: 150.0,
                    radius: 4.0,
                    max_range: 300.0,
                    traveled_distance: 0.0,
                    lifetime: 5.0,
                    effects: vec![SkillEffect::Stun { duration_sec: 1.2 }],
                    is_player_projectile: true,
                    aoe_radius: 0.0,
                    skill_id: Some("skill_4".to_string()),
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        assert!(world.get_entity(proj).is_err());
        let status = world.get::<StatusEffects>(mob).unwrap();
        assert!(status.is_stunned());
        assert_eq!(status.stun_timer, 1.2);
    }

    #[test]
    fn test_projectile_collision_applies_knockback_impulse() {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let mob = world
            .spawn((
                Position::new(50.0, 50.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(25.0),
                MobTag,
            ))
            .id();

        // Projectile traveling East (+X) with speed 200.0
        let proj = world
            .spawn((
                Position::new(50.0, 50.0),
                Velocity::new(200.0, 0.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: None,
                    damage: 25.0,
                    damage_type: DamageType::Physical,
                    element: Element::Neutral,
                    speed: 200.0,
                    radius: 4.0,
                    max_range: 300.0,
                    traveled_distance: 0.0,
                    lifetime: 5.0,
                    effects: vec![],
                    is_player_projectile: true,
                    aoe_radius: 0.0,
                    skill_id: None,
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        // Projectile despawns on hit
        assert!(world.get_entity(proj).is_err());

        // Mob is shoved along +X axis: knockback_speed(25 dmg, mass 25) = 3600 / 25 = 144.0
        let vel = world.get::<Velocity>(mob).unwrap();
        assert!(
            vel.vx > 10.0,
            "expected mob velocity vx > 10.0 from projectile impulse, got {}",
            vel.vx
        );
        assert_eq!(vel.vy, 0.0);
    }

    /// A mob moving West at run speed (toward the shooter) and a player projectile of
    /// `aoe_radius` travelling East, spawned at `proj_x` on the mob's row.
    fn hit_mob_running_at_shooter(proj_x: f32, aoe_radius: f32) -> crate::Velocity {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let mob = world
            .spawn((
                Position::new(50.0, 50.0),
                Velocity::new(-200.0, 0.0),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(25.0),
                MobTag,
            ))
            .id();
        world.spawn((
            Position::new(proj_x, 50.0),
            Velocity::new(200.0, 0.0),
            Projectile {
                owner: Entity::PLACEHOLDER,
                target: None,
                damage: 25.0,
                damage_type: DamageType::Physical,
                element: Element::Neutral,
                speed: 200.0,
                radius: 4.0,
                max_range: 300.0,
                traveled_distance: 0.0,
                lifetime: 5.0,
                effects: vec![],
                is_player_projectile: true,
                aoe_radius,
                skill_id: None,
                detonated: false,
            },
        ));

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        assert!(world.get::<Health>(mob).unwrap().current < 100.0);
        *world.get::<Velocity>(mob).unwrap()
    }

    #[test]
    fn test_projectile_direct_hit_knockback_replaces_velocity_toward_shooter() {
        let vel = hit_mob_running_at_shooter(50.0, 0.0);
        assert!(
            vel.vx > 0.0,
            "hit must shove away from the shooter, got vx {}",
            vel.vx
        );
    }

    #[test]
    fn test_projectile_aoe_knockback_replaces_velocity_toward_blast() {
        // Blast centre 10 u West of the mob: the radial shove points East.
        let vel = hit_mob_running_at_shooter(40.0, 60.0);
        assert!(
            vel.vx > 0.0,
            "blast must shove away from its centre, got vx {}",
            vel.vx
        );
    }

    #[test]
    fn test_projectile_aoe_detonation_damages_multiple_mobs() {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let mob1 = world
            .spawn((
                Position::new(100.0, 100.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(25.0),
                MobTag,
            ))
            .id();

        let mob2 = world
            .spawn((
                Position::new(130.0, 100.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(25.0),
                MobTag,
            ))
            .id();

        let mob3 = world
            .spawn((
                Position::new(100.0, 140.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(25.0),
                MobTag,
            ))
            .id();

        let mob_far = world
            .spawn((
                Position::new(300.0, 300.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(25.0),
                MobTag,
            ))
            .id();

        let proj = world
            .spawn((
                Position::new(100.0, 100.0),
                Velocity::new(100.0, 0.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: None,
                    damage: 30.0,
                    damage_type: DamageType::Magical,
                    element: Element::Fire,
                    speed: 150.0,
                    radius: 6.0,
                    max_range: 300.0,
                    traveled_distance: 0.0,
                    lifetime: 5.0,
                    effects: vec![],
                    is_player_projectile: true,
                    aoe_radius: 60.0,
                    skill_id: Some("skill_1".to_string()),
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        assert!(world.get_entity(proj).is_err());
        assert!(world.get::<Health>(mob1).unwrap().current < 100.0);
        assert!(world.get::<Health>(mob2).unwrap().current < 100.0);
        assert!(world.get::<Health>(mob3).unwrap().current < 100.0);

        let vel2 = world.get::<Velocity>(mob2).unwrap();
        assert!(vel2.vx > 0.0, "mob2 should receive eastward radial impulse");

        let vel3 = world.get::<Velocity>(mob3).unwrap();
        assert!(
            vel3.vy > 0.0,
            "mob3 should receive southward radial impulse"
        );

        assert_eq!(world.get::<Health>(mob_far).unwrap().current, 100.0);
    }

    #[test]
    fn test_projectile_melee_parry_deflects_and_recoils() {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let player = world
            .spawn((
                Position::new(50.0, 50.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(20.0),
                PlayerTag,
                PlayerInputState {
                    attack: true,
                    ..Default::default()
                },
            ))
            .id();

        let proj = world
            .spawn((
                Position::new(60.0, 50.0),
                Velocity::new(-200.0, 0.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: Some(player),
                    damage: 20.0,
                    damage_type: DamageType::Physical,
                    element: Element::Neutral,
                    speed: 200.0,
                    radius: 4.0,
                    max_range: 300.0,
                    traveled_distance: 100.0,
                    lifetime: 1.5,
                    effects: vec![],
                    is_player_projectile: false,
                    aoe_radius: 0.0,
                    skill_id: Some("spear".to_string()),
                    detonated: false,
                },
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        assert!(world.get_entity(proj).is_ok());

        let proj_comp = world.get::<Projectile>(proj).unwrap();
        assert!(
            proj_comp.is_player_projectile,
            "projectile should become player-owned"
        );
        assert_eq!(proj_comp.owner, player);
        assert_eq!(proj_comp.damage, 24.0);

        let proj_vel = world.get::<Velocity>(proj).unwrap();
        assert!(
            proj_vel.vx > 100.0,
            "reflected vx should be positive, got {}",
            proj_vel.vx
        );

        assert_eq!(world.get::<Health>(player).unwrap().current, 100.0);

        let player_vel = world.get::<Velocity>(player).unwrap();
        assert!(
            player_vel.vx < 0.0,
            "player should experience recoil impulse, got vx={}",
            player_vel.vx
        );

        assert!(
            world.get::<Parried>(proj).is_some(),
            "a reflected projectile must be marked as already parried"
        );
    }

    #[test]
    fn test_projectile_second_parry_destroys_instead_of_reflecting() {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let player = world
            .spawn((
                Position::new(50.0, 50.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(20.0),
                PlayerTag,
                PlayerInputState {
                    attack: true,
                    ..Default::default()
                },
            ))
            .id();

        // Already reflected once, then sent back at a player.
        let proj = world
            .spawn((
                Position::new(60.0, 50.0),
                Velocity::new(-200.0, 0.0),
                Projectile {
                    owner: Entity::PLACEHOLDER,
                    target: Some(player),
                    damage: 20.0,
                    damage_type: DamageType::Physical,
                    element: Element::Neutral,
                    speed: 200.0,
                    radius: 4.0,
                    max_range: 300.0,
                    traveled_distance: 100.0,
                    lifetime: 1.5,
                    effects: vec![],
                    is_player_projectile: false,
                    aoe_radius: 0.0,
                    skill_id: Some("spear".to_string()),
                    detonated: false,
                },
                Parried,
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        assert!(
            world.get_entity(proj).is_err(),
            "a second parry must destroy the projectile"
        );
        assert_eq!(world.get::<Health>(player).unwrap().current, 100.0);
        assert_eq!(*world.get::<Velocity>(player).unwrap(), Velocity::zero());
    }

    #[test]
    fn test_projectile_already_parried_still_hits_a_player_not_swinging() {
        let mut world = World::new();
        world.insert_resource(SpatialGrid::default());

        let player = world
            .spawn((
                Position::new(50.0, 50.0),
                Velocity::zero(),
                Health::new(100.0),
                ElementalAttributes::default(),
                StatusEffects::default(),
                Mass(20.0),
                PlayerTag,
                PlayerInputState::default(),
            ))
            .id();

        // Already reflected once, then sent back at a player.
        world.spawn((
            Position::new(60.0, 50.0),
            Velocity::new(-200.0, 0.0),
            Projectile {
                owner: Entity::PLACEHOLDER,
                target: Some(player),
                damage: 20.0,
                damage_type: DamageType::Physical,
                element: Element::Neutral,
                speed: 200.0,
                radius: 4.0,
                max_range: 300.0,
                traveled_distance: 100.0,
                lifetime: 1.5,
                effects: vec![],
                is_player_projectile: false,
                aoe_radius: 0.0,
                skill_id: Some("spear".to_string()),
                detonated: false,
            },
            Parried,
        ));

        let mut schedule = Schedule::default();
        schedule.add_systems(projectile_collision_system);
        schedule.run(&mut world);

        assert!(
            world.get::<Health>(player).unwrap().current < 100.0,
            "without a swing, an already-parried projectile must still deal damage"
        );
    }
}
