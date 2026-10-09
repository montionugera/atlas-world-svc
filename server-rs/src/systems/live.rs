use crate::core::clock::SimClock;
use crate::ecs::components::{
    BodyRadius, Health, LiveRules, PlayerRespawnTimer, PlayerTag, Position, SpawnPoint, Velocity,
};
use crate::systems::steering::ArenaBounds;
use bevy_ecs::prelude::*;

/// Relaxation passes per tick; exits early once no pair overlaps. Dense crowds that hit
/// the cap keep resolving on following ticks.
const COLLISION_ITERATIONS: usize = 32;
/// Tiny slop so a resolved pair is not re-detected from float error.
const COLLISION_SLOP: f32 = 1e-3;

fn clamp_to(bounds: &ArenaBounds, x: f32, y: f32) -> (f32, f32) {
    (x.clamp(0.0, bounds.width), y.clamp(0.0, bounds.height))
}

fn resolve_against_statics(
    bounds: &ArenaBounds,
    statics: &[crate::content::map::StaticObstacle],
    x: &mut f32,
    y: &mut f32,
    r: f32,
) {
    for obs in statics {
        let cx = x.clamp(obs.min_x, obs.max_x);
        let cy = y.clamp(obs.min_y, obs.max_y);
        let dx = *x - cx;
        let dy = *y - cy;
        let d2 = dx * dx + dy * dy;
        if d2 < r * r {
            if d2 > 1e-6 {
                let d = d2.sqrt();
                let push = r - d + COLLISION_SLOP;
                *x += (dx / d) * push;
                *y += (dy / d) * push;
            } else {
                let left = *x - obs.min_x;
                let right = obs.max_x - *x;
                let top = *y - obs.min_y;
                let bottom = obs.max_y - *y;
                let min_edge = left.min(right).min(top).min(bottom);
                if min_edge == left {
                    *x = obs.min_x - r - COLLISION_SLOP;
                } else if min_edge == right {
                    *x = obs.max_x + r + COLLISION_SLOP;
                } else if min_edge == top {
                    *y = obs.min_y - r - COLLISION_SLOP;
                } else {
                    *y = obs.max_y + r + COLLISION_SLOP;
                }
            }
            let (cx, cy) = clamp_to(bounds, *x, *y);
            *x = cx;
            *y = cy;
        }
    }
}

/// Positional push-out so live bodies (players, bots, mobs) do not overlap: pairs are
/// pushed to `r1 + r2` apart, static obstacles block movement, and all bodies are clamped
/// to the arena.
pub fn body_collision_system(
    bounds: Res<ArenaBounds>,
    statics: Option<Res<crate::content::map::StaticObstacles>>,
    mut query: Query<(Entity, &mut Position, &BodyRadius, &Health)>,
) {
    let mut bodies: Vec<(Entity, f32, f32, f32)> = query
        .iter()
        .filter(|(_, _, _, h)| h.is_alive)
        .map(|(e, p, r, _)| (e, p.x, p.y, r.0))
        .collect();

    // 1. Resolve static obstacle collisions first for all bodies
    if let Some(statics) = &statics {
        for body in &mut bodies {
            resolve_against_statics(
                &bounds,
                &statics.obstacles,
                &mut body.1,
                &mut body.2,
                body.3,
            );
        }
    }

    if bodies.len() >= 2 {
        let max_r = bodies.iter().map(|b| b.3).fold(0.0f32, f32::max);

        for _ in 0..COLLISION_ITERATIONS {
            // Sweep-and-prune on x; entity bits break ties deterministically.
            bodies.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
            let mut any = false;
            for i in 0..bodies.len() {
                for j in (i + 1)..bodies.len() {
                    let (_, ax, ay, ar) = bodies[i];
                    let (_, bx, by, br) = bodies[j];
                    if bx - ax > ar + max_r {
                        break;
                    }
                    let rsum = ar + br;
                    let (dx, dy) = (bx - ax, by - ay);
                    let d = (dx * dx + dy * dy).sqrt();
                    if d >= rsum {
                        continue;
                    }
                    any = true;
                    let (nx, ny) = if d > 1e-4 {
                        (dx / d, dy / d)
                    } else {
                        let seed =
                            (bodies[i].0.index() ^ bodies[j].0.index().rotate_left(7)) as f32;
                        let a = seed * 2.399_963;
                        (a.cos(), a.sin())
                    };
                    let half = (rsum - d) * 0.5 + COLLISION_SLOP;
                    let (mut ax2, mut ay2) = clamp_to(&bounds, ax - nx * half, ay - ny * half);
                    let (mut bx2, mut by2) = clamp_to(&bounds, bx + nx * half, by + ny * half);
                    let rem = rsum - ((bx2 - ax2).powi(2) + (by2 - ay2).powi(2)).sqrt();
                    if rem > 0.0 {
                        let push = rem + COLLISION_SLOP;
                        (ax2, ay2) = clamp_to(&bounds, ax2 - nx * push, ay2 - ny * push);
                        (bx2, by2) = clamp_to(&bounds, bx2 + nx * push, by2 + ny * push);
                    }
                    if let Some(statics) = &statics {
                        resolve_against_statics(
                            &bounds,
                            &statics.obstacles,
                            &mut ax2,
                            &mut ay2,
                            ar,
                        );
                        resolve_against_statics(
                            &bounds,
                            &statics.obstacles,
                            &mut bx2,
                            &mut by2,
                            br,
                        );
                    }
                    bodies[i].1 = ax2;
                    bodies[i].2 = ay2;
                    bodies[j].1 = bx2;
                    bodies[j].2 = by2;
                }
            }
            if !any {
                break;
            }
        }
    }

    // Write back resolved positions to the world query
    for (e, x, y, _) in bodies {
        if let Ok((_, mut pos, _, _)) = query.get_mut(e) {
            if pos.x != x || pos.y != y {
                pos.x = x;
                pos.y = y;
            }
        }
    }
}

/// Live bot AI: steers bots to acquire nearest mob within vision range (300u), approaches,
/// and attacks when within melee reach. When no mob is in vision, falls back to boundary
/// margin avoidance and wandering.
#[allow(clippy::type_complexity)]
pub fn live_bot_ai_system(
    clock: Res<SimClock>,
    mut prng: ResMut<crate::core::prng::Mulberry32>,
    bounds: Res<ArenaBounds>,
    rules: Option<Res<LiveRules>>,
    mut bots: Query<(
        &crate::ecs::components::EntityId,
        &Position,
        &mut crate::ecs::components::BotAgent,
        &mut Velocity,
        &Health,
        &crate::ecs::components::CombatStats,
    )>,
    mobs: Query<(&Position, &Health), With<crate::ecs::components::MobTag>>,
) {
    if rules.is_none() {
        return;
    }
    let dt = clock.delta_seconds();
    let margin = bounds.margin;
    let width = bounds.width;
    let height = bounds.height;
    let max_chase_speed = 100.0;
    let accel_gain = 15.0;
    let vision_range = 300.0;

    for (_id, pos, mut bot, mut vel, health, combat) in &mut bots {
        if !health.is_alive {
            continue;
        }

        // Search for nearest alive mob within vision range
        let mut nearest_mob: Option<(&Position, f32)> = None;
        for (m_pos, m_health) in &mobs {
            if !m_health.is_alive {
                continue;
            }
            let dx = m_pos.x - pos.x;
            let dy = m_pos.y - pos.y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= vision_range {
                if let Some((_, best_dist)) = nearest_mob {
                    if dist < best_dist {
                        nearest_mob = Some((m_pos, dist));
                    }
                } else {
                    nearest_mob = Some((m_pos, dist));
                }
            }
        }

        if let Some((m_pos, dist)) = nearest_mob {
            let dx = m_pos.x - pos.x;
            let dy = m_pos.y - pos.y;
            let dir_x = if dist > 1e-4 { dx / dist } else { 1.0 };
            let dir_y = if dist > 1e-4 { dy / dist } else { 0.0 };
            bot.vx = dir_x;
            bot.vy = dir_y;

            if dist <= combat.attack_range {
                vel.vx = 0.0;
                vel.vy = 0.0;
            } else {
                let desired_vx = dir_x * max_chase_speed;
                let desired_vy = dir_y * max_chase_speed;
                vel.vx += accel_gain * (desired_vx - vel.vx) * dt;
                vel.vy += accel_gain * (desired_vy - vel.vy) * dt;
            }
        } else {
            // Margin avoidance
            if (pos.x <= margin && bot.vx < 0.0) || (pos.x >= width - margin && bot.vx > 0.0) {
                bot.vx = -bot.vx;
            }
            if (pos.y <= margin && bot.vy < 0.0) || (pos.y >= height - margin && bot.vy > 0.0) {
                bot.vy = -bot.vy;
            }
            let turn_angle = prng.as_mut().range(-0.2, 0.2);
            let current_angle = bot.vy.atan2(bot.vx) + turn_angle;
            bot.vx = current_angle.cos();
            bot.vy = current_angle.sin();

            let desired_vx = bot.vx * 20.0;
            let desired_vy = bot.vy * 20.0;
            vel.vx += accel_gain * (desired_vx - vel.vx) * dt;
            vel.vy += accel_gain * (desired_vy - vel.vy) * dt;
        }
    }
}

/// Dead players (humans and bots) respawn at their `SpawnPoint` with full HP after
/// `LiveRules::player_respawn_sec`. Legacy Colyseus respawned players manually via a
/// `player_respawn` message; server-rs has no such wire message (wire changes are Wave B),
/// so the live runtime auto-respawns after a delay instead. No-op without `LiveRules`.
#[allow(clippy::type_complexity)]
pub fn player_respawn_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    rules: Option<Res<LiveRules>>,
    bounds: Res<ArenaBounds>,
    mut query: Query<
        (
            Entity,
            &mut Health,
            &mut Position,
            &mut Velocity,
            Option<&SpawnPoint>,
            Option<&PlayerRespawnTimer>,
        ),
        With<PlayerTag>,
    >,
) {
    let Some(rules) = rules else {
        return;
    };
    let now = clock.current_time_seconds();
    for (entity, mut health, mut pos, mut vel, spawn, timer) in &mut query {
        if health.is_alive {
            continue;
        }
        match timer {
            None => {
                commands.entity(entity).insert(PlayerRespawnTimer {
                    respawn_at: now + rules.player_respawn_sec,
                });
            }
            Some(t) if now >= t.respawn_at => {
                health.current = health.max;
                health.is_alive = true;
                *pos = spawn
                    .map(|s| s.0)
                    .unwrap_or(Position::new(bounds.width / 2.0, bounds.height / 2.0));
                *vel = Velocity::zero();
                commands.entity(entity).remove::<PlayerRespawnTimer>();
            }
            Some(_) => {}
        }
    }
}
