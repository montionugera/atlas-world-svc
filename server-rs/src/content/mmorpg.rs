use crate::combat::Element;
use crate::content::stats::{derived_stats, DerivedStats};
use crate::storage::PrimaryStats;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

pub const JOBS_JSON: &str = include_str!("../../../contracts/content/jobs.json");
pub const MOBS_JSON: &str = include_str!("../../../contracts/content/mobs.json");
pub const CARDS_JSON: &str = include_str!("../../../contracts/content/cards.json");
pub const QUEST_BOARD_JSON: &str = include_str!("../../../contracts/content/quest_board.json");
pub const HANDBOOK_JSON: &str = include_str!("../../../contracts/content/handbook.json");
pub const CASTLES_JSON: &str = include_str!("../../../contracts/content/castles.json");
pub const ELEMENTS_JSON: &str = include_str!("../../../contracts/content/elements.json");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementsCatalogSpec {
    pub elements: Vec<String>,
    pub damage_matrix_pct: HashMap<String, HashMap<String, u32>>,
    pub weapon_size_penalty_pct: HashMap<String, HashMap<String, u32>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSkillProfile {
    pub slot: u8,
    pub id: String,
    pub name: String,
    pub button_label: String,
    pub element: String,
    pub damage_mult: f32,
    pub sp_cost: u32,
    pub cooldown_sec: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobBonusStats {
    pub str: u32,
    pub agi: u32,
    pub vit: u32,
    pub int: u32,
    pub dex: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobCatalogEntry {
    pub id: String,
    pub name: String,
    pub tier: u32,
    pub parent_job_id: Option<String>,
    pub min_base_level: u32,
    pub max_job_level: u32,
    pub job_change_quest_id: Option<String>,
    pub primary_stats: Vec<String>,
    pub allowed_weapon_kinds: Vec<String>,
    pub job_bonus_at_max: JobBonusStats,
    pub unlocked_skill_ids: Vec<String>,
    pub asset_studio_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobDropEntry {
    pub item_id: String,
    pub chance_bps: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobCatalogEntry {
    pub id: String,
    pub name: String,
    pub level: u32,
    pub rank: String,
    pub element: String,
    pub race: String,
    pub size: String,
    pub is_mvp: bool,
    pub hp: u32,
    pub p_atk: u32,
    pub p_def: u32,
    pub base_exp: u32,
    pub job_exp: u32,
    pub aggro_range_m: f32,
    pub leash_range_m: f32,
    pub spawn_zones: Vec<String>,
    pub drops: Vec<MobDropEntry>,
    pub card_id: Option<String>,
    pub asset_studio_key: String,
}

impl MobCatalogEntry {
    pub fn combat_element(&self) -> Element {
        match self.element.to_ascii_lowercase().as_str() {
            "earth" => Element::Earth,
            "water" => Element::Water,
            "wind" => Element::Wind,
            "fire" => Element::Fire,
            "holy" => Element::Holy,
            "shadow" | "void" | "undead" | "ghost" => Element::Void,
            _ => Element::Neutral,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCatalogEntry {
    pub id: String,
    pub name: String,
    pub slot: String,
    pub mob_id: String,
    pub equip_stats: HashMap<String, i32>,
    pub handbook_deposit_stats: HashMap<String, i32>,
    pub asset_studio_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandbookTierEntry {
    pub required_count: u32,
    pub unlock_note: String,
    pub bonus_stat: String,
    pub bonus_value: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandbookCatalogEntry {
    pub id: String,
    pub category: String,
    pub title: String,
    pub target_id: String,
    pub tiers: Vec<HandbookTierEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestObjectiveEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub target_id: String,
    pub required: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRewardItemEntry {
    pub item_id: String,
    pub qty: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRewardsEntry {
    pub base_xp: u32,
    pub job_xp: u32,
    pub unlock_job_id: Option<String>,
    pub unlock_skill_id: Option<String>,
    pub reputation: u32,
    pub items: Vec<QuestRewardItemEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestBoardCatalogEntry {
    pub id: String,
    pub title: String,
    pub category: String,
    pub min_base_level: u32,
    pub required_job_id: Option<String>,
    pub giver_npc_id: String,
    pub zone_id: String,
    pub repeatable: bool,
    pub objectives: Vec<QuestObjectiveEntry>,
    pub rewards: QuestRewardsEntry,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastleEmperiumSpec {
    pub hp: u32,
    pub element: String,
    pub race: String,
    pub size: String,
    pub only_normal_attack_damage: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastleFortificationsSpec {
    pub outer_gate_barricade_count: u32,
    pub inner_gate_barricade_count: u32,
    pub guardian_stone_count: u32,
    pub barricade_hp: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastlePvpRulesSpec {
    pub player_damage_scaling_pct: u32,
    pub ranged_damage_in_siege_pct: u32,
    pub knockback_disabled: bool,
    pub consumable_cooldown_ms: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastleOwnerRewardsSpec {
    pub daily_treasure_chest_count: u32,
    pub guild_dungeon_zone_id: String,
    pub town_tax_share_bps: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastleCatalogEntry {
    pub id: String,
    pub name: String,
    pub hub_town_id: String,
    pub siege_map_id: String,
    pub siege_duration_minutes: u32,
    pub max_guild_size: u32,
    pub emperium: CastleEmperiumSpec,
    pub fortifications: CastleFortificationsSpec,
    pub pvp_rules: CastlePvpRulesSpec,
    pub owner_rewards: CastleOwnerRewardsSpec,
    pub asset_studio_key: String,
}

pub struct MmorpgCatalogRegistry {
    pub jobs: Vec<JobCatalogEntry>,
    pub mobs: Vec<MobCatalogEntry>,
    pub cards: Vec<CardCatalogEntry>,
    pub quests: Vec<QuestBoardCatalogEntry>,
    pub handbook: Vec<HandbookCatalogEntry>,
    pub castles: Vec<CastleCatalogEntry>,
    pub elements: ElementsCatalogSpec,
}

pub static MMORPG_CATALOG: LazyLock<MmorpgCatalogRegistry> = LazyLock::new(|| {
    let jobs: Vec<JobCatalogEntry> =
        serde_json::from_str(JOBS_JSON).expect("jobs.json must be valid");
    let mobs: Vec<MobCatalogEntry> =
        serde_json::from_str(MOBS_JSON).expect("mobs.json must be valid");
    let cards: Vec<CardCatalogEntry> =
        serde_json::from_str(CARDS_JSON).expect("cards.json must be valid");
    let quests: Vec<QuestBoardCatalogEntry> =
        serde_json::from_str(QUEST_BOARD_JSON).expect("quest_board.json must be valid");
    let handbook: Vec<HandbookCatalogEntry> =
        serde_json::from_str(HANDBOOK_JSON).expect("handbook.json must be valid");
    let castles: Vec<CastleCatalogEntry> =
        serde_json::from_str(CASTLES_JSON).expect("castles.json must be valid");
    let elements: ElementsCatalogSpec =
        serde_json::from_str(ELEMENTS_JSON).expect("elements.json must be valid");

    MmorpgCatalogRegistry {
        jobs,
        mobs,
        cards,
        quests,
        handbook,
        castles,
        elements,
    }
});

/// Evaluates the 10-Element counter percentage (e.g. `Fire` vs `Earth` = `150`, `Fire` vs `Water` = `50`)
/// directly from `contracts/content/elements.json`. Defaults to `100` when neutral/unspecified.
pub fn element_counter_pct(attack_element: &str, defend_element: &str) -> u32 {
    MMORPG_CATALOG
        .elements
        .damage_matrix_pct
        .get(attack_element)
        .and_then(|row| row.get(defend_element))
        .copied()
        .unwrap_or(100)
}

/// Evaluates the Weapon-vs-Monster-Size modifier percentage (`Small` / `Medium` / `Large`)
/// from `contracts/content/elements.json`. Defaults to `100`.
pub fn weapon_size_modifier_pct(weapon_kind: &str, target_size: &str) -> u32 {
    MMORPG_CATALOG
        .elements
        .weapon_size_penalty_pct
        .get(weapon_kind)
        .and_then(|row| row.get(target_size))
        .copied()
        .unwrap_or(100)
}

/// Returns the 3 active hotbar skill profiles for a given Job Class (`novice`, `swordman`, `mage`, `archer`, `knight`, `wizard`).
pub fn job_skill_loadout(job_id: &str) -> [JobSkillProfile; 3] {
    match job_id {
        "swordman" => [
            JobSkillProfile {
                slot: 1,
                id: "bash".to_string(),
                name: "Bash!!".to_string(),
                button_label: "BASH".to_string(),
                element: "Neutral".to_string(),
                damage_mult: 2.10,
                sp_cost: 180,
                cooldown_sec: 3.5,
            },
            JobSkillProfile {
                slot: 2,
                id: "magnum_break".to_string(),
                name: "Magnum Break!! (Fire)".to_string(),
                button_label: "MAGNUM".to_string(),
                element: "Fire".to_string(),
                damage_mult: 2.60,
                sp_cost: 260,
                cooldown_sec: 5.5,
            },
            JobSkillProfile {
                slot: 3,
                id: "endure".to_string(),
                name: "Endure! (DEF+Flint)".to_string(),
                button_label: "ENDURE".to_string(),
                element: "Holy".to_string(),
                damage_mult: 1.50,
                sp_cost: 160,
                cooldown_sec: 7.0,
            },
        ],
        "mage" => [
            JobSkillProfile {
                slot: 1,
                id: "fire_bolt".to_string(),
                name: "Fire Bolt!! (Fire)".to_string(),
                button_label: "FIRE".to_string(),
                element: "Fire".to_string(),
                damage_mult: 2.75,
                sp_cost: 220,
                cooldown_sec: 3.5,
            },
            JobSkillProfile {
                slot: 2,
                id: "cold_bolt".to_string(),
                name: "Cold Bolt!! (Water)".to_string(),
                button_label: "COLD".to_string(),
                element: "Water".to_string(),
                damage_mult: 2.55,
                sp_cost: 220,
                cooldown_sec: 4.5,
            },
            JobSkillProfile {
                slot: 3,
                id: "lightning_bolt".to_string(),
                name: "Lightning Bolt!! (Wind)".to_string(),
                button_label: "THUNDER".to_string(),
                element: "Wind".to_string(),
                damage_mult: 2.65,
                sp_cost: 240,
                cooldown_sec: 5.5,
            },
        ],
        "archer" => [
            JobSkillProfile {
                slot: 1,
                id: "double_strafe".to_string(),
                name: "Double Strafe!!".to_string(),
                button_label: "STRAFE".to_string(),
                element: "Wind".to_string(),
                damage_mult: 2.45,
                sp_cost: 190,
                cooldown_sec: 3.0,
            },
            JobSkillProfile {
                slot: 2,
                id: "arrow_shower".to_string(),
                name: "Arrow Shower!! (Fire)".to_string(),
                button_label: "SHOWER".to_string(),
                element: "Fire".to_string(),
                damage_mult: 2.35,
                sp_cost: 240,
                cooldown_sec: 5.0,
            },
            JobSkillProfile {
                slot: 3,
                id: "owl_eye_shot".to_string(),
                name: "Falcon Assault!! (Holy)".to_string(),
                button_label: "FALCON".to_string(),
                element: "Holy".to_string(),
                damage_mult: 2.80,
                sp_cost: 260,
                cooldown_sec: 6.5,
            },
        ],
        "knight" => [
            JobSkillProfile {
                slot: 1,
                id: "bowling_bash".to_string(),
                name: "Bowling Bash!!".to_string(),
                button_label: "BOWL".to_string(),
                element: "Fire".to_string(),
                damage_mult: 3.20,
                sp_cost: 240,
                cooldown_sec: 4.0,
            },
            JobSkillProfile {
                slot: 2,
                id: "brandish_spear".to_string(),
                name: "Brandish Spear!! (Holy)".to_string(),
                button_label: "BRANDISH".to_string(),
                element: "Holy".to_string(),
                damage_mult: 3.40,
                sp_cost: 280,
                cooldown_sec: 5.5,
            },
            JobSkillProfile {
                slot: 3,
                id: "pierce".to_string(),
                name: "Pierce!! (Anti-Large)".to_string(),
                button_label: "PIERCE".to_string(),
                element: "Earth".to_string(),
                damage_mult: 3.00,
                sp_cost: 200,
                cooldown_sec: 4.5,
            },
        ],
        "wizard" => [
            JobSkillProfile {
                slot: 1,
                id: "meteor_storm".to_string(),
                name: "Meteor Storm!! (Fire)".to_string(),
                button_label: "METEOR".to_string(),
                element: "Fire".to_string(),
                damage_mult: 3.60,
                sp_cost: 260,
                cooldown_sec: 4.5,
            },
            JobSkillProfile {
                slot: 2,
                id: "storm_gust".to_string(),
                name: "Storm Gust!! (Water)".to_string(),
                button_label: "GUST".to_string(),
                element: "Water".to_string(),
                damage_mult: 3.45,
                sp_cost: 280,
                cooldown_sec: 5.5,
            },
            JobSkillProfile {
                slot: 3,
                id: "lord_of_vermilion".to_string(),
                name: "Lord of Vermilion!! (Wind)".to_string(),
                button_label: "VERMILION".to_string(),
                element: "Wind".to_string(),
                damage_mult: 3.50,
                sp_cost: 300,
                cooldown_sec: 6.5,
            },
        ],
        _ => [
            JobSkillProfile {
                slot: 1,
                id: "power_strike".to_string(),
                name: "Power Strike!!".to_string(),
                button_label: "STRIKE".to_string(),
                element: "Neutral".to_string(),
                damage_mult: 1.75,
                sp_cost: 140,
                cooldown_sec: 3.0,
            },
            JobSkillProfile {
                slot: 2,
                id: "ember_slash".to_string(),
                name: "Ember Slash!! (Fire)".to_string(),
                button_label: "EMBER".to_string(),
                element: "Fire".to_string(),
                damage_mult: 2.00,
                sp_cost: 180,
                cooldown_sec: 4.5,
            },
            JobSkillProfile {
                slot: 3,
                id: "first_aid".to_string(),
                name: "Holy Aid!!".to_string(),
                button_label: "AID".to_string(),
                element: "Holy".to_string(),
                damage_mult: 1.60,
                sp_cost: 150,
                cooldown_sec: 5.0,
            },
        ],
    }
}

/// Base EXP required to advance from `base_level` to `base_level + 1` (Lv 1..99).
pub fn base_exp_to_next_level(base_level: u32) -> u32 {
    let lvl = base_level.clamp(1, 99) as f32;
    (50.0 * 1.115_f32.powf(lvl - 1.0)).round() as u32
}

/// Job EXP required to advance from `job_level` to `job_level + 1` (Job Lv 1..50).
pub fn job_exp_to_next_level(job_level: u32, tier: u32) -> u32 {
    let jlvl = job_level.clamp(1, 50) as f32;
    let tier_mult = match tier {
        0 => 0.65,
        1 => 1.0,
        _ => 1.45,
    };
    (35.0 * tier_mult * 1.105_f32.powf(jlvl - 1.0)).round() as u32
}

/// Returns the success rate in basis points (10_000 = 100%) for refining from `current_refine` to `current_refine + 1`.
/// `+0 -> +4` is 100% safe; `+4 -> +15` scales down with a 3-attempt guaranteed pity counter.
pub fn refine_success_rate_bps(current_refine: u32) -> u32 {
    match current_refine {
        0..=3 => 10_000,
        4 => 6_000,
        5 => 5_000,
        6 => 4_000,
        7 => 3_000,
        8 => 2_500,
        9 => 2_000,
        10..=14 => 1_500,
        _ => 0,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RefineOutcome {
    pub success: bool,
    pub new_refine_level: u32,
    pub new_pity_count: u32,
    pub triggered_pity: bool,
    pub oridecon_cost: u32,
}

/// Executes an authoritative Refine attempt (`+0..+15`).
/// Never destroys gear; if `pity_count >= 2` (3rd consecutive attempt after 2 failures), guarantees success.
pub fn attempt_refine(current_refine: u32, pity_count: u32, roll_bps: u32) -> RefineOutcome {
    if current_refine >= 15 {
        return RefineOutcome {
            success: false,
            new_refine_level: 15,
            new_pity_count: 0,
            triggered_pity: false,
            oridecon_cost: 0,
        };
    }

    let oridecon_cost = match current_refine {
        0..=3 => 1,
        4..=6 => 2,
        7..=9 => 3,
        _ => 5,
    };

    let chance_bps = refine_success_rate_bps(current_refine);
    let triggered_pity = pity_count >= 2;
    let success = triggered_pity || roll_bps < chance_bps;

    if success {
        RefineOutcome {
            success: true,
            new_refine_level: current_refine + 1,
            new_pity_count: 0,
            triggered_pity,
            oridecon_cost,
        }
    } else {
        RefineOutcome {
            success: false,
            new_refine_level: current_refine,
            new_pity_count: pity_count + 1,
            triggered_pity: false,
            oridecon_cost,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountGrowthBonuses {
    pub str_bonus: i32,
    pub agi_bonus: i32,
    pub vit_bonus: i32,
    pub int_bonus: i32,
    pub dex_bonus: i32,
    pub max_hp_flat: i32,
    pub p_atk_flat: i32,
    pub m_atk_flat: i32,
    pub p_def_flat: i32,
    pub crit_rate_pct: i32,
    pub demi_human_resist_pct: i32,
    pub unlocked_handbook_tiers: u32,
}

impl AccountGrowthBonuses {
    fn add_stat(&mut self, key: &str, val: i32) {
        match key {
            "str" => self.str_bonus += val,
            "agi" => self.agi_bonus += val,
            "vit" => self.vit_bonus += val,
            "int" => self.int_bonus += val,
            "dex" => self.dex_bonus += val,
            "maxHpFlat" => self.max_hp_flat += val,
            "pAtkFlat" => self.p_atk_flat += val,
            "mAtkFlat" => self.m_atk_flat += val,
            "pDefFlat" => self.p_def_flat += val,
            "critRatePct" => self.crit_rate_pct += val,
            "demiHumanResistPct" => self.demi_human_resist_pct += val,
            _ => {}
        }
    }
}

/// Evaluates cumulative bonuses from socketed Monster Cards, Handbook-deposited Cards,
/// and Adventurer Handbook monster kill / scenic vista milestones.
pub fn compute_card_and_handbook_bonuses(
    socketed_card_ids: &[&str],
    deposited_card_ids: &[&str],
    handbook_counts: &HashMap<String, u32>,
) -> AccountGrowthBonuses {
    let mut out = AccountGrowthBonuses::default();

    for cid in socketed_card_ids {
        if let Some(card) = MMORPG_CATALOG.cards.iter().find(|c| c.id == *cid) {
            for (k, v) in &card.equip_stats {
                out.add_stat(k, *v);
            }
        }
    }

    for cid in deposited_card_ids {
        if let Some(card) = MMORPG_CATALOG.cards.iter().find(|c| c.id == *cid) {
            for (k, v) in &card.handbook_deposit_stats {
                out.add_stat(k, *v);
            }
        }
    }

    for entry in &MMORPG_CATALOG.handbook {
        let count = handbook_counts
            .get(&entry.id)
            .or_else(|| handbook_counts.get(&entry.target_id))
            .copied()
            .unwrap_or(0);
        for tier in &entry.tiers {
            if count >= tier.required_count {
                out.add_stat(&tier.bonus_stat, tier.bonus_value);
                out.unlocked_handbook_tiers += 1;
            }
        }
    }

    out
}

/// Computes effective primary stats including proportional Job Level bonus stats.
pub fn effective_stats_with_job(
    allocated: &PrimaryStats,
    job_id: &str,
    job_level: u32,
) -> PrimaryStats {
    let Some(job) = MMORPG_CATALOG.jobs.iter().find(|j| j.id == job_id) else {
        return allocated.clone();
    };
    let ratio = (job_level.clamp(1, job.max_job_level) as f32) / (job.max_job_level.max(1) as f32);
    let bonus = &job.job_bonus_at_max;
    PrimaryStats {
        str: (allocated.str + ((bonus.str as f32 * ratio).round() as u32)).min(99),
        agi: (allocated.agi + ((bonus.agi as f32 * ratio).round() as u32)).min(99),
        vit: (allocated.vit + ((bonus.vit as f32 * ratio).round() as u32)).min(99),
        int: (allocated.int + ((bonus.int as f32 * ratio).round() as u32)).min(99),
        dex: (allocated.dex + ((bonus.dex as f32 * ratio).round() as u32)).min(99),
    }
}

/// Computes derived combat stats for a player factoring in Base Level, Job Level bonuses,
/// and Refine level (`+0..+15`).
pub fn derived_stats_for_job(
    base_level: u32,
    job_id: &str,
    job_level: u32,
    allocated: &PrimaryStats,
    weapon_id: Option<&str>,
    refine_level: u32,
) -> DerivedStats {
    derived_stats_with_full_growth(
        base_level,
        job_id,
        job_level,
        allocated,
        weapon_id,
        refine_level,
        &AccountGrowthBonuses::default(),
    )
}

/// Computes derived combat stats combining Base Level, Job Level bonuses, Weapon Refine (`+0..+15`),
/// Socketed Monster Cards, and Adventurer Handbook permanent account passives.
pub fn derived_stats_with_full_growth(
    base_level: u32,
    job_id: &str,
    job_level: u32,
    allocated: &PrimaryStats,
    weapon_id: Option<&str>,
    refine_level: u32,
    growth: &AccountGrowthBonuses,
) -> DerivedStats {
    let mut eff = effective_stats_with_job(allocated, job_id, job_level);
    eff.str = (eff.str as i32 + growth.str_bonus).clamp(1, 99) as u32;
    eff.agi = (eff.agi as i32 + growth.agi_bonus).clamp(1, 99) as u32;
    eff.vit = (eff.vit as i32 + growth.vit_bonus).clamp(1, 99) as u32;
    eff.int = (eff.int as i32 + growth.int_bonus).clamp(1, 99) as u32;
    eff.dex = (eff.dex as i32 + growth.dex_bonus).clamp(1, 99) as u32;

    let mut base = derived_stats(base_level, &eff, weapon_id);
    let refine = refine_level.min(15) as f32;
    // Each refine level adds +2.5% weapon offence; crit_rate_pct adds +0.5% expected DPS per 1% crit
    let refine_mult = 1.0 + 0.025 * refine + 0.005 * (growth.crit_rate_pct.max(0) as f32);
    base.p_atk = base.p_atk * refine_mult + (growth.p_atk_flat as f32);
    base.m_atk = base.m_atk * refine_mult + (growth.m_atk_flat as f32);
    base.p_def += growth.p_def_flat as f32;
    base.max_health += growth.max_hp_flat as f32;
    base
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DuelSimulationResult {
    pub job_id: String,
    pub mob_id: String,
    pub base_level: u32,
    pub job_level: u32,
    pub player_dps: f32,
    pub mob_dps: f32,
    pub ttk_seconds: f32,
    pub survival_seconds: f32,
    pub r_ratio: f32,
    pub verdict: String,
    pub kills_to_next_base_level: u32,
    pub minutes_to_next_base_level: f32,
}

/// Simulates a deterministic PvE encounter & leveling speed for a given Job vs. a Catalog Mob,
/// factoring in the 10-Element counter matrix and Weapon-vs-Size modifier from `elements.json`.
pub fn simulate_job_vs_mob(
    job_id: &str,
    base_level: u32,
    job_level: u32,
    allocated: &PrimaryStats,
    weapon_id: Option<&str>,
    refine_level: u32,
    mob_id: &str,
) -> Option<DuelSimulationResult> {
    let mob = MMORPG_CATALOG.mobs.iter().find(|m| m.id == mob_id)?;
    let p_stats = derived_stats_for_job(
        base_level,
        job_id,
        job_level,
        allocated,
        weapon_id,
        refine_level,
    );

    let weapon_kind = weapon_id.unwrap_or("basic_sword");
    let size_mult = (weapon_size_modifier_pct(weapon_kind, &mob.size) as f32) / 100.0;
    let loadout = job_skill_loadout(job_id);
    // Primary rotation uses slot 1 skill element counter
    let elem_mult = (element_counter_pct(&loadout[0].element, &mob.element) as f32) / 100.0;

    let raw_offence = p_stats.p_atk.max(p_stats.m_atk) * size_mult * elem_mult;
    let player_hit = (raw_offence - (mob.p_def as f32).min(raw_offence * 0.8)).max(1.0);
    // 1.25 attacks/sec baseline + skill weave
    let player_dps = player_hit * 1.25;
    let ttk_seconds = (mob.hp as f32 / player_dps).max(0.2);

    let mob_raw = mob.p_atk as f32;
    let mob_hit = (mob_raw - p_stats.p_def.min(mob_raw * 0.8)).max(1.0);
    let mob_dps = mob_hit * 0.85;
    let survival_seconds = (p_stats.max_health / mob_dps).max(0.2);

    let r_ratio = survival_seconds / ttk_seconds;
    let verdict = if r_ratio >= 6.0 {
        "trivial"
    } else if r_ratio >= 3.0 {
        "easy"
    } else if r_ratio >= 1.8 {
        "fair"
    } else if r_ratio >= 1.0 {
        "hard"
    } else {
        "LOSS"
    }
    .to_string();

    let exp_needed = base_exp_to_next_level(base_level);
    let kills_to_next = ((exp_needed as f32) / (mob.base_exp.max(1) as f32)).ceil() as u32;
    // Include 2.5s travel/spawn gap between kills
    let cycle_sec = ttk_seconds + 2.5;
    let minutes_to_next = (kills_to_next as f32 * cycle_sec) / 60.0;

    Some(DuelSimulationResult {
        job_id: job_id.to_string(),
        mob_id: mob_id.to_string(),
        base_level,
        job_level,
        player_dps,
        mob_dps,
        ttk_seconds,
        survival_seconds,
        r_ratio,
        verdict,
        kills_to_next_base_level: kills_to_next,
        minutes_to_next_base_level: minutes_to_next,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SiegeSimulationResult {
    pub castle_id: String,
    pub attacker_count: u32,
    pub barricade_clear_seconds: f32,
    pub emperium_ttk_seconds: f32,
    pub total_siege_breach_minutes: f32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CastleSiegeState {
    pub castle_id: String,
    pub castle_name: String,
    pub owner_guild_name: String,
    pub outer_barricades_remaining: u32,
    pub current_barricade_hp: u32,
    pub max_barricade_hp: u32,
    pub emperium_hp: u32,
    pub max_emperium_hp: u32,
    pub player_damage_scaling_pct: u32,
    pub emperium_only_normal_attacks: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SiegeHitOutcome {
    BarricadeDamaged {
        damage_dealt: u32,
        remaining_barricade_hp: u32,
        barricades_left: u32,
    },
    BarricadeBreached {
        barricades_left: u32,
    },
    EmperiumImmuneToSkills,
    EmperiumDamaged {
        damage_dealt: u32,
        remaining_emperium_hp: u32,
    },
    CastleCaptured {
        new_owner_guild: String,
    },
}

impl CastleSiegeState {
    pub fn from_catalog(castle_id: &str) -> Option<Self> {
        let c = MMORPG_CATALOG.castles.iter().find(|x| x.id == castle_id)?;
        let total_barricades =
            c.fortifications.outer_gate_barricade_count + c.fortifications.inner_gate_barricade_count;
        Some(Self {
            castle_id: c.id.clone(),
            castle_name: c.name.clone(),
            owner_guild_name: "Valkyrie Vanguard".to_string(),
            outer_barricades_remaining: total_barricades,
            current_barricade_hp: c.fortifications.barricade_hp,
            max_barricade_hp: c.fortifications.barricade_hp,
            emperium_hp: c.emperium.hp,
            max_emperium_hp: c.emperium.hp,
            player_damage_scaling_pct: c.pvp_rules.player_damage_scaling_pct,
            emperium_only_normal_attacks: c.emperium.only_normal_attack_damage,
        })
    }

    /// Applies an authoritative GvG Siege attack against the Outer/Inner Barricades or the Holy Emperium.
    /// Enforces:
    /// 1. Barricades must be breached before the Emperium can take damage.
    /// 2. `only_normal_attack_damage`: Active skills deal 0 damage (`EmperiumImmuneToSkills`) to the Holy Emperium.
    /// 3. `player_damage_scaling_pct` (`60%` in `castles.json`) + `10-Element` vs `Holy` (`Shadow` = `150%`, `Holy` = `0%`).
    pub fn apply_siege_attack(
        &mut self,
        raw_damage: u32,
        is_skill_attack: bool,
        attack_element: &str,
        attacker_guild: &str,
    ) -> SiegeHitOutcome {
        let gvg_scaled = ((raw_damage as u64) * (self.player_damage_scaling_pct as u64) / 100).max(1) as u32;

        if self.outer_barricades_remaining > 0 {
            if gvg_scaled >= self.current_barricade_hp {
                self.outer_barricades_remaining -= 1;
                self.current_barricade_hp = if self.outer_barricades_remaining > 0 {
                    self.max_barricade_hp
                } else {
                    0
                };
                return SiegeHitOutcome::BarricadeBreached {
                    barricades_left: self.outer_barricades_remaining,
                };
            } else {
                self.current_barricade_hp -= gvg_scaled;
                return SiegeHitOutcome::BarricadeDamaged {
                    damage_dealt: gvg_scaled,
                    remaining_barricade_hp: self.current_barricade_hp,
                    barricades_left: self.outer_barricades_remaining,
                };
            }
        }

        if self.emperium_only_normal_attacks && is_skill_attack {
            return SiegeHitOutcome::EmperiumImmuneToSkills;
        }

        let elem_pct = element_counter_pct(attack_element, "Holy");
        let emp_damage = ((gvg_scaled as u64) * (elem_pct as u64) / 100) as u32;
        if emp_damage == 0 {
            return SiegeHitOutcome::EmperiumDamaged {
                damage_dealt: 0,
                remaining_emperium_hp: self.emperium_hp,
            };
        }

        if emp_damage >= self.emperium_hp {
            self.owner_guild_name = attacker_guild.to_string();
            self.emperium_hp = self.max_emperium_hp;
            self.outer_barricades_remaining = 4;
            self.current_barricade_hp = self.max_barricade_hp;
            SiegeHitOutcome::CastleCaptured {
                new_owner_guild: self.owner_guild_name.clone(),
            }
        } else {
            self.emperium_hp -= emp_damage;
            SiegeHitOutcome::EmperiumDamaged {
                damage_dealt: emp_damage,
                remaining_emperium_hp: self.emperium_hp,
            }
        }
    }
}

/// Simulates a GvG Castle Siege breach duration against Barricades + the Holy Emperium.
pub fn simulate_castle_siege(
    castle_id: &str,
    attacker_count: u32,
    avg_base_level: u32,
) -> Option<SiegeSimulationResult> {
    let castle = MMORPG_CATALOG.castles.iter().find(|c| c.id == castle_id)?;
    let attackers = attacker_count.clamp(1, castle.max_guild_size) as f32;
    let alloc = PrimaryStats {
        str: 70,
        agi: 50,
        vit: 60,
        int: 20,
        dex: 50,
    };
    let knight = derived_stats_for_job(
        avg_base_level,
        "knight",
        40,
        &alloc,
        Some("scythe"),
        7,
    );
    let gvg_scale = (castle.pvp_rules.player_damage_scaling_pct as f32) / 100.0;
    let per_attacker_dps = knight.p_atk * gvg_scale * 1.35;
    let raid_dps = (per_attacker_dps * attackers).max(1.0);

    let total_barricades = (castle.fortifications.outer_gate_barricade_count
        + castle.fortifications.inner_gate_barricade_count) as f32;
    let total_barricade_hp = total_barricades * (castle.fortifications.barricade_hp as f32);
    let barricade_clear_seconds = total_barricade_hp / raid_dps;

    // Emperium only takes normal-attack damage (~65% of full skill weave DPS)
    let emp_dps = (raid_dps * 0.65).max(1.0);
    let emperium_ttk_seconds = (castle.emperium.hp as f32) / emp_dps;
    let total_siege_breach_minutes = (barricade_clear_seconds + emperium_ttk_seconds + 45.0) / 60.0;

    Some(SiegeSimulationResult {
        castle_id: castle_id.to_string(),
        attacker_count,
        barricade_clear_seconds,
        emperium_ttk_seconds,
        total_siege_breach_minutes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedded_mmorpg_catalogs_parse() {
        assert_eq!(MMORPG_CATALOG.jobs.len(), 6);
        assert_eq!(MMORPG_CATALOG.mobs.len(), 4);
        assert_eq!(MMORPG_CATALOG.cards.len(), 4);
        assert_eq!(MMORPG_CATALOG.quests.len(), 8);
        assert_eq!(MMORPG_CATALOG.handbook.len(), 3);
        assert_eq!(MMORPG_CATALOG.castles.len(), 1);
        assert_eq!(MMORPG_CATALOG.elements.elements.len(), 10);
    }

    #[test]
    fn test_element_counter_and_weapon_size_matrix() {
        assert_eq!(element_counter_pct("Fire", "Earth"), 150);
        assert_eq!(element_counter_pct("Fire", "Water"), 50);
        assert_eq!(element_counter_pct("Holy", "Undead"), 150);
        assert_eq!(weapon_size_modifier_pct("dagger", "Small"), 100);
        assert_eq!(weapon_size_modifier_pct("dagger", "Large"), 50);
        assert_eq!(weapon_size_modifier_pct("scythe", "Large"), 100);

        let mage_skills = job_skill_loadout("mage");
        assert_eq!(mage_skills[0].id, "fire_bolt");
        assert_eq!(mage_skills[0].element, "Fire");
    }

    #[test]
    fn test_castle_siege_barricade_and_emperium_normal_attack_rules() {
        let mut siege =
            CastleSiegeState::from_catalog("castle_valkyrie_01").expect("castle_valkyrie_01 must exist");
        assert_eq!(siege.outer_barricades_remaining, 4);

        // Breach all 4 barricades (each 45,000 HP; 100,000 raw * 60% GvG scaling = 60,000 > 45,000)
        for expected_left in (0..4).rev() {
            let res = siege.apply_siege_attack(100_000, true, "Fire", "Freja Knights");
            assert_eq!(
                res,
                SiegeHitOutcome::BarricadeBreached {
                    barricades_left: expected_left
                }
            );
        }

        // Once barricades are down, active skills are blocked by `onlyNormalAttackDamage: true`
        let skill_attempt = siege.apply_siege_attack(50_000, true, "Fire", "Freja Knights");
        assert_eq!(skill_attempt, SiegeHitOutcome::EmperiumImmuneToSkills);

        // Normal melee attack damages the Holy Emperium and captures the castle when HP reaches 0
        let capture = siege.apply_siege_attack(250_000, false, "Shadow", "Freja Knights");
        assert_eq!(
            capture,
            SiegeHitOutcome::CastleCaptured {
                new_owner_guild: "Freja Knights".to_string()
            }
        );
        assert_eq!(siege.owner_guild_name, "Freja Knights");
    }

    #[test]
    fn test_job_bonuses_and_refine_increase_stats() {
        let alloc = PrimaryStats {
            str: 30,
            agi: 20,
            vit: 25,
            int: 1,
            dex: 20,
        };
        let novice = derived_stats_for_job(20, "novice", 10, &alloc, Some("basic_sword"), 0);
        let swordman = derived_stats_for_job(20, "swordman", 40, &alloc, Some("basic_sword"), 5);
        assert!(swordman.p_atk > novice.p_atk);
        assert!(swordman.max_health > novice.max_health);
    }

    #[test]
    fn test_refine_pity_and_cards_and_handbook_passives() {
        // Safe zone +0 -> +4 always succeeds
        let safe = attempt_refine(3, 0, 9_999);
        assert!(safe.success && safe.new_refine_level == 4);

        // +7 with high roll fails twice, then 3rd attempt triggers guaranteed pity
        let f1 = attempt_refine(7, 0, 9_500);
        assert!(!f1.success && f1.new_pity_count == 1);
        let f2 = attempt_refine(7, f1.new_pity_count, 9_500);
        assert!(!f2.success && f2.new_pity_count == 2);
        let pity = attempt_refine(7, f2.new_pity_count, 9_999);
        assert!(pity.success && pity.triggered_pity && pity.new_refine_level == 8 && pity.new_pity_count == 0);

        // Card socketing + Handbook milestones
        let mut counts = HashMap::new();
        counts.insert("forest_slime".to_string(), 120);
        counts.insert("boar".to_string(), 500);
        counts.insert("prontera_south_field".to_string(), 1);

        let bonuses = compute_card_and_handbook_bonuses(
            &["card_skeleton_soldier", "card_orc_warlord"],
            &["card_forest_slime", "card_boar"],
            &counts,
        );
        assert!(bonuses.p_atk_flat >= 15);
        assert!(bonuses.max_hp_flat >= 850);
        assert!(bonuses.crit_rate_pct >= 9);
        assert!(bonuses.unlocked_handbook_tiers >= 5);
    }

    #[test]
    fn test_pve_and_gvg_simulators_produce_sane_curves() {
        let alloc = PrimaryStats {
            str: 35,
            agi: 25,
            vit: 30,
            int: 10,
            dex: 20,
        };
        let boar_duel = simulate_job_vs_mob(
            "swordman",
            20,
            20,
            &alloc,
            Some("basic_sword"),
            3,
            "boar",
        )
        .expect("boar simulation should succeed");
        assert!(boar_duel.r_ratio > 1.5);
        assert!(boar_duel.ttk_seconds > 0.5 && boar_duel.ttk_seconds < 15.0);

        let siege = simulate_castle_siege("castle_valkyrie_01", 20, 60)
            .expect("castle siege simulation should succeed");
        assert!(siege.emperium_ttk_seconds > 5.0);
        assert!(siege.total_siege_breach_minutes > 0.5);
    }
}
