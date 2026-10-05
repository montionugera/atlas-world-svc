pub mod core;
pub mod ecs;
pub mod physics;
pub mod protocol;
pub mod simulation;
pub mod spatial;
pub mod systems;

pub use core::{Lcg, Mulberry32, SimClock};
pub use ecs::{
    AiAgent, BotAgent, CombatStats, EntityId, Health, MobTag, PlayerTag, Position, Velocity,
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
    bot_steering_system, combat_system, physics_step_system, separation_system,
    spatial_grid_rebuild_system, ArenaBounds,
};
