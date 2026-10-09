use crate::ai::ThreatTable;
use crate::content::{derive_mob_stats, BestiaryCatalog};
use crate::core::clock::SimClock;
use crate::ecs::components::{
    BodyRadius, CombatStats, DeadMobTracker, DespawnedIds, ElementalAttributes, EntityId, Health,
    LiveRules, MobAi, MobCorpse, MobSpawnAnchor, MobTag, Position, Velocity, MOB_BODY_RADIUS,
    PLAYER_BODY_RADIUS,
};
use bevy_ecs::prelude::*;
use std::sync::OnceLock;

static DEFAULT_CATALOG: OnceLock<BestiaryCatalog> = OnceLock::new();

/// The ONE full live mob bundle, shared by the live initial spawn
/// (`AtlasSimulation::live`) and `mob_lifecycle_system` respawns.
pub fn mob_bundle(catalog: &BestiaryCatalog, anchor: &MobSpawnAnchor, id: String) -> impl Bundle {
    // (hp, p_atk, defence attrs, base attack range, chase range, ranged, speed)
    let (hp, p_atk, attrs, base_range, chase_range, is_ranged, speed) =
        match catalog.get_mob(&anchor.mob_id) {
            Some(entry) => {
                let d = derive_mob_stats(entry, anchor.tier);
                (
                    d.hp,
                    d.p_atk,
                    ElementalAttributes {
                        element: d.element,
                        p_def: d.p_def,
                        m_def: d.m_def,
                        armor: d.armor,
                    },
                    d.attack_range(),
                    d.chase_range,
                    d.is_ranged,
                    d.move_speed(),
                )
            }
            // Fallback for custom / unregistered mob_ids.
            None => (
                100.0,
                10.0,
                ElementalAttributes::default(),
                20.0,
                200.0,
                false,
                80.0,
            ),
        };
    // Bodies can no longer overlap (min centre distance = mob + player radius), so melee
    // reach is treated as edge-to-edge and measured centre-to-centre here (otherwise a
    // 20px melee mob could never touch a player). Assumption: legacy melee attackRange was
    // also surface reach for Planck bodies. Ranged reach is projectile range: unchanged.
    let attack_range = if is_ranged {
        base_range
    } else {
        base_range + MOB_BODY_RADIUS + PLAYER_BODY_RADIUS
    };
    let spawn = anchor.spawn_pos;

    (
        EntityId(id),
        Position::new(spawn.x, spawn.y),
        Velocity::zero(),
        Health::new(hp),
        MobTag,
        attrs,
        CombatStats {
            attack_power: p_atk,
            defense: attrs.p_def,
            attack_range,
            attack_cooldown: 1.0,
            cooldown_timer: 0.0,
            is_player: false,
        },
        ThreatTable::new(),
        MobAi::new(spawn, chase_range, attack_range, is_ranged).with_move_speed(speed),
        anchor.clone(),
        BodyRadius(MOB_BODY_RADIUS),
    )
}

#[allow(clippy::type_complexity)]
pub fn mob_lifecycle_system(
    mut commands: Commands,
    clock: Res<SimClock>,
    dead_query: Query<
        (
            Entity,
            &Health,
            &MobSpawnAnchor,
            Option<&EntityId>,
            Option<&MobCorpse>,
        ),
        With<MobTag>,
    >,
    trackers: Query<(Entity, &DeadMobTracker)>,
    catalog_res: Option<Res<BestiaryCatalog>>,
    rules: Option<Res<LiveRules>>,
    mut despawned: Option<ResMut<DespawnedIds>>,
) {
    let current_time = clock.current_time_seconds();
    // Live keeps corpses briefly; without LiveRules (harness / unit tests) despawn at once.
    let corpse_sec = rules.map_or(0.0, |r| r.mob_corpse_sec);

    // 1. Dead mobs: linger as a corpse, then despawn and start the respawn timer.
    for (entity, health, anchor, id, corpse) in &dead_query {
        if health.is_alive {
            continue;
        }
        let death_time = corpse.map_or(current_time, |c| c.died_at);
        if current_time < death_time + corpse_sec {
            if corpse.is_none() {
                commands.entity(entity).insert(MobCorpse {
                    died_at: death_time,
                });
            }
            continue;
        }
        commands.spawn(DeadMobTracker {
            death_time,
            respawn_at: death_time + anchor.respawn_delay_sec,
            anchor: anchor.clone(),
        });
        commands.entity(entity).despawn();
        if let (Some(list), Some(id)) = (despawned.as_mut(), id) {
            list.0.push(id.0.clone());
        }
    }

    // 2. Check trackers ready for respawn
    let catalog = catalog_res
        .as_deref()
        .unwrap_or_else(|| DEFAULT_CATALOG.get_or_init(BestiaryCatalog::default));

    for (tracker_entity, tracker) in &trackers {
        if current_time >= tracker.respawn_at {
            // Tracker index keeps ids unique when two same-type mobs respawn on one tick.
            let id = format!(
                "{}-{}-{}",
                tracker.anchor.mob_id,
                clock.tick(),
                tracker_entity.index()
            );
            commands.spawn(mob_bundle(catalog, &tracker.anchor, id));
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
