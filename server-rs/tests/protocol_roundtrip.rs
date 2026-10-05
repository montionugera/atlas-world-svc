use server_rs::protocol::{
    root_as_world_snapshot, EntitySnapshotData, EntityType, SnapshotBuilder,
};
use std::path::PathBuf;

#[test]
fn test_protocol_cross_language_parity_and_bandwidth() {
    let tick = 1000u32;
    let server_time_ms = 1728001000u64;

    let mut entities = Vec::with_capacity(60);

    // 10 Players
    for i in 1..=10 {
        entities.push(EntitySnapshotData {
            id: i,
            entity_type: EntityType::Player,
            x: 100.0 + (i as f32) * 10.0,
            y: 200.0 + (i as f32) * 5.0,
            vx: 1.5,
            vy: -0.5,
            health: 100.0 - (i as f32) * 2.0,
            max_health: 100.0,
            state_flags: (i as u16) & 0b11,
            target_id: i.saturating_sub(1),
        });
    }

    // 50 Mobs
    for j in 1..=50 {
        let mob_id = 100 + j;
        entities.push(EntitySnapshotData {
            id: mob_id,
            entity_type: EntityType::Mob,
            x: 500.0 + (j as f32) * 2.0,
            y: 600.0 - (j as f32) * 3.0,
            vx: 0.0,
            vy: 0.0,
            health: 50.0,
            max_health: 50.0,
            state_flags: 0,
            target_id: (j % 10) + 1,
        });
    }

    let removed_ids = vec![9001u32, 9002u32, 9003u32];

    let mut builder = SnapshotBuilder::new();
    let bytes = builder.serialize_snapshot(tick, server_time_ms, &entities, &removed_ids);

    println!("Total serialized bytes for 60 entities: {}", bytes.len());
    let bytes_per_entity = bytes.len() as f32 / entities.len() as f32;
    println!("Bytes per entity delta: {:.2} B", bytes_per_entity);

    // Bandwidth assertions
    // Total packet must be < 2.5 KB (2560 bytes)
    assert!(
        bytes.len() < 2560,
        "Snapshot size {} exceeds 2.5 KB limit",
        bytes.len()
    );
    // Average delta size must be compact (< 40 bytes per entity)
    assert!(
        bytes_per_entity < 40.0,
        "Average bytes per entity {:.2} exceeds 40 bytes",
        bytes_per_entity
    );

    // Verify self-decoding in Rust
    let snapshot = root_as_world_snapshot(&bytes).expect("Valid WorldSnapshot buffer");
    assert_eq!(snapshot.tick(), tick);
    assert_eq!(snapshot.server_time_ms(), server_time_ms);
    let decoded_entities = snapshot.entities().expect("entities vector present");
    assert_eq!(decoded_entities.len(), 60);

    // Write fixture for TypeScript cross-language test
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixture_path = manifest_dir
        .parent()
        .unwrap()
        .join("contracts/src/protocol/fixtures/snapshot_test.bin");

    if let Some(parent) = fixture_path.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create fixture directory");
    }

    std::fs::write(&fixture_path, &bytes).expect("Failed to write snapshot_test.bin");
    println!("Wrote fixture to {:?}", fixture_path);
}

#[test]
fn test_aoi_typical_delta_bandwidth() {
    // In a 15-entity AOI view, typical tick updates cull unchanged entities,
    // transmitting deltas for active/dirty entities (~20% dirty rate = 3 entities per 50ms tick).
    let mut builder = SnapshotBuilder::new();
    let active_deltas = vec![
        EntitySnapshotData {
            id: 1,
            entity_type: EntityType::Player,
            x: 101.5,
            y: 201.0,
            vx: 1.5,
            vy: 0.0,
            health: 98.0,
            max_health: 100.0,
            state_flags: 1,
            target_id: 101,
        },
        EntitySnapshotData {
            id: 101,
            entity_type: EntityType::Mob,
            x: 105.0,
            y: 200.0,
            vx: -0.5,
            vy: 0.0,
            health: 45.0,
            max_health: 50.0,
            state_flags: 0,
            target_id: 1,
        },
        EntitySnapshotData {
            id: 201,
            entity_type: EntityType::Projectile,
            x: 103.0,
            y: 200.5,
            vx: 10.0,
            vy: 0.0,
            health: 1.0,
            max_health: 1.0,
            state_flags: 0,
            target_id: 101,
        },
    ];

    let bytes = builder.serialize_snapshot(1001, 1728001050, &active_deltas, &[]);
    println!(
        "Typical AOI delta update bytes (3 active of 15 in AOI): {} bytes",
        bytes.len()
    );
    assert!(
        bytes.len() <= 250,
        "Typical AOI delta update must be <= 250 bytes, got {}",
        bytes.len()
    );
    let bandwidth_20hz = bytes.len() * 20;
    println!(
        "Bandwidth at 20 Hz: {} B/s ({:.2} KB/s)",
        bandwidth_20hz,
        bandwidth_20hz as f32 / 1024.0
    );
    assert!(
        bandwidth_20hz <= 5000,
        "Bandwidth at 20 Hz must be <= 5 KB/s"
    );
}
