use bevy_ecs::prelude::With;
use server_rs::ecs::components::{
    DeadMobTracker, EntityId, Health, MobSpawnAnchor, MobTag, Position,
};
use server_rs::meta::SqliteMetaStore;
use server_rs::simulation::AtlasSimulation;
use server_rs::storage::{MemoryWorldStateStore, MetaWorldStateStore, WorldObjectRecord};
use std::collections::BTreeMap;
use std::sync::Arc;

#[tokio::test]
async fn save_and_restore_region_state_preserves_mobs_respawn_timers_and_world_objects_across_restart(
) {
    let db_path = std::env::temp_dir().join(format!(
        "atlas-region-restart-{}.db",
        server_rs::meta::generate_uuid_v4()
    ));
    let sqlite = Arc::new(SqliteMetaStore::open(&db_path).expect("open SqliteMetaStore"));
    let store = MetaWorldStateStore::new(sqlite);

    let mut sim =
        AtlasSimulation::from_generated_region("millcross-ford", 42).expect("load millcross-ford");

    // Pick two mobs in millcross-ford: wound + move the first, kill the second
    let mut mob_ids: Vec<String> = sim
        .world
        .query_filtered::<&EntityId, With<MobTag>>()
        .iter(&sim.world)
        .map(|id| id.0.clone())
        .collect();
    mob_ids.sort();
    assert!(
        mob_ids.len() >= 2,
        "expected at least 2 mobs in millcross-ford"
    );
    let wounded_id = mob_ids[0].clone();
    let killed_id = mob_ids[1].clone();

    {
        let mut q = sim
            .world
            .query_filtered::<(&EntityId, &mut Position, &mut Health), With<MobTag>>();
        for (id, mut pos, mut health) in q.iter_mut(&mut sim.world) {
            if id.0 == wounded_id {
                *pos = Position::new(1777.5, 2333.25);
                health.current = (health.max * 0.5).max(10.0);
            } else if id.0 == killed_id {
                health.take_damage(100_000.0);
            }
        }
    }
    let expected_wounded_hp = {
        let mut q = sim
            .world
            .query_filtered::<(&EntityId, &Health), With<MobTag>>();
        q.iter(&sim.world)
            .find(|(id, _)| id.0 == wounded_id)
            .map(|(_, h)| h.current)
            .unwrap()
    };

    // Step 12 ticks (0.6s) so corpse despawns into DeadMobTracker, then re-pin wounded mob pos
    for _ in 0..12 {
        sim.live_tick(&[], &[]);
    }
    {
        let mut q = sim
            .world
            .query_filtered::<(&EntityId, &mut Position, &mut Health), With<MobTag>>();
        for (id, mut pos, mut health) in q.iter_mut(&mut sim.world) {
            if id.0 == wounded_id {
                *pos = Position::new(1777.5, 2333.25);
                health.current = expected_wounded_hp;
            }
        }
    }

    // Add a persistent world object
    let mut props = BTreeMap::new();
    props.insert("state".to_string(), "activated".to_string());
    props.insert("activatedBy".to_string(), "player-hero".to_string());
    sim.upsert_world_object(WorldObjectRecord {
        object_id: "beacon-millcross-plaza".to_string(),
        kind: "beacon".to_string(),
        x: 2010.0,
        y: 1980.0,
        properties: props,
    });

    // Save region state at t = 10_000ms
    let saved_snapshot = sim
        .save_to_store(&store, 10_000)
        .await
        .expect("save_to_store should succeed");
    assert_eq!(saved_snapshot.region_id, "millcross-ford");
    assert_eq!(saved_snapshot.dead_mob_respawns.len(), 1);
    assert_eq!(saved_snapshot.world_objects.len(), 1);
    let saved_remaining = saved_snapshot.dead_mob_respawns[0].remaining_respawn_sec;
    assert!(saved_remaining > 4.0 && saved_remaining <= 5.0);

    // Simulate a server restart with a fresh AtlasSimulation (even using a different seed)
    // and restore at t = 12_000ms (2.0s of downtime elapsed)
    let mut restarted = AtlasSimulation::from_generated_region("millcross-ford", 999)
        .expect("recreate millcross-ford on restart");
    let did_restore = restarted
        .restore_from_store(&store, Some(12_000))
        .await
        .expect("restore_from_store should succeed");
    assert!(did_restore);

    // 1. Verify wounded mob's exact coordinates and HP were restored
    {
        let mut q = restarted
            .world
            .query_filtered::<(&EntityId, &Position, &Health), With<MobTag>>();
        let (_, pos, health) = q
            .iter(&restarted.world)
            .find(|(id, _, _)| id.0 == wounded_id)
            .expect("wounded mob should exist after restore");
        assert!((pos.x - 1777.5).abs() < 1e-3);
        assert!((pos.y - 2333.25).abs() < 1e-3);
        assert!((health.current - expected_wounded_hp).abs() < 1e-3);
    }

    // 2. Verify DeadMobTracker was restored and fast-forwarded by 2.0s of downtime
    {
        let current_sec = restarted.clock.current_time_seconds();
        let mut tq = restarted.world.query::<&DeadMobTracker>();
        let trackers: Vec<&DeadMobTracker> = tq.iter(&restarted.world).collect();
        assert_eq!(trackers.len(), 1);
        let remaining_after_restore = trackers[0].respawn_at - current_sec;
        assert!(
            (saved_remaining - remaining_after_restore - 2.0).abs() < 1e-3,
            "expected remaining timer to decrease by 2.0s downtime (was {}, now {})",
            saved_remaining,
            remaining_after_restore
        );
    }

    // 3. Verify world objects were restored
    assert_eq!(restarted.world_objects().len(), 1);
    assert_eq!(
        restarted.world_objects()[0].object_id,
        "beacon-millcross-plaza"
    );
    assert_eq!(
        restarted.world_objects()[0]
            .properties
            .get("state")
            .map(String::as_str),
        Some("activated")
    );

    let _ = std::fs::remove_file(&db_path);
}

#[tokio::test]
async fn restore_from_store_respawns_dead_mob_when_downtime_exceeds_remaining_timer() {
    let store = MemoryWorldStateStore::new();
    let mut sim =
        AtlasSimulation::from_generated_region("millcross-ford", 42).expect("load millcross-ford");

    let initial_mob_count = sim
        .world
        .query_filtered::<&EntityId, With<MobTag>>()
        .iter(&sim.world)
        .count();

    // Kill one mob and advance until it is in DeadMobTracker
    {
        let mut q = sim.world.query_filtered::<&mut Health, With<MobTag>>();
        if let Some(mut h) = q.iter_mut(&mut sim.world).next() {
            h.take_damage(100_000.0);
        }
    }
    for _ in 0..12 {
        sim.live_tick(&[], &[]);
    }
    assert_eq!(
        sim.world
            .query::<&DeadMobTracker>()
            .iter(&sim.world)
            .count(),
        1
    );

    // Save at t = 10_000ms
    sim.save_to_store(&store, 10_000).await.unwrap();

    // Restore after 8,000ms of downtime (t = 18_000ms, exceeding 5.0s respawn delay)
    let mut restarted =
        AtlasSimulation::from_generated_region("millcross-ford", 1).expect("load millcross-ford");
    let did_restore = restarted
        .restore_from_store(&store, Some(18_000))
        .await
        .unwrap();
    assert!(did_restore);

    // All DeadMobTrackers should have completed and respawned as living mobs at their anchors
    assert_eq!(
        restarted
            .world
            .query::<&DeadMobTracker>()
            .iter(&restarted.world)
            .count(),
        0
    );
    let restored_mob_count = restarted
        .world
        .query_filtered::<(&EntityId, &MobSpawnAnchor), With<MobTag>>()
        .iter(&restarted.world)
        .count();
    assert_eq!(restored_mob_count, initial_mob_count);
}
