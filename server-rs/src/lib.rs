pub mod auth;
pub mod combat;
pub mod core;
pub mod ecs;
pub mod fleet;
pub mod net;
pub mod physics;
pub mod protocol;
pub mod simulation;
pub mod spatial;
pub mod systems;

pub use auth::{AuthError, AuthGuard, Claims};
pub use combat::{
    get_element_multiplier, get_skill, DamageCalculator, DamageOptions, DamageType, Element,
    SkillDefinition, SkillEffect, ALL_ELEMENTS, GLOBAL_MAGIC_CD_KEY,
};
pub use fleet::{AgonesClient, FleetLifecycle, FleetState, HeartbeatTask, MockFleetClient};
pub use net::{ClientPacket, WsServer};

pub use core::{Lcg, Mulberry32, SimClock};
pub use ecs::{
    AiAgent, BotAgent, CastingState, CombatStats, CooldownTracker, ElementalAttributes, EntityId,
    Health, MobTag, PlayerInputState, PlayerTag, Position, Projectile, StatusEffects, Velocity,
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
    bot_steering_system, combat_system, cooldown_tick_system, physics_step_system,
    player_input_system, projectile_collision_system, projectile_kinematics_system,
    separation_system, skill_execution_system, spatial_grid_rebuild_system,
    status_effect_tick_system, ArenaBounds,
};
