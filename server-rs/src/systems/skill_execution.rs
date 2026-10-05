use crate::combat::get_skill;
use crate::core::clock::SimClock;
use crate::ecs::components::{
    CastingState, CooldownTracker, Health, MobTag, PlayerInputState, PlayerTag, Position,
    Projectile, Velocity,
};
use bevy_ecs::prelude::*;

#[allow(clippy::type_complexity)]
pub fn skill_execution_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    mut query: Query<(
        Entity,
        &Position,
        &PlayerInputState,
        &mut CooldownTracker,
        &mut CastingState,
        &mut Velocity,
        Has<PlayerTag>,
    )>,
    enemies: Query<(Entity, &Position, &Health, Has<MobTag>, Has<PlayerTag>)>,
) {
    let current_time = clock.current_time_seconds();

    for (entity, pos, input, mut cooldown_tracker, mut casting, mut vel, is_player) in &mut query {
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

                    let speed = 150.0;
                    let max_range = 300.0;
                    let lifetime = 5.0;

                    let proj_pos = Position::new(pos.x, pos.y);
                    let proj_vel = Velocity::new(dir_x * speed, dir_y * speed);
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
                    };

                    commands.spawn((proj_pos, proj_vel, projectile));
                }
            }
        }

        // 2. Process player input skill_slot
        if input.skill_slot > 0 && !casting.is_casting(current_time) {
            let skill_id_str = match input.skill_slot {
                1 => "skill_1",
                2 => "skill_2",
                3 => "skill_3",
                4 => "skill_4",
                5 => "skill_dash",
                _ => "",
            };

            if let Some(skill) = get_skill(skill_id_str) {
                let can_perform = if skill.id == "skill_dash" {
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
                                (1.0, 0.0)
                            }
                        };

                        vel.vx = dir_x * 160.0;
                        vel.vy = dir_y * 160.0;
                        cooldown_tracker.set_cooldown(&skill.id, skill.cooldown_sec);
                    } else {
                        // Start casting
                        casting.start_cast(&skill.id, skill.casting_time_sec, current_time);
                        cooldown_tracker.set_cooldown(&skill.id, skill.cooldown_sec);
                        if skill.gcd_sec > 0.0 {
                            cooldown_tracker.set_cooldown("global_magic_cd", skill.gcd_sec);
                        }
                        vel.vx = 0.0;
                        vel.vy = 0.0;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::Element;

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
        assert_eq!(vel.vy, 160.0);

        let cd = world.get::<CooldownTracker>(entity).unwrap();
        assert_eq!(cd.get_remaining("skill_dash"), 0.5);
        assert!(!cd.can_perform(&["skill_dash"]));
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
        // Default facing (1.0, 0.0) -> vel.vx = 160.0, vel.vy = 0.0
        assert_eq!(vel.vx, 160.0);
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
    fn test_cast_completion_spawns_projectile() {
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

        // A projectile entity was spawned directed toward the mob
        let mut proj_query = world.query::<(&Position, &Velocity, &Projectile)>();
        let mut found = false;
        for (p_pos, p_vel, proj) in proj_query.iter(&world) {
            assert_eq!(proj.owner, player);
            assert_eq!(proj.target, Some(mob));
            assert_eq!(proj.damage, 20.0);
            assert_eq!(proj.element, Element::Fire);
            assert_eq!(p_pos.x, 0.0);
            assert_eq!(p_pos.y, 0.0);
            // Mob is at (100.0, 0.0), so dir is (1.0, 0.0) -> vel.vx = 150.0, vel.vy = 0.0
            assert!((p_vel.vx - 150.0).abs() < 1e-4);
            assert_eq!(p_vel.vy, 0.0);
            found = true;
        }
        assert!(
            found,
            "Projectile should have been spawned on cast completion"
        );
    }
}
