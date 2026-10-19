use bevy_ecs::prelude::Resource;
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub mod nakama;
pub mod world_store;

pub use nakama::{
    normalize_match_event_type, CharacterStateSnapshot, EquippedItemIds, LoadoutSnapshot,
    MatchEvent, MatchEventBatch, MockNakamaClient, NakamaClient, NakamaConfig, NakamaStorage,
    PrimaryStats, ProfileDoc, SkillUnlock, DEFAULT_NAKAMA_MATCH_ID, PROBE_RETRY_WINDOW,
};
pub use world_store::{
    DeadMobRespawnRecord, FileWorldStateStore, MemoryWorldStateStore, MetaWorldStateStore,
    MobStateRecord, RegionStateSnapshot, WorldObjectRecord, WorldStateStore,
    WORLD_REGIONS_COLLECTION, WORLD_REGIONS_INDEX_COLLECTION, WORLD_REGIONS_INDEX_KEY,
    WORLD_SYSTEM_USER_ID,
};

/// Default interval between buffered match-event flushes to Nakama (5 seconds).
pub const DEFAULT_MATCH_EVENT_FLUSH_INTERVAL: Duration = Duration::from_secs(5);

/// Default interval between periodic character-state checkpoints to Nakama (5 seconds).
pub const DEFAULT_CHARACTER_STATE_FLUSH_INTERVAL: Duration = Duration::from_secs(5);

/// In-memory queue storing player match events to be dispatched or drained by persistence tasks.
#[derive(Resource, Default, Debug, Clone)]
pub struct MatchEventQueue {
    pub events: Vec<(String, MatchEvent)>,
}

impl MatchEventQueue {
    pub fn push(&mut self, user_id: impl Into<String>, event: MatchEvent) {
        self.events.push((user_id.into(), event));
    }

    pub fn drain(&mut self) -> Vec<(String, MatchEvent)> {
        std::mem::take(&mut self.events)
    }
}

/// Buffers drained simulation `MatchEvent`s per authenticated player (UUID `user_id`)
/// and flushes `MatchEventBatch`es on a fixed time interval or immediately when a player leaves.
#[derive(Debug, Clone)]
pub struct MatchEventBuffer {
    pending: HashMap<String, Vec<MatchEvent>>,
    flush_interval: Duration,
    elapsed: Duration,
}

impl Default for MatchEventBuffer {
    fn default() -> Self {
        Self::new(DEFAULT_MATCH_EVENT_FLUSH_INTERVAL)
    }
}

impl MatchEventBuffer {
    pub fn new(flush_interval: Duration) -> Self {
        Self {
            pending: HashMap::new(),
            flush_interval,
            elapsed: Duration::ZERO,
        }
    }

    /// Returns true if `user_id` is a real Nakama UUID account (skipping bots and synthetic IDs).
    pub fn is_persistable_user_id(user_id: &str) -> bool {
        crate::net::is_uuid_user_id(user_id)
    }

    /// Buffers a single match event for `user_id` if `user_id` is a valid Nakama UUID.
    pub fn record(&mut self, user_id: &str, event: MatchEvent) -> bool {
        if !Self::is_persistable_user_id(user_id) {
            return false;
        }
        self.pending
            .entry(user_id.to_string())
            .or_default()
            .push(event);
        true
    }

    /// Buffers a collection of `(user_id, MatchEvent)` tuples.
    pub fn record_all(&mut self, events: impl IntoIterator<Item = (String, MatchEvent)>) {
        for (user_id, event) in events {
            self.record(&user_id, event);
        }
    }

    /// Immediately drains any buffered events for a single disconnecting/leaving player.
    pub fn flush_user(&mut self, user_id: &str) -> Option<MatchEventBatch> {
        let events = self.pending.remove(user_id)?;
        if events.is_empty() {
            None
        } else {
            Some(MatchEventBatch {
                user_id: user_id.to_string(),
                events,
            })
        }
    }

    /// Immediately drains buffered events for all disconnecting/leaving players in `user_ids`.
    pub fn flush_users(&mut self, user_ids: &[String]) -> Vec<MatchEventBatch> {
        user_ids
            .iter()
            .filter_map(|uid| self.flush_user(uid))
            .collect()
    }

    /// Drains all buffered events across all users (sorted by `user_id` for determinism)
    /// and resets the interval timer.
    pub fn flush_all(&mut self) -> Vec<MatchEventBatch> {
        self.elapsed = Duration::ZERO;
        if self.pending.is_empty() {
            return Vec::new();
        }
        let mut keys: Vec<String> = self.pending.keys().cloned().collect();
        keys.sort();
        keys.into_iter()
            .filter_map(|uid| self.flush_user(&uid))
            .collect()
    }

    /// Advances the buffer clock by `dt`; when `elapsed >= flush_interval`, drains and returns
    /// all pending `MatchEventBatch`es.
    pub fn tick(&mut self, dt: Duration) -> Vec<MatchEventBatch> {
        self.elapsed += dt;
        if self.elapsed >= self.flush_interval {
            self.flush_all()
        } else {
            Vec::new()
        }
    }

    /// Dispatches a list of `MatchEventBatch`es to a `NakamaStorage` backend.
    pub async fn dispatch_batches(
        storage: &dyn NakamaStorage,
        batches: &[MatchEventBatch],
    ) -> Vec<Result<String, String>> {
        let mut results = Vec::with_capacity(batches.len());
        for batch in batches {
            results.push(storage.report_match_events(batch).await);
        }
        results
    }
}

/// Buffers latest world `(map_id, x, y, health, seq)` per authenticated UUID player
/// and flushes immediately on leave, on a periodic checkpoint interval (crash safety),
/// or on graceful shutdown.
#[derive(Debug, Clone)]
pub struct CharacterStateBuffer {
    pending: HashMap<String, CharacterStateSnapshot>,
    flush_interval: Duration,
    elapsed: Duration,
    next_seq: u64,
}

impl Default for CharacterStateBuffer {
    fn default() -> Self {
        Self::new(DEFAULT_CHARACTER_STATE_FLUSH_INTERVAL)
    }
}

impl CharacterStateBuffer {
    pub fn new(flush_interval: Duration) -> Self {
        let initial_seq = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(1)
            .max(1);
        Self {
            pending: HashMap::new(),
            flush_interval,
            elapsed: Duration::ZERO,
            next_seq: initial_seq,
        }
    }

    pub fn with_initial_seq(mut self, initial_seq: u64) -> Self {
        self.next_seq = initial_seq.max(1);
        self
    }

    /// Records the latest `CharacterStateSnapshot` for `user_id` if `user_id` is a valid UUID.
    /// Assigns a monotonically increasing `seq` when `state.seq == 0`.
    pub fn record(&mut self, user_id: &str, mut state: CharacterStateSnapshot) -> bool {
        if !MatchEventBuffer::is_persistable_user_id(user_id) {
            return false;
        }
        if state.seq == 0 {
            state.seq = self.next_seq;
            self.next_seq = self.next_seq.saturating_add(1);
        } else if state.seq >= self.next_seq {
            self.next_seq = state.seq.saturating_add(1);
        }
        if let Some(existing) = self.pending.get(user_id) {
            if state.seq < existing.seq {
                return false;
            }
        }
        self.pending.insert(user_id.to_string(), state);
        true
    }

    /// Records a collection of `(user_id, CharacterStateSnapshot)` entries.
    pub fn record_all(
        &mut self,
        states: impl IntoIterator<Item = (String, CharacterStateSnapshot)>,
    ) {
        for (user_id, state) in states {
            self.record(&user_id, state);
        }
    }

    /// Immediately drains the buffered character state for a disconnecting/leaving player.
    pub fn flush_user(&mut self, user_id: &str) -> Option<(String, CharacterStateSnapshot)> {
        self.pending
            .remove(user_id)
            .map(|state| (user_id.to_string(), state))
    }

    /// Immediately drains buffered character states for all leaving players in `user_ids`.
    pub fn flush_users(&mut self, user_ids: &[String]) -> Vec<(String, CharacterStateSnapshot)> {
        user_ids
            .iter()
            .filter_map(|uid| self.flush_user(uid))
            .collect()
    }

    /// Drains all buffered character states (sorted by `user_id` for determinism)
    /// and resets the interval timer.
    pub fn flush_all(&mut self) -> Vec<(String, CharacterStateSnapshot)> {
        self.elapsed = Duration::ZERO;
        if self.pending.is_empty() {
            return Vec::new();
        }
        let mut keys: Vec<String> = self.pending.keys().cloned().collect();
        keys.sort();
        keys.into_iter()
            .filter_map(|uid| self.flush_user(&uid))
            .collect()
    }

    /// Advances the checkpoint timer by `dt`; when `elapsed >= flush_interval`, returns `true`
    /// so the caller can snapshot active players and call `flush_all()`.
    pub fn should_checkpoint(&mut self, dt: Duration) -> bool {
        self.elapsed += dt;
        self.elapsed >= self.flush_interval
    }

    /// Advances the buffer clock by `dt` and flushes any pending character states when the
    /// checkpoint interval is reached.
    pub fn tick(&mut self, dt: Duration) -> Vec<(String, CharacterStateSnapshot)> {
        if self.should_checkpoint(dt) {
            self.flush_all()
        } else {
            Vec::new()
        }
    }

    /// Dispatches a list of `(user_id, CharacterStateSnapshot)` entries to `NakamaStorage`.
    pub async fn dispatch_states(
        storage: &dyn NakamaStorage,
        states: &[(String, CharacterStateSnapshot)],
    ) -> Vec<Result<String, String>> {
        let mut results = Vec::with_capacity(states.len());
        for (user_id, state) in states {
            results.push(storage.save_character_state(user_id, state).await);
        }
        results
    }
}
