use serde::{Deserialize, Serialize};

/// Canonical Playable & Mob Races of Atlas World.
/// Matches `content/studio/world_history_and_concept.json` (`race_taxonomy`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AtlasRace {
    #[serde(rename = "human_demi_human")]
    HumanDemiHuman,
    #[serde(rename = "dwarf")]
    Dwarf,
    #[serde(rename = "ogre_orc")]
    OgreOrc,
    #[serde(rename = "furral")]
    Furral,
    #[serde(rename = "lunar")]
    Lunar,
    #[serde(rename = "dark_lunar")]
    DarkLunar,
}

impl AtlasRace {
    pub const ALL: [AtlasRace; 6] = [
        AtlasRace::HumanDemiHuman,
        AtlasRace::Dwarf,
        AtlasRace::OgreOrc,
        AtlasRace::Furral,
        AtlasRace::Lunar,
        AtlasRace::DarkLunar,
    ];

    pub fn as_key(&self) -> &'static str {
        match self {
            Self::HumanDemiHuman => "human_demi_human",
            Self::Dwarf => "dwarf",
            Self::OgreOrc => "ogre_orc",
            Self::Furral => "furral",
            Self::Lunar => "lunar",
            Self::DarkLunar => "dark_lunar",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::HumanDemiHuman => "Human / Demi-Human",
            Self::Dwarf => "Dwarf (Tontatta-Lineage Micro-Titans)",
            Self::OgreOrc => "Ogre / Orc",
            Self::Furral => "Furral (Electro-Beastfolk Tribe)",
            Self::Lunar => "Lunar (Astral High-Elven Lineage)",
            Self::DarkLunar => "Dark-Lunar (Umbral Eclipse Lineage)",
        }
    }

    pub fn from_key(key: &str) -> Option<Self> {
        match key.trim().to_ascii_lowercase().as_str() {
            "human_demi_human" | "human" | "demi_human" => Some(Self::HumanDemiHuman),
            "dwarf" => Some(Self::Dwarf),
            "ogre_orc" | "orc" | "ogre" => Some(Self::OgreOrc),
            "furral" => Some(Self::Furral),
            "lunar" => Some(Self::Lunar),
            "dark_lunar" => Some(Self::DarkLunar),
            _ => None,
        }
    }

    pub fn profile(&self) -> RaceProfile {
        match self {
            Self::HumanDemiHuman => RaceProfile {
                race: *self,
                home_town_id: "town-lantern-hollow",
                home_town_name: "Lantern Hollow",
                continent_id: "continent-01-hearthbloom-basin",
                district_id: "district-teacup-meadows",
                starter_level_band: (1, 10),
                base_str: 35,
                base_agi: 35,
                base_vit: 35,
                base_int: 35,
                base_dex: 35,
                base_luk: 35,
                hitbox_radius_m: 0.45,
                hitbox_height_m: 1.8,
                innate_trait_name: "Balanced Seal-Resonance",
                innate_trait_description: "+10% adaptability to all weapon classes and accelerated Job Quest mastery.",
                bonus_carry_weight: 0,
                base_move_speed_bonus: 0.0,
                innate_stun_resist_pct: 0.0,
                innate_crit_rate_bonus_pct: 0.0,
                elemental_affinity: "Neutral",
                spawn_position: (100.0, 10.0, 100.0),
            },
            Self::Dwarf => RaceProfile {
                race: *self,
                home_town_id: "town-root-train-roundhouse",
                home_town_name: "Root-Train Roundhouse",
                continent_id: "continent-01-hearthbloom-basin",
                district_id: "district-amber-root-hollows",
                starter_level_band: (1, 10),
                base_str: 45,
                base_agi: 25,
                base_vit: 45,
                base_int: 20,
                base_dex: 30,
                base_luk: 45,
                hitbox_radius_m: 0.35,
                hitbox_height_m: 1.1,
                innate_trait_name: "Tontatta Mighty Impact",
                innate_trait_description: "Miniature hitbox with colossal hammer/axe knockdown force and +15% Blacksmith forging yield.",
                bonus_carry_weight: 1000,
                base_move_speed_bonus: -0.5,
                innate_stun_resist_pct: 10.0,
                innate_crit_rate_bonus_pct: 5.0,
                elemental_affinity: "Earth",
                spawn_position: (250.0, 12.0, 180.0),
            },
            Self::OgreOrc => RaceProfile {
                race: *self,
                home_town_id: "town-draft-kiln-post",
                home_town_name: "Draft-Kiln Post",
                continent_id: "continent-01-hearthbloom-basin",
                district_id: "district-ash-bellows-trench",
                starter_level_band: (1, 10),
                base_str: 50,
                base_agi: 25,
                base_vit: 50,
                base_int: 15,
                base_dex: 25,
                base_luk: 20,
                hitbox_radius_m: 0.60,
                hitbox_height_m: 2.3,
                innate_trait_name: "Crucible Blood-Fury",
                innate_trait_description: "High thermal/physical fortitude, heavy cleave, and damage scaling up as HP drops.",
                bonus_carry_weight: 500,
                base_move_speed_bonus: 0.0,
                innate_stun_resist_pct: 25.0,
                innate_crit_rate_bonus_pct: 0.0,
                elemental_affinity: "Fire",
                spawn_position: (400.0, 15.0, 320.0),
            },
            Self::Furral => RaceProfile {
                race: *self,
                home_town_id: "town-cinnamon-mill-haven",
                home_town_name: "Cinnamon-Mill Haven",
                continent_id: "continent-01-hearthbloom-basin",
                district_id: "district-cinnamon-bellows-bluff",
                starter_level_band: (1, 10),
                base_str: 30,
                base_agi: 50,
                base_vit: 30,
                base_int: 30,
                base_dex: 35,
                base_luk: 35,
                hitbox_radius_m: 0.45,
                hitbox_height_m: 1.7,
                innate_trait_name: "Electro Claw & Sulong Surge",
                innate_trait_description: "Imbues melee strikes/dashes with chain-lightning shock and high evasion.",
                bonus_carry_weight: 0,
                base_move_speed_bonus: 2.0,
                innate_stun_resist_pct: 0.0,
                innate_crit_rate_bonus_pct: 5.0,
                elemental_affinity: "Wind",
                spawn_position: (520.0, 20.0, 110.0),
            },
            Self::Lunar => RaceProfile {
                race: *self,
                home_town_id: "town-porcelain-loom-sanctuary",
                home_town_name: "Porcelain Loom Sanctuary",
                continent_id: "continent-01-hearthbloom-basin",
                district_id: "district-porcelain-cradle",
                starter_level_band: (1, 10),
                base_str: 25,
                base_agi: 40,
                base_vit: 30,
                base_int: 45,
                base_dex: 45,
                base_luk: 25,
                hitbox_radius_m: 0.40,
                hitbox_height_m: 1.85,
                innate_trait_name: "Astral Grace & Bow/Spell Precision",
                innate_trait_description: "Extended ranged/spell reach and low-gravity aerial step.",
                bonus_carry_weight: 0,
                base_move_speed_bonus: 0.5,
                innate_stun_resist_pct: 0.0,
                innate_crit_rate_bonus_pct: 5.0,
                elemental_affinity: "Water",
                spawn_position: (180.0, 18.0, 450.0),
            },
            Self::DarkLunar => RaceProfile {
                race: *self,
                home_town_id: "town-carillon-hearth-belfry",
                home_town_name: "Carillon Hearth Belfry",
                continent_id: "continent-01-hearthbloom-basin",
                district_id: "district-terracotta-wind-chimes",
                starter_level_band: (1, 10),
                base_str: 38,
                base_agi: 42,
                base_vit: 28,
                base_int: 42,
                base_dex: 35,
                base_luk: 30,
                hitbox_radius_m: 0.42,
                hitbox_height_m: 1.85,
                innate_trait_name: "Umbral Refraction",
                innate_trait_description: "Critical backstab/shadow-arts multiplier and high resistance to abyssal corruption.",
                bonus_carry_weight: 0,
                base_move_speed_bonus: 1.0,
                innate_stun_resist_pct: 5.0,
                innate_crit_rate_bonus_pct: 12.0,
                elemental_affinity: "Shadow",
                spawn_position: (310.0, 22.0, 580.0),
            },
        }
    }
}

/// Static racial definition and base gameplay parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaceProfile {
    pub race: AtlasRace,
    pub home_town_id: &'static str,
    pub home_town_name: &'static str,
    pub continent_id: &'static str,
    pub district_id: &'static str,
    pub starter_level_band: (u32, u32),
    pub base_str: u32,
    pub base_agi: u32,
    pub base_vit: u32,
    pub base_int: u32,
    pub base_dex: u32,
    pub base_luk: u32,
    pub hitbox_radius_m: f32,
    pub hitbox_height_m: f32,
    pub innate_trait_name: &'static str,
    pub innate_trait_description: &'static str,
    pub bonus_carry_weight: u32,
    pub base_move_speed_bonus: f32,
    pub innate_stun_resist_pct: f32,
    pub innate_crit_rate_bonus_pct: f32,
    pub elemental_affinity: &'static str,
    pub spawn_position: (f32, f32, f32),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_six_races_exist_and_serialize_snake_case() {
        assert_eq!(AtlasRace::ALL.len(), 6);
        for race in AtlasRace::ALL {
            let key = race.as_key();
            let parsed = AtlasRace::from_key(key).expect("Key must parse back");
            assert_eq!(race, parsed);

            let serialized = serde_json::to_string(&race).unwrap();
            assert_eq!(serialized, format!("\"{}\"", key));
        }
    }

    #[test]
    fn test_race_profiles_match_canonical_starter_towns() {
        let human = AtlasRace::HumanDemiHuman.profile();
        assert_eq!(human.home_town_id, "town-lantern-hollow");

        let dwarf = AtlasRace::Dwarf.profile();
        assert_eq!(dwarf.home_town_id, "town-root-train-roundhouse");
        assert!(
            dwarf.hitbox_height_m < 1.5,
            "Dwarves have miniature hitboxes"
        );
        assert_eq!(dwarf.bonus_carry_weight, 1000);

        let orc = AtlasRace::OgreOrc.profile();
        assert_eq!(orc.home_town_id, "town-draft-kiln-post");
        assert_eq!(orc.base_str, 50);

        let furral = AtlasRace::Furral.profile();
        assert_eq!(furral.home_town_id, "town-cinnamon-mill-haven");
        assert!(furral.base_move_speed_bonus > 0.0);

        let lunar = AtlasRace::Lunar.profile();
        assert_eq!(lunar.home_town_id, "town-porcelain-loom-sanctuary");

        let dark_lunar = AtlasRace::DarkLunar.profile();
        assert_eq!(dark_lunar.home_town_id, "town-carillon-hearth-belfry");
        assert!(dark_lunar.innate_crit_rate_bonus_pct >= 10.0);
    }
}
