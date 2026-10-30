use crate::content::world_model::HANDOFF_HYSTERESIS_UNITS;
use crate::ecs::components::{
    CombatStats, CooldownTracker, DashState, ElementalAttributes, PlayerInputState, StatusEffects,
};
use crate::protocol::fnv1a_32;
use crate::simulation::{AtlasSimulation, LiveFrame};
use crate::spatial::border_ghosts::{CardinalBorder, RegionAdjacencyGraph};
use crate::storage::LoadoutSnapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Complete runtime state of a player avatar crossing a region border (`E-004` Slice 10).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerTransferState {
    pub session_id: String,
    pub from_region: String,
    pub to_region: String,
    pub border: CardinalBorder,
    /// Target X position in `to_region` coordinates (inset by `HANDOFF_HYSTERESIS_UNITS`).
    pub x: f32,
    /// Target Y position in `to_region` coordinates (inset by `HANDOFF_HYSTERESIS_UNITS`).
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub health: f32,
    pub max_health: f32,
    pub is_alive: bool,
    pub speed: f32,
    pub combat_stats: CombatStats,
    pub elemental_attributes: ElementalAttributes,
    pub cooldowns: CooldownTracker,
    pub status_effects: StatusEffects,
    pub dash_state: DashState,
    pub client_tick: u32,
    pub last_facing: (f32, f32),
    pub loadout: Option<LoadoutSnapshot>,
}

/// Audit/lease token emitted when a player's simulation authority transfers between regions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HandoffToken {
    pub token_id: u64,
    pub issued_at_tick: u32,
    pub issued_at_ms: u64,
    pub transfer: PlayerTransferState,
}

/// Coordinates atomic single-tick authority handoffs across adjacent regions (`E-004` Slice 10).
#[derive(Debug, Clone)]
pub struct AuthorityHandoffCoordinator {
    hysteresis_units: f32,
    next_token_id: u64,
    completed_handoffs: Vec<HandoffToken>,
}

impl Default for AuthorityHandoffCoordinator {
    fn default() -> Self {
        Self::new(HANDOFF_HYSTERESIS_UNITS)
    }
}

impl AuthorityHandoffCoordinator {
    pub fn new(hysteresis_units: f32) -> Self {
        Self {
            hysteresis_units: hysteresis_units.max(1.0),
            next_token_id: 1,
            completed_handoffs: Vec::new(),
        }
    }

    pub fn hysteresis_units(&self) -> f32 {
        self.hysteresis_units
    }

    pub fn completed_handoffs(&self) -> &[HandoffToken] {
        &self.completed_handoffs
    }

    /// Detects players crossing any connected cardinal border in `rooms`, atomically despawns
    /// them from `from_region`, wakes `to_region` if sleeping, and spawns them in `to_region`
    /// with full state preservation in the same tick (`<= 1` tick / `50 ms`).
    pub fn step_handoffs(
        &mut self,
        rooms: &mut HashMap<String, AtlasSimulation>,
        adjacency: &RegionAdjacencyGraph,
        now_ms: u64,
    ) -> Vec<HandoffToken> {
        let mut region_ids: Vec<String> = rooms.keys().cloned().collect();
        region_ids.sort();

        let mut pending_transfers: Vec<(u32, PlayerTransferState)> = Vec::new();
        for region_id in &region_ids {
            if let Some(sim) = rooms.get_mut(region_id) {
                let tick = sim.clock.tick();
                let extracted =
                    sim.extract_border_crossing_players(adjacency, self.hysteresis_units);
                for transfer in extracted {
                    if rooms.contains_key(&transfer.to_region) {
                        pending_transfers.push((tick, transfer));
                    }
                }
            }
        }

        let mut tokens = Vec::with_capacity(pending_transfers.len());
        for (issued_at_tick, transfer) in pending_transfers {
            if let Some(target_sim) = rooms.get_mut(&transfer.to_region) {
                target_sim.accept_player_transfer(&transfer, now_ms);
                let token = HandoffToken {
                    token_id: self.next_token_id,
                    issued_at_tick,
                    issued_at_ms: now_ms,
                    transfer,
                };
                self.next_token_id += 1;
                self.completed_handoffs.push(token.clone());
                tokens.push(token);
            }
        }

        tokens
    }

    /// Executes `step_handoffs` and refreshes `room_frames` for affected source and target
    /// regions so that the current tick's snapshots contain the player in `to_region` and
    /// emit `removed_ids` in `from_region` without any duplicate or missing entity ticks.
    pub fn step_handoffs_with_frames(
        &mut self,
        rooms: &mut HashMap<String, AtlasSimulation>,
        room_frames: &mut HashMap<String, LiveFrame>,
        adjacency: &RegionAdjacencyGraph,
        now_ms: u64,
    ) -> Vec<HandoffToken> {
        let tokens = self.step_handoffs(rooms, adjacency, now_ms);
        for token in &tokens {
            let wire_id = fnv1a_32(&token.transfer.session_id);
            if let Some(from_sim) = rooms.get_mut(&token.transfer.from_region) {
                let drained = from_sim.drain_despawned_ids();
                if let Some(from_frame) = room_frames.get_mut(&token.transfer.from_region) {
                    from_frame.entities = from_sim.capture_wire_entities();
                    if !from_frame.removed_ids.contains(&wire_id) {
                        from_frame.removed_ids.push(wire_id);
                    }
                    for d in drained {
                        let did = fnv1a_32(&d);
                        if !from_frame.removed_ids.contains(&did) {
                            from_frame.removed_ids.push(did);
                        }
                    }
                }
            }
            if let Some(to_sim) = rooms.get_mut(&token.transfer.to_region) {
                let to_entities = to_sim.capture_wire_entities();
                let tick = to_sim.clock.tick();
                let sim_time_ms = to_sim.clock.now();
                room_frames
                    .entry(token.transfer.to_region.clone())
                    .and_modify(|f| {
                        f.entities = to_entities.clone();
                        f.removed_ids.retain(|&id| id != wire_id);
                    })
                    .or_insert(LiveFrame {
                        tick,
                        sim_time_ms,
                        entities: to_entities,
                        removed_ids: Vec::new(),
                        events: Vec::new(),
                        match_events: Vec::new(),
                        departed_states: Vec::new(),
                        dungeon_portal_events: Vec::new(),
                    });
            }
        }
        tokens
    }
}

/// Helper to construct a `PlayerInputState` from a completed `PlayerTransferState`.
pub fn input_state_from_transfer(transfer: &PlayerTransferState) -> PlayerInputState {
    PlayerInputState {
        client_tick: transfer.client_tick,
        last_facing: transfer.last_facing,
        ..Default::default()
    }
}
