use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::content::{derived_stats, BestiaryCatalog};
use crate::core::clock::SimClock;
use crate::core::prng::{Lcg, Mulberry32};
use crate::ecs::components::{
    AiAgent, BotAgent, CastingState, CombatStats, CooldownTracker, ElementalAttributes, EntityId,
    Health, MobTag, PlayerAvatar, PlayerInputState, PlayerTag, Position, StatusEffects, Velocity,
};
use crate::physics::world::PhysicsWorld;
use crate::spatial::grid::SpatialGrid;
use crate::storage::{MatchEvent, MatchEventQueue, PrimaryStats};
use crate::systems::{
    bot_steering_system, combat_system, cooldown_tick_system, mob_ai_system, mob_lifecycle_system,
    physics_step_system, player_input_system, projectile_collision_system,
    projectile_kinematics_system, separation_system, skill_execution_system,
    spatial_grid_rebuild_system, status_effect_tick_system, ArenaBounds,
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
        world.insert_resource(BestiaryCatalog::default());
        world.insert_resource(MatchEventQueue::default());

        let mut schedule = Schedule::default();
        schedule.add_systems(
            (
                cooldown_tick_system,
                status_effect_tick_system,
                player_input_system,
                skill_execution_system,
                bot_steering_system,
                mob_ai_system,
                spatial_grid_rebuild_system,
                separation_system,
                projectile_kinematics_system,
                projectile_collision_system,
                physics_step_system,
                combat_system,
                mob_lifecycle_system,
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

    /// Spawns a human-controlled player avatar in the ECS world with persistent loadout stats.
    pub fn spawn_player_avatar_with_loadout(
        &mut self,
        session_id: &str,
        x: f32,
        y: f32,
        loadout: Option<&crate::storage::LoadoutSnapshot>,
    ) -> Entity {
        let (level, allocated, weapon_id) = match loadout {
            Some(l) => (
                l.profile.level,
                l.profile.allocated,
                l.equipped_item_ids.weapon.as_deref(),
            ),
            None => (1, PrimaryStats::default(), Some("basic_sword")),
        };

        let derived = derived_stats(level, &allocated, weapon_id);

        self.world
            .spawn((
                EntityId(session_id.to_string()),
                Position::new(x, y),
                Velocity::zero(),
                Health::new(derived.max_health),
                PlayerTag,
                PlayerAvatar::new(session_id, derived.max_move_speed * 10.0),
                PlayerInputState::default(),
                CombatStats {
                    attack_power: derived.p_atk.max(derived.m_atk).max(1.0),
                    defense: derived.p_def,
                    attack_range: 40.0,
                    attack_cooldown: 0.8,
                    cooldown_timer: 0.0,
                    is_player: true,
                },
                ElementalAttributes {
                    element: crate::combat::elements::Element::Neutral,
                    p_def: derived.p_def,
                    m_def: derived.m_def,
                    armor: 0.0,
                },
                CooldownTracker::default(),
                CastingState::default(),
                StatusEffects::default(),
            ))
            .id()
    }

    /// Spawns a human-controlled player avatar in the ECS world with default level 1 loadout.
    pub fn spawn_player_avatar(&mut self, session_id: &str, x: f32, y: f32) -> Entity {
        self.spawn_player_avatar_with_loadout(session_id, x, y, None)
    }

    /// Drains queued match events from the ECS simulation.
    pub fn drain_match_events(&mut self) -> Vec<(String, MatchEvent)> {
        self.world
            .get_resource_mut::<MatchEventQueue>()
            .map(|mut q| q.drain())
            .unwrap_or_default()
    }

    /// Removes a player avatar from the ECS world when disconnected.
    pub fn remove_player_avatar(&mut self, session_id: &str) -> bool {
        let mut to_despawn = None;
        let mut query = self.world.query::<(Entity, &EntityId, &PlayerAvatar)>();
        for (entity, id, _avatar) in query.iter(&self.world) {
            if id.0 == session_id {
                to_despawn = Some(entity);
                break;
            }
        }

        if let Some(entity) = to_despawn {
            self.world.despawn(entity);
            true
        } else {
            false
        }
    }

    /// Applies client input state to the player avatar, auto-spawning if necessary.
    pub fn apply_player_input(&mut self, session_id: &str, input: &crate::protocol::ClientInput) {
        let mut found = false;
        let mut query = self
            .world
            .query::<(&EntityId, &mut PlayerInputState, &mut CombatStats)>();
        for (id, mut input_state, mut combat) in query.iter_mut(&mut self.world) {
            if id.0 == session_id {
                input_state.move_x = input.move_x();
                input_state.move_y = input.move_y();
                input_state.attack = input.attack();
                // Latch one-shot skill presses: a movement packet arriving in the same
                // tick (skill_slot = 0) must not erase a press before skill_execution
                // consumes it.
                if input.skill_slot() != 0 {
                    input_state.skill_slot = input.skill_slot();
                }
                input_state.target_id = input.target_id();
                input_state.client_tick = input.client_tick();

                if input.attack() {
                    combat.is_player = true;
                }
                found = true;
                break;
            }
        }

        if !found {
            let center_x = self.arena_width / 2.0;
            let center_y = self.arena_height / 2.0;
            let entity = self.spawn_player_avatar(session_id, center_x, center_y);
            if let Some(mut state) = self.world.get_mut::<PlayerInputState>(entity) {
                state.move_x = input.move_x();
                state.move_y = input.move_y();
                state.attack = input.attack();
                state.skill_slot = input.skill_slot();
                state.target_id = input.target_id();
                state.client_tick = input.client_tick();
            }
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

    #[test]
    fn test_skill_press_survives_same_tick_move_packet() {
        use crate::protocol::{deserialize_client_input, serialize_client_input};
        let mut sim = AtlasSimulation::new(1, 500.0, 500.0);
        let e = sim.spawn_player_avatar("p", 100.0, 100.0);
        let press = serialize_client_input(1, 0.0, 0.0, false, 5, 0); // dash
        let mv = serialize_client_input(2, 0.0, 1.0, false, 0, 0); // move down, same tick
        sim.apply_player_input("p", &deserialize_client_input(&press).unwrap());
        sim.apply_player_input("p", &deserialize_client_input(&mv).unwrap());
        let st = sim.world.get::<PlayerInputState>(e).unwrap();
        assert_eq!(st.skill_slot, 5, "press must be latched until consumed");
        assert_eq!(st.move_y, 1.0);
        sim.step();
        let st = sim.world.get::<PlayerInputState>(e).unwrap();
        assert_eq!(st.skill_slot, 0, "consumed by skill_execution");
        assert!(
            sim.world
                .get::<CooldownTracker>(e)
                .unwrap()
                .get_remaining("skill_dash")
                > 0.0
        );
    }

    #[test]
    fn test_player_avatar_input_and_movement() {
        use crate::protocol::{deserialize_client_input, serialize_client_input};

        let mut sim = AtlasSimulation::new(0x1337c0de, 500.0, 500.0);
        let session_id = "user-alice-123";
        let avatar_entity = sim.spawn_player_avatar(session_id, 200.0, 200.0);

        let initial_pos = sim.world.get::<Position>(avatar_entity).cloned().unwrap();
        assert_eq!(initial_pos.x, 200.0);
        assert_eq!(initial_pos.y, 200.0);

        // Send movement input: move right (x=1.0, y=0.0)
        let input_bytes = serialize_client_input(1, 1.0, 0.0, false, 0, 0);
        let client_input = deserialize_client_input(&input_bytes).unwrap();
        sim.apply_player_input(session_id, &client_input);

        // Step simulation (dt = 0.05s, speed = 202.0 => dx = 10.1)
        sim.step();

        let updated_pos = sim.world.get::<Position>(avatar_entity).cloned().unwrap();
        let updated_vel = sim.world.get::<Velocity>(avatar_entity).cloned().unwrap();

        assert!((updated_vel.vx - 202.0).abs() < 2.0);
        assert!((updated_vel.vy - 0.0).abs() < 0.1);
        assert!((updated_pos.x - 210.1).abs() < 0.2);
        assert!((updated_pos.y - 200.0).abs() < 0.1);

        // Test remove avatar
        let removed = sim.remove_player_avatar(session_id);
        assert!(removed);
        assert!(sim.world.get_entity(avatar_entity).is_err());
    }
}
