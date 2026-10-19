use crate::content::world_model::{AOI_ENTER_RADIUS_UNITS, AOI_EXIT_RADIUS_UNITS};
use crate::protocol::{EntitySnapshotData, GameEventData};
use std::collections::{HashMap, HashSet};

/// Per-room Area-of-Interest (AOI) tracker with enter/exit hysteresis (`E-004` Slice 3 & Slice 9).
///
/// Tracks which entity IDs were replicated to each viewer (`viewer_id = fnv1a_32(session_id)`)
/// on the previous tick so that:
/// - New entities (including cross-border ghosts projected from adjacent regions) enter the
///   viewer's snapshot when `distance <= enter_radius` (`600.0`).
/// - Already-visible entities remain in the viewer's snapshot while `distance <= exit_radius` (`640.0`).
/// - Entities that move past `exit_radius` (or leave the 250-unit border ghost band or despawn)
///   are emitted in the viewer's `removed_ids` on the transition tick and omitted from subsequent snapshots.
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
    /// their avatar), returns the unfiltered slice so initial join snapshots work seamlessly.
    pub fn filter_for_viewer(
        &mut self,
        viewer_id: u32,
        entities: &[EntitySnapshotData],
        global_removed: &[u32],
        events: &[GameEventData],
    ) -> (Vec<EntitySnapshotData>, Vec<u32>, Vec<GameEventData>) {
        self.filter_for_viewer_with_ghosts(viewer_id, entities, &[], global_removed, events)
    }

    /// Filters a room tick's `local_entities`, projected `border_ghosts` from adjacent regions,
    /// `global_removed`, and `events` for `viewer_id` (`E-004` Slice 9).
    ///
    /// Border ghosts use the same enter/exit hysteresis (`600.0` / `640.0` units) as local
    /// entities and automatically emit `removed_ids` when they leave the 250-unit border band
    /// or move beyond `exit_radius` from the viewer.
    pub fn filter_for_viewer_with_ghosts(
        &mut self,
        viewer_id: u32,
        local_entities: &[EntitySnapshotData],
        border_ghosts: &[EntitySnapshotData],
        global_removed: &[u32],
        events: &[GameEventData],
    ) -> (Vec<EntitySnapshotData>, Vec<u32>, Vec<GameEventData>) {
        let Some(viewer) = local_entities.iter().find(|e| e.id == viewer_id).copied() else {
            return (
                local_entities.to_vec(),
                global_removed.to_vec(),
                events.to_vec(),
            );
        };

        let prev_visible = self
            .visible_by_viewer
            .remove(&viewer_id)
            .unwrap_or_default();
        let mut next_visible = HashSet::with_capacity(prev_visible.len().max(16));
        let mut filtered_entities = Vec::with_capacity(prev_visible.len().max(16));

        for entity in local_entities.iter().chain(border_ghosts.iter()) {
            if next_visible.contains(&entity.id) {
                continue;
            }
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
        // (either stepped outside exit_radius, left the border ghost band, or despawned)
        // must be sent in removed_ids once.
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

        let entities_t2 = vec![
            make_entity(viewer_id, 1000.0, 1000.0),
            make_entity(10, 1625.0, 1000.0),
            make_entity(20, 1620.0, 1000.0),
        ];
        let (vis2, rem2, _) = aoi.filter_for_viewer(viewer_id, &entities_t2, &[], &[]);
        let vis2_ids: Vec<u32> = vis2.iter().map(|e| e.id).collect();
        assert_eq!(vis2_ids, vec![viewer_id, 10]);
        assert!(rem2.is_empty());

        let entities_t3 = vec![
            make_entity(viewer_id, 1000.0, 1000.0),
            make_entity(10, 1650.0, 1000.0),
        ];
        let (vis3, rem3, _) = aoi.filter_for_viewer(viewer_id, &entities_t3, &[], &[]);
        let vis3_ids: Vec<u32> = vis3.iter().map(|e| e.id).collect();
        assert_eq!(vis3_ids, vec![viewer_id]);
        assert_eq!(rem3, vec![10]);

        let (vis4, rem4, _) = aoi.filter_for_viewer(viewer_id, &entities_t3, &[], &[]);
        let vis4_ids: Vec<u32> = vis4.iter().map(|e| e.id).collect();
        assert_eq!(vis4_ids, vec![viewer_id]);
        assert!(rem4.is_empty());
    }
}
