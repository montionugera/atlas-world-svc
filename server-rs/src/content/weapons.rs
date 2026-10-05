use serde::{Deserialize, Serialize};

/// Which primary stat a weapon reads for offence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AtkStat {
    Str,
    Agi,
    Int,
    Vit,
    Dex,
}

/// The highest `pAtk + mAtk` in the item catalog.
pub const GEAR_REFERENCE: f32 = 18.0;

/// Bare hands magnitude. Below the dagger's 6/18 (~0.333) so any weapon beats none.
pub const UNARMED_GEAR: f32 = 0.25;

/// Weapon offensive characteristics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeaponOffence {
    /// Which single primary stat this weapon's damage reads.
    pub atk_stat: AtkStat,
    /// Multiplicative magnitude, 0 < gear <= 1.
    pub gear: f32,
    /// Physical share of output (1.0 = fully physical, 0.0 = fully magical).
    pub rho: f32,
}

const UNARMED: WeaponOffence = WeaponOffence {
    atk_stat: AtkStat::Str,
    gear: UNARMED_GEAR,
    rho: 1.0,
};

/// Resolves an equipped weapon ID to its offence parameters (atkStat, gear, rho).
///
/// Matches contracts/src/meta/weaponStats.ts and content/items.json.
pub fn weapon_offence(weapon_id: Option<&str>) -> WeaponOffence {
    let id = match weapon_id {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => return UNARMED,
    };

    match id {
        "basic_sword" => WeaponOffence {
            atk_stat: AtkStat::Str,
            gear: 10.0 / GEAR_REFERENCE,
            rho: 1.0,
        },
        "apprentice_staff" => WeaponOffence {
            atk_stat: AtkStat::Int,
            gear: 6.0 / GEAR_REFERENCE,
            rho: 0.0,
        },
        "magic_staff" => WeaponOffence {
            atk_stat: AtkStat::Int,
            gear: 17.0 / GEAR_REFERENCE,
            rho: 2.0 / 17.0,
        },
        "great_bow" => WeaponOffence {
            atk_stat: AtkStat::Dex,
            gear: 16.0 / GEAR_REFERENCE,
            rho: 1.0,
        },
        "dagger" => WeaponOffence {
            atk_stat: AtkStat::Str,
            gear: 6.0 / GEAR_REFERENCE,
            rho: 1.0,
        },
        "scythe" => WeaponOffence {
            atk_stat: AtkStat::Str,
            gear: 18.0 / GEAR_REFERENCE,
            rho: 1.0,
        },
        _ => UNARMED,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unarmed_defaults() {
        assert_eq!(weapon_offence(None), UNARMED);
        assert_eq!(weapon_offence(Some("")), UNARMED);
        assert_eq!(weapon_offence(Some("unknown_item")), UNARMED);
        assert_eq!(UNARMED.atk_stat, AtkStat::Str);
        assert_eq!(UNARMED.gear, UNARMED_GEAR);
        assert_eq!(UNARMED.rho, 1.0);
    }

    #[test]
    fn test_catalog_weapons_resolution() {
        let sword = weapon_offence(Some("basic_sword"));
        assert_eq!(sword.atk_stat, AtkStat::Str);
        assert!((sword.gear - (10.0 / 18.0)).abs() < 1e-6);
        assert_eq!(sword.rho, 1.0);

        let staff = weapon_offence(Some("apprentice_staff"));
        assert_eq!(staff.atk_stat, AtkStat::Int);
        assert!((staff.gear - (6.0 / 18.0)).abs() < 1e-6);
        assert_eq!(staff.rho, 0.0);

        let magic = weapon_offence(Some("magic_staff"));
        assert_eq!(magic.atk_stat, AtkStat::Int);
        assert!((magic.gear - (17.0 / 18.0)).abs() < 1e-6);
        assert!((magic.rho - (2.0 / 17.0)).abs() < 1e-6);

        let bow = weapon_offence(Some("great_bow"));
        assert_eq!(bow.atk_stat, AtkStat::Dex);
        assert!((bow.gear - (16.0 / 18.0)).abs() < 1e-6);
        assert_eq!(bow.rho, 1.0);

        let scythe = weapon_offence(Some("scythe"));
        assert_eq!(scythe.atk_stat, AtkStat::Str);
        assert_eq!(scythe.gear, 1.0);
        assert_eq!(scythe.rho, 1.0);
    }
}
