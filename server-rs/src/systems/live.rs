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

/// Positional push-out so live bodies (players, bots, mobs) do not overlap: pairs are
/// pushed to `r1 + r2` apart and clamped to the arena, iterating until no pair overlaps
/// (capped at `COLLISION_ITERATIONS` per tick; extreme pile-ups finish over a few ticks).
/// Only entities with
/// `BodyRadius` participate (live runtime only; the golden-trace population has none).
/// Map statics are out of scope (plan row 13).
pub fn body_collision_system(
    bounds: Res<ArenaBounds>,
    mut query: Query<(Entity, &mut Position, &BodyRadius, &Health)>,
) {
    // (entity, x, y, radius)
    let mut bodies: Vec<(Entity, f32, f32, f32)> = query
        .iter()
        .filter(|(_, _, _, h)| h.is_alive)
        .map(|(e, p, r, _)| (e, p.x, p.y, r.0))
        .collect();
    if bodies.len() < 2 {
        return;
    }
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
                    // Coincident centres: deterministic per-pair direction (golden angle)
                    // so a stacked crowd fans out in 2D instead of a single line.
                    let seed = (bodies[i].0.index() ^ bodies[j].0.index().rotate_left(7)) as f32;
                    let a = seed * 2.399_963;
                    (a.cos(), a.sin())
                };
                // Split the overlap evenly, then clamp to the arena.
                let half = (rsum - d) * 0.5 + COLLISION_SLOP;
                let (mut ax2, mut ay2) = clamp_to(&bounds, ax - nx * half, ay - ny * half);
                let (mut bx2, mut by2) = clamp_to(&bounds, bx + nx * half, by + ny * half);
                // A wall-clamped body cannot move: the free one takes the remainder.
                let rem = rsum - ((bx2 - ax2).powi(2) + (by2 - ay2).powi(2)).sqrt();
                if rem > 0.0 {
                    let push = rem + COLLISION_SLOP;
                    (ax2, ay2) = clamp_to(&bounds, ax2 - nx * push, ay2 - ny * push);
                    (bx2, by2) = clamp_to(&bounds, bx2 + nx * push, by2 + ny * push);
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

    for (e, x, y, _) in bodies {
        if let Ok((_, mut pos, _, _)) = query.get_mut(e) {
            if pos.x != x || pos.y != y {
                pos.x = x;
                pos.y = y;
            }
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
