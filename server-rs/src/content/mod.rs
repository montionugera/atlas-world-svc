pub mod bestiary;
pub mod map;
pub mod mmorpg;
pub mod stats;
pub mod weapons;

pub use bestiary::{
    derive_mob_stats, BestiaryCatalog, BestiaryEntry, DerivedMobStats, MobTier, BASE_MOB_ATK,
    BESTIARY_JSON,
};
pub use map::{
    HeightTerrace, MapConfig, MapSpawnArea, StaticObstacle, StaticObstacles, TerrainHeightfield,
};
pub use mmorpg::{
    base_exp_to_next_level, derived_stats_for_job, effective_stats_with_job,
    job_exp_to_next_level, simulate_castle_siege, simulate_job_vs_mob, CardCatalogEntry,
    CastleCatalogEntry, DuelSimulationResult, JobCatalogEntry, MmorpgCatalogRegistry,
    MobCatalogEntry, QuestBoardCatalogEntry, SiegeSimulationResult, MMORPG_CATALOG,
};
pub use stats::{
    derived_stats, DerivedStats, BASE_ATK, BASE_DEF, BASE_HP, GROWTH, STAT_COEF, STAT_MAX,
};
pub use weapons::{weapon_offence, AtkStat, WeaponOffence, GEAR_REFERENCE, UNARMED_GEAR};
