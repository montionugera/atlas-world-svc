//! Snapshot serialization byte breakdown and scaling test.
//!
//! Measures snapshot bytes and per-entity byte costs at 50, 200, and 800 entities
//! (as well as the 75-entity baseline corresponding to the 50-client swarm load test).

use server_rs::protocol::{
    intern_mob_type, EnchantVisualGlow, EntitySnapshotData, EntityType, Race, SnapshotBuilder,
    STATE_FLAG_ALIVE, STATE_FLAG_BOT,
};

/// Creates a realistic entity mix for scaling measurements:
/// ~67% active moving players, ~7% bots, ~26% mobs.
fn create_mock_entities(count: usize) -> Vec<EntitySnapshotData> {
    (0..count)
        .map(|i| {
            let id = (i + 1) as u32;
            let (entity_type, flags, mob_type, vx, vy, input_ack, level, xp) = if i % 15 == 0 {
                // Bot (wandering)
                (EntityType::Player, STATE_FLAG_ALIVE | STATE_FLAG_BOT, "", 0.8, -0.4, 0, 0, 0)
            } else if i % 4 == 0 {
                // Mob (mostly stationary until engaged, shared bestiary string)
                (
                    EntityType::Mob,
                    STATE_FLAG_ALIVE,
                    intern_mob_type("mob-millpond-gnawer"),
                    0.0,
                    0.0,
                    0,
                    0,
                    0,
                )
            } else {
                // Active human player with input acknowledgements & progression
                (
                    EntityType::Player,
                    STATE_FLAG_ALIVE,
                    "",
                    1.4,
                    -0.8,
                    100 + (i as u32),
                    5,
                    1250,
                )
            };

            EntitySnapshotData {
                id,
                entity_type,
                x: 100.0 + (i as f32) * 5.0,
                y: 150.0 + (i as f32) * 3.0,
                vx,
                vy,
                health: 100.0,
                max_health: 100.0,
                state_flags: flags,
                target_id: if i > 0 && i % 3 == 0 { i as u32 } else { 0 },
                mob_type,
                owner_id: 0,
                input_ack,
                level,
                xp,
                race: Race::HumanDemiHuman,
                enchant_glow: EnchantVisualGlow::None,
            }
        })
        .collect()
}

/// Creates the exact 75-entity composition from the 50-client swarm test
/// (50 active moving players, 5 bots, 20 route mobs).
fn create_swarm_75_entities() -> Vec<EntitySnapshotData> {
    let mut entities = Vec::with_capacity(75);

    // 50 Active human players (moving at 20 Hz, input_ack updated)
    for i in 0..50 {
        let angle = (i as f32 * 0.25) + 0.5;
        let (sin, cos) = angle.sin_cos();
        entities.push(EntitySnapshotData {
            id: 1000 + i,
            entity_type: EntityType::Player,
            x: 500.0 + cos * 50.0,
            y: 500.0 + sin * 50.0,
            vx: cos * 150.0,
            vy: sin * 150.0,
            health: 100.0,
            max_health: 100.0,
            state_flags: STATE_FLAG_ALIVE,
            target_id: 0,
            mob_type: "",
            owner_id: 0,
            input_ack: 25,
            level: 1,
            xp: 0,
            race: Race::HumanDemiHuman,
            enchant_glow: EnchantVisualGlow::None,
        });
    }

    // 5 Bots
    for i in 0..5 {
        entities.push(EntitySnapshotData {
            id: 2000 + i,
            entity_type: EntityType::Player,
            x: 1000.0 + (i as f32) * 20.0,
            y: 1000.0 + (i as f32) * 20.0,
            vx: 0.0,
            vy: 0.0,
            health: 100.0,
            max_health: 100.0,
            state_flags: STATE_FLAG_ALIVE | STATE_FLAG_BOT,
            target_id: 0,
            mob_type: "",
            owner_id: 0,
            input_ack: 0,
            level: 0,
            xp: 0,
            race: Race::HumanDemiHuman,
            enchant_glow: EnchantVisualGlow::None,
        });
    }

    // 20 Mobs
    for i in 0..20 {
        entities.push(EntitySnapshotData {
            id: 3000 + i,
            entity_type: EntityType::Mob,
            x: 200.0 + (i as f32) * 40.0,
            y: 200.0 + (i as f32) * 40.0,
            vx: 0.0,
            vy: 0.0,
            health: 80.0,
            max_health: 80.0,
            state_flags: STATE_FLAG_ALIVE,
            target_id: 0,
            mob_type: intern_mob_type("mob-bramble-stalker"),
            owner_id: 0,
            input_ack: 0,
            level: 0,
            xp: 0,
            race: Race::HumanDemiHuman,
            enchant_glow: EnchantVisualGlow::None,
        });
    }

    entities
}

#[test]
#[ignore = "Benchmark and measurement test for research doc"]
fn test_snapshot_bytes_breakdown_50_200_800() {
    let mut builder = SnapshotBuilder::new();
    let tick_rate_hz = 20.0;

    println!("\n=== SNAPSHOT BYTES BREAKDOWN MEASUREMENT ===");
    println!(
        "| Entity Count | Snapshot Bytes | Per-Entity Bytes | Bandwidth (KB/s @ 20Hz) | Bandwidth (kbps @ 20Hz) |"
    );
    println!(
        "|:---:|:---:|:---:|:---:|:---:|"
    );

    let test_counts = [50, 200, 800];

    for &count in &test_counts {
        let entities = create_mock_entities(count);
        let bytes = builder.build_frame(100, 1_700_000_000_000, &entities, &[], &[]);
        let total_len = bytes.len();
        let per_entity = total_len as f64 / count as f64;
        let kb_per_sec = (total_len as f64 * tick_rate_hz) / 1024.0;
        let kbps = (total_len as f64 * tick_rate_hz * 8.0) / 1000.0;

        println!(
            "| {:12} | {:14} | {:16.2} | {:23.2} | {:23.2} |",
            count, total_len, per_entity, kb_per_sec, kbps
        );

        assert!(total_len > 0);
        assert!(per_entity > 40.0 && per_entity < 70.0);
    }

    // Empty snapshot framing overhead
    let empty_bytes = builder.build_frame(100, 1_700_000_000_000, &[], &[], &[]);
    println!(
        "\nEmpty Snapshot Header Framing Overhead: {} bytes",
        empty_bytes.len()
    );

    // Exact 75-entity swarm test replication
    let swarm_entities = create_swarm_75_entities();
    let swarm_bytes = builder.build_frame(100, 1_700_000_000_000, &swarm_entities, &[], &[]);
    let swarm_len = swarm_bytes.len();
    let swarm_per_entity = swarm_len as f64 / 75.0;
    let swarm_kb_sec = (swarm_len as f64 * tick_rate_hz) / 1024.0;
    let swarm_kbps = (swarm_len as f64 * tick_rate_hz * 8.0) / 1000.0;
    println!("\n=== 50-CLIENT SWARM (75 ENTITIES) EXACT REPLICATION ===");
    println!("Swarm Snapshot Size: {} bytes", swarm_len);
    println!("Per-Entity Average: {:.2} bytes/entity", swarm_per_entity);
    println!("Bandwidth @ 20Hz: {:.2} KB/s ({:.2} kbps)", swarm_kb_sec, swarm_kbps);

    // Incremental field costs
    println!("\n=== PER-FIELD BYTE IMPACT IN FLATBUFFERS ===");
    let base_player = vec![EntitySnapshotData {
        id: 1,
        entity_type: EntityType::Player,
        x: 100.0,
        y: 100.0,
        vx: 0.0,
        vy: 0.0,
        health: 100.0,
        max_health: 100.0,
        state_flags: STATE_FLAG_ALIVE,
        target_id: 0,
        mob_type: "",
        owner_id: 0,
        input_ack: 0,
        level: 0,
        xp: 0,
        race: Race::HumanDemiHuman,
        enchant_glow: EnchantVisualGlow::None,
    }];
    let b_base = builder.build_frame(1, 1000, &base_player, &[], &[]).len();

    let mut p_vel = base_player.clone();
    p_vel[0].vx = 1.0;
    p_vel[0].vy = 1.0;
    let b_vel = builder.build_frame(1, 1000, &p_vel, &[], &[]).len();

    let mut p_ack = p_vel.clone();
    p_ack[0].input_ack = 42;
    let b_ack = builder.build_frame(1, 1000, &p_ack, &[], &[]).len();

    let mut p_prog = p_ack.clone();
    p_prog[0].level = 5;
    p_prog[0].xp = 2500;
    let b_prog = builder.build_frame(1, 1000, &p_prog, &[], &[]).len();

    println!("Base Stationary Player (pos, id, health, max_health, flags): {} bytes (incl header)", b_base);
    println!("+ Velocity Vec2 (vx != 0 || vy != 0): +{} bytes (total: {})", b_vel - b_base, b_vel);
    println!("+ Input Ack (non-zero u32): +{} bytes (total: {})", b_ack - b_vel, b_ack);
    println!("+ Level & XP (non-zero u32s): +{} bytes (total: {})", b_prog - b_ack, b_prog);

    println!("=== END SNAPSHOT BYTES BREAKDOWN MEASUREMENT ===\n");
}
