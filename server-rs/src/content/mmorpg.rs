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
    pub castles: Vec<CastleCatalogEntry>,
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
    let castles: Vec<CastleCatalogEntry> =
        serde_json::from_str(CASTLES_JSON).expect("castles.json must be valid");

    MmorpgCatalogRegistry {
        jobs,
        mobs,
        cards,
        quests,
        castles,
    }
});

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
/// Refine level (`+0..+15`), and Equipped/Deposited Monster Cards.
pub fn derived_stats_for_job(
    base_level: u32,
    job_id: &str,
    job_level: u32,
    allocated: &PrimaryStats,
    weapon_id: Option<&str>,
    refine_level: u32,
) -> DerivedStats {
    let eff = effective_stats_with_job(allocated, job_id, job_level);
    let mut base = derived_stats(base_level, &eff, weapon_id);
    let refine = refine_level.min(15) as f32;
    // Each refine level adds +2.5% weapon offence
    let refine_mult = 1.0 + 0.025 * refine;
    base.p_atk *= refine_mult;
    base.m_atk *= refine_mult;
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

/// Simulates a deterministic PvE encounter & leveling speed for a given Job vs. a Catalog Mob.
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

    let raw_offence = p_stats.p_atk.max(p_stats.m_atk);
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
        assert_eq!(MMORPG_CATALOG.castles.len(), 1);
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
