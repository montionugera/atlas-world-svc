#[allow(clippy::all, unused_imports, dead_code)]
#[path = "generated/game_protocol_generated.rs"]
pub mod generated;

pub use generated::atlas::protocol::*;

/// Wire protocol version exchanged during the WebSocket handshake (`?proto=<u32>`).
pub const PROTOCOL_VERSION: u32 = 1;

/// WebSocket close code sent when a newer connection for the same account replaces an older one.
pub const DUPLICATE_SESSION_CLOSE_CODE: u16 = 4002;

/// `state_flags` bit: the entity is alive.
pub const STATE_FLAG_ALIVE: u16 = 1;
/// `state_flags` bit: the entity is a server-driven bot (`BotAgent`), not a human.
pub const STATE_FLAG_BOT: u16 = 2;

/// Data structure representing entity state for snapshot replication.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EntitySnapshotData {
    pub id: u32,
    pub entity_type: EntityType,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub health: f32,
    pub max_health: f32,
    pub state_flags: u16,
    pub target_id: u32,
    /// Bestiary id for mobs (interned, see [`intern_mob_type`]); empty otherwise.
    pub mob_type: &'static str,
    /// Owning entity id (projectiles); 0 otherwise.
    pub owner_id: u32,
    /// `client_tick` of the last input this player's tick ran on; 0 for none / non-players.
    pub input_ack: u32,
}

impl Default for EntitySnapshotData {
    fn default() -> Self {
        Self {
            id: 0,
            entity_type: EntityType::Player,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            health: 100.0,
            max_health: 100.0,
            state_flags: 0,
            target_id: 0,
            mob_type: "",
            owner_id: 0,
            input_ack: 0,
        }
    }
}

/// One combat event that happened during a tick (wire `GameEvent`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GameEventData {
    pub kind: GameEventKind,
    pub source_id: u32,
    pub target_id: u32,
    pub amount: f32,
}

/// Interns a mob type id so `EntitySnapshotData` stays `Copy` and the per-tick snapshot
/// path does not allocate. The set is bounded by the bestiary (~100 ids).
pub fn intern_mob_type(id: &str) -> &'static str {
    use std::collections::HashSet;
    use std::sync::{Mutex, OnceLock};
    static POOL: OnceLock<Mutex<HashSet<&'static str>>> = OnceLock::new();
    let mut pool = POOL
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(s) = pool.get(id) {
        return s;
    }
    let leaked: &'static str = Box::leak(id.to_owned().into_boxed_str());
    pool.insert(leaked);
    leaked
}

/// Zero-allocation FlatBuffers builder for world snapshots.
pub struct SnapshotBuilder {
    fbb: flatbuffers::FlatBufferBuilder<'static>,
    delta_offsets: Vec<flatbuffers::WIPOffset<EntityDelta<'static>>>,
}

impl Default for SnapshotBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl SnapshotBuilder {
    pub fn new() -> Self {
        Self::with_capacity(1024)
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            fbb: flatbuffers::FlatBufferBuilder::with_capacity(capacity),
            delta_offsets: Vec::new(),
        }
    }

    /// Reusable serialization returning a byte slice borrowing from the internal builder (zero-allocation).
    pub fn build_snapshot(
        &mut self,
        tick: u32,
        time_ms: u64,
        entities: &[EntitySnapshotData],
        removed: &[u32],
    ) -> &[u8] {
        self.build_frame(tick, time_ms, entities, removed, &[])
    }

    /// Like [`Self::build_snapshot`], plus the tick's combat `events`.
    pub fn build_frame(
        &mut self,
        tick: u32,
        time_ms: u64,
        entities: &[EntitySnapshotData],
        removed: &[u32],
        events: &[GameEventData],
    ) -> &[u8] {
        self.fbb.reset();
        self.delta_offsets.clear();

        for e in entities {
            let pos = Vec2::new(e.x, e.y);
            let vel = Vec2::new(e.vx, e.vy);
            let vel_opt = if e.vx != 0.0 || e.vy != 0.0 {
                Some(&vel)
            } else {
                None
            };
            // Shared strings: one copy per mob type per frame.
            let mob_type = if e.mob_type.is_empty() {
                None
            } else {
                Some(self.fbb.create_shared_string(e.mob_type))
            };
            let delta = EntityDelta::create(
                &mut self.fbb,
                &EntityDeltaArgs {
                    id: e.id,
                    entity_type: e.entity_type,
                    pos: Some(&pos),
                    vel: vel_opt,
                    health: e.health,
                    max_health: e.max_health,
                    state_flags: e.state_flags,
                    target_id: e.target_id,
                    mob_type,
                    owner_id: e.owner_id,
                    input_ack: e.input_ack,
                },
            );
            self.delta_offsets.push(delta);
        }

        let entities_vec = if !self.delta_offsets.is_empty() {
            Some(self.fbb.create_vector(&self.delta_offsets))
        } else {
            None
        };

        let removed_vec = if !removed.is_empty() {
            Some(self.fbb.create_vector(removed))
        } else {
            None
        };

        let events_vec = if events.is_empty() {
            None
        } else {
            let offsets: Vec<_> = events
                .iter()
                .map(|ev| {
                    GameEvent::create(
                        &mut self.fbb,
                        &GameEventArgs {
                            kind: ev.kind,
                            source_id: ev.source_id,
                            target_id: ev.target_id,
                            amount: ev.amount,
                        },
                    )
                })
                .collect();
            Some(self.fbb.create_vector(&offsets))
        };

        let snapshot = WorldSnapshot::create(
            &mut self.fbb,
            &WorldSnapshotArgs {
                tick,
                server_time_ms: time_ms,
                entities: entities_vec,
                removed_ids: removed_vec,
                events: events_vec,
            },
        );

        self.fbb.finish(snapshot, None);
        self.fbb.finished_data()
    }

    /// Serializes a snapshot reusing internal capacity, returning an owned Vec<u8>.
    pub fn serialize_snapshot(
        &mut self,
        tick: u32,
        time_ms: u64,
        entities: &[EntitySnapshotData],
        removed: &[u32],
    ) -> Vec<u8> {
        self.build_snapshot(tick, time_ms, entities, removed)
            .to_vec()
    }
}

/// Standalone helper serializing snapshot to owned Vec<u8>.
pub fn serialize_snapshot(
    tick: u32,
    time_ms: u64,
    entities: &[EntitySnapshotData],
    removed: &[u32],
) -> Vec<u8> {
    let mut builder = SnapshotBuilder::new();
    builder.serialize_snapshot(tick, time_ms, entities, removed)
}

/// Deserializes a client input payload received over WebSocket.
pub fn deserialize_client_input(
    bytes: &[u8],
) -> Result<ClientInput<'_>, flatbuffers::InvalidFlatbuffer> {
    flatbuffers::root::<ClientInput>(bytes)
}

/// Helper to serialize a client input for testing and clients.
pub fn serialize_client_input(
    client_tick: u32,
    move_x: f32,
    move_y: f32,
    attack: bool,
    skill_slot: u8,
    target_id: u32,
) -> Vec<u8> {
    serialize_client_input_full(
        client_tick,
        move_x,
        move_y,
        attack,
        skill_slot,
        target_id,
        0.0,
        0.0,
        false,
    )
}

/// Helper to serialize a client input with target aim coordinates and respawn flag.
#[allow(clippy::too_many_arguments)]
pub fn serialize_client_input_full(
    client_tick: u32,
    move_x: f32,
    move_y: f32,
    attack: bool,
    skill_slot: u8,
    target_id: u32,
    target_x: f32,
    target_y: f32,
    respawn: bool,
) -> Vec<u8> {
    let mut fbb = flatbuffers::FlatBufferBuilder::new();
    let offset = ClientInput::create(
        &mut fbb,
        &ClientInputArgs {
            client_tick,
            move_x,
            move_y,
            attack,
            skill_slot,
            target_id,
            target_x,
            target_y,
            respawn,
        },
    );
    fbb.finish(offset, None);
    fbb.finished_data().to_vec()
}

/// Computes 32-bit FNV-1a hash of a string, matching TypeScript client.
pub fn fnv1a_32(s: &str) -> u32 {
    let mut hash = 2166136261u32;
    for b in s.as_bytes() {
        hash ^= *b as u32;
        hash = hash.wrapping_mul(16777619);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_and_inspect_snapshot() {
        let entities = vec![
            EntitySnapshotData {
                id: 101,
                entity_type: EntityType::Player,
                x: 12.5,
                y: -34.0,
                vx: 1.0,
                vy: -0.5,
                health: 95.0,
                max_health: 100.0,
                state_flags: 0b0000_0001,
                target_id: 202,
                ..Default::default()
            },
            EntitySnapshotData {
                id: 202,
                entity_type: EntityType::Mob,
                x: 100.0,
                y: 200.0,
                vx: 0.0,
                vy: 0.0,
                health: 50.0,
                max_health: 50.0,
                state_flags: 0,
                target_id: 101,
                ..Default::default()
            },
        ];
        let removed = vec![303, 404];

        let mut builder = SnapshotBuilder::new();
        let bytes = builder.serialize_snapshot(42, 1728000000, &entities, &removed);

        assert!(!bytes.is_empty());

        let snapshot = root_as_world_snapshot(&bytes).expect("Valid WorldSnapshot buffer");
        assert_eq!(snapshot.tick(), 42);
        assert_eq!(snapshot.server_time_ms(), 1728000000);

        let decoded_entities = snapshot.entities().expect("entities vector present");
        assert_eq!(decoded_entities.len(), 2);

        let e0 = decoded_entities.get(0);
        assert_eq!(e0.id(), 101);
        assert_eq!(e0.entity_type(), EntityType::Player);
        let pos0 = e0.pos().expect("pos present");
        assert_eq!(pos0.x(), 12.5);
        assert_eq!(pos0.y(), -34.0);
        let vel0 = e0.vel().expect("vel present");
        assert_eq!(vel0.x(), 1.0);
        assert_eq!(vel0.y(), -0.5);
        assert_eq!(e0.health(), 95.0);
        assert_eq!(e0.max_health(), 100.0);
        assert_eq!(e0.state_flags(), 1);
        assert_eq!(e0.target_id(), 202);

        let e1 = decoded_entities.get(1);
        assert_eq!(e1.id(), 202);
        assert_eq!(e1.entity_type(), EntityType::Mob);

        let decoded_removed = snapshot.removed_ids().expect("removed vector present");
        assert_eq!(decoded_removed.len(), 2);
        assert_eq!(decoded_removed.get(0), 303);
        assert_eq!(decoded_removed.get(1), 404);
    }

    #[test]
    fn test_zero_allocation_reuse() {
        let mut builder = SnapshotBuilder::with_capacity(2048);
        for tick in 1..=5 {
            let entities = vec![EntitySnapshotData {
                id: tick,
                entity_type: EntityType::Projectile,
                x: tick as f32,
                y: (tick * 2) as f32,
                ..Default::default()
            }];
            let slice = builder.build_snapshot(tick, tick as u64 * 50, &entities, &[]);
            let snapshot = root_as_world_snapshot(slice).unwrap();
            assert_eq!(snapshot.tick(), tick);
            assert_eq!(snapshot.entities().unwrap().get(0).id(), tick);
        }
    }

    #[test]
    fn test_input_ack_roundtrip_and_absent_when_zero() {
        let player = |input_ack| EntitySnapshotData {
            id: 101,
            input_ack,
            ..Default::default()
        };
        let with = serialize_snapshot(1, 1000, &[player(7)], &[]);
        let without = serialize_snapshot(1, 1000, &[player(0)], &[]);
        let ack = |bytes: &[u8]| {
            let snapshot = root_as_world_snapshot(bytes).unwrap();
            let ack = snapshot.entities().unwrap().get(0).input_ack();
            ack
        };
        assert_eq!(ack(&with), 7);
        // 0 is the default: not written, and read back as 0 (as from an older server).
        assert_eq!(ack(&without), 0);
        assert!(without.len() < with.len());
    }

    #[test]
    fn test_standalone_serialize_snapshot() {
        let bytes = serialize_snapshot(1, 1000, &[], &[99]);
        let snapshot = root_as_world_snapshot(&bytes).unwrap();
        assert_eq!(snapshot.tick(), 1);
        assert_eq!(snapshot.server_time_ms(), 1000);
        assert!(snapshot.entities().is_none());
        assert_eq!(snapshot.removed_ids().unwrap().get(0), 99);
    }

    #[test]
    fn test_client_input_serialization_roundtrip() {
        let bytes = serialize_client_input(42, 0.707, -0.707, true, 2, 909);
        let input = deserialize_client_input(&bytes).expect("valid client input");
        assert_eq!(input.client_tick(), 42);
        assert!((input.move_x() - 0.707).abs() < 1e-4);
        assert!((input.move_y() - (-0.707)).abs() < 1e-4);
        assert!(input.attack());
        assert_eq!(input.skill_slot(), 2);
        assert_eq!(input.target_id(), 909);
        assert_eq!(input.target_x(), 0.0);
        assert_eq!(input.target_y(), 0.0);
        assert!(!input.respawn());

        let bytes_full =
            serialize_client_input_full(43, 0.0, 0.0, false, 1, 101, 250.5, 300.25, true);
        let input_full = deserialize_client_input(&bytes_full).expect("valid client input");
        assert_eq!(input_full.client_tick(), 43);
        assert_eq!(input_full.skill_slot(), 1);
        assert_eq!(input_full.target_id(), 101);
        assert!((input_full.target_x() - 250.5).abs() < 1e-4);
        assert!((input_full.target_y() - 300.25).abs() < 1e-4);
        assert!(input_full.respawn());
    }

    #[test]
    fn test_fnv1a_32() {
        assert_eq!(fnv1a_32("dev-player"), 4026785618);
        assert_ne!(fnv1a_32("player-1"), fnv1a_32("player-2"));
    }
}
