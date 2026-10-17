use bevy_ecs::prelude::Resource;

pub mod nakama;

pub use nakama::{
    EquippedItemIds, LoadoutSnapshot, MatchEvent, MatchEventBatch, MockNakamaClient, NakamaClient,
    NakamaConfig, NakamaStorage, PrimaryStats, ProfileDoc, PROBE_RETRY_WINDOW,
};

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
