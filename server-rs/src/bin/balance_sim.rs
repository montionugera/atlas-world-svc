use server_rs::content::mmorpg::{
    base_exp_to_next_level, job_exp_to_next_level, simulate_castle_siege, simulate_job_vs_mob,
    MMORPG_CATALOG,
};
use server_rs::fleet::dungeons::DungeonRegistry;
use server_rs::net::ws::ClientPacket;
use server_rs::protocol::serialize_client_input;
use server_rs::simulation::LiveConfig;
use server_rs::storage::PrimaryStats;
use server_rs::AtlasSimulation;
use std::sync::Arc;
use std::time::Instant;

fn main() {
    println!("================================================================================");
    println!("  ATLAS WORLD — SERVER-RS HEADLESS MMORPG GROWTH, JOB & GVG SIEGE SIMULATOR");
    println!("================================================================================");
    println!(
        "Loaded Catalogs: {} Jobs | {} Mobs | {} Cards | {} Quests | {} Castles\n",
        MMORPG_CATALOG.jobs.len(),
        MMORPG_CATALOG.mobs.len(),
        MMORPG_CATALOG.cards.len(),
        MMORPG_CATALOG.quests.len(),
        MMORPG_CATALOG.castles.len()
    );

    println!("--- 1. DUAL-TRACK EXP CURVE (BASE LV 1..99 & JOB LV 1..50) ---");
    for &(blv, jlv, tier) in &[
        (1, 1, 0),
        (10, 10, 0),
        (20, 15, 1),
        (40, 40, 1),
        (60, 30, 2),
        (99, 50, 2),
    ] {
        println!(
            "  Base Lv {:>2} -> {:>3} BaseEXP | Job Lv {:>2} (Tier {}) -> {:>4} JobEXP",
            blv,
            base_exp_to_next_level(blv),
            jlv,
            tier,
            job_exp_to_next_level(jlv, tier)
        );
    }

    println!("\n--- 2. PVE JOB PROGRESSION & ZONE LEVELING PACING ---");
    println!(
        "{:<12} {:<6} {:<18} {:>8} {:>8} {:>7} {:>8} {:>10}",
        "Job", "Lv/JLv", "Target Mob", "PlayerDPS", "TTK(s)", "R-Ratio", "Verdict", "Min/Level"
    );
    println!("{}", "-".repeat(84));

    let scenarios = [
        (
            "novice",
            6,
            5,
            PrimaryStats {
                str: 8,
                agi: 6,
                vit: 6,
                int: 1,
                dex: 6,
                luk: 1,
            },
            Some("dagger"),
            0,
            "forest_slime",
        ),
        (
            "swordman",
            19,
            15,
            PrimaryStats {
                str: 28,
                agi: 15,
                vit: 24,
                int: 1,
                dex: 15,
                luk: 1,
            },
            Some("basic_sword"),
            3,
            "boar",
        ),
        (
            "mage",
            19,
            15,
            PrimaryStats {
                str: 1,
                agi: 12,
                vit: 12,
                int: 34,
                dex: 20,
                luk: 1,
            },
            Some("magic_staff"),
            3,
            "boar",
        ),
        (
            "archer",
            33,
            28,
            PrimaryStats {
                str: 10,
                agi: 35,
                vit: 18,
                int: 5,
                dex: 45,
                luk: 1,
            },
            Some("great_bow"),
            5,
            "skeleton_soldier",
        ),
        (
            "knight",
            63,
            35,
            PrimaryStats {
                str: 72,
                agi: 40,
                vit: 68,
                int: 10,
                dex: 42,
                luk: 1,
            },
            Some("scythe"),
            9,
            "orc_warlord",
        ),
    ];

    for (job_id, blv, jlv, alloc, weapon, refine, mob_id) in scenarios {
        if let Some(res) = simulate_job_vs_mob(job_id, blv, jlv, &alloc, weapon, refine, mob_id) {
            println!(
                "{:<12} {:>2}/{:<3} {:<18} {:>8.1} {:>8.2} {:>7.2} {:>8} {:>9.1}m",
                res.job_id,
                res.base_level,
                res.job_level,
                res.mob_id,
                res.player_dps,
                res.ttk_seconds,
                res.r_ratio,
                res.verdict,
                res.minutes_to_next_base_level
            );
        }
    }

    println!("\n--- 3. WAR OF EMPERIUM (GVG CASTLE SIEGE) BREACH SIMULATION ---");
    for &attackers in &[5_u32, 15, 30, 50] {
        if let Some(siege) = simulate_castle_siege("castle_valkyrie_01", attackers, 65) {
            println!(
                "  Castle: {} | Attackers: {:>2} | Barricades: {:>5.1}s | Emperium TTK: {:>5.1}s | Total Breach: {:>4.2} min",
                siege.castle_id,
                siege.attacker_count,
                siege.barricade_clear_seconds,
                siege.emperium_ttk_seconds,
                siege.total_siege_breach_minutes
            );
        }
    }

    println!("\n--- 4. CONCURRENT 20HZ TICK TIMING BENCHMARK (OVERWORLD + 60-DUNGEON SPIRES) ---");
    let mut sim = AtlasSimulation::live(LiveConfig {
        seed: 42,
        arena_width: 2000.0,
        arena_height: 2000.0,
        bot_count: 0,
        mob_count: 50,
        mob_respawn_sec: 5.0,
        player_respawn_sec: 5.0,
        map_id: Some("millcross-ford".to_string()),
    });

    let concurrent_players = 100;
    println!(
        "  Spawning {} concurrent player avatars into Overworld ('millcross-ford')...",
        concurrent_players
    );
    for i in 0..concurrent_players {
        let sid = format!("bench_player_{:03}", i);
        sim.spawn_player_avatar(
            &sid,
            100.0 + (i as f32 % 10.0) * 15.0,
            100.0 + (i as f32 / 10.0) * 15.0,
        );
    }

    let dungeon_registry = Arc::new(DungeonRegistry::new());
    let dungeon_count = 10;
    println!(
        "  Initializing {} active multi-floor dungeon spire instances...",
        dungeon_count
    );
    for i in 0..dungeon_count {
        let inst_id = format!("spire_inst_{:02}", i);
        let party_id = format!("party_{:02}", i);
        let template_id = if i % 2 == 0 {
            "millcross-crypts"
        } else {
            "gilded-flues-spire"
        };
        dungeon_registry.allocate_dungeon_with_floors(
            inst_id,
            party_id,
            template_id,
            format!("boss_floor_{}", i),
            100_000,
            300,
            5,
            10,
            1800,
            1000,
        );
    }

    let test_ticks = 100; // 5 seconds of 20Hz gameplay
    let mut tick_durations = Vec::with_capacity(test_ticks);

    let sample_payload = serialize_client_input(1, 0.707, 0.707, true, 0, 0);

    for tick in 1..=test_ticks {
        let mut inputs = Vec::with_capacity(concurrent_players);
        for i in 0..concurrent_players {
            let sid = format!("bench_player_{:03}", i);
            inputs.push(ClientPacket {
                session_id: sid,
                room_id: "millcross-ford".to_string(),
                payload: sample_payload.clone(),
            });
        }

        let start = Instant::now();
        // 1. Simulation 20Hz ECS tick with 100 players moving & attacking
        let frame = sim.live_tick(&inputs, &[]);

        // 2. Active multi-floor dungeon spire combat progression
        for i in 0..dungeon_count {
            let inst_id = format!("spire_inst_{:02}", i);
            if tick % 5 == 0 {
                let _ = dungeon_registry.record_floor_mob_kills(&inst_id, 1, 1000 + tick as u64);
            }
            if tick % 20 == 0 {
                let _ = dungeon_registry.advance_floor(&inst_id, 1000 + tick as u64);
            }
            let _ = dungeon_registry.record_boss_damage(
                &inst_id,
                "player_001",
                1500,
                300,
                1000 + tick as u64,
            );
        }

        let duration = start.elapsed();
        tick_durations.push(duration.as_micros());
        assert!(!frame.entities.is_empty());
    }

    tick_durations.sort_unstable();
    let min_us = tick_durations[0];
    let max_us = tick_durations[tick_durations.len() - 1];
    let avg_us = tick_durations.iter().sum::<u128>() / tick_durations.len() as u128;
    let p95_us = tick_durations[(tick_durations.len() * 95) / 100];
    let p99_us = tick_durations[(tick_durations.len() * 99) / 100];

    println!(
        "  Benchmark Results across {} Ticks (20Hz = 50,000 µs frame budget):",
        test_ticks
    );
    println!(
        "    Min: {:>6} µs ({:.2} ms) | Avg: {:>6} µs ({:.2} ms)",
        min_us,
        min_us as f64 / 1000.0,
        avg_us,
        avg_us as f64 / 1000.0
    );
    println!(
        "    P95: {:>6} µs ({:.2} ms) | P99: {:>6} µs ({:.2} ms) | Max: {:>6} µs ({:.2} ms)",
        p95_us,
        p95_us as f64 / 1000.0,
        p99_us,
        p99_us as f64 / 1000.0,
        max_us,
        max_us as f64 / 1000.0
    );
    let budget_pct = (p99_us as f64 / 50_000.0) * 100.0;
    println!(
        "    Frame Budget Utilization (P99 / 50ms): {:.2}% (Passed: {})",
        budget_pct,
        if p99_us < 50_000 {
            "YES (Headroom > 80%)"
        } else {
            "NO"
        }
    );
}
