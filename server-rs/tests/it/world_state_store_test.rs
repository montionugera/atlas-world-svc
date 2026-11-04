use server_rs::meta::{InMemoryMetaStore, SqliteMetaStore};
use server_rs::storage::{
    DeadMobRespawnRecord, FileWorldStateStore, MemoryWorldStateStore, MetaWorldStateStore,
    MobStateRecord, RegionStateSnapshot, WorldObjectRecord, WorldStateStore,
};
use std::collections::BTreeMap;
use std::sync::Arc;

fn sample_region_snapshot(region_id: &str, tick: u32, saved_at_ms: u64) -> RegionStateSnapshot {
    let mut props = BTreeMap::new();
    props.insert("state".to_string(), "lit".to_string());
    RegionStateSnapshot {
        schema_version: 1,
        region_id: region_id.to_string(),
        saved_at_tick: tick,
        saved_at_ms,
        sleeping_since_ms: Some(saved_at_ms),
        mobs: vec![MobStateRecord {
            entity_id: "mob-bramble-stalker-0".to_string(),
            mob_id: "mob-bramble-stalker".to_string(),
            tier: "route".to_string(),
            x: 1240.5,
            y: 1890.25,
            vx: 0.0,
            vy: 0.0,
            health: 75.0,
            max_health: 120.0,
            spawn_x: 1200.0,
            spawn_y: 1900.0,
            respawn_delay_sec: 5.0,
        }],
        dead_mob_respawns: vec![DeadMobRespawnRecord {
            mob_id: "mob-cinder-hound".to_string(),
            tier: "route".to_string(),
            spawn_x: 2100.0,
            spawn_y: 2300.0,
            respawn_delay_sec: 8.0,
            remaining_respawn_sec: 3.5,
        }],
        world_objects: vec![WorldObjectRecord {
            object_id: "beacon-millcross-north".to_string(),
            kind: "beacon".to_string(),
            x: 2000.0,
            y: 1500.0,
            properties: props,
        }],
    }
}

async fn assert_store_contract(store: &dyn WorldStateStore) {
    // Initially empty
    assert_eq!(store.list_region_ids().await.unwrap(), Vec::<String>::new());
    assert_eq!(
        store.load_region_state("town-millcross").await.unwrap(),
        None
    );

    // Save two regions
    let snap_millcross = sample_region_snapshot("town-millcross", 100, 5_000);
    let snap_bramble = sample_region_snapshot("bramblewood", 250, 12_500);
    store.save_region_state(&snap_millcross).await.unwrap();
    store.save_region_state(&snap_bramble).await.unwrap();

    // List region IDs (sorted deterministically)
    let ids = store.list_region_ids().await.unwrap();
    assert_eq!(
        ids,
        vec!["bramblewood".to_string(), "town-millcross".to_string()]
    );

    // Read back town-millcross
    let loaded = store
        .load_region_state("town-millcross")
        .await
        .unwrap()
        .expect("town-millcross should exist");
    assert_eq!(loaded, snap_millcross);

    // Update town-millcross
    let mut updated = snap_millcross.clone();
    updated.saved_at_tick = 140;
    updated.saved_at_ms = 7_000;
    updated.mobs[0].health = 42.0;
    updated.dead_mob_respawns[0].remaining_respawn_sec = 1.5;
    store.save_region_state(&updated).await.unwrap();

    let reloaded = store
        .load_region_state("town-millcross")
        .await
        .unwrap()
        .expect("updated town-millcross should exist");
    assert_eq!(reloaded, updated);

    // Delete bramblewood
    store.delete_region_state("bramblewood").await.unwrap();
    assert_eq!(store.load_region_state("bramblewood").await.unwrap(), None);
    assert_eq!(
        store.list_region_ids().await.unwrap(),
        vec!["town-millcross".to_string()]
    );
}

#[tokio::test]
async fn memory_world_state_store_crud_and_listing() {
    let store = MemoryWorldStateStore::new();
    assert_store_contract(&store).await;
}

#[tokio::test]
async fn file_world_state_store_persists_atomically_across_reopen() {
    let tmp = std::env::temp_dir().join(format!(
        "atlas-world-store-test-{}",
        server_rs::meta::generate_uuid_v4()
    ));
    let store = FileWorldStateStore::new(&tmp).expect("create FileWorldStateStore");
    assert_store_contract(&store).await;

    // Reopen a fresh FileWorldStateStore pointing to the same directory
    let reopened = FileWorldStateStore::new(&tmp).expect("reopen FileWorldStateStore");
    let loaded = reopened
        .load_region_state("town-millcross")
        .await
        .unwrap()
        .expect("town-millcross should persist on disk");
    assert_eq!(loaded.saved_at_tick, 140);
    assert_eq!(loaded.mobs[0].health, 42.0);

    let _ = std::fs::remove_dir_all(&tmp);
}

#[tokio::test]
async fn meta_world_state_store_persists_via_in_memory_and_sqlite_meta_doc_stores() {
    // 1. InMemoryMetaStore backend
    let mem_meta = Arc::new(InMemoryMetaStore::new());
    let mem_world_store = MetaWorldStateStore::new(mem_meta);
    assert_store_contract(&mem_world_store).await;

    // 2. SqliteMetaStore backend (persisting across reopen)
    let db_path = std::env::temp_dir().join(format!(
        "atlas-world-meta-sqlite-{}.db",
        server_rs::meta::generate_uuid_v4()
    ));
    {
        let sqlite_meta = Arc::new(SqliteMetaStore::open(&db_path).expect("open SqliteMetaStore"));
        let sqlite_world_store = MetaWorldStateStore::new(sqlite_meta);
        assert_store_contract(&sqlite_world_store).await;
    }
    {
        let reopened_meta =
            Arc::new(SqliteMetaStore::open(&db_path).expect("reopen SqliteMetaStore"));
        let reopened_world_store = MetaWorldStateStore::new(reopened_meta);
        let loaded = reopened_world_store
            .load_region_state("town-millcross")
            .await
            .unwrap()
            .expect("town-millcross should persist in SQLite");
        assert_eq!(loaded.saved_at_tick, 140);
        assert_eq!(loaded.mobs[0].health, 42.0);
    }
    let _ = std::fs::remove_file(&db_path);
}
