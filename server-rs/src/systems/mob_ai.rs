use crate::ai::ThreatTable;
use crate::combat::{DamageType, Element};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    AiState, CombatStats, ElementalAttributes, Health, MobAi, PlayerTag, Position, Projectile,
    Velocity,
};
use bevy_ecs::prelude::*;

#[allow(clippy::type_complexity)]
pub fn mob_ai_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    mut mobs: Query<(
        Entity,
        &Position,
        &mut Velocity,
        &mut MobAi,
        &mut ThreatTable,
        &mut CombatStats,
        &Health,
        Option<&ElementalAttributes>,
    )>,
    players: Query<(Entity, &Position, &Health, Has<PlayerTag>)>,
) {
    let current_time = clock.current_time_seconds();
    let dt = clock.delta_seconds();

    for (mob_entity, pos, mut vel, mut mob_ai, mut threat, mut stats, health, opt_attrs) in
        &mut mobs
    {
        if !health.is_alive {
            continue;
        }

        if stats.cooldown_timer > 0.0 {
            stats.cooldown_timer = (stats.cooldown_timer - dt).max(0.0);
        }

        // Update threat table: if a top target exists, check if target is alive.
        // If target dead or not found, clear target from threat table.
        let mut active_target: Option<(Entity, Position)> = None;
        while let Some(candidate) = threat.top_target(current_time) {
            match players.get(candidate) {
                Ok((_, target_pos, target_health, _)) if target_health.is_alive => {
                    active_target = Some((candidate, *target_pos));
                    break;
                }
                _ => {
                    threat.clear_target(candidate);
                }
            }
        }

        // Proximity aggro (legacy ChaseBehavior detection): with no live target and not
        // walking home after a leash, threaten the nearest live player inside chase_range.
        if active_target.is_none() && mob_ai.state != AiState::ReturnHome {
            let range_sq = mob_ai.chase_range * mob_ai.chase_range;
            let mut nearest: Option<(Entity, Position, f32)> = None;
            for (p_entity, p_pos, p_health, is_player) in &players {
                if !is_player || !p_health.is_alive {
                    continue;
                }
                let d_sq = (p_pos.x - pos.x).powi(2) + (p_pos.y - pos.y).powi(2);
                if d_sq <= range_sq && nearest.is_none_or(|(_, _, best)| d_sq < best) {
                    nearest = Some((p_entity, *p_pos, d_sq));
                }
            }
            if let Some((p_entity, p_pos, _)) = nearest {
                threat.add_threat(p_entity, 1.0, current_time);
                active_target = Some((p_entity, p_pos));
            }
        }

        // Target died / despawned mid-chase: stop and walk home instead of drifting.
        if active_target.is_none() && matches!(mob_ai.state, AiState::Chase | AiState::Attack) {
            mob_ai.state = AiState::ReturnHome;
        }

        if let Some((target_entity, target_pos)) = active_target {
            let home_dx = target_pos.x - mob_ai.home_pos.x;
            let home_dy = target_pos.y - mob_ai.home_pos.y;
            let dist_from_home = (home_dx * home_dx + home_dy * home_dy).sqrt();

            if dist_from_home > mob_ai.leash_distance {
                // Target leashed! Clear target from threat table, switch state = ReturnHome
                threat.clear_target(target_entity);
                mob_ai.state = AiState::ReturnHome;
            } else {
                let dx = target_pos.x - pos.x;
                let dy = target_pos.y - pos.y;
                let dist = (dx * dx + dy * dy).sqrt();

                if dist <= mob_ai.attack_range {
                    mob_ai.state = AiState::Attack;
                    vel.vx = 0.0;
                    vel.vy = 0.0;

                    if stats.cooldown_timer <= 0.0 {
                        stats.cooldown_timer = stats.attack_cooldown;
                        let dir_x = if dist > 0.001 { dx / dist } else { 1.0 };
                        let dir_y = if dist > 0.001 { dy / dist } else { 0.0 };
                        let mob_element = opt_attrs.map(|a| a.element).unwrap_or(Element::Neutral);

                        if mob_ai.is_ranged {
                            let speed = 200.0;
                            commands.spawn((
                                Projectile {
                                    owner: mob_entity,
                                    target: Some(target_entity),
                                    damage: stats.attack_power,
                                    damage_type: DamageType::Physical,
                                    element: mob_element,
                                    speed,
                                    radius: 8.0,
                                    max_range: mob_ai.attack_range + 50.0,
                                    traveled_distance: 0.0,
                                    lifetime: 2.0,
                                    effects: Vec::new(),
                                    is_player_projectile: false,
                                },
                                Position::new(pos.x, pos.y),
                                Velocity::new(dir_x * speed, dir_y * speed),
                            ));
                        } else {
                            let speed = 400.0;
                            commands.spawn((
                                Projectile {
                                    owner: mob_entity,
                                    target: Some(target_entity),
                                    damage: stats.attack_power,
                                    damage_type: DamageType::Physical,
                                    element: mob_element,
                                    speed,
                                    radius: 12.0,
                                    max_range: mob_ai.attack_range + 20.0,
                                    traveled_distance: 0.0,
                                    lifetime: 0.2,
                                    effects: Vec::new(),
                                    is_player_projectile: false,
                                },
                                Position::new(pos.x, pos.y),
                                Velocity::new(dir_x * speed, dir_y * speed),
                            ));
                        }
                    }
                } else if dist <= mob_ai.chase_range {
                    mob_ai.state = AiState::Chase;
                    let dir_x = if dist > 0.001 { dx / dist } else { 0.0 };
                    let dir_y = if dist > 0.001 { dy / dist } else { 0.0 };
                    vel.vx = dir_x * mob_ai.move_speed;
                    vel.vy = dir_y * mob_ai.move_speed;
                } else {
                    // Outside chase range: clear target, switch to ReturnHome
                    threat.clear_target(target_entity);
                    mob_ai.state = AiState::ReturnHome;
                }
            }
        }

        // If returning home or idling/wandering
        if mob_ai.state == AiState::ReturnHome {
            let home_dx = mob_ai.home_pos.x - pos.x;
            let home_dy = mob_ai.home_pos.y - pos.y;
            let home_dist = (home_dx * home_dx + home_dy * home_dy).sqrt();

            if home_dist <= 10.0 {
                mob_ai.state = AiState::Idle;
                vel.vx = 0.0;
                vel.vy = 0.0;
            } else {
                let dir_x = home_dx / home_dist;
                let dir_y = home_dy / home_dist;
                let return_speed = mob_ai.move_speed;
                vel.vx = dir_x * return_speed;
                vel.vy = dir_y * return_speed;
            }
        } else if mob_ai.state == AiState::Idle || mob_ai.state == AiState::Wander {
            mob_ai.wander_timer -= dt;
            if mob_ai.wander_timer <= 0.0 {
                if mob_ai.state == AiState::Idle {
                    mob_ai.state = AiState::Wander;
                    mob_ai.wander_timer = 2.0;
                    let offset_angle = (clock.current_time_seconds() * 1.5
                        + (mob_entity.to_bits() % 1000) as f32)
                        .sin()
                        * std::f32::consts::PI;
                    let offset_dist = 25.0;
                    mob_ai.wander_target = Position::new(
                        mob_ai.home_pos.x + offset_angle.cos() * offset_dist,
                        mob_ai.home_pos.y + offset_angle.sin() * offset_dist,
                    );
                } else {
                    mob_ai.state = AiState::Idle;
                    mob_ai.wander_timer = 2.0;
                    vel.vx = 0.0;
                    vel.vy = 0.0;
                }
            }

            if mob_ai.state == AiState::Wander {
                let wdx = mob_ai.wander_target.x - pos.x;
                let wdy = mob_ai.wander_target.y - pos.y;
                let wdist = (wdx * wdx + wdy * wdy).sqrt();

                if wdist <= 5.0 {
                    mob_ai.state = AiState::Idle;
                    vel.vx = 0.0;
                    vel.vy = 0.0;
                } else {
                    // Legacy WanderBehavior strolls below full speed; half move speed.
                    let wander_speed = mob_ai.move_speed * 0.5;
                    vel.vx = (wdx / wdist) * wander_speed;
                    vel.vy = (wdy / wdist) * wander_speed;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mob_ai_idle_to_chase() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let mob = world
            .spawn((
                Position::new(0.0, 0.0),
                Velocity::zero(),
                MobAi::new(Position::new(0.0, 0.0), 200.0, 20.0, false),
                ThreatTable::new(),
                CombatStats {
                    attack_power: 50.0,
                    attack_range: 20.0,
                    ..Default::default()
                },
                Health::new(100.0),
            ))
            .id();

        let player = world
            .spawn((Position::new(100.0, 0.0), Health::new(100.0), PlayerTag))
            .id();

        // Add threat so mob targets player
        world
            .get_mut::<ThreatTable>(mob)
            .unwrap()
            .add_threat(player, 100.0, 0.0);

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_ai_system);
        schedule.run(&mut world);

        let ai = world.get::<MobAi>(mob).unwrap();
        assert_eq!(ai.state, AiState::Chase);

        let vel = world.get::<Velocity>(mob).unwrap();
        assert!(vel.vx > 0.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_mob_ai_chase_to_attack_and_projectile() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let mob = world
            .spawn((
                Position::new(0.0, 0.0),
                Velocity::new(50.0, 0.0),
                MobAi::new(Position::new(0.0, 0.0), 200.0, 25.0, true), // ranged
                ThreatTable::new(),
                CombatStats {
                    attack_power: 30.0,
                    attack_range: 25.0,
                    attack_cooldown: 1.0,
                    cooldown_timer: 0.0,
                    ..Default::default()
                },
                Health::new(100.0),
            ))
            .id();

        let player = world
            .spawn((Position::new(20.0, 0.0), Health::new(100.0), PlayerTag))
            .id();

        world
            .get_mut::<ThreatTable>(mob)
            .unwrap()
            .add_threat(player, 100.0, 0.0);

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_ai_system);
        schedule.run(&mut world);

        let ai = world.get::<MobAi>(mob).unwrap();
        assert_eq!(ai.state, AiState::Attack);

        let vel = world.get::<Velocity>(mob).unwrap();
        assert_eq!(vel.vx, 0.0);
        assert_eq!(vel.vy, 0.0);

        let stats = world.get::<CombatStats>(mob).unwrap();
        assert_eq!(stats.cooldown_timer, 1.0);

        // Projectile should be spawned
        let mut proj_query = world.query::<&Projectile>();
        let projs: Vec<&Projectile> = proj_query.iter(&world).collect();
        assert_eq!(projs.len(), 1);
        assert_eq!(projs[0].owner, mob);
        assert_eq!(projs[0].target, Some(player));
        assert!(!projs[0].is_player_projectile);
    }

    #[test]
    fn test_mob_ai_leash_return_home() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let mob = world
            .spawn((
                Position::new(250.0, 0.0),
                Velocity::zero(),
                MobAi::new(Position::new(0.0, 0.0), 300.0, 20.0, false).with_leash_distance(200.0),
                ThreatTable::new(),
                CombatStats {
                    attack_power: 40.0,
                    ..Default::default()
                },
                Health::new(100.0),
            ))
            .id();

        let player = world
            .spawn((
                Position::new(260.0, 0.0), // > 200.0 from home (0,0)
                Health::new(100.0),
                PlayerTag,
            ))
            .id();

        world
            .get_mut::<ThreatTable>(mob)
            .unwrap()
            .add_threat(player, 100.0, 0.0);

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_ai_system);
        schedule.run(&mut world);

        let ai = world.get::<MobAi>(mob).unwrap();
        assert_eq!(ai.state, AiState::ReturnHome);

        let threat = world.get::<ThreatTable>(mob).unwrap();
        assert!(threat.is_empty());

        let vel = world.get::<Velocity>(mob).unwrap();
        assert!(vel.vx < 0.0); // Moving back left towards (0, 0)
    }

    #[test]
    fn test_mob_ai_return_home_stops_near_home() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let mut ai = MobAi::new(Position::new(0.0, 0.0), 200.0, 20.0, false);
        ai.state = AiState::ReturnHome;

        let mob = world
            .spawn((
                Position::new(6.0, 0.0), // <= 10.0 from home
                Velocity::new(-20.0, 0.0),
                ai,
                ThreatTable::new(),
                CombatStats::default(),
                Health::new(100.0),
            ))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_ai_system);
        schedule.run(&mut world);

        let ai = world.get::<MobAi>(mob).unwrap();
        assert_eq!(ai.state, AiState::Idle);

        let vel = world.get::<Velocity>(mob).unwrap();
        assert_eq!(vel.vx, 0.0);
        assert_eq!(vel.vy, 0.0);
    }

    #[test]
    fn test_mob_ai_clears_dead_target() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let mob = world
            .spawn((
                Position::new(0.0, 0.0),
                Velocity::zero(),
                MobAi::new(Position::new(0.0, 0.0), 200.0, 20.0, false),
                ThreatTable::new(),
                CombatStats::default(),
                Health::new(100.0),
            ))
            .id();

        let mut dead_health = Health::new(100.0);
        dead_health.take_damage(100.0);
        assert!(!dead_health.is_alive);

        let player = world
            .spawn((Position::new(50.0, 0.0), dead_health, PlayerTag))
            .id();

        world
            .get_mut::<ThreatTable>(mob)
            .unwrap()
            .add_threat(player, 100.0, 0.0);

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_ai_system);
        schedule.run(&mut world);

        let threat = world.get::<ThreatTable>(mob).unwrap();
        assert!(threat.is_empty());

        let ai = world.get::<MobAi>(mob).unwrap();
        assert_ne!(ai.state, AiState::Chase);
    }
}
