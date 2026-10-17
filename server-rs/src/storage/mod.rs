use bevy_ecs::prelude::Resource;
use std::collections::HashMap;
use std::time::Duration;

pub mod nakama;

pub use nakama::{
    normalize_match_event_type, EquippedItemIds, LoadoutSnapshot, MatchEvent, MatchEventBatch,
    MockNakamaClient, NakamaClient, NakamaConfig, NakamaStorage, PrimaryStats, ProfileDoc,
    DEFAULT_NAKAMA_MATCH_ID, PROBE_RETRY_WINDOW,
};

/// Default interval between buffered match-event flushes to Nakama (5 seconds).
pub const DEFAULT_MATCH_EVENT_FLUSH_INTERVAL: Duration = Duration::from_secs(5);

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
