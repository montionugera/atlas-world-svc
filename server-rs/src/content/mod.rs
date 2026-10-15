pub mod bestiary;
pub mod map;
pub mod stats;
pub mod weapons;

pub use bestiary::{
    derive_mob_stats, BestiaryCatalog, BestiaryEntry, DerivedMobStats, MobTier, BASE_MOB_ATK,
    BESTIARY_JSON,
};
pub use map::{
    HeightTerrace, MapConfig, MapSpawnArea, StaticObstacle, StaticObstacles, TerrainHeightfield,
};
pub use stats::{
    derived_stats, DerivedStats, BASE_ATK, BASE_DEF, BASE_HP, GROWTH, STAT_COEF, STAT_MAX,
};
pub use weapons::{weapon_offence, AtkStat, WeaponOffence, GEAR_REFERENCE, UNARMED_GEAR};
