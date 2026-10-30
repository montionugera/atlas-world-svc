pub mod ai;
pub mod auth;
pub mod combat;
pub mod content;
pub mod core;
pub mod debug;
pub mod ecs;
pub mod fleet;
pub mod load_harness;
pub mod meta;
pub mod net;
pub mod physics;
pub mod protocol;
pub mod simulation;
pub mod spatial;
pub mod storage;
pub mod systems;
pub mod ws_swarm;

pub use ai::{ThreatEntry, ThreatTable, DEFAULT_THREAT_HALF_LIFE};
pub use auth::{AuthError, AuthGuard, Claims};
pub use combat::{
    get_element_multiplier, get_skill, ActiveBuff, AuraEmitter, BuffCategory, BuffContainer,
    CombinedBuffMultipliers, DamageCalculator, DamageOptions, DamageType, Element, SkillDefinition,
    SkillEffect, ALL_ELEMENTS, GLOBAL_MAGIC_CD_KEY,
};
pub use content::{
    attempt_high_tier_enchant, compute_enchant_stat_multipliers, derive_mob_stats, derived_stats,
    derived_stats_with_race, weapon_offence, AtkStat, AtlasRace, BestiaryCatalog, BestiaryEntry,
    DerivedMobStats, DerivedStats, EnchantResultKind, EnchantVisualGlow, HighTierEnchantOutcome,
    ItemSocketState, MobTier, RaceProfile, SpecialAbility, WeaponOffence, BASE_ATK, BASE_DEF,
    BASE_HP, BASE_MOB_ATK, BESTIARY_JSON, GEAR_REFERENCE, GROWTH, MAX_ENCHANT_TIER,
    SAFE_ENCHANT_TIER, STAT_COEF, STAT_MAX, UNARMED_GEAR,
};
pub use fleet::{
    AgonesClient, DungeonInstance, DungeonRegistry, DungeonState, FleetLifecycle, FleetState,
    HeartbeatTask, MockFleetClient, MvpRewardDistribution,
};
pub use load_harness::{
    measure_tier, run_capacity_sweep, CapacitySweepReport, CapacityTierReport,
    DEFAULT_CAPACITY_TIERS,
};
pub use net::{ClientPacket, WsServer};
pub use ws_swarm::{run_swarm, SwarmConfig, SwarmReport};
pub use storage::{
    normalize_match_event_type, CharacterStateBuffer, CharacterStateSnapshot, EquippedItemIds,
    LoadoutSnapshot, MatchEvent, MatchEventBatch, MatchEventBuffer, MatchEventQueue,
    MockNakamaClient, NakamaClient, NakamaStorage, PrimaryStats, ProfileDoc, SkillUnlock,
    DEFAULT_CHARACTER_STATE_FLUSH_INTERVAL, DEFAULT_MATCH_EVENT_FLUSH_INTERVAL,
    DEFAULT_NAKAMA_MATCH_ID,
};

pub use core::{Lcg, Mulberry32, SimClock};
pub use ecs::{
    AiAgent, AiState, AttackFacingCone, BotAgent, CastingState, CombatStats, CooldownTracker,
    DashState, DeadMobTracker, ElementalAttributes, EntityId, EquippedWeapon, Health, Mass, MobAi,
    MobSpawnAnchor, MobTag, MobWindupConfig, Parried, ParryState, PlayerInputState, PlayerTag,
    Position, Projectile, RaceComponent, StatusEffects, Velocity, WeaponGlowComponent, WeaponKind,
    MAX_PARRY_CHARGES, MAX_PARRY_HOLD_WINDOW_SEC, MOB_FACING_CONE_HALF_ANGLE_COS,
    MOB_WINDUP_DURATION_SEC, PARRY_COOLDOWN_SEC, PARRY_REFLECT_STAGGER_SEC,
};
pub use physics::{PhysicsWorld, RapierBodyHandle, RapierColliderHandle};
pub use protocol::{
    serialize_snapshot, EntitySnapshotData, EntityType, SnapshotBuilder, WorldSnapshot,
};
pub use simulation::{
    AtlasSimulation, EntityTraceSnapshot, FinalSummary, SimulationTrace, TickTraceSnapshot,
};
pub use spatial::{AoiTracker, SpatialGrid};
pub use systems::{
    bot_steering_system, buff_and_aura_tick_system, combat_system, cooldown_tick_system,
    mob_ai_system, mob_lifecycle_system, parry_tick_system, physics_step_system,
    player_input_system, projectile_collision_system, projectile_kinematics_system,
    separation_system, skill_execution_system, spatial_grid_rebuild_system,
    status_effect_tick_system, ArenaBounds,
};
