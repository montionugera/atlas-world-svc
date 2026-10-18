use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::ai::ThreatTable;
use crate::content::{derived_stats, BestiaryCatalog, MobTier};
use crate::core::clock::SimClock;
use crate::core::prng::{Lcg, Mulberry32};
use crate::ecs::components::{
    AiAgent, BodyRadius, BotAgent, CastingState, CombatStats, CooldownTracker, DashState,
    DespawnedIds, ElementalAttributes, EntityId, Health, HitLog, LiveRules, Mass, MobSpawnAnchor,
    MobTag, PlayerAvatar, PlayerInputState, PlayerTag, Position, Projectile, SpawnPoint,
    StatusEffects, Velocity, MOB_BODY_RADIUS, PLAYER_BODY_RADIUS,
};
use crate::net::ClientPacket;
use crate::physics::world::PhysicsWorld;
use crate::protocol::{EntitySnapshotData, EntityType, GameEventData, GameEventKind};
use crate::spatial::grid::SpatialGrid;
use crate::storage::{
    CharacterStateSnapshot, LoadoutSnapshot, MatchEvent, MatchEventQueue, PrimaryStats,
};
use crate::systems::{
    body_collision_system, bot_steering_system, combat_system, cooldown_tick_system,
    live_bot_ai_system, mob_ai_system, mob_bundle, mob_lifecycle_system, physics_step_system,
    player_input_system, player_respawn_system, projectile_collision_system,
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

/// Configuration for the live game-server runtime (`main.rs`). The golden-trace harness
/// uses `with_arena`/`populate_entities` instead and must never go through this path.
#[derive(Debug, Clone, PartialEq)]
pub struct LiveConfig {
    pub seed: u32,
    pub arena_width: f32,
    pub arena_height: f32,
    pub bot_count: usize,
    pub mob_count: usize,
    pub mob_respawn_sec: f32,
    pub player_respawn_sec: f32,
    pub map_id: Option<String>,
}

impl Default for LiveConfig {
    fn default() -> Self {
        Self {
            seed: 0x1337c0de,
            arena_width: 1000.0,
            arena_height: 1000.0,
            bot_count: 10,
            mob_count: 50,
            mob_respawn_sec: 5.0,
            player_respawn_sec: 5.0,
            map_id: None,
        }
    }
}

/// Dead mobs stay visible (flagged dead) this long before despawning.
pub const MOB_CORPSE_SEC: f32 = 0.5;

/// One live tick's wire-ready output (what `main.rs` broadcasts).
#[derive(Debug, Clone, PartialEq)]
pub struct LiveFrame {
    pub tick: u32,
    pub sim_time_ms: u64,
    pub entities: Vec<EntitySnapshotData>,
    pub removed_ids: Vec<u32>,
    pub events: Vec<GameEventData>,
    /// Drained `MatchEventQueue` (user id, event) for persistence; not sent to clients.
    pub match_events: Vec<(String, MatchEvent)>,
    /// Captured position and health of players who disconnected this tick (before despawn).
    pub departed_states: Vec<(String, CharacterStateSnapshot)>,
}

pub struct AtlasSimulation {
    pub world: World,
    pub schedule: Schedule,
    pub clock: SimClock,
    pub prng: Mulberry32,
    pub map_id: String,
    pub arena_width: f32,
    pub arena_height: f32,
    /// Where a joining player's avatar appears (arena centre unless the map says otherwise).
    pub player_spawn: Position,
    /// Development mode (see `debug::debug_enabled`): unlocks the debug controls.
    pub debug_enabled: bool,
    /// Respawn delay given to mobs spawned after start-up.
    pub mob_respawn_sec: f32,
    /// Per-account persistent character loadout applied when spawning the player's avatar.
    session_loadouts: HashMap<String, LoadoutSnapshot>,
    /// Number of simulation ticks to retain a disconnected player's avatar before despawning (0 = immediate).
    disconnect_grace_ticks: u32,
    /// Active disconnect grace countdowns (`session_id` -> remaining ticks).
    pending_disconnects: HashMap<String, u32>,
    next_bot_index: usize,
    pub(crate) debug_mob_seq: u32,
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
        // The systems are fully chained: run them inline rather than through a task pool.
        schedule.set_executor_kind(bevy_ecs::schedule::ExecutorKind::SingleThreaded);
        schedule.add_systems(
            (
                cooldown_tick_system,
                status_effect_tick_system,
                player_input_system,
                skill_execution_system,
                bot_steering_system,
                live_bot_ai_system,
                mob_ai_system,
                spatial_grid_rebuild_system,
                separation_system,
                projectile_kinematics_system,
                projectile_collision_system,
                physics_step_system,
                // Live-only (BodyRadius / LiveRules gated): no-ops for the golden trace.
                body_collision_system,
                combat_system,
                mob_lifecycle_system,
                player_respawn_system,
            )
                .chain(),
        );

        Self {
            world,
            schedule,
            clock,
            prng,
            map_id: "map-for-play".to_string(),
            arena_width,
            arena_height,
            player_spawn: Position::new(arena_width / 2.0, arena_height / 2.0),
            debug_enabled: false,
            mob_respawn_sec: LiveConfig::default().mob_respawn_sec,
            session_loadouts: HashMap::new(),
            disconnect_grace_ticks: 0,
            pending_disconnects: HashMap::new(),
            next_bot_index: 0,
            debug_mob_seq: 0,
        }
    }

    /// Configures how many simulation ticks a disconnected player's avatar remains in the
    /// world before despawning (`0` = immediate removal on the disconnect tick).
    pub fn set_disconnect_grace_ticks(&mut self, ticks: u32) {
        self.disconnect_grace_ticks = ticks;
    }

    /// Returns the configured disconnect grace window in simulation ticks.
    pub fn disconnect_grace_ticks(&self) -> u32 {
        self.disconnect_grace_ticks
    }

    /// Returns `true` if `session_id` is currently within its disconnect grace window.
    pub fn has_pending_disconnect(&self, session_id: &str) -> bool {
        self.pending_disconnects.contains_key(session_id)
    }

    /// Stores or clears a player's saved `LoadoutSnapshot` so their avatar spawns with
    /// their saved level, primary stats, and equipped weapon on join.
    pub fn set_session_loadout(&mut self, session_id: &str, loadout: Option<LoadoutSnapshot>) {
        match loadout {
            Some(l) => {
                self.session_loadouts.insert(session_id.to_string(), l);
            }
            None => {
                self.session_loadouts.remove(session_id);
            }
        }
    }

    /// Returns the stored `LoadoutSnapshot` for `session_id`, if any.
    pub fn session_loadout(&self, session_id: &str) -> Option<&LoadoutSnapshot> {
        self.session_loadouts.get(session_id)
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

    /// The ONLY constructor the live server (`main.rs`) may use. Bots and bestiary mobs
    /// carry the full live bundles (collision bodies, spawn points, MobAi, ThreatTable,
    /// spawn anchors). The golden-trace harness uses `with_arena` instead.
    pub fn live(cfg: LiveConfig) -> Self {
        let map_cfg =
            crate::content::map::MapConfig::load(cfg.map_id.as_deref().unwrap_or("default"));
        let arena_width = if cfg.map_id.is_some() {
            map_cfg.width
        } else {
            cfg.arena_width
        };
        let arena_height = if cfg.map_id.is_some() {
            map_cfg.height
        } else {
            cfg.arena_height
        };

        let mut sim = Self::new(cfg.seed, arena_width, arena_height);
        if let Some(ref map_id) = cfg.map_id {
            sim.map_id = map_id.clone();
        }
        if let (Some(_), Some((x, y))) = (&cfg.map_id, map_cfg.player_spawn) {
            sim.player_spawn = Position::new(x, y);
        }
        sim.world.insert_resource(LiveRules {
            player_respawn_sec: cfg.player_respawn_sec,
            mob_corpse_sec: MOB_CORPSE_SEC,
        });
        sim.world.insert_resource(DespawnedIds::default());
        sim.world.insert_resource(HitLog::default());
        sim.world
            .insert_resource(crate::content::map::StaticObstacles {
                obstacles: map_cfg.static_obstacles.clone(),
            });
        sim.world
            .insert_resource(crate::content::map::TerrainHeightfield::from_map_config(
                &map_cfg,
            ));

        // Like the arena size, terrain belongs to a named map: a config without `map_id`
        // (anonymous test arenas) is all default ground.
        if cfg.map_id.is_some() {
            sim.world
                .insert_resource(crate::content::map::TerrainZones {
                    zones: map_cfg.terrain_zones.clone(),
                });
        }

        // Add static colliders to Rapier PhysicsWorld
        if let Some(mut pw) = sim.world.get_resource_mut::<PhysicsWorld>() {
            for obs in &map_cfg.static_obstacles {
                let half_w = (obs.max_x - obs.min_x) / 2.0;
                let half_h = (obs.max_y - obs.min_y) / 2.0;
                let center_x = (obs.min_x + obs.max_x) / 2.0;
                let center_y = (obs.min_y + obs.max_y) / 2.0;
                pw.add_static_box(center_x, center_y, half_w, half_h);
            }
        }

        let mut prng = Mulberry32::new(cfg.seed);
        sim.mob_respawn_sec = cfg.mob_respawn_sec;
        for _ in 0..cfg.bot_count {
            let x = prng.range(100.0, arena_width - 100.0);
            let y = prng.range(100.0, arena_height - 100.0);
            let angle = prng.range(0.0, std::f32::consts::PI * 2.0);
            sim.spawn_bot(x, y, angle);
        }

        let catalog = sim.world.resource::<BestiaryCatalog>().clone();
        let mut spawned_count = 0;

        if !map_cfg.spawn_areas.is_empty() {
            for area in &map_cfg.spawn_areas {
                for _ in 0..area.count {
                    if spawned_count >= cfg.mob_count {
                        break;
                    }
                    let min_x = area.x.clamp(5.0, arena_width - 5.0);
                    let max_x = (area.x + area.width).clamp(min_x, arena_width - 5.0);
                    let min_y = area.y.clamp(5.0, arena_height - 5.0);
                    let max_y = (area.y + area.height).clamp(min_y, arena_height - 5.0);
                    let pos = Position::new(prng.range(min_x, max_x), prng.range(min_y, max_y));
                    let mob_id = if catalog.get_mob(&area.mob_type).is_some() {
                        &area.mob_type
                    } else {
                        "mob-bramble-stalker"
                    };
                    let anchor =
                        MobSpawnAnchor::new(pos, mob_id, MobTier::Route, cfg.mob_respawn_sec);
                    sim.world.spawn(mob_bundle(
                        &catalog,
                        &anchor,
                        format!("{}-{}", mob_id, spawned_count),
                    ));
                    spawned_count += 1;
                }
            }
        }

        let mut mob_ids: Vec<String> = catalog.entries().map(|e| e.id.clone()).collect();
        mob_ids.sort();
        if !mob_ids.is_empty() {
            while spawned_count < cfg.mob_count {
                let pos = Position::new(
                    prng.range(50.0, arena_width - 50.0)
                        .clamp(5.0, arena_width - 5.0),
                    prng.range(50.0, arena_height - 50.0)
                        .clamp(5.0, arena_height - 5.0),
                );
                let pick = (prng.range(0.0, mob_ids.len() as f32) as usize).min(mob_ids.len() - 1);
                let mob_id = &mob_ids[pick];
                let anchor = MobSpawnAnchor::new(pos, mob_id, MobTier::Route, cfg.mob_respawn_sec);
                sim.world.spawn(mob_bundle(
                    &catalog,
                    &anchor,
                    format!("{}-{}", mob_id, spawned_count),
                ));
                spawned_count += 1;
            }
        }

        sim.prng = prng.clone();
        sim.world.insert_resource(prng);
        sim
    }

    /// Spawns the next live bot (`bot-<n>`), clamped into the arena, heading along `angle`.
    pub(crate) fn spawn_bot(&mut self, x: f32, y: f32, angle: f32) {
        let id = format!("bot-{}", self.next_bot_index);
        self.next_bot_index += 1;
        let pos = Position::new(
            x.clamp(10.0, self.arena_width - 10.0),
            y.clamp(10.0, self.arena_height - 10.0),
        );
        self.world.spawn((
            EntityId(id.clone()),
            pos,
            Velocity::zero(),
            Health::new(100.0),
            PlayerTag,
            BotAgent::new(id, angle.cos(), angle.sin()),
            CombatStats {
                // Same edge-to-edge melee reach as mobs (20px + both body radii), so a
                // bot can answer a mob standing at its own melee reach.
                attack_range: 20.0 + PLAYER_BODY_RADIUS + MOB_BODY_RADIUS,
                is_player: true,
                ..Default::default()
            },
            ElementalAttributes {
                element: crate::combat::Element::Neutral,
                p_def: 6.0,
                m_def: 6.0,
                armor: 0.0,
            },
            BodyRadius(PLAYER_BODY_RADIUS),
            Mass(15.0),
            SpawnPoint(pos),
        ));
    }

    /// One live server tick, exactly as `main.rs` runs it: apply inputs, then drop avatars
    /// whose session's last socket closed (or whose disconnect grace window expired), step,
    /// and build the wire frame including `removed_ids`.
    pub fn live_tick(&mut self, inputs: &[ClientPacket], disconnected: &[String]) -> LiveFrame {
        for packet in inputs {
            self.pending_disconnects.remove(&packet.session_id);
            if let Ok(client_input) = crate::protocol::deserialize_client_input(&packet.payload) {
                self.apply_player_input(&packet.session_id, &client_input);
            }
        }
        let mut departed_states = Vec::new();
        if !self.pending_disconnects.is_empty() {
            let mut expired = Vec::new();
            for (session_id, remaining) in self.pending_disconnects.iter_mut() {
                *remaining = remaining.saturating_sub(1);
                if *remaining == 0 {
                    expired.push(session_id.clone());
                }
            }
            expired.sort();
            for session_id in expired {
                self.pending_disconnects.remove(&session_id);
                if let Some(state) = self.capture_player_state(&session_id) {
                    departed_states.push((session_id.clone(), state));
                }
                self.remove_player_avatar(&session_id);
            }
        }
        for session_id in disconnected {
            // A packet from the same session this tick means it reconnected after the
            // disconnect notice was drained: keep the avatar (no free heal / teleport).
            if inputs.iter().any(|p| &p.session_id == session_id) {
                continue;
            }
            if self.disconnect_grace_ticks == 0 {
                self.pending_disconnects.remove(session_id);
                if let Some(state) = self.capture_player_state(session_id) {
                    departed_states.push((session_id.clone(), state));
                }
                self.remove_player_avatar(session_id);
            } else if self.halt_player_avatar(session_id) {
                let _ = self.capture_player_state(session_id);
                self.pending_disconnects
                    .insert(session_id.clone(), self.disconnect_grace_ticks);
            }
        }
        self.step();
        LiveFrame {
            tick: self.clock.tick(),
            sim_time_ms: self.clock.now(),
            entities: self.capture_wire_entities(),
            removed_ids: self
                .drain_despawned_ids()
                .iter()
                .map(|id| crate::protocol::fnv1a_32(id))
                .collect(),
            events: self.drain_wire_events(),
            match_events: self.drain_match_events(),
            departed_states,
        }
    }

    /// Wire-ready entity list: players and mobs (sorted by id, real `Health.max`, bot flag,
    /// mob bestiary type, current target), then live projectiles (with their owner).
    pub fn capture_wire_entities(&mut self) -> Vec<EntitySnapshotData> {
        use crate::protocol::{fnv1a_32, intern_mob_type, STATE_FLAG_ALIVE, STATE_FLAG_BOT};
        let now = self.clock.current_time_seconds();
        let mut ids = self.world.query::<(Entity, &EntityId)>();
        let wire_id: std::collections::HashMap<Entity, u32> = ids
            .iter(&self.world)
            .map(|(e, id)| (e, fnv1a_32(&id.0)))
            .collect();
        let id_of = |e: Option<Entity>| e.and_then(|e| wire_id.get(&e).copied()).unwrap_or(0);

        let mut query = self.world.query_filtered::<(
            &EntityId,
            &Position,
            &Velocity,
            &Health,
            Has<PlayerTag>,
            Option<&BotAgent>,
            Option<&MobSpawnAnchor>,
            Option<&ThreatTable>,
            Option<&PlayerInputState>,
        ), Or<(With<PlayerTag>, With<MobTag>)>>();
        let mut entities: Vec<(String, EntitySnapshotData)> = query
            .iter(&self.world)
            .map(
                |(id, pos, vel, health, is_player, bot, anchor, threat, input)| {
                    let mut flags = 0;
                    if health.is_alive {
                        flags |= STATE_FLAG_ALIVE;
                    }
                    if bot.is_some() {
                        flags |= STATE_FLAG_BOT;
                    }
                    let target_id = match (threat, input, bot) {
                        (Some(t), _, _) if health.is_alive => id_of(t.top_target(now)),
                        (_, Some(i), _) => i.target_id,
                        (_, _, Some(b)) if health.is_alive => id_of(b.target_entity),
                        _ => 0,
                    };
                    (
                        id.0.clone(),
                        EntitySnapshotData {
                            id: fnv1a_32(&id.0),
                            entity_type: if is_player {
                                EntityType::Player
                            } else {
                                EntityType::Mob
                            },
                            x: pos.x,
                            y: pos.y,
                            vx: vel.vx,
                            vy: vel.vy,
                            health: health.current,
                            max_health: health.max,
                            state_flags: flags,
                            target_id,
                            mob_type: anchor.map_or("", |a| intern_mob_type(&a.mob_id)),
                            owner_id: 0,
                            // Bots keep the default 0: only client packets set it.
                            input_ack: input.map_or(0, |i| i.client_tick),
                        },
                    )
                },
            )
            .collect();
        entities.sort_by(|a, b| a.0.cmp(&b.0));

        // Projectiles carry no EntityId: their wire id is derived from the ECS entity, which
        // is stable for the projectile's lifetime. They are ephemeral (the client replaces
        // its projectile set every snapshot), so they never go through removed_ids.
        let mut projectiles = self
            .world
            .query::<(Entity, &Position, &Velocity, &Projectile)>();
        let mut projs: Vec<(u64, EntitySnapshotData)> = projectiles
            .iter(&self.world)
            .map(|(e, pos, vel, proj)| {
                let p_type: &'static str = match proj.skill_id.as_deref() {
                    Some("skill_1") => "meteor",
                    Some("skill_2") => "precision",
                    Some("skill_3") => "blizzard",
                    Some("skill_4") => "thunder",
                    Some("skill_dash") => "dash",
                    Some("spear") => "spear",
                    Some(s) => intern_mob_type(s),
                    None => match proj.element {
                        crate::combat::Element::Fire => "meteor",
                        crate::combat::Element::Water => "blizzard",
                        crate::combat::Element::Wind => "thunder",
                        _ => "spear",
                    },
                };
                (
                    e.to_bits(),
                    EntitySnapshotData {
                        id: fnv1a_32(&format!("proj-{}", e.to_bits())),
                        entity_type: EntityType::Projectile,
                        x: pos.x,
                        y: pos.y,
                        vx: vel.vx,
                        vy: vel.vy,
                        health: 0.0,
                        max_health: 0.0,
                        state_flags: STATE_FLAG_ALIVE,
                        target_id: id_of(proj.target),
                        mob_type: p_type,
                        owner_id: id_of(Some(proj.owner)),
                        input_ack: 0,
                    },
                )
            })
            .collect();
        projs.sort_by_key(|p| p.0);

        entities
            .into_iter()
            .map(|(_, e)| e)
            .chain(projs.into_iter().map(|(_, e)| e))
            .collect()
    }

    /// Combat events since the last call (wire ids): one `Hit` per damage application and
    /// a `Kill` when that hit was lethal.
    pub fn drain_wire_events(&mut self) -> Vec<GameEventData> {
        let hits = self
            .world
            .get_resource_mut::<HitLog>()
            .map(|mut h| std::mem::take(&mut h.0))
            .unwrap_or_default();
        let wire = |world: &World, e: Entity| {
            world
                .get::<EntityId>(e)
                .map_or(0, |id| crate::protocol::fnv1a_32(&id.0))
        };
        let mut events = Vec::with_capacity(hits.len());
        for hit in hits {
            let source_id = wire(&self.world, hit.attacker);
            let target_id = wire(&self.world, hit.target);
            events.push(GameEventData {
                kind: GameEventKind::Hit,
                source_id,
                target_id,
                amount: hit.amount,
            });
            if hit.killed {
                events.push(GameEventData {
                    kind: GameEventKind::Kill,
                    source_id,
                    target_id,
                    amount: 0.0,
                });
            }
        }
        events
    }

    /// Ids despawned since the last call (dead mobs, disconnected avatars).
    pub fn drain_despawned_ids(&mut self) -> Vec<String> {
        self.world
            .get_resource_mut::<DespawnedIds>()
            .map(|mut d| std::mem::take(&mut d.0))
            .unwrap_or_default()
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

        let saved_cs = loadout
            .and_then(|l| l.character_state.as_ref())
            .filter(|cs| cs.map_id.is_empty() || cs.map_id == self.map_id);
        let (spawn_x, spawn_y) = match saved_cs {
            Some(cs) if cs.x.is_finite() && cs.y.is_finite() => (
                cs.x.clamp(0.0, self.arena_width),
                cs.y.clamp(0.0, self.arena_height),
            ),
            _ => (x, y),
        };
        let mut initial_health = Health::new(derived.max_health);
        if let Some(cs) = saved_cs {
            if cs.health.is_finite() && cs.health > 0.0 {
                initial_health.current = cs.health.min(derived.max_health);
            }
        }

        let entity = self
            .world
            .spawn((
                EntityId(session_id.to_string()),
                Position::new(spawn_x, spawn_y),
                Velocity::zero(),
                initial_health,
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
                BodyRadius(PLAYER_BODY_RADIUS),
                Mass(15.0),
                SpawnPoint(Position::new(x, y)),
            ))
            .id();

        self.world.entity_mut(entity).insert(DashState::default());
        entity
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

    /// Captures a player's current position and health into a `CharacterStateSnapshot` and
    /// updates the simulation's cached loadout for that session.
    pub fn capture_player_state(&mut self, session_id: &str) -> Option<CharacterStateSnapshot> {
        let mut query = self
            .world
            .query::<(&EntityId, &Position, &Health, &PlayerAvatar)>();
        let mut captured = None;
        for (id, pos, health, _avatar) in query.iter(&self.world) {
            if id.0 == session_id {
                captured = Some(CharacterStateSnapshot {
                    schema_version: 1,
                    map_id: self.map_id.clone(),
                    x: pos.x,
                    y: pos.y,
                    health: if health.is_alive {
                        health.current.max(0.0)
                    } else {
                        0.0
                    },
                    seq: 0,
                });
                break;
            }
        }
        if let Some(ref state) = captured {
            let entry = self
                .session_loadouts
                .entry(session_id.to_string())
                .or_default();
            entry.character_state = Some(state.clone());
            crate::net::set_cached_session_loadout(session_id, Some(entry.clone()));
        }
        captured
    }

    /// Snapshots all live player avatars' position and health for periodic crash-safe checkpointing.
    pub fn snapshot_active_player_states(&mut self) -> Vec<(String, CharacterStateSnapshot)> {
        let mut query = self
            .world
            .query::<(&EntityId, &Position, &Health, &PlayerAvatar)>();
        let mut states = Vec::new();
        for (id, pos, health, _avatar) in query.iter(&self.world) {
            let state = CharacterStateSnapshot {
                schema_version: 1,
                map_id: self.map_id.clone(),
                x: pos.x,
                y: pos.y,
                health: if health.is_alive {
                    health.current.max(0.0)
                } else {
                    0.0
                },
                seq: 0,
            };
            states.push((id.0.clone(), state));
        }
        for (session_id, state) in &states {
            let entry = self.session_loadouts.entry(session_id.clone()).or_default();
            entry.character_state = Some(state.clone());
            crate::net::set_cached_session_loadout(session_id, Some(entry.clone()));
        }
        states
    }

    /// Zeroes movement and attack inputs on a disconnected player's avatar so it stands still
    /// during the disconnect grace window. Returns `true` if the avatar exists.
    pub fn halt_player_avatar(&mut self, session_id: &str) -> bool {
        let mut query = self.world.query::<(
            &EntityId,
            &PlayerAvatar,
            &mut Velocity,
            &mut PlayerInputState,
        )>();
        for (id, _avatar, mut vel, mut input_state) in query.iter_mut(&mut self.world) {
            if id.0 == session_id {
                *vel = Velocity::zero();
                input_state.move_x = 0.0;
                input_state.move_y = 0.0;
                input_state.attack = false;
                input_state.attack_held = false;
                input_state.skill_slot = 0;
                return true;
            }
        }
        false
    }

    /// Removes a player avatar from the ECS world when disconnected.
    pub fn remove_player_avatar(&mut self, session_id: &str) -> bool {
        self.pending_disconnects.remove(session_id);
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
            if let Some(mut despawned) = self.world.get_resource_mut::<DespawnedIds>() {
                despawned.0.push(session_id.to_string());
            }
            true
        } else {
            false
        }
    }

    /// Maximum Euclidean distance at which a player may legitimately target an entity or ground point.
    pub const MAX_TARGET_INTENT_RANGE: f32 = 500.0;

    /// Applies client input state to the player avatar, auto-spawning if necessary.
    pub fn apply_player_input(&mut self, session_id: &str, input: &crate::protocol::ClientInput) {
        let mut player_pos = self.player_spawn;
        {
            let mut pos_query = self
                .world
                .query::<(&EntityId, &Position, Option<&SpawnPoint>)>();
            for (eid, pos, spawn) in pos_query.iter(&self.world) {
                if eid.0 == session_id {
                    player_pos = if input.respawn() && self.debug_enabled {
                        spawn.map(|s| s.0).unwrap_or(Position::new(
                            self.arena_width / 2.0,
                            self.arena_height / 2.0,
                        ))
                    } else {
                        *pos
                    };
                    break;
                }
            }
        }

        let max_range_sq = Self::MAX_TARGET_INTENT_RANGE * Self::MAX_TARGET_INTENT_RANGE;
        let (validated_target_id, resolved_target_entity) = if input.target_id() != 0 {
            let mut id_query = self.world.query::<(
                Entity,
                &EntityId,
                &Position,
                &Health,
                bevy_ecs::prelude::Has<MobTag>,
            )>();
            let mut found_valid = None;
            for (e, eid, t_pos, t_health, is_mob) in id_query.iter(&self.world) {
                if crate::protocol::fnv1a_32(&eid.0) == input.target_id() {
                    let dx = t_pos.x - player_pos.x;
                    let dy = t_pos.y - player_pos.y;
                    let dist_sq = dx * dx + dy * dy;
                    if is_mob && t_health.is_alive && dist_sq <= max_range_sq {
                        found_valid = Some(e);
                    }
                    break;
                }
            }
            if let Some(e) = found_valid {
                (input.target_id(), Some(e))
            } else {
                (0, None)
            }
        } else {
            (0, None)
        };

        let tx = input.target_x();
        let ty = input.target_y();
        let target_pos = if tx != 0.0 || ty != 0.0 {
            let dx = tx - player_pos.x;
            let dy = ty - player_pos.y;
            let dist_sq = dx * dx + dy * dy;
            if tx.is_finite()
                && ty.is_finite()
                && tx >= 0.0
                && tx <= self.arena_width
                && ty >= 0.0
                && ty <= self.arena_height
                && dist_sq <= max_range_sq
            {
                Some(Position::new(tx, ty))
            } else {
                None
            }
        } else {
            None
        };

        let mut found = false;
        let mut revived_entity = None;
        let mut query = self.world.query::<(
            Entity,
            &EntityId,
            &mut Health,
            &mut Position,
            &mut Velocity,
            Option<&SpawnPoint>,
            &mut PlayerInputState,
            &mut CombatStats,
        )>();
        for (entity, id, mut health, mut pos, mut vel, spawn, mut input_state, mut combat) in
            query.iter_mut(&mut self.world)
        {
            if id.0 == session_id {
                // Development mode only: a respawn request revives/teleports to the spawn
                // point at once with full health, alive or dead. Otherwise it is ignored and
                // `player_respawn_system` revives the dead after the respawn delay.
                if input.respawn() && self.debug_enabled {
                    health.current = health.max;
                    health.is_alive = true;
                    *pos = spawn.map(|s| s.0).unwrap_or(Position::new(
                        self.arena_width / 2.0,
                        self.arena_height / 2.0,
                    ));
                    *vel = Velocity::zero();
                    revived_entity = Some(entity);
                }

                let mx = if input.move_x().is_finite() {
                    input.move_x()
                } else {
                    0.0
                };
                let my = if input.move_y().is_finite() {
                    input.move_y()
                } else {
                    0.0
                };
                input_state.move_x = mx;
                input_state.move_y = my;
                let move_len_sq = mx * mx + my * my;
                if move_len_sq > 1e-4 {
                    let inv_len = 1.0 / move_len_sq.sqrt();
                    input_state.last_facing = (mx * inv_len, my * inv_len);
                }

                // Latch attack presses in the same tick: a keyup/movement packet arriving in the same
                // tick must not erase a tap before combat_system runs.
                if input.attack() {
                    input_state.attack = true;
                    input_state.attack_held = true;
                } else {
                    input_state.attack_held = false;
                }

                // Latch one-shot skill presses: a movement packet arriving in the same
                // tick (skill_slot = 0) must not erase a press before skill_execution
                // consumes it.
                if input.skill_slot() != 0 {
                    input_state.skill_slot = input.skill_slot();
                }
                input_state.target_id = validated_target_id;
                input_state.target_entity = resolved_target_entity;
                if target_pos.is_some() {
                    input_state.target_pos = target_pos;
                }
                input_state.client_tick = input.client_tick();

                if input.attack() {
                    combat.is_player = true;
                }
                found = true;
                break;
            }
        }

        if let Some(e) = revived_entity {
            self.world
                .entity_mut(e)
                .remove::<crate::ecs::components::PlayerRespawnTimer>();
            if let Some(mut casting) = self
                .world
                .get_mut::<crate::ecs::components::CastingState>(e)
            {
                casting.finish_or_cancel();
            }
            if let Some(mut cd) = self
                .world
                .get_mut::<crate::ecs::components::CooldownTracker>(e)
            {
                cd.cooldowns.clear();
            }

            // Clear all mobs' threat and aggro against this revived player
            let mut mob_query = self.world.query::<(
                &mut crate::ai::threat::ThreatTable,
                &mut crate::ecs::components::MobAi,
            )>();
            for (mut threat, mut mob_ai) in mob_query.iter_mut(&mut self.world) {
                threat.clear_target(e);
                if mob_ai.state == crate::ecs::components::AiState::Chase
                    || mob_ai.state == crate::ecs::components::AiState::Attack
                {
                    mob_ai.state = crate::ecs::components::AiState::ReturnHome;
                }
            }
        }

        if !found {
            let spawn = self.player_spawn;
            let loadout = self
                .session_loadouts
                .get(session_id)
                .cloned()
                .or_else(|| crate::net::cached_session_loadout(session_id));
            if let Some(ref l) = loadout {
                self.session_loadouts
                    .entry(session_id.to_string())
                    .or_insert_with(|| l.clone());
            }
            let entity = self.spawn_player_avatar_with_loadout(
                session_id,
                spawn.x,
                spawn.y,
                loadout.as_ref(),
            );
            if let Some(mut state) = self.world.get_mut::<PlayerInputState>(entity) {
                let mx = if input.move_x().is_finite() {
                    input.move_x()
                } else {
                    0.0
                };
                let my = if input.move_y().is_finite() {
                    input.move_y()
                } else {
                    0.0
                };
                state.move_x = mx;
                state.move_y = my;
                let move_len_sq = mx * mx + my * my;
                if move_len_sq > 1e-4 {
                    let inv_len = 1.0 / move_len_sq.sqrt();
                    state.last_facing = (mx * inv_len, my * inv_len);
                }
                state.attack = input.attack();
                state.attack_held = input.attack();
                state.skill_slot = input.skill_slot();
                state.target_id = validated_target_id;
                state.target_entity = resolved_target_entity;
                state.target_pos = target_pos;
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
    fn schedule_runs_on_the_calling_thread() {
        // Every system is chained, so a task pool adds only cross-thread handoffs:
        // measured 15 ms p50 / 40-70 ms p95 per tick on a busy host, versus 3 / 7 ms.
        let sim = AtlasSimulation::init(1, 1, 1);
        assert_eq!(
            sim.schedule.get_executor_kind(),
            bevy_ecs::schedule::ExecutorKind::SingleThreaded
        );
    }

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

    #[test]
    fn test_validate_target_intents_rejects_invalid_target_id_cases() {
        use crate::protocol::{deserialize_client_input, fnv1a_32, serialize_client_input_full};

        let mut sim = AtlasSimulation::new(1, 2000.0, 2000.0);
        let p_ent = sim.spawn_player_avatar("hero", 200.0, 200.0);
        let _other_player = sim.spawn_player_avatar("ally", 250.0, 200.0);

        // 1. Dead mob nearby
        let mut dead_health = Health::new(100.0);
        dead_health.current = 0.0;
        dead_health.is_alive = false;
        sim.world.spawn((
            EntityId("dead-mob".to_string()),
            Position::new(240.0, 200.0),
            Velocity::zero(),
            dead_health,
            MobTag,
        ));

        // 2. Living mob out of range (> 500 units away)
        sim.world.spawn((
            EntityId("far-mob".to_string()),
            Position::new(900.0, 900.0),
            Velocity::zero(),
            Health::new(100.0),
            MobTag,
        ));

        // 3. Living mob in range (<= 500 units away)
        let valid_mob = sim
            .world
            .spawn((
                EntityId("valid-mob".to_string()),
                Position::new(300.0, 200.0),
                Velocity::zero(),
                Health::new(100.0),
                MobTag,
            ))
            .id();

        for bad_id in [
            999_999u32,           // non-existent entity
            fnv1a_32("hero"),     // self
            fnv1a_32("ally"),     // friendly player (not a mob)
            fnv1a_32("dead-mob"), // dead mob
            fnv1a_32("far-mob"),  // out-of-range mob
        ] {
            let bytes = serialize_client_input_full(1, 0.0, 0.0, false, 0, bad_id, 0.0, 0.0, false);
            let input = deserialize_client_input(&bytes).unwrap();
            sim.apply_player_input("hero", &input);
            let st = sim.world.get::<PlayerInputState>(p_ent).unwrap();
            assert_eq!(st.target_id, 0, "bad target_id {bad_id} must be rejected");
            assert!(
                st.target_entity.is_none(),
                "bad target_id {bad_id} must not resolve to an entity"
            );
        }

        // Valid living in-range mob succeeds
        let good_id = fnv1a_32("valid-mob");
        let bytes = serialize_client_input_full(2, 0.0, 0.0, false, 0, good_id, 0.0, 0.0, false);
        let input = deserialize_client_input(&bytes).unwrap();
        sim.apply_player_input("hero", &input);
        let st = sim.world.get::<PlayerInputState>(p_ent).unwrap();
        assert_eq!(st.target_id, good_id);
        assert_eq!(st.target_entity, Some(valid_mob));
    }

    #[test]
    fn test_validate_target_intents_rejects_invalid_target_positions() {
        use crate::protocol::{deserialize_client_input, serialize_client_input_full};

        let mut sim = AtlasSimulation::new(1, 1000.0, 1000.0);
        let p_ent = sim.spawn_player_avatar("hero", 200.0, 200.0);

        for (bad_x, bad_y) in [
            (f32::NAN, 200.0),      // NaN
            (200.0, f32::INFINITY), // Infinity
            (-10.0, 200.0),         // negative x (out of arena)
            (200.0, 1200.0),        // > arena_height
            (900.0, 900.0),         // in arena but > 500 units from player at (200, 200)
        ] {
            let bytes = serialize_client_input_full(1, 0.0, 0.0, false, 0, 0, bad_x, bad_y, false);
            let input = deserialize_client_input(&bytes).unwrap();
            sim.apply_player_input("hero", &input);
            let st = sim.world.get::<PlayerInputState>(p_ent).unwrap();
            assert!(
                st.target_pos.is_none(),
                "invalid target position ({bad_x}, {bad_y}) must be rejected"
            );
        }

        // Valid in-bounds, in-range target position succeeds
        let bytes = serialize_client_input_full(2, 0.0, 0.0, false, 0, 0, 350.0, 250.0, false);
        let input = deserialize_client_input(&bytes).unwrap();
        sim.apply_player_input("hero", &input);
        let st = sim.world.get::<PlayerInputState>(p_ent).unwrap();
        assert_eq!(st.target_pos, Some(Position::new(350.0, 250.0)));
    }
}
