use bevy_ecs::component::Component;
use bevy_ecs::entity::Entity;
use std::collections::HashMap;

/// Default threat half-life in seconds (6.0s).
pub const DEFAULT_THREAT_HALF_LIFE: f32 = 6.0;

/// A single entry in the threat table tracking accumulated threat and timestamp.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ThreatEntry {
    pub value: f32,
    pub stamp: f32,
}

/// Decaying threat table component tracking aggro across entities.
#[derive(Component, Debug, Clone, PartialEq)]
pub struct ThreatTable {
    pub entries: HashMap<Entity, ThreatEntry>,
    pub taunted_entity: Option<Entity>,
    pub taunted_until: f32,
    pub half_life: f32,
}

impl Default for ThreatTable {
    fn default() -> Self {
        Self::new()
    }
}

impl ThreatTable {
    /// Creates a new threat table with default 6.0s half-life.
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
            taunted_entity: None,
            taunted_until: 0.0,
            half_life: DEFAULT_THREAT_HALF_LIFE,
        }
    }

    /// Creates a new threat table with a custom half-life.
    pub fn with_half_life(half_life: f32) -> Self {
        Self {
            entries: HashMap::new(),
            taunted_entity: None,
            taunted_until: 0.0,
            half_life,
        }
    }

    /// Calculate the exponentially decayed threat value for an entity at `current_time`.
    ///
    /// Formula: `value * (-LN_2 * dt / half_life).exp()`
    pub fn decayed_value(&self, entity: Entity, current_time: f32) -> f32 {
        let Some(entry) = self.entries.get(&entity) else {
            return 0.0;
        };

        let dt = (current_time - entry.stamp).max(0.0);
        if self.half_life <= 0.0 {
            if dt > 0.0 {
                0.0
            } else {
                entry.value
            }
        } else {
            let decay = (-std::f32::consts::LN_2 * dt / self.half_life).exp();
            entry.value * decay
        }
    }

    /// Adds threat to an entity. Decays current threat to `current_time` first,
    /// then adds `amount` and updates the entry's timestamp.
    pub fn add_threat(&mut self, entity: Entity, amount: f32, current_time: f32) {
        let current_val = self.decayed_value(entity, current_time);
        let new_val = (current_val + amount).max(0.0);
        self.entries.insert(
            entity,
            ThreatEntry {
                value: new_val,
                stamp: current_time,
            },
        );
    }

    /// Taunts the mob, pinning `entity` as top target for `duration_sec` seconds.
    pub fn taunt(&mut self, entity: Entity, duration_sec: f32, current_time: f32) {
        self.taunted_entity = Some(entity);
        self.taunted_until = current_time + duration_sec;
    }

    /// Clears any active taunt.
    pub fn clear_taunt(&mut self) {
        self.taunted_entity = None;
        self.taunted_until = 0.0;
    }

    /// Returns whether a taunt is currently active.
    pub fn is_taunted(&self, current_time: f32) -> bool {
        self.taunted_entity.is_some() && current_time < self.taunted_until
    }

    /// Returns the top threat target at `current_time`.
    ///
    /// If an active taunt is in effect, the taunting entity is prioritized.
    /// Otherwise returns the entity with the maximum positive decayed threat.
    pub fn top_target(&self, current_time: f32) -> Option<Entity> {
        if let Some(taunted) = self.taunted_entity {
            if current_time < self.taunted_until {
                return Some(taunted);
            }
        }

        let mut best_target: Option<Entity> = None;
        let mut max_threat = 0.0f32;

        for &entity in self.entries.keys() {
            let val = self.decayed_value(entity, current_time);
            if val > max_threat {
                max_threat = val;
                best_target = Some(entity);
            }
        }

        best_target
    }

    /// Removes an entity from the threat table, clearing taunt if it was the taunting entity.
    pub fn clear_target(&mut self, entity: Entity) {
        self.entries.remove(&entity);
        if self.taunted_entity == Some(entity) {
            self.taunted_entity = None;
            self.taunted_until = 0.0;
        }
    }

    /// Number of tracked entities.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns true if no entities are tracked.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_threat_accumulates_on_repeated_hits() {
        let mut table = ThreatTable::new();
        let entity = Entity::from_raw(1);

        table.add_threat(entity, 50.0, 0.0);
        assert_eq!(table.decayed_value(entity, 0.0), 50.0);

        table.add_threat(entity, 50.0, 0.0);
        assert_eq!(table.decayed_value(entity, 0.0), 100.0);

        // Advance 6 seconds (1 half-life): 100 decays to 50
        assert!((table.decayed_value(entity, 6.0) - 50.0).abs() < 1e-4);

        // Add 25 more threat at t = 6.0: 50 + 25 = 75
        table.add_threat(entity, 25.0, 6.0);
        assert!((table.decayed_value(entity, 6.0) - 75.0).abs() < 1e-4);
    }

    #[test]
    fn test_threat_decays_over_time_according_to_half_life() {
        let mut table = ThreatTable::new(); // half-life = 6.0s
        let entity = Entity::from_raw(42);

        table.add_threat(entity, 100.0, 0.0);

        // t = 0: 100.0
        assert_eq!(table.decayed_value(entity, 0.0), 100.0);

        // t = 6 (1 half-life): 50.0
        let val_6 = table.decayed_value(entity, 6.0);
        assert!((val_6 - 50.0).abs() < 1e-4, "Expected ~50.0, got {}", val_6);

        // t = 12 (2 half-lives): 25.0
        let val_12 = table.decayed_value(entity, 12.0);
        assert!(
            (val_12 - 25.0).abs() < 1e-4,
            "Expected ~25.0, got {}",
            val_12
        );

        // t = 18 (3 half-lives): 12.5
        let val_18 = table.decayed_value(entity, 18.0);
        assert!(
            (val_18 - 12.5).abs() < 1e-4,
            "Expected ~12.5, got {}",
            val_18
        );

        // Arbitrary dt check: at t = 3.0 (half a half-life): 100 * 2^(-0.5) ~ 70.7107
        let val_3 = table.decayed_value(entity, 3.0);
        let expected_3 = 100.0 * (-std::f32::consts::LN_2 * 3.0 / 6.0).exp();
        assert!((val_3 - expected_3).abs() < 1e-4);
    }

    #[test]
    fn test_taunted_entity_pinned_as_top_target_until_expiry() {
        let mut table = ThreatTable::new();
        let regular_target = Entity::from_raw(10);
        let tank = Entity::from_raw(20);

        // regular_target builds 1000 threat at t = 0
        table.add_threat(regular_target, 1000.0, 0.0);
        assert_eq!(table.top_target(0.0), Some(regular_target));

        // tank taunts for 3.0s at t = 1.0 (expires at t = 4.0)
        table.taunt(tank, 3.0, 1.0);

        // Tank is pinned as top target during taunt window
        assert_eq!(table.top_target(1.0), Some(tank));
        assert_eq!(table.top_target(2.5), Some(tank));
        assert_eq!(table.top_target(3.99), Some(tank));

        // At t = 4.01, taunt has expired -> top target reverts to regular_target
        assert_eq!(table.top_target(4.01), Some(regular_target));
    }

    #[test]
    fn test_clear_target_removes_entry_and_taunt() {
        let mut table = ThreatTable::new();
        let e1 = Entity::from_raw(1);
        let e2 = Entity::from_raw(2);

        table.add_threat(e1, 100.0, 0.0);
        table.add_threat(e2, 50.0, 0.0);
        table.taunt(e1, 5.0, 0.0);

        assert_eq!(table.top_target(1.0), Some(e1));

        // Clearing e1 also removes its active taunt
        table.clear_target(e1);
        assert_eq!(table.decayed_value(e1, 1.0), 0.0);
        assert_eq!(table.top_target(1.0), Some(e2));
    }
}
