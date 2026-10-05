use crate::ai::ThreatTable;
use crate::content::{derive_mob_stats, BestiaryCatalog};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    CombatStats, DeadMobTracker, ElementalAttributes, EntityId, Health, MobAi, MobSpawnAnchor,
    MobTag, Position, Velocity,
};
use bevy_ecs::prelude::*;
use std::sync::OnceLock;

static DEFAULT_CATALOG: OnceLock<BestiaryCatalog> = OnceLock::new();

#[allow(clippy::type_complexity)]
pub fn mob_lifecycle_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    dead_query: Query<(Entity, &Position, &Health, &MobSpawnAnchor), With<MobTag>>,
    trackers: Query<(Entity, &DeadMobTracker)>,
    catalog_res: Option<Res<BestiaryCatalog>>,
) {
    let current_time = clock.current_time_seconds();

    // 1. Check for newly dead mobs
    for (entity, _pos, health, anchor) in &dead_query {
        if !health.is_alive {
            let death_time = current_time;
            commands.spawn(DeadMobTracker {
                death_time,
                respawn_at: death_time + anchor.respawn_delay_sec,
                anchor: anchor.clone(),
            });
            commands.entity(entity).despawn();
        }
    }

    // 2. Check trackers ready for respawn
    let catalog = catalog_res
        .as_deref()
        .unwrap_or_else(|| DEFAULT_CATALOG.get_or_init(BestiaryCatalog::default));

    for (tracker_entity, tracker) in &trackers {
        if current_time >= tracker.respawn_at {
            if let Some(entry) = catalog.get_mob(&tracker.anchor.mob_id) {
                let derived = derive_mob_stats(entry, tracker.anchor.tier);
                let attack_range = derived.attack_range();

                commands.spawn((
                    EntityId(format!("{}-{}", tracker.anchor.mob_id, clock.tick())),
                    Position::new(tracker.anchor.spawn_pos.x, tracker.anchor.spawn_pos.y),
                    Velocity::zero(),
                    Health::new(derived.hp),
                    MobTag,
                    ElementalAttributes {
                        element: derived.element,
                        p_def: derived.p_def,
                        m_def: derived.m_def,
                        armor: derived.armor,
                    },
                    CombatStats {
                        attack_power: derived.p_atk,
                        defense: derived.p_def,
                        attack_range,
                        attack_cooldown: 1.0,
                        cooldown_timer: 0.0,
                        is_player: false,
                    },
                    ThreatTable::new(),
                    MobAi::new(
                        tracker.anchor.spawn_pos,
                        derived.chase_range,
                        attack_range,
                        derived.is_ranged,
                    ),
                    tracker.anchor.clone(),
                ));
            } else {
                // Fallback for custom / unregistered mob_ids
                let attack_range = 20.0;
                commands.spawn((
                    EntityId(format!("{}-{}", tracker.anchor.mob_id, clock.tick())),
                    Position::new(tracker.anchor.spawn_pos.x, tracker.anchor.spawn_pos.y),
                    Velocity::zero(),
                    Health::new(100.0),
                    MobTag,
                    ElementalAttributes::default(),
                    CombatStats {
                        attack_power: 10.0,
                        defense: 1.0,
                        attack_range,
                        attack_cooldown: 1.0,
                        cooldown_timer: 0.0,
                        is_player: false,
                    },
                    ThreatTable::new(),
                    MobAi::new(tracker.anchor.spawn_pos, 200.0, attack_range, false),
                    tracker.anchor.clone(),
                ));
            }

            commands.entity(tracker_entity).despawn();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::MobTier;

    #[test]
    fn test_mob_lifecycle_dead_mob_spawns_tracker_and_despawns_entity() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let anchor = MobSpawnAnchor::new(
            Position::new(100.0, 100.0),
            "mob-bramble-stalker",
            MobTier::Route,
            5.0,
        );

        let mut health = Health::new(100.0);
        health.take_damage(100.0);
        assert!(!health.is_alive);

        let mob = world
            .spawn((Position::new(100.0, 100.0), health, MobTag, anchor.clone()))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_lifecycle_system);
        schedule.run(&mut world);

        // Mob entity should be despawned
        assert!(world.get_entity(mob).is_err());

        // DeadMobTracker should exist
        let mut tracker_query = world.query::<&DeadMobTracker>();
        let trackers: Vec<&DeadMobTracker> = tracker_query.iter(&world).collect();
        assert_eq!(trackers.len(), 1);
        assert_eq!(trackers[0].death_time, 0.0);
        assert_eq!(trackers[0].respawn_at, 5.0);
        assert_eq!(trackers[0].anchor, anchor);
    }

    #[test]
    fn test_mob_lifecycle_tracker_does_not_respawn_before_timer() {
        let mut world = World::new();
        let clock = SimClock::default();
        world.insert_resource(clock);

        let anchor = MobSpawnAnchor::new(
            Position::new(50.0, 50.0),
            "mob-bramble-stalker",
            MobTier::Route,
            10.0,
        );

        let tracker_entity = world.spawn(DeadMobTracker::new(0.0, 10.0, anchor)).id();

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_lifecycle_system);
        schedule.run(&mut world);

        // Tracker should still exist since current_time (0.0) < respawn_at (10.0)
        assert!(world.get_entity(tracker_entity).is_ok());

        let mut mob_query = world.query_filtered::<Entity, With<MobTag>>();
        assert_eq!(mob_query.iter(&world).count(), 0);
    }

    #[test]
    fn test_mob_lifecycle_tracker_respawns_mob_at_anchor() {
        let mut world = World::new();
        let mut clock = SimClock::default();
        // Advance clock past respawn_at (5.0s = 5000ms)
        clock.advance_by(5100);
        world.insert_resource(clock);

        let anchor = MobSpawnAnchor::new(
            Position::new(200.0, 300.0),
            "mob-bramble-stalker",
            MobTier::Route,
            5.0,
        );

        let tracker_entity = world
            .spawn(DeadMobTracker::new(0.0, 5.0, anchor.clone()))
            .id();

        let mut schedule = Schedule::default();
        schedule.add_systems(mob_lifecycle_system);
        schedule.run(&mut world);

        // Tracker should be despawned
        assert!(world.get_entity(tracker_entity).is_err());

        // Respawned mob should exist
        let mut mob_query = world.query::<(
            &EntityId,
            &Position,
            &Health,
            &MobTag,
            &ElementalAttributes,
            &CombatStats,
            &ThreatTable,
            &MobAi,
            &MobSpawnAnchor,
        )>();

        let mobs: Vec<_> = mob_query.iter(&world).collect();
        assert_eq!(mobs.len(), 1);
        let (id, pos, health, _, elem, combat, _threat, ai, respawn_anchor) = mobs[0];

        assert!(id.0.starts_with("mob-bramble-stalker-"));
        assert_eq!(pos.x, 200.0);
        assert_eq!(pos.y, 300.0);
        assert_eq!(health.current, 100.0); // Bramble stalker route tier hp = 100
        assert_eq!(health.max, 100.0);
        assert!(health.is_alive);
        assert_eq!(elem.element, crate::combat::Element::Earth);
        assert_eq!(combat.attack_power, 10.0);
        assert_eq!(ai.home_pos, Position::new(200.0, 300.0));
        assert_eq!(*respawn_anchor, anchor);
    }
}
