use crate::content::weapons::{weapon_offence, AtkStat};
use crate::storage::PrimaryStats;
use serde::{Deserialize, Serialize};

/// Per-level stat growth factor. Mirrors `GROWTH` in contracts/src/meta/derivedStats.ts.
pub const GROWTH: f32 = 1.045;
/// Primary stat coefficient. Mirrors `STAT_COEF` in contracts/src/meta/derivedStats.ts.
pub const STAT_COEF: f32 = 0.5;
/// Maximum value for stat allocation clamping.
pub const STAT_MAX: f32 = 99.0;

/// Base combat values solved to reproduce pre-F018 level 1 anchors.
pub const BASE_HP: f32 = 108.9;
pub const BASE_ATK: f32 = 19.602;
pub const BASE_DEF: f32 = 5.94;

/// Calculated player combat statistics used in simulation and combat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedStats {
    pub max_health: f32,
    pub p_atk: f32,
    pub m_atk: f32,
    pub p_def: f32,
    pub m_def: f32,
    pub max_move_speed: f32,
}

/// Computes server-authoritative combat stats from level, allocated primary stats, and equipped weapon.
///
/// Implements the exact multiplicative formula from contracts/src/meta/derivedStats.ts:
/// - grow = GROWTH^(max(1, level) - 1)
/// - share(p) = clamp(p, 1, 99) / 99
/// - offMagnitude = 1 + 2 * C * share(allocated[weapon.atkStat])
/// - defMagnitude = 1 + 2 * C * share(vit)
/// - atk = BASE_ATK * grow * offMagnitude * weapon.gear
/// - def = BASE_DEF * grow * defMagnitude
/// - maxHealth = BASE_HP * grow * defMagnitude
/// - pAtk = atk * 2 * rho
/// - mAtk = atk * 2 * (1 - rho)
/// - pDef = mDef = def
/// - maxMoveSpeed = 20.0 + 0.2 * agi
pub fn derived_stats(
    level: u32,
    allocated: &PrimaryStats,
    weapon_id: Option<&str>,
) -> DerivedStats {
    let weapon = weapon_offence(weapon_id);
    let level_idx = (level.max(1) - 1) as i32;
    let grow = GROWTH.powi(level_idx);

    let share = |p: u32| (p.clamp(1, 99) as f32) / STAT_MAX;

    let allocated_atk_stat = match weapon.atk_stat {
        AtkStat::Str => allocated.str,
        AtkStat::Agi => allocated.agi,
        AtkStat::Int => allocated.int,
        AtkStat::Vit => allocated.vit,
        AtkStat::Dex => allocated.dex,
    };

    let off_mag = 1.0 + 2.0 * STAT_COEF * share(allocated_atk_stat);
    let def_mag = 1.0 + 2.0 * STAT_COEF * share(allocated.vit);

    let atk = BASE_ATK * grow * off_mag * weapon.gear;
    let def = BASE_DEF * grow * def_mag;

    DerivedStats {
        max_health: BASE_HP * grow * def_mag,
        p_atk: atk * 2.0 * weapon.rho,
        m_atk: atk * 2.0 * (1.0 - weapon.rho),
        p_def: def,
        m_def: def,
        max_move_speed: 20.0 + 0.2 * (allocated.agi as f32),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_1_basic_sword_anchor_parity() {
        let stats = PrimaryStats::default();
        let derived = derived_stats(1, &stats, Some("basic_sword"));

        assert!((derived.max_health - 110.0).abs() < 1e-4);
        assert!((derived.p_atk - 22.0).abs() < 1e-4);
        assert_eq!(derived.m_atk, 0.0);
        assert!((derived.p_def - 6.0).abs() < 1e-4);
        assert!((derived.m_def - 6.0).abs() < 1e-4);
        assert!((derived.max_move_speed - 20.2).abs() < 1e-4);
    }

    #[test]
    fn test_level_10_growth_scaling() {
        let stats = PrimaryStats::default();
        let lvl1 = derived_stats(1, &stats, Some("basic_sword"));
        let lvl10 = derived_stats(10, &stats, Some("basic_sword"));

        let expected_growth = GROWTH.powi(9);
        assert!((lvl10.max_health / lvl1.max_health - expected_growth).abs() < 1e-4);
        assert!((lvl10.p_atk / lvl1.p_atk - expected_growth).abs() < 1e-4);
        assert!((lvl10.p_def / lvl1.p_def - expected_growth).abs() < 1e-4);

        // Move speed is level-free
        assert_eq!(lvl10.max_move_speed, lvl1.max_move_speed);
    }

    #[test]
    fn test_magic_staff_rho_zero_yields_zero_patk_and_positive_matk() {
        let stats = PrimaryStats::default();
        let staff = derived_stats(1, &stats, Some("apprentice_staff"));

        assert_eq!(staff.p_atk, 0.0);
        assert!(staff.m_atk > 0.0);
        assert!((staff.m_atk - 13.2).abs() < 1e-4);
    }

    #[test]
    fn test_atk_def_ratio_is_level_independent() {
        let stats = PrimaryStats::default();
        let at = |lvl: u32| derived_stats(lvl, &stats, Some("basic_sword"));

        let ratio1 = at(1).p_atk / at(1).p_def;
        let ratio50 = at(50).p_atk / at(50).p_def;
        let ratio99 = at(99).p_atk / at(99).p_def;

        assert!((ratio50 - ratio1).abs() < 1e-4);
        assert!((ratio99 - ratio1).abs() < 1e-4);
    }

    #[test]
    fn test_stat_clamping_behavior() {
        let low = PrimaryStats {
            str: 0,
            agi: 0,
            int: 0,
            vit: 0,
            dex: 0,
        };
        let normal = PrimaryStats::default();
        // Clamped at minimum 1 for offence/defense calculation
        let d_low = derived_stats(1, &low, Some("basic_sword"));
        let d_norm = derived_stats(1, &normal, Some("basic_sword"));
        assert_eq!(d_low.p_atk, d_norm.p_atk);
        assert_eq!(d_low.max_health, d_norm.max_health);

        let high = PrimaryStats {
            str: 500,
            agi: 1,
            int: 1,
            vit: 1,
            dex: 1,
        };
        let cap = PrimaryStats {
            str: 99,
            agi: 1,
            int: 1,
            vit: 1,
            dex: 1,
        };
        let d_high = derived_stats(1, &high, Some("scythe"));
        let d_cap = derived_stats(1, &cap, Some("scythe"));
        assert!((d_high.p_atk - d_cap.p_atk).abs() < 1e-5);
    }
}
