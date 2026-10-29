pub mod bestiary;
pub mod enchantment;
pub mod item_catalog;
pub mod map;
pub mod mmorpg;
pub mod races;
pub mod stats;
pub mod weapons;
pub mod world_model;
pub mod world_regions;

pub use bestiary::{
    derive_mob_stats, BestiaryCatalog, BestiaryEntry, DerivedMobStats, MobTier, BASE_MOB_ATK,
    BESTIARY_JSON, BOSS_ATK_MULTIPLIER, BOSS_HP_MULTIPLIER,
};
pub use enchantment::{
    attempt_high_tier_enchant, compute_enchant_stat_multipliers, enchant_success_rate_bps,
    EnchantResultKind, EnchantVisualGlow, HighTierEnchantOutcome, ItemSocketState, SpecialAbility,
    MAX_ENCHANT_TIER, SAFE_ENCHANT_TIER,
};
pub use item_catalog::{EquipmentSlot, ItemCatalog, ItemDefinition, LootDropSpec};
pub use map::{
    HeightTerrace, MapConfig, MapSpawnArea, StaticObstacle, StaticObstacles, TerrainHeightfield,
    TerrainType, TerrainZone, TerrainZones,
};
pub use mmorpg::{
    base_exp_to_next_level, derived_stats_for_job, effective_stats_with_job, job_exp_to_next_level,
    simulate_castle_siege, simulate_job_vs_mob, CardCatalogEntry, CastleCatalogEntry,
    DuelSimulationResult, JobCatalogEntry, MmorpgCatalogRegistry, MobCatalogEntry,
    QuestBoardCatalogEntry, SiegeSimulationResult, MMORPG_CATALOG,
};
pub use races::{AtlasRace, RaceProfile};
pub use stats::{
    derived_stats, derived_stats_with_race, DerivedStats, BASE_ATK, BASE_DEF, BASE_HP, GROWTH,
    STAT_COEF, STAT_MAX,
};
pub use weapons::{weapon_offence, AtkStat, WeaponOffence, GEAR_REFERENCE, UNARMED_GEAR};
pub use world_model::{
    WorldModelConfig, AOI_ENTER_RADIUS_UNITS, AOI_EXIT_RADIUS_UNITS, BORDER_GHOST_BAND_UNITS,
    CROSSING_MECHANISM, HANDOFF_HYSTERESIS_UNITS, REGION_SIZE_UNITS, SIM_WARN_BUDGET_MS,
    WORLD_STATE_STORE_KIND, WORLD_TICK_BUDGET_MS, WORLD_TICK_RATE_HZ,
};
pub use world_regions::{
    embedded_region_json, load_generated_region_config, resolve_room_or_region_id,
    GENERATED_REGION_IDS,
};
