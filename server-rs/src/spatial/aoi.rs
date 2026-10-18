use crate::content::world_model::{AOI_ENTER_RADIUS_UNITS, AOI_EXIT_RADIUS_UNITS};
use crate::protocol::{EntitySnapshotData, GameEventData};
use std::collections::{HashMap, HashSet};

/// Per-room Area-of-Interest (AOI) tracker with enter/exit hysteresis (`E-004` Slice 3).
///
/// Tracks which entity IDs were replicated to each viewer (`viewer_id = fnv1a_32(session_id)`)
/// on the previous tick so that:
/// - New entities enter the viewer's snapshot when `distance <= enter_radius` (`600.0`).
/// - Already-visible entities remain in the viewer's snapshot while `distance <= exit_radius` (`640.0`).
/// - Entities that move past `exit_radius` (or despawn globally) are emitted in the viewer's
///   `removed_ids` on the transition tick and omitted from subsequent snapshots.
#[derive(Debug, Clone)]
pub struct AoiTracker {
    enter_radius_sq: f32,
    exit_radius_sq: f32,
    visible_by_viewer: HashMap<u32, HashSet<u32>>,
}

impl Default for AoiTracker {
    fn default() -> Self {
        Self::new(AOI_ENTER_RADIUS_UNITS, AOI_EXIT_RADIUS_UNITS)
    }
}

impl AoiTracker {
    pub fn new(enter_radius: f32, exit_radius: f32) -> Self {
        let enter = enter_radius.max(1.0);
        let exit = exit_radius.max(enter);
        Self {
            enter_radius_sq: enter * enter,
            exit_radius_sq: exit * exit,
            visible_by_viewer: HashMap::new(),
        }
    }

    /// Removes tracked visibility state for a disconnected viewer.
    pub fn remove_viewer(&mut self, viewer_id: u32) {
        self.visible_by_viewer.remove(&viewer_id);
    }

    /// Filters a room tick's `entities`, `global_removed`, and `events` for `viewer_id`.
    ///
    /// If `viewer_id` is not present in `entities` yet (e.g., before their first input spawns
    /// their avatar), returns the unfiltered slice around `(500.0, 500.0)` or full room so
    /// initial join snapshots work seamlessly.
    pub fn filter_for_viewer(
        &mut self,
        viewer_id: u32,
        entities: &[EntitySnapshotData],
        global_removed: &[u32],
        events: &[GameEventData],
    ) -> (Vec<EntitySnapshotData>, Vec<u32>, Vec<GameEventData>) {
        let Some(viewer) = entities.iter().find(|e| e.id == viewer_id).copied() else {
            return (entities.to_vec(), global_removed.to_vec(), events.to_vec());
        };

        let prev_visible = self
            .visible_by_viewer
            .remove(&viewer_id)
            .unwrap_or_default();
        let mut next_visible = HashSet::with_capacity(prev_visible.len().max(16));
        let mut filtered_entities = Vec::with_capacity(prev_visible.len().max(16));

        for entity in entities {
            if entity.id == viewer_id {
                next_visible.insert(entity.id);
                filtered_entities.push(*entity);
                continue;
            }
            let dx = entity.x - viewer.x;
            let dy = entity.y - viewer.y;
            let dist_sq = dx * dx + dy * dy;
            let was_visible = prev_visible.contains(&entity.id);
            let is_visible = if was_visible {
                dist_sq <= self.exit_radius_sq
            } else {
                dist_sq <= self.enter_radius_sq
            };
            if is_visible {
                next_visible.insert(entity.id);
                filtered_entities.push(*entity);
            }
        }

        // Any entity that was visible last tick and is no longer visible this tick
        // (either stepped outside exit_radius or despawned) must be sent in removed_ids once.
        let mut removed_ids: Vec<u32> = prev_visible
            .iter()
            .copied()
            .filter(|id| !next_visible.contains(id))
            .collect();
        for &gid in global_removed {
            if !removed_ids.contains(&gid) {
                removed_ids.push(gid);
            }
        }
        removed_ids.sort_unstable();

        // Filter combat events to those involving any currently or just-previously visible entity.
        let filtered_events: Vec<GameEventData> = events
            .iter()
            .copied()
            .filter(|ev| {
                next_visible.contains(&ev.source_id)
                    || next_visible.contains(&ev.target_id)
                    || prev_visible.contains(&ev.source_id)
                    || prev_visible.contains(&ev.target_id)
            })
            .collect();

        self.visible_by_viewer.insert(viewer_id, next_visible);
        (filtered_entities, removed_ids, filtered_events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{EntityType, GameEventKind};

    fn make_entity(id: u32, x: f32, y: f32) -> EntitySnapshotData {
        EntitySnapshotData {
            id,
            entity_type: EntityType::Player,
            x,
            y,
            ..Default::default()
        }
    }

    #[test]
    fn aoi_tracker_enforces_enter_hysteresis_and_emits_removed_id_once_on_leave() {
        let mut aoi = AoiTracker::new(600.0, 640.0);
        let viewer_id = 1;

        // Tick 1: viewer at (1000, 1000), near_mob at (1500, 1000) [dist 500 <= 600],
        // band_mob at (1620, 1000) [dist 620 > 600 -> not entered yet],
        // far_mob at (2500, 2500) [dist > 640].
        let entities_t1 = vec![
            make_entity(viewer_id, 1000.0, 1000.0),
            make_entity(10, 1500.0, 1000.0),
            make_entity(20, 1620.0, 1000.0),
            make_entity(30, 2500.0, 2500.0),
        ];
        let events_t1 = vec![
            GameEventData {
                kind: GameEventKind::Hit,
                source_id: viewer_id,
                target_id: 10,
                amount: 15.0,
            },
            GameEventData {
                kind: GameEventKind::Hit,
                source_id: 30,
                target_id: 30,
                amount: 99.0,
            },
        ];
        let (vis1, rem1, ev1) = aoi.filter_for_viewer(viewer_id, &entities_t1, &[], &events_t1);
        let vis1_ids: Vec<u32> = vis1.iter().map(|e| e.id).collect();
        assert_eq!(vis1_ids, vec![viewer_id, 10]);
        assert!(rem1.is_empty());
        assert_eq!(ev1.len(), 1);
        assert_eq!(ev1[0].target_id, 10);

        // Tick 2: entity 10 moves to (1625, 1000) [dist 625, inside 600..640 hysteresis band].
        // Because entity 10 was already visible, it STAYS visible (no flicker).
        let entities_t2 = vec![
            make_entity(viewer_id, 1000.0, 1000.0),
            make_entity(10, 1625.0, 1000.0),
            make_entity(20, 1620.0, 1000.0),
        ];
        let (vis2, rem2, _) = aoi.filter_for_viewer(viewer_id, &entities_t2, &[], &[]);
        let vis2_ids: Vec<u32> = vis2.iter().map(|e| e.id).collect();
        assert_eq!(vis2_ids, vec![viewer_id, 10]);
        assert!(rem2.is_empty());

        // Tick 3: entity 10 moves to (1650, 1000) [dist 650 > 640 exit radius].
        // Entity 10 leaves AOI and its ID (10) is emitted in removed_ids once.
        let entities_t3 = vec![
            make_entity(viewer_id, 1000.0, 1000.0),
            make_entity(10, 1650.0, 1000.0),
        ];
        let (vis3, rem3, _) = aoi.filter_for_viewer(viewer_id, &entities_t3, &[], &[]);
        let vis3_ids: Vec<u32> = vis3.iter().map(|e| e.id).collect();
        assert_eq!(vis3_ids, vec![viewer_id]);
        assert_eq!(rem3, vec![10]);

        // Tick 4: entity 10 stays at (1650, 1000); removed_ids is NOT repeated.
        let (vis4, rem4, _) = aoi.filter_for_viewer(viewer_id, &entities_t3, &[], &[]);
        let vis4_ids: Vec<u32> = vis4.iter().map(|e| e.id).collect();
        assert_eq!(vis4_ids, vec![viewer_id]);
        assert!(rem4.is_empty());
    }
}
