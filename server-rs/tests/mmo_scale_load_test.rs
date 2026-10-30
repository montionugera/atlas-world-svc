use server_rs::fleet::dungeons::DungeonRegistry;
use server_rs::net::ws::ClientPacket;
use server_rs::protocol::serialize_client_input;
use server_rs::simulation::LiveConfig;
use server_rs::AtlasSimulation;
use std::sync::Arc;
use std::time::Instant;

#[test]
fn test_concurrent_20hz_tick_timing_scale_invariants() {
    let mut sim = AtlasSimulation::live(LiveConfig {
        seed: 1337,
        arena_width: 2000.0,
        arena_height: 2000.0,
        bot_count: 0,
        mob_count: 50,
        mob_respawn_sec: 5.0,
        player_respawn_sec: 5.0,
        map_id: Some("millcross-ford".to_string()),
    });

    let concurrent_players = 100;
    for i in 0..concurrent_players {
        let sid = format!("scale_player_{:03}", i);
        sim.spawn_player_avatar(
            &sid,
            120.0 + (i as f32 % 10.0) * 15.0,
            120.0 + (i as f32 / 10.0) * 15.0,
        );
    }

    let dungeon_registry = Arc::new(DungeonRegistry::new());
    let dungeon_count = 10;
    for i in 0..dungeon_count {
        let inst_id = format!("scale_spire_{:02}", i);
        let party_id = format!("scale_party_{:02}", i);
        let template_id = if i % 2 == 0 {
            "millcross-crypts"
        } else {
            "gilded-flues-spire"
        };
        dungeon_registry.allocate_dungeon_with_floors(
            inst_id,
            party_id,
            template_id,
            format!("boss_{}", i),
            100_000,
            300,
            5,
            10,
            1800,
            1000,
        );
    }

    let test_ticks = 60; // 3 seconds of 20Hz gameplay
    let mut tick_durations_us = Vec::with_capacity(test_ticks);
    let sample_payload = serialize_client_input(1, 0.707, 0.707, true, 0, 0);

    for tick in 1..=test_ticks {
        let mut inputs = Vec::with_capacity(concurrent_players);
        for i in 0..concurrent_players {
            let sid = format!("scale_player_{:03}", i);
            inputs.push(ClientPacket {
                session_id: sid,
                room_id: "millcross-ford".to_string(),
                payload: sample_payload.clone(),
            });
        }

        let start = Instant::now();
        let frame = sim.live_tick(&inputs, &[]);

        for i in 0..dungeon_count {
            let inst_id = format!("scale_spire_{:02}", i);
            if tick % 5 == 0 {
                let _ = dungeon_registry.record_floor_mob_kills(&inst_id, 1, 1000 + tick as u64);
            }
            if tick % 20 == 0 {
                let _ = dungeon_registry.advance_floor(&inst_id, 1000 + tick as u64);
            }
            let _ = dungeon_registry.record_boss_damage(
                &inst_id,
                "player_001",
                1200,
                250,
                1000 + tick as u64,
            );
        }

        let elapsed = start.elapsed().as_micros();
        tick_durations_us.push(elapsed);
        assert!(!frame.entities.is_empty());
    }

    tick_durations_us.sort_unstable();
    let avg_us = tick_durations_us.iter().sum::<u128>() / tick_durations_us.len() as u128;
    let p95_us = tick_durations_us[(tick_durations_us.len() * 95) / 100];
    let p99_us = tick_durations_us[(tick_durations_us.len() * 99) / 100];

    // Verification invariant: P99 tick duration must be strictly under 15ms (15,000 µs), well within the 50ms budget
    assert!(
        p99_us < 15_000,
        "P99 tick duration {} µs exceeded 15,000 µs scale threshold",
        p99_us
    );
    assert!(
        avg_us < 5_000,
        "Average tick duration {} µs exceeded 5,000 µs scale threshold",
        avg_us
    );
    println!(
        "Scale verification passed: Avg {} µs, P95 {} µs, P99 {} µs across 100 players + 10 spires",
        avg_us, p95_us, p99_us
    );
}
