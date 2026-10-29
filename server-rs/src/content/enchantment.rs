use crate::combat::Element;
use serde::{Deserialize, Serialize};

/// Maximum equipment enchantment level (+20).
pub const MAX_ENCHANT_TIER: u32 = 20;
/// Safe enchantment threshold (+4).
pub const SAFE_ENCHANT_TIER: u32 = 4;

/// Visual glow tier of an enchanted weapon/armor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnchantVisualGlow {
    None,
    FaintWhite,       // +4
    LuminescentBlue,  // +5..=+8
    RadiantRed,       // +9..=+12
    AbyssalPurple,    // +13..=+15
    CelestialGold,    // +16..=+20
}

impl EnchantVisualGlow {
    pub fn from_tier(tier: u32) -> Self {
        match tier {
            0..=3 => Self::None,
            4 => Self::FaintWhite,
            5..=8 => Self::LuminescentBlue,
            9..=12 => Self::RadiantRed,
            13..=15 => Self::AbyssalPurple,
            16..=20 => Self::CelestialGold,
            _ => Self::CelestialGold,
        }
    }
}

/// Lineage 2-style Special Abilities (SA) bound to high-tier weapons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpecialAbility {
    Focus,        // +15% Critical Chance
    Health,       // +20% Maximum HP
    VampiricRage,// 6% Damage leeched as HP
    Haste,        // +12% Attack Speed (ASPD)
    Acumen,       // +25% Cast Speed
    CriticalStun, // 8% chance to stun on hit
    Guidance,     // +30 Accuracy (Hit Rate)
    Evasion,      // +25 Evasion (Flee Rate)
}

impl SpecialAbility {
    pub fn description(&self) -> &'static str {
        match self {
            Self::Focus => "Focus: +15% Critical Strike Rate",
            Self::Health => "Health: +20% Max Health Capacity",
            Self::VampiricRage => "Vampiric Rage: 6% of physical damage dealt converted to HP",
            Self::Haste => "Haste: +12% Attack Speed (ASPD)",
            Self::Acumen => "Acumen: +25% Variable Cast Speed Reduction",
            Self::CriticalStun => "Critical Stun: 8% chance on critical strike to inflict 2s Stun",
            Self::Guidance => "Guidance: +30 Hit Accuracy",
            Self::Evasion => "Evasion: +25 Flee Dodge Rate",
        }
    }
}

/// Detailed outcome of a +20 Enchant attempt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnchantResultKind {
    Success,
    FailedDegraded,
    FailedProtected,
    FailedBrokenCrystalized,
    MaxTierReached,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighTierEnchantOutcome {
    pub result: EnchantResultKind,
    pub previous_tier: u32,
    pub new_tier: u32,
    pub glow: EnchantVisualGlow,
    pub crystals_yielded: u32,
    pub consume_scroll_id: String,
}

/// Success rate curve (in Basis Points: 10,000 = 100%) for +0..+20.
pub fn enchant_success_rate_bps(tier: u32) -> u32 {
    match tier {
        0..=3 => 10_000, // 100% safe
        4 => 7_000,     // 70%
        5 => 6_500,     // 65%
        6 => 6_000,     // 60%
        7 => 5_000,     // 50%
        8 => 4_500,     // 45%
        9 => 4_000,     // 40%
        10 => 3_500,    // 35%
        11 => 3_000,    // 30%
        12 => 2_500,    // 25%
        13 => 2_000,    // 20%
        14 => 1_500,    // 15%
        15 => 1_200,    // 12%
        16 => 1_000,    // 10%
        17 => 800,      // 8%
        18 => 600,      // 6%
        19 => 400,      // 4%
        _ => 0,
    }
}

/// Authoritative +20 Enchanting resolution with failure safety mechanics.
pub fn attempt_high_tier_enchant(
    current_tier: u32,
    roll_bps: u32,
    is_blessed: bool,
    has_protection_stone: bool,
) -> HighTierEnchantOutcome {
    if current_tier >= MAX_ENCHANT_TIER {
        return HighTierEnchantOutcome {
            result: EnchantResultKind::MaxTierReached,
            previous_tier: MAX_ENCHANT_TIER,
            new_tier: MAX_ENCHANT_TIER,
            glow: EnchantVisualGlow::from_tier(MAX_ENCHANT_TIER),
            crystals_yielded: 0,
            consume_scroll_id: String::new(),
        };
    }

    let chance = enchant_success_rate_bps(current_tier);
    let success = roll_bps < chance;

    if success {
        let new_tier = current_tier + 1;
        HighTierEnchantOutcome {
            result: EnchantResultKind::Success,
            previous_tier: current_tier,
            new_tier,
            glow: EnchantVisualGlow::from_tier(new_tier),
            crystals_yielded: 0,
            consume_scroll_id: if is_blessed { "scroll_enchant_blessed".to_string() } else { "scroll_enchant_standard".to_string() },
        }
    } else {
        // Failure branch
        if current_tier <= SAFE_ENCHANT_TIER {
            // Should not fail in safe zone, but if called: maintain tier
            HighTierEnchantOutcome {
                result: EnchantResultKind::FailedProtected,
                previous_tier: current_tier,
                new_tier: current_tier,
                glow: EnchantVisualGlow::from_tier(current_tier),
                crystals_yielded: 0,
                consume_scroll_id: "scroll_enchant_standard".to_string(),
            }
        } else if has_protection_stone {
            // Protected: maintain level
            HighTierEnchantOutcome {
                result: EnchantResultKind::FailedProtected,
                previous_tier: current_tier,
                new_tier: current_tier,
                glow: EnchantVisualGlow::from_tier(current_tier),
                crystals_yielded: 0,
                consume_scroll_id: "stone_enchant_protection".to_string(),
            }
        } else if is_blessed {
            // Blessed scroll: degrades by 1 level instead of breaking
            let new_tier = current_tier.saturating_sub(1).max(SAFE_ENCHANT_TIER);
            HighTierEnchantOutcome {
                result: EnchantResultKind::FailedDegraded,
                previous_tier: current_tier,
                new_tier,
                glow: EnchantVisualGlow::from_tier(new_tier),
                crystals_yielded: 0,
                consume_scroll_id: "scroll_enchant_blessed".to_string(),
            }
        } else if current_tier >= 10 {
            // Lineage 2 High Risk Zone (+10 or above without blessed scroll/protection breaks into crystals!)
            let crystals = current_tier * 75;
            HighTierEnchantOutcome {
                result: EnchantResultKind::FailedBrokenCrystalized,
                previous_tier: current_tier,
                new_tier: 0,
                glow: EnchantVisualGlow::None,
                crystals_yielded: crystals,
                consume_scroll_id: "scroll_enchant_standard".to_string(),
            }
        } else {
            // +5 to +9 standard failure degrades by 1 level
            let new_tier = current_tier.saturating_sub(1);
            HighTierEnchantOutcome {
                result: EnchantResultKind::FailedDegraded,
                previous_tier: current_tier,
                new_tier,
                glow: EnchantVisualGlow::from_tier(new_tier),
                crystals_yielded: 0,
                consume_scroll_id: "scroll_enchant_standard".to_string(),
            }
        }
    }
}

/// Item Socket & Card/Affinity Inlay State for unique gear.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSocketState {
    pub max_sockets: usize,
    pub socketed_card_ids: Vec<String>,
    pub special_ability: Option<SpecialAbility>,
    pub elemental_attribute: Option<Element>,
    pub elemental_attack_bonus: u32,
    pub elemental_resist_bonus: u32,
}

impl Default for ItemSocketState {
    fn default() -> Self {
        Self {
            max_sockets: 2,
            socketed_card_ids: Vec::new(),
            special_ability: None,
            elemental_attribute: None,
            elemental_attack_bonus: 0,
            elemental_resist_bonus: 0,
        }
    }
}

impl ItemSocketState {
    pub fn with_max_sockets(max_sockets: usize) -> Self {
        Self {
            max_sockets: max_sockets.min(4),
            ..Default::default()
        }
    }

    pub fn insert_card(&mut self, card_id: impl Into<String>) -> Result<(), &'static str> {
        if self.socketed_card_ids.len() >= self.max_sockets {
            return Err("All card sockets are occupied");
        }
        self.socketed_card_ids.push(card_id.into());
        Ok(())
    }

    pub fn set_special_ability(&mut self, sa: SpecialAbility) {
        self.special_ability = Some(sa);
    }

    pub fn imbue_element(&mut self, element: Element, attack_bonus: u32, resist_bonus: u32) {
        self.elemental_attribute = Some(element);
        self.elemental_attack_bonus = attack_bonus;
        self.elemental_resist_bonus = resist_bonus;
    }
}

/// Computes cumulative stat bonuses from enchant tier (+0..+20).
pub fn compute_enchant_stat_multipliers(tier: u32) -> (f32, f32, f32) {
    let t = tier.min(MAX_ENCHANT_TIER) as f32;
    // P.Atk bonus: non-linear quadratic curve for high-tier excitement
    let patk_mult = 1.0 + (t * 0.05) + ((t * t) * 0.003);
    // P.Def bonus
    let pdef_mult = 1.0 + (t * 0.04) + ((t * t) * 0.002);
    // HP Bonus
    let hp_mult = 1.0 + (t * 0.035);
    (patk_mult, pdef_mult, hp_mult)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_zone_always_succeeds() {
        for tier in 0..SAFE_ENCHANT_TIER {
            let res = attempt_high_tier_enchant(tier, 9_999, false, false);
            assert_eq!(res.result, EnchantResultKind::Success);
            assert_eq!(res.new_tier, tier + 1);
        }
    }

    #[test]
    fn test_failure_under_ten_degrades_by_one() {
        let res = attempt_high_tier_enchant(7, 9_999, false, false);
        assert_eq!(res.result, EnchantResultKind::FailedDegraded);
        assert_eq!(res.new_tier, 6);
    }

    #[test]
    fn test_failure_ten_plus_crystalizes_without_blessing() {
        let res = attempt_high_tier_enchant(12, 9_999, false, false);
        assert_eq!(res.result, EnchantResultKind::FailedBrokenCrystalized);
        assert_eq!(res.new_tier, 0);
        assert!(res.crystals_yielded > 500);
    }

    #[test]
    fn test_failure_ten_plus_protected_by_blessed_scroll() {
        let res = attempt_high_tier_enchant(12, 9_999, true, false);
        assert_eq!(res.result, EnchantResultKind::FailedDegraded);
        assert_eq!(res.new_tier, 11);
        assert_eq!(res.crystals_yielded, 0);
    }

    #[test]
    fn test_visual_glow_transitions_correctly() {
        assert_eq!(EnchantVisualGlow::from_tier(0), EnchantVisualGlow::None);
        assert_eq!(EnchantVisualGlow::from_tier(4), EnchantVisualGlow::FaintWhite);
        assert_eq!(EnchantVisualGlow::from_tier(7), EnchantVisualGlow::LuminescentBlue);
        assert_eq!(EnchantVisualGlow::from_tier(10), EnchantVisualGlow::RadiantRed);
        assert_eq!(EnchantVisualGlow::from_tier(14), EnchantVisualGlow::AbyssalPurple);
        assert_eq!(EnchantVisualGlow::from_tier(18), EnchantVisualGlow::CelestialGold);
    }

    #[test]
    fn test_item_socketing_and_special_abilities() {
        let mut sockets = ItemSocketState::with_max_sockets(3);
        assert!(sockets.insert_card("card_orc_hero").is_ok());
        assert!(sockets.insert_card("card_baphomet").is_ok());
        assert!(sockets.insert_card("card_valkyrie").is_ok());
        assert!(sockets.insert_card("card_extra").is_err(), "Exceeds max sockets");

        sockets.set_special_ability(SpecialAbility::Focus);
        assert_eq!(sockets.special_ability, Some(SpecialAbility::Focus));

        sockets.imbue_element(Element::Fire, 50, 20);
        assert_eq!(sockets.elemental_attribute, Some(Element::Fire));
        assert_eq!(sockets.elemental_attack_bonus, 50);
    }
}
