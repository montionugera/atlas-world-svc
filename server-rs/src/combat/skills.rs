use crate::combat::damage::DamageType;
use crate::combat::elements::Element;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

pub const GLOBAL_MAGIC_CD_KEY: &str = "global_magic_cd";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SkillEffect {
    Damage(f32),
    Freeze {
        duration_sec: f32,
        speed_multiplier: f32,
    },
    Stun {
        duration_sec: f32,
    },
    ImpulseCaster(f32),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub id: String,
    pub name: String,
    pub element: Element,
    pub damage_type: DamageType,
    pub radius: f32,
    pub casting_time_sec: f32,
    pub cooldown_sec: f32,
    pub gcd_sec: f32,
    pub effects: Vec<SkillEffect>,
}

impl SkillDefinition {
    pub fn considering_cooldowns(&self) -> Vec<&str> {
        if self.gcd_sec > 0.0 {
            vec![self.id.as_str(), GLOBAL_MAGIC_CD_KEY]
        } else {
            vec![self.id.as_str()]
        }
    }

    pub fn base_damage(&self) -> f32 {
        self.effects
            .iter()
            .find_map(|effect| match effect {
                SkillEffect::Damage(dmg) => Some(*dmg),
                _ => None,
            })
            .unwrap_or(0.0)
    }

    pub fn is_instant(&self) -> bool {
        self.casting_time_sec <= 0.0
    }

    pub fn impulse(&self) -> Option<f32> {
        self.effects.iter().find_map(|effect| match effect {
            SkillEffect::ImpulseCaster(impulse) => Some(*impulse),
            _ => None,
        })
    }

    pub fn freeze(&self) -> Option<(f32, f32)> {
        self.effects.iter().find_map(|effect| match effect {
            SkillEffect::Freeze {
                duration_sec,
                speed_multiplier,
            } => Some((*duration_sec, *speed_multiplier)),
            _ => None,
        })
    }

    pub fn stun(&self) -> Option<f32> {
        self.effects.iter().find_map(|effect| match effect {
            SkillEffect::Stun { duration_sec } => Some(*duration_sec),
            _ => None,
        })
    }
}

static SKILL_CATALOG: LazyLock<HashMap<&'static str, SkillDefinition>> = LazyLock::new(|| {
    let mut catalog = HashMap::new();

    catalog.insert(
        "skill_1",
        SkillDefinition {
            id: "skill_1".to_string(),
            name: "Meteor Strike".to_string(),
            element: Element::Fire,
            damage_type: DamageType::Magical,
            radius: 6.0,
            casting_time_sec: 1.5,
            cooldown_sec: 5.0,
            gcd_sec: 5.0,
            effects: vec![SkillEffect::Damage(20.0)],
        },
    );

    catalog.insert(
        "skill_2",
        SkillDefinition {
            id: "skill_2".to_string(),
            name: "Precision Strike".to_string(),
            element: Element::Earth,
            damage_type: DamageType::Physical,
            radius: 2.0,
            casting_time_sec: 1.0,
            cooldown_sec: 2.0,
            gcd_sec: 1.0,
            effects: vec![SkillEffect::Damage(50.0)],
        },
    );

    catalog.insert(
        "skill_3",
        SkillDefinition {
            id: "skill_3".to_string(),
            name: "Blizzard".to_string(),
            element: Element::Water,
            damage_type: DamageType::Magical,
            radius: 5.0,
            casting_time_sec: 1.0,
            cooldown_sec: 4.0,
            gcd_sec: 1.5,
            effects: vec![
                SkillEffect::Damage(30.0),
                SkillEffect::Freeze {
                    duration_sec: 5.0,
                    speed_multiplier: 0.2,
                },
            ],
        },
    );

    catalog.insert(
        "skill_4",
        SkillDefinition {
            id: "skill_4".to_string(),
            name: "Thunder Strike".to_string(),
            element: Element::Wind,
            damage_type: DamageType::Magical,
            radius: 4.0,
            casting_time_sec: 0.5,
            cooldown_sec: 5.0,
            gcd_sec: 1.0,
            effects: vec![
                SkillEffect::Damage(25.0),
                SkillEffect::Stun { duration_sec: 1.2 },
            ],
        },
    );

    catalog.insert(
        "skill_dash",
        SkillDefinition {
            id: "skill_dash".to_string(),
            name: "Dash".to_string(),
            element: Element::Neutral,
            damage_type: DamageType::Physical,
            radius: 0.0,
            casting_time_sec: 0.0,
            cooldown_sec: 0.5,
            gcd_sec: 0.0,
            effects: vec![SkillEffect::ImpulseCaster(160.0)],
        },
    );

    catalog
});

pub fn get_skill(id: &str) -> Option<&'static SkillDefinition> {
    SKILL_CATALOG.get(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_skill_1_meteor_strike() {
        let skill = get_skill("skill_1").expect("skill_1 should exist");
        assert_eq!(skill.name, "Meteor Strike");
        assert_eq!(skill.element, Element::Fire);
        assert_eq!(skill.damage_type, DamageType::Magical);
        assert_eq!(skill.radius, 6.0);
        assert_eq!(skill.casting_time_sec, 1.5);
        assert_eq!(skill.cooldown_sec, 5.0);
        assert_eq!(skill.gcd_sec, 5.0);
        assert_eq!(skill.base_damage(), 20.0);
        assert_eq!(
            skill.considering_cooldowns(),
            vec!["skill_1", GLOBAL_MAGIC_CD_KEY]
        );
    }

    #[test]
    fn test_skill_2_precision_strike() {
        let skill = get_skill("skill_2").expect("skill_2 should exist");
        assert_eq!(skill.name, "Precision Strike");
        assert_eq!(skill.element, Element::Earth);
        assert_eq!(skill.damage_type, DamageType::Physical);
        assert_eq!(skill.radius, 2.0);
        assert_eq!(skill.casting_time_sec, 1.0);
        assert_eq!(skill.cooldown_sec, 2.0);
        assert_eq!(skill.gcd_sec, 1.0);
        assert_eq!(skill.base_damage(), 50.0);
    }

    #[test]
    fn test_skill_3_blizzard() {
        let skill = get_skill("skill_3").expect("skill_3 should exist");
        assert_eq!(skill.name, "Blizzard");
        assert_eq!(skill.element, Element::Water);
        assert_eq!(skill.damage_type, DamageType::Magical);
        assert_eq!(skill.radius, 5.0);
        assert_eq!(skill.casting_time_sec, 1.0);
        assert_eq!(skill.cooldown_sec, 4.0);
        assert_eq!(skill.gcd_sec, 1.5);
        assert_eq!(skill.base_damage(), 30.0);
        assert_eq!(skill.freeze(), Some((5.0, 0.2)));
    }

    #[test]
    fn test_skill_4_thunder_strike() {
        let skill = get_skill("skill_4").expect("skill_4 should exist");
        assert_eq!(skill.name, "Thunder Strike");
        assert_eq!(skill.element, Element::Wind);
        assert_eq!(skill.damage_type, DamageType::Magical);
        assert_eq!(skill.radius, 4.0);
        assert_eq!(skill.casting_time_sec, 0.5);
        assert_eq!(skill.cooldown_sec, 5.0);
        assert_eq!(skill.gcd_sec, 1.0);
        assert_eq!(skill.base_damage(), 25.0);
        assert_eq!(skill.stun(), Some(1.2));
    }

    #[test]
    fn test_skill_dash() {
        let skill = get_skill("skill_dash").expect("skill_dash should exist");
        assert_eq!(skill.name, "Dash");
        assert_eq!(skill.element, Element::Neutral);
        assert_eq!(skill.damage_type, DamageType::Physical);
        assert_eq!(skill.radius, 0.0);
        assert_eq!(skill.casting_time_sec, 0.0);
        assert_eq!(skill.cooldown_sec, 0.5);
        assert_eq!(skill.gcd_sec, 0.0);
        assert!(skill.is_instant());
        assert_eq!(skill.impulse(), Some(160.0));
        assert_eq!(skill.considering_cooldowns(), vec!["skill_dash"]);
    }

    #[test]
    fn test_get_nonexistent_skill() {
        assert!(get_skill("skill_unknown").is_none());
    }
}
