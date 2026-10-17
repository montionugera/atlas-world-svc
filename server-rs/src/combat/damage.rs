use crate::combat::elements::{get_element_multiplier, Element};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DamageType {
    Physical,
    Magical,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DamageOptions {
    pub base_damage: f32,
    pub damage_type: DamageType,
    pub attack_element: Element,
    pub defense_element: Element,
    pub p_def: f32,
    pub m_def: f32,
    pub armor: f32,
}

impl DamageOptions {
    pub fn new(
        base_damage: f32,
        damage_type: DamageType,
        attack_element: Element,
        defense_element: Element,
    ) -> Self {
        Self {
            base_damage,
            damage_type,
            attack_element,
            defense_element,
            p_def: 0.0,
            m_def: 0.0,
            armor: 0.0,
        }
    }
}

pub struct DamageCalculator;

impl DamageCalculator {
    pub fn calculate(opts: &DamageOptions) -> f32 {
        let primary_def = match opts.damage_type {
            DamageType::Magical => opts.m_def,
            DamageType::Physical => opts.p_def,
        };
        let total_def = primary_def + opts.armor;
        let damage_reduction = total_def.min(opts.base_damage * 0.8);
        let after_def = (opts.base_damage - damage_reduction).max(1.0);
        let multiplier = get_element_multiplier(opts.attack_element, opts.defense_element);
        (after_def * multiplier).floor().max(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_physical_damage_with_def_and_armor() {
        let opts = DamageOptions {
            base_damage: 100.0,
            damage_type: DamageType::Physical,
            attack_element: Element::Neutral,
            defense_element: Element::Neutral,
            p_def: 10.0,
            m_def: 50.0, // should be ignored for physical
            armor: 5.0,
        };
        // 100 - (10 + 5) = 85
        assert_eq!(DamageCalculator::calculate(&opts), 85.0);
    }

    #[test]
    fn test_magical_damage_with_def_and_armor() {
        let opts = DamageOptions {
            base_damage: 100.0,
            damage_type: DamageType::Magical,
            attack_element: Element::Neutral,
            defense_element: Element::Neutral,
            p_def: 999.0, // should be ignored for magical
            m_def: 4.0,
            armor: 5.0,
        };
        // 100 - (4 + 5) = 91
        assert_eq!(DamageCalculator::calculate(&opts), 91.0);
    }

    #[test]
    fn test_defense_reduction_cap_at_80_percent() {
        let opts = DamageOptions {
            base_damage: 100.0,
            damage_type: DamageType::Physical,
            attack_element: Element::Neutral,
            defense_element: Element::Neutral,
            p_def: 500.0, // excessive defense
            m_def: 0.0,
            armor: 50.0,
        };
        // max reduction is 100 * 0.8 = 80.0
        // after_def = 100 - 80 = 20.0
        assert_eq!(DamageCalculator::calculate(&opts), 20.0);
    }

    #[test]
    fn test_minimum_damage_floor_of_one() {
        let opts = DamageOptions {
            base_damage: 1.0,
            damage_type: DamageType::Physical,
            attack_element: Element::Neutral,
            defense_element: Element::Neutral,
            p_def: 10.0,
            m_def: 0.0,
            armor: 0.0,
        };
        // 1.0 - min(10.0, 0.8) = 0.2, max(1.0) = 1.0
        assert_eq!(DamageCalculator::calculate(&opts), 1.0);
    }

    #[test]
    fn test_element_multiplier_advantage() {
        let opts = DamageOptions {
            base_damage: 100.0,
            damage_type: DamageType::Magical,
            attack_element: Element::Fire,
            defense_element: Element::Earth,
            p_def: 0.0,
            m_def: 10.0,
            armor: 5.0,
        };
        // after_def = 85.0
        // fire vs earth = 2.0x -> 170.0
        assert_eq!(DamageCalculator::calculate(&opts), 170.0);
    }

    #[test]
    fn test_element_multiplier_disadvantage_and_floor() {
        let opts = DamageOptions {
            base_damage: 100.0,
            damage_type: DamageType::Magical,
            attack_element: Element::Fire,
            defense_element: Element::Water,
            p_def: 0.0,
            m_def: 10.0,
            armor: 5.0,
        };
        // after_def = 85.0
        // fire vs water = 0.5x -> 42.5 -> floor = 42.0
        assert_eq!(DamageCalculator::calculate(&opts), 42.0);
    }

    #[test]
    fn test_element_multiplier_sub_one_floored_to_one() {
        let opts = DamageOptions {
            base_damage: 1.0,
            damage_type: DamageType::Physical,
            attack_element: Element::Fire,
            defense_element: Element::Water,
            p_def: 0.0,
            m_def: 0.0,
            armor: 0.0,
        };
        // after_def = 1.0
        // fire vs water = 0.5 -> floor(0.5) = 0.0 -> max(1.0) = 1.0
        assert_eq!(DamageCalculator::calculate(&opts), 1.0);
    }
}
