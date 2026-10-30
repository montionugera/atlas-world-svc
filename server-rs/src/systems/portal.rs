use bevy_ecs::prelude::*;
use crate::ecs::components::{
    DungeonPortalEntryEvent, DungeonPortalEventQueue, DungeonPortalTrigger, EntityId, Health,
    PlayerProgression, PlayerTag, Position,
};

/// Evaluates player proximity to spatial dungeon portals.
/// When a player is within `trigger_radius`, pushes a `DungeonPortalEntryEvent` into `DungeonPortalEventQueue`.
pub fn dungeon_portal_trigger_system(
    portals: Query<(&Position, &DungeonPortalTrigger)>,
    players: Query<
        (
            &Position,
            &EntityId,
            Option<&Health>,
            Option<&PlayerProgression>,
        ),
        With<PlayerTag>,
    >,
    event_queue: Option<ResMut<DungeonPortalEventQueue>>,
) {
    let Some(mut queue) = event_queue else {
        return;
    };

    for (player_pos, entity_id, opt_health, opt_prog) in players.iter() {
        if let Some(health) = opt_health {
            if health.current <= 0.0 {
                continue; // Dead players don't trigger portals
            }
        }

        let player_level = opt_prog.map(|p| p.level).unwrap_or(1);

        for (portal_pos, trigger) in portals.iter() {
            if player_level < trigger.min_level {
                continue;
            }

            let dx = player_pos.x - portal_pos.x;
            let dy = player_pos.y - portal_pos.y;
            let dist_sq = dx * dx + dy * dy;

            if dist_sq <= trigger.trigger_radius * trigger.trigger_radius {
                // Avoid flooding duplicates in the same tick
                let already_enqueued = queue
                    .pending_entries
                    .iter()
                    .any(|e| e.player_id == entity_id.0 && e.portal_id == trigger.portal_id);

                if !already_enqueued {
                    queue.pending_entries.push(DungeonPortalEntryEvent {
                        player_id: entity_id.0.clone(),
                        portal_id: trigger.portal_id.clone(),
                        dungeon_template_id: trigger.target_dungeon_template_id.clone(),
                        mvp_boss_id: trigger.target_mvp_boss_id.clone(),
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dungeon_portal_trigger_system_enqueues_entry() {
        let mut world = World::new();
        world.insert_resource(DungeonPortalEventQueue::default());

        // Spawn a portal at (100, 100) with radius 15
        world.spawn((
            Position::new(100.0, 100.0),
            DungeonPortalTrigger::new(
                "portal_vesper_gateway",
                "dungeon_vesper_crater",
                "mvp_vesper_archon",
                15.0,
                1,
            ),
        ));

        // Spawn player inside trigger radius at (105, 100)
        world.spawn((
            PlayerTag,
            EntityId("player_alpha".to_string()),
            Position::new(105.0, 100.0),
            Health::new(100.0),
        ));

        // Spawn another player outside trigger radius at (150, 100)
        world.spawn((
            PlayerTag,
            EntityId("player_beta".to_string()),
            Position::new(150.0, 100.0),
            Health::new(100.0),
        ));

        let mut schedule = Schedule::default();
        schedule.add_systems(dungeon_portal_trigger_system);
        schedule.run(&mut world);

        let queue = world.resource::<DungeonPortalEventQueue>();
        assert_eq!(queue.pending_entries.len(), 1);
        assert_eq!(queue.pending_entries[0].player_id, "player_alpha");
        assert_eq!(
            queue.pending_entries[0].dungeon_template_id,
            "dungeon_vesper_crater"
        );
        assert_eq!(queue.pending_entries[0].mvp_boss_id, "mvp_vesper_archon");
    }
}
