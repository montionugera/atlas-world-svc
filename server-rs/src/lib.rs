pub mod ai;
pub mod auth;
pub mod combat;
pub mod content;
pub mod core;
pub mod ecs;
pub mod fleet;
pub mod net;
pub mod physics;
pub mod protocol;
pub mod simulation;
pub mod spatial;
pub mod storage;
pub mod systems;

pub use ai::{ThreatEntry, ThreatTable, DEFAULT_THREAT_HALF_LIFE};
pub use auth::{AuthError, AuthGuard, Claims};
pub use combat::{
    get_element_multiplier, get_skill, DamageCalculator, DamageOptions, DamageType, Element,
    SkillDefinition, SkillEffect, ALL_ELEMENTS, GLOBAL_MAGIC_CD_KEY,
};
pub use content::{
    derive_mob_stats, derived_stats, weapon_offence, AtkStat, BestiaryCatalog, BestiaryEntry,
    DerivedMobStats, DerivedStats, MobTier, WeaponOffence, BASE_ATK, BASE_DEF, BASE_HP,
    BASE_MOB_ATK, BESTIARY_JSON, GEAR_REFERENCE, GROWTH, STAT_COEF, STAT_MAX, UNARMED_GEAR,
};
pub use fleet::{AgonesClient, FleetLifecycle, FleetState, HeartbeatTask, MockFleetClient};
pub use net::{ClientPacket, WsServer};
pub use storage::{
    EquippedItemIds, LoadoutSnapshot, MatchEvent, MatchEventBatch, MatchEventQueue,
    MockNakamaClient, NakamaClient, NakamaStorage, PrimaryStats, ProfileDoc,
};

pub use core::{Lcg, Mulberry32, SimClock};
pub use ecs::{
    AiAgent, AiState, BotAgent, CastingState, CombatStats, CooldownTracker, DeadMobTracker,
    ElementalAttributes, EntityId, Health, MobAi, MobSpawnAnchor, MobTag, PlayerInputState,
    PlayerTag, Position, Projectile, StatusEffects, Velocity,
};
pub use physics::{PhysicsWorld, RapierBodyHandle, RapierColliderHandle};
pub use protocol::{
    serialize_snapshot, EntitySnapshotData, EntityType, SnapshotBuilder, WorldSnapshot,
};
pub use simulation::{
    AtlasSimulation, EntityTraceSnapshot, FinalSummary, SimulationTrace, TickTraceSnapshot,
};
pub use spatial::SpatialGrid;
pub use systems::{
    bot_steering_system, combat_system, cooldown_tick_system, mob_ai_system, mob_lifecycle_system,
    physics_step_system, player_input_system, projectile_collision_system,
    projectile_kinematics_system, separation_system, skill_execution_system,
    spatial_grid_rebuild_system, status_effect_tick_system, ArenaBounds,
};
