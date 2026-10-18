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
