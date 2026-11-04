use bevy_ecs::prelude::*;
use bevy_ecs::schedule::ExecutorKind;
use server_rs::combat::buffs::{ActiveBuff, AuraEmitter, BuffCategory, BuffContainer};
use server_rs::core::clock::SimClock;
use server_rs::core::prng::Mulberry32;
use server_rs::ecs::components::{EntityId, MobTag, Position};
use server_rs::systems::buff_and_aura_tick_system;
use server_rs::AtlasSimulation;
use std::time::Instant;

#[test]
fn test_aura_correctness_at_n50_hits_exactly_in_radius() {
    let mut sim = AtlasSimulation::new(0x1234, 1000.0, 1000.0);

    // Setup: N = 50 total entities.
    // 30 players:
    //   - 1 Buffer hero at (500.0, 500.0) with aura radius 30.0m
    //   - 9 Ally players inside radius (distance 2m..18m <= 30.0m)
    //   - 20 Ally players outside radius (distance 45m..140m > 30.0m)
    // 20 mobs:
    //   - 10 mobs inside radius
    //   - 10 mobs outside radius
    // Total = 1 + 9 + 20 + 20 = 50 entities.

    let buffer = sim.spawn_player_avatar("buffer_hero", 500.0, 500.0);
    let mut chant = ActiveBuff::new(
        "chant_of_victory",
        "Chant of Victory",
        BuffCategory::SongDance,
        20.0,
    );
    chant.p_atk_mult = 1.20;
    chant.crit_rate_bonus = 15.0;

    let aura = AuraEmitter::new(chant, 30.0, 0.05, true);
    sim.world.entity_mut(buffer).insert(aura);

    let mut in_radius_allies = Vec::new();
    for i in 1..=9 {
        let x = 500.0 + (i as f32) * 2.0; // 502.0 to 518.0 (dx <= 18.0 < 30.0)
        let ent = sim.spawn_player_avatar(&format!("ally_in_{}", i), x, 500.0);
        in_radius_allies.push(ent);
    }

    let mut out_radius_allies = Vec::new();
    for i in 1..=20 {
        let x = 500.0 + 40.0 + (i as f32) * 5.0; // 545.0 to 640.0 (dx >= 45.0 > 30.0)
        let ent = sim.spawn_player_avatar(&format!("ally_out_{}", i), x, 500.0);
        out_radius_allies.push(ent);
    }

    let mut mobs = Vec::new();
    for j in 1..=10 {
        let y = 500.0 + (j as f32) * 2.0; // In radius spatially, but is mob
        let mob_ent = sim
            .world
            .spawn((
                EntityId(format!("mob_in_{}", j)),
                Position::new(500.0, y),
                MobTag,
                BuffContainer::default(),
            ))
            .id();
        mobs.push(mob_ent);
    }
    for j in 1..=10 {
        let y = 500.0 + 40.0 + (j as f32) * 5.0; // Out of radius spatially
        let mob_ent = sim
            .world
            .spawn((
                EntityId(format!("mob_out_{}", j)),
                Position::new(500.0, y),
                MobTag,
                BuffContainer::default(),
            ))
            .id();
        mobs.push(mob_ent);
    }

    // Verify entity count is exactly 50
    let total_entities = 1 + in_radius_allies.len() + out_radius_allies.len() + mobs.len();
    assert_eq!(
        total_entities, 50,
        "Test must populate exactly N=50 entities"
    );

    // Advance clock and run buff_and_aura_tick_system
    let mut schedule = Schedule::default();
    schedule.set_executor_kind(ExecutorKind::SingleThreaded);
    schedule.add_systems(buff_and_aura_tick_system);

    sim.world.resource_mut::<SimClock>().advance();
    schedule.run(&mut sim.world);

    // Verification 1: Buffer has the buff
    let buffer_container = sim.world.get::<BuffContainer>(buffer).unwrap();
    assert!(
        buffer_container.has_buff("chant_of_victory"),
        "Buffer should have buff"
    );

    // Verification 2: All 9 in-radius allies received the buff
    for &ally in &in_radius_allies {
        let container = sim.world.get::<BuffContainer>(ally).unwrap();
        assert!(
            container.has_buff("chant_of_victory"),
            "Ally in radius should receive buff"
        );
        let mults = container.aggregate_multipliers();
        assert!((mults.p_atk_mult - 1.20).abs() < 1e-3);
    }

    // Verification 3: None of the 20 out-radius allies received the buff
    for &ally in &out_radius_allies {
        let container = sim.world.get::<BuffContainer>(ally).unwrap();
        assert!(
            !container.has_buff("chant_of_victory"),
            "Ally out of radius must NOT receive buff"
        );
    }

    // Verification 4: None of the mobs received the buff (affects_allies=true)
    for &mob in &mobs {
        let container = sim.world.get::<BuffContainer>(mob).unwrap();
        assert!(
            !container.has_buff("chant_of_victory"),
            "Mob must NOT receive ally aura buff"
        );
    }

    // Verification 5: In the entire world, exactly 10 entities have the buff (1 buffer + 9 allies)
    let mut receivers = sim.world.query::<&BuffContainer>();
    let buffed_count = receivers
        .iter(&sim.world)
        .filter(|c| c.has_buff("chant_of_victory"))
        .count();
    assert_eq!(
        buffed_count, 10,
        "Exactly 10 entities (1 buffer + 9 in-radius allies) must have the buff"
    );
}

struct BenchResult {
    n: usize,
    players: usize,
    mobs: usize,
    auras: usize,
    p50: f64,
    p95: f64,
    max: f64,
}

fn run_aura_bench_tier(n: usize, ticks: usize) -> BenchResult {
    let arena_width = 2000.0;
    let arena_height = 2000.0;
    let mut sim = AtlasSimulation::new(0x1337_c0de ^ (n as u32), arena_width, arena_height);

    let players = n / 2;
    let mobs = n - players;
    let auras = (players / 10).max(1);

    let mut prng = Mulberry32::new(0xcafe_babe ^ (n as u32));

    // Spawn players
    for i in 0..players {
        let x = prng.range(50.0, arena_width - 50.0);
        let y = prng.range(50.0, arena_height - 50.0);
        let ent = sim.spawn_player_avatar(&format!("player_{}", i), x, y);

        // 10% of players have auras
        if i < auras {
            let mut buff = ActiveBuff::new(
                format!("aura_buff_{}", i),
                format!("Aura Buff {}", i),
                BuffCategory::SongDance,
                30.0,
            );
            buff.p_atk_mult = 1.10;
            // 30m radius, 0.05s pulse interval (pulses every tick)
            let aura = AuraEmitter::new(buff, 30.0, 0.05, true);
            sim.world.entity_mut(ent).insert(aura);
        }
    }

    // Spawn mobs
    for j in 0..mobs {
        let x = prng.range(50.0, arena_width - 50.0);
        let y = prng.range(50.0, arena_height - 50.0);
        sim.world.spawn((
            EntityId(format!("mob_{}", j)),
            Position::new(x, y),
            MobTag,
            BuffContainer::default(),
        ));
    }

    let mut schedule = Schedule::default();
    schedule.set_executor_kind(ExecutorKind::SingleThreaded);
    schedule.add_systems(buff_and_aura_tick_system);

    // Warm-up ticks to stabilize caches and memory
    for _ in 0..10 {
        sim.world.resource_mut::<SimClock>().advance();
        schedule.run(&mut sim.world);
    }

    // Benchmark measured ticks
    let mut durations_us = Vec::with_capacity(ticks);
    for _ in 0..ticks {
        sim.world.resource_mut::<SimClock>().advance();
        let start = Instant::now();
        schedule.run(&mut sim.world);
        let elapsed_us = start.elapsed().as_nanos() as f64 / 1_000.0;
        durations_us.push(elapsed_us);
    }

    durations_us.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let p50_idx = ((ticks as f64) * 0.50).floor() as usize;
    let p95_idx = ((ticks as f64) * 0.95).floor() as usize;
    let max_idx = ticks - 1;

    BenchResult {
        n,
        players,
        mobs,
        auras,
        p50: durations_us[p50_idx],
        p95: durations_us[p95_idx],
        max: durations_us[max_idx],
    }
}

#[test]
#[ignore]
fn bench_aura_spatial_scaling() {
    let tiers = [100, 400, 1600];
    let ticks = 200;
    let mut results = Vec::new();

    for &n in &tiers {
        let res = run_aura_bench_tier(n, ticks);
        results.push(res);
    }

    println!("\n### Aura Spatial Query Scaling Benchmark (200 ticks per tier)");
    println!("| Entity Count (N) | Players | Mobs | Auras (10% players) | p50 (µs) | p95 (µs) | max (µs) |");
    println!("|-----------------:|--------:|-----:|--------------------:|---------:|---------:|---------:|");
    for r in &results {
        println!(
            "| {:16} | {:7} | {:4} | {:19} | {:8.2} | {:8.2} | {:8.2} |",
            r.n, r.players, r.mobs, r.auras, r.p50, r.p95, r.max
        );
    }
    println!();
}
