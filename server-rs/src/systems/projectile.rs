use crate::combat::{DamageCalculator, DamageOptions, SkillEffect};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    ElementalAttributes, Health, MobTag, PlayerTag, Position, Projectile, StatusEffects, Velocity,
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
    proj_query: Query<(Entity, &Position, &Projectile)>,
    mut targets: Query<(
        Entity,
        &Position,
        &mut Health,
        Option<&ElementalAttributes>,
        Option<&mut StatusEffects>,
        Has<PlayerTag>,
        Has<MobTag>,
    )>,
) {
    let default_attrs = ElementalAttributes::default();

    for (proj_entity, pos, proj) in &proj_query {
        let hit_radius = proj.radius + 20.0;
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
            for (t_entity, t_pos, t_health, _, _, is_player, is_mob) in &targets {
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
            if let Ok((_, _, mut health, opt_attrs, mut opt_status, _, _)) =
                targets.get_mut(target_entity)
            {
                if !health.is_alive {
                    continue;
                }

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

                if let Some(ref mut status) = opt_status {
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
                } else if !proj.effects.is_empty() {
                    let mut status = StatusEffects::default();
                    let mut has_status = false;
                    for effect in &proj.effects {
                        match effect {
                            SkillEffect::Freeze {
                                duration_sec,
                                speed_multiplier,
                            } => {
                                status.apply_freeze(*duration_sec, *speed_multiplier);
                                has_status = true;
                            }
                            SkillEffect::Stun { duration_sec } => {
                                status.apply_stun(*duration_sec);
                                has_status = true;
                            }
                            _ => {}
                        }
                    }
                    if has_status {
                        commands.entity(target_entity).insert(status);
                    }
                }

                commands.entity(proj_entity).despawn();
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
}
