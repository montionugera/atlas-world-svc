use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::clock::SimClock;
use crate::core::prng::{Lcg, Mulberry32};
use crate::ecs::components::{
    AiAgent, BotAgent, CombatStats, EntityId, Health, MobTag, PlayerTag, Position, Velocity,
};
use crate::physics::world::PhysicsWorld;
use crate::spatial::grid::SpatialGrid;
use crate::systems::{
    bot_steering_system, combat_system, physics_step_system, separation_system,
    spatial_grid_rebuild_system, ArenaBounds,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntityTraceSnapshot {
    pub id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub health: f32,
    #[serde(rename = "isAlive")]
    pub is_alive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behavior: Option<String>,
    #[serde(rename = "targetId", skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TickTraceSnapshot {
    pub tick: u32,
    #[serde(rename = "simTimeMs")]
    pub sim_time_ms: u64,
    pub entities: Vec<EntityTraceSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FinalSummary {
    #[serde(rename = "alivePlayers")]
    pub alive_players: usize,
    #[serde(rename = "aliveMobs")]
    pub alive_mobs: usize,
    #[serde(rename = "totalDamageEvents", skip_serializing_if = "Option::is_none")]
    pub total_damage_events: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimulationTrace {
    pub seed: u32,
    #[serde(rename = "totalTicks")]
    pub total_ticks: u32,
    #[serde(rename = "tickRateMs")]
    pub tick_rate_ms: u64,
    #[serde(rename = "arenaWidth")]
    pub arena_width: f32,
    #[serde(rename = "arenaHeight")]
    pub arena_height: f32,
    pub snapshots: Vec<TickTraceSnapshot>,
    #[serde(rename = "finalSummary")]
    pub final_summary: FinalSummary,
}

pub struct AtlasSimulation {
    pub world: World,
    pub schedule: Schedule,
    pub clock: SimClock,
    pub prng: Mulberry32,
    pub arena_width: f32,
    pub arena_height: f32,
}

impl AtlasSimulation {
    pub fn new(seed: u32, arena_width: f32, arena_height: f32) -> Self {
        bevy_tasks::ComputeTaskPool::get_or_init(|| {
            let threads = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4);
            bevy_tasks::TaskPoolBuilder::new()
                .num_threads(threads)
                .build()
        });

        let mut world = World::new();

        let clock = SimClock::default();
        let prng = Mulberry32::new(seed);
        let spatial_grid = SpatialGrid::new_with_bounds(25.0, arena_width, arena_height);
        let physics_world = PhysicsWorld::new(arena_width, arena_height);
        let arena_bounds = ArenaBounds::new(arena_width, arena_height);

        world.insert_resource(clock.clone());
        world.insert_resource(prng.clone());
        world.insert_resource(spatial_grid);
        world.insert_resource(physics_world);
        world.insert_resource(arena_bounds);

        let mut schedule = Schedule::default();
        schedule.add_systems(
            (
                bot_steering_system,
                spatial_grid_rebuild_system,
                separation_system,
                physics_step_system,
                combat_system,
            )
                .chain(),
        );

        Self {
            world,
            schedule,
            clock,
            prng,
            arena_width,
            arena_height,
        }
    }

    pub fn with_arena(
        seed: u32,
        arena_width: f32,
        arena_height: f32,
        player_count: usize,
        mob_count: usize,
    ) -> Self {
        let mut sim = Self::new(seed, arena_width, arena_height);
        sim.populate_entities(seed, player_count, mob_count);
        sim
    }

    pub fn init(seed: u32, player_count: usize, mob_count: usize) -> Self {
        Self::with_arena(seed, 1000.0, 1000.0, player_count, mob_count)
    }

    pub fn populate_entities(&mut self, seed: u32, player_count: usize, mob_count: usize) {
        let mut prng = Mulberry32::new(seed);
        let mut lcg = Lcg::new(seed);

        // Spawn players matching DeterministicSimHarness.ts
        for i in 0..player_count {
            let id = format!("det-p{}", i);
            let x = prng.range(100.0, self.arena_width - 100.0);
            let y = prng.range(100.0, self.arena_height - 100.0);
            let angle = prng.range(0.0, std::f32::consts::PI * 2.0);
            let bot_vx = angle.cos();
            let bot_vy = angle.sin();

            self.world.spawn((
                EntityId(id.clone()),
                Position::new(x, y),
                Velocity::zero(),
                Health::new(100.0),
                PlayerTag,
                BotAgent::new(id, bot_vx, bot_vy),
                CombatStats {
                    is_player: true,
                    ..Default::default()
                },
            ));
        }

        // Spawn mobs matching DeterministicSimHarness.ts
        for i in 0..mob_count {
            let x = prng.range(50.0, self.arena_width - 50.0);
            let y = prng.range(50.0, self.arena_height - 50.0);
            let rand2 = lcg.next_base36_2();
            let id = format!("mob-debug-{}-{}", i + 1, rand2);

            self.world.spawn((
                EntityId(id),
                Position::new(x, y),
                Velocity::zero(),
                Health::new(100.0),
                MobTag,
                AiAgent::new("idle", None),
                CombatStats {
                    is_player: false,
                    ..Default::default()
                },
            ));
        }

        // Keep PRNG updated in resources and struct
        self.prng = prng.clone();
        if let Some(mut res_prng) = self.world.get_resource_mut::<Mulberry32>() {
            *res_prng = prng;
        }
    }

    pub fn step(&mut self) {
        // Advance clock
        if let Some(mut clock) = self.world.get_resource_mut::<SimClock>() {
            clock.advance();
            self.clock = clock.clone();
        }

        // Run schedule
        self.schedule.run(&mut self.world);

        // Sync prng resource back to struct
        if let Some(prng) = self.world.get_resource::<Mulberry32>() {
            self.prng = prng.clone();
        }
    }

    pub fn capture_snapshot(&mut self, tick: u32) -> TickTraceSnapshot {
        let round4 = |v: f32| (v * 10000.0).round() / 10000.0;
        let round2 = |v: f32| (v * 100.0).round() / 100.0;

        let mut entities = Vec::new();

        // Query players
        let mut player_query = self
            .world
            .query_filtered::<(&EntityId, &Position, &Velocity, &Health), With<PlayerTag>>();
        for (id, pos, vel, health) in player_query.iter(&self.world) {
            entities.push(EntityTraceSnapshot {
                id: id.0.clone(),
                entity_type: "player".to_string(),
                x: round4(pos.x),
                y: round4(pos.y),
                vx: round4(vel.vx),
                vy: round4(vel.vy),
                health: round2(health.current),
                is_alive: health.is_alive,
                behavior: None,
                target_id: None,
            });
        }

        // Query mobs
        let mut mob_query = self.world.query_filtered::<(
            &EntityId,
            &Position,
            &Velocity,
            &Health,
            Option<&AiAgent>,
        ), With<MobTag>>();
        for (id, pos, vel, health, ai) in mob_query.iter(&self.world) {
            entities.push(EntityTraceSnapshot {
                id: id.0.clone(),
                entity_type: "mob".to_string(),
                x: round4(pos.x),
                y: round4(pos.y),
                vx: round4(vel.vx),
                vy: round4(vel.vy),
                health: round2(health.current),
                is_alive: health.is_alive,
                behavior: Some(
                    ai.map(|a| a.behavior.clone())
                        .unwrap_or_else(|| "idle".to_string()),
                ),
                target_id: ai.and_then(|a| a.target_id.clone()),
            });
        }

        // Sort entities deterministically by id
        entities.sort_by(|a, b| a.id.cmp(&b.id));

        TickTraceSnapshot {
            tick,
            sim_time_ms: self.clock.now(),
            entities,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simulation_init_and_tick0_snapshot() {
        let mut sim = AtlasSimulation::init(0x1337c0de, 10, 50);
        let snapshot = sim.capture_snapshot(0);

        assert_eq!(snapshot.tick, 0);
        assert_eq!(snapshot.sim_time_ms, 0);
        assert_eq!(snapshot.entities.len(), 60);

        // Check first player
        let p0 = snapshot.entities.iter().find(|e| e.id == "det-p0").unwrap();
        assert_eq!(p0.x, 306.3883);
        assert_eq!(p0.y, 305.724);
        assert_eq!(p0.vx, 0.0);
        assert_eq!(p0.vy, 0.0);
        assert_eq!(p0.health, 100.0);
        assert!(p0.is_alive);

        // Check first mob
        let m0 = snapshot
            .entities
            .iter()
            .find(|e| e.id == "mob-debug-1-9e")
            .unwrap();
        assert_eq!(m0.x, 212.3504);
        assert!((m0.y - 139.9755).abs() <= 0.001);
        assert_eq!(m0.vx, 0.0);
        assert_eq!(m0.vy, 0.0);
        assert_eq!(m0.health, 100.0);
        assert!(m0.is_alive);
        assert_eq!(m0.behavior.as_deref(), Some("idle"));
    }

    #[test]
    fn test_simulation_step_1000_ticks_no_panics() {
        let mut sim = AtlasSimulation::init(0x1337c0de, 10, 50);
        for _ in 1..=1000 {
            sim.step();
        }
        assert_eq!(sim.clock.tick(), 1000);
        assert_eq!(sim.clock.now(), 50000);

        let snapshot = sim.capture_snapshot(1000);
        assert_eq!(snapshot.tick, 1000);
        for e in snapshot.entities {
            assert!(!e.x.is_nan());
            assert!(!e.y.is_nan());
            assert!(!e.vx.is_nan());
            assert!(!e.vy.is_nan());
            assert!(!e.health.is_nan());
        }
    }
}
