use crate::content::MobTier;
use crate::ecs::components::*;
use bevy_ecs::prelude::*;

/// Max HP bonus granted per player level-up (`+20.0` HP/level) (E-005 Slice 1).
pub const HP_GAIN_PER_LEVEL: f32 = 20.0;
/// Attack power bonus granted per player level-up (`+3.0` ATK/level) (E-005 Slice 1).
pub const ATK_GAIN_PER_LEVEL: f32 = 3.0;

/// Deterministic XP reward for defeating a mob of the given tier (E-005 Slice 1).
pub fn mob_xp_reward(tier: Option<MobTier>) -> u32 {
    match tier {
        Some(MobTier::Verge) => 30,
        Some(MobTier::Route) => 40,
        Some(MobTier::Interior) => 65,
        Some(MobTier::Heart) => 120,
        Some(MobTier::Boss) => 300,
        None => 50,
    }
}

/// Grants `amount` XP to `progression` and applies level-up stat bonuses (`Health::max`, `CombatStats::attack_power`)
/// whenever one or more level thresholds are crossed (E-005 Slice 1).
pub fn grant_xp_and_scale_stats(
    progression: &mut PlayerProgression,
    health: &mut Health,
    stats: Option<&mut CombatStats>,
    amount: u32,
) -> u32 {
    let levels_gained = progression.grant_xp(amount);
    if levels_gained > 0 {
        let hp_bonus = HP_GAIN_PER_LEVEL * (levels_gained as f32);
        health.max += hp_bonus;
        if health.is_alive {
            health.current = health.max;
        }
        if let Some(s) = stats {
            s.attack_power += ATK_GAIN_PER_LEVEL * (levels_gained as f32);
        }
    }
    levels_gained
}

/// Processes lethal hits recorded in `HitLog` and awards experience (and level-up stat increases)
/// to the killing player (or the owner of a killing companion) (E-005 Slice 1).
#[allow(clippy::type_complexity)]
pub fn experience_on_kill_system(
    hit_log: Option<Res<HitLog>>,
    companions: Query<&CompanionAi, With<CompanionTag>>,
    mobs: Query<Option<&MobSpawnAnchor>, With<MobTag>>,
    mut players: Query<
        (
            &mut PlayerProgression,
            &mut Health,
            Option<&mut CombatStats>,
        ),
        With<PlayerTag>,
    >,
) {
    let Some(log) = hit_log else {
        return;
    };

    for hit in &log.0 {
        if !hit.killed {
            continue;
        }

        let tier = mobs
            .get(hit.target)
            .ok()
            .flatten()
            .map(|anchor| anchor.tier);
        let xp_amount = mob_xp_reward(tier);

        // Credit the player directly, or if a companion landed the killing blow, credit its owner.
        let killer_entity = companions
            .get(hit.attacker)
            .map(|c| c.owner)
            .unwrap_or(hit.attacker);

        if let Ok((mut prog, mut hp, mut opt_stats)) = players.get_mut(killer_entity) {
            grant_xp_and_scale_stats(&mut prog, &mut hp, opt_stats.as_deref_mut(), xp_amount);
        }
    }
}
