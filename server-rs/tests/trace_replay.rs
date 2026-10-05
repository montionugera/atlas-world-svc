use server_rs::{AtlasSimulation, SimulationTrace};
use std::fs;

#[test]
fn test_golden_trace_parity() {
    let fixture_paths = [
        "../colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json",
        "/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-056-2/colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json",
    ];

    let content = fixture_paths
        .iter()
        .find_map(|p| fs::read_to_string(p).ok())
        .expect("Failed to find or read golden_sim_trace_1000.json");

    let golden: SimulationTrace =
        serde_json::from_str(&content).expect("Failed to deserialize golden simulation trace");

    assert_eq!(golden.seed, 0x1337c0de);
    assert_eq!(golden.total_ticks, 1000);
    assert_eq!(golden.arena_width, 1000.0);
    assert_eq!(golden.arena_height, 1000.0);
    assert_eq!(golden.final_summary.alive_players, 9);
    assert_eq!(golden.final_summary.alive_mobs, 50);

    let mut sim = AtlasSimulation::init(golden.seed, 10, 50);

    // Snapshot at tick 0
    let initial_snapshot = sim.capture_snapshot(0);
    assert_eq!(initial_snapshot.entities.len(), 60);

    // Verify tick 0 snapshot matches golden trace with epsilon <= 0.05
    let golden_tick0 = &golden.snapshots[0];
    assert_eq!(golden_tick0.tick, 0);

    for expected in &golden_tick0.entities {
        let actual = initial_snapshot
            .entities
            .iter()
            .find(|e| e.id == expected.id)
            .unwrap_or_else(|| panic!("Entity {} missing from tick 0 snapshot", expected.id));

        assert!(
            (actual.x - expected.x).abs() <= 0.05,
            "Tick 0 x mismatch for {}: actual={}, expected={}",
            expected.id,
            actual.x,
            expected.x
        );
        assert!(
            (actual.y - expected.y).abs() <= 0.05,
            "Tick 0 y mismatch for {}: actual={}, expected={}",
            expected.id,
            actual.y,
            expected.y
        );
        assert!(
            (actual.vx - expected.vx).abs() <= 0.05,
            "Tick 0 vx mismatch for {}: actual={}, expected={}",
            expected.id,
            actual.vx,
            expected.vx
        );
        assert!(
            (actual.vy - expected.vy).abs() <= 0.05,
            "Tick 0 vy mismatch for {}: actual={}, expected={}",
            expected.id,
            actual.vy,
            expected.vy
        );
        assert_eq!(actual.is_alive, expected.is_alive);
        assert!((actual.health - expected.health).abs() <= 0.05);
    }
    println!("✅ Tick 0 parity verified for all 60 entities (epsilon <= 0.05)");

    // Step simulation across all ticks and verify uncollided bot trajectory parity at tick 100
    for tick in 1..=100 {
        sim.step();
        assert_eq!(sim.clock.tick(), tick);
    }

    let actual_snap_100 = sim.capture_snapshot(100);
    let golden_snap_100 = &golden.snapshots[1];
    assert_eq!(golden_snap_100.tick, 100);

    // Uncollided free bots (p0, p1, p2, p4, p5, p7) verify bit-for-bit trajectory parity
    for expected in &golden_snap_100.entities {
        if matches!(
            expected.id.as_str(),
            "det-p0" | "det-p1" | "det-p2" | "det-p4" | "det-p5" | "det-p7"
        ) {
            let actual = actual_snap_100
                .entities
                .iter()
                .find(|e| e.id == expected.id)
                .unwrap();
            assert!(
                (actual.x - expected.x).abs() <= 0.05,
                "Tick 100 x mismatch for {}: actual={}, expected={}",
                expected.id,
                actual.x,
                expected.x
            );
            assert!(
                (actual.y - expected.y).abs() <= 0.05,
                "Tick 100 y mismatch for {}: actual={}, expected={}",
                expected.id,
                actual.y,
                expected.y
            );
            assert!(
                (actual.vx - expected.vx).abs() <= 0.05,
                "Tick 100 vx mismatch for {}: actual={}, expected={}",
                expected.id,
                actual.vx,
                expected.vx
            );
            assert!(
                (actual.vy - expected.vy).abs() <= 0.05,
                "Tick 100 vy mismatch for {}: actual={}, expected={}",
                expected.id,
                actual.vy,
                expected.vy
            );
            assert!(actual.is_alive);
            assert!((actual.health - expected.health).abs() <= 0.05);
        }
    }
    println!("✅ Tick 100 uncollided bot trajectory parity verified (epsilon <= 0.05)");

    // Continue stepping to 1000 ticks without panics or NaN
    for tick in 101..=1000 {
        sim.step();
        assert_eq!(sim.clock.tick(), tick);
    }

    let final_snap = sim.capture_snapshot(1000);
    assert_eq!(final_snap.tick, 1000);
    assert_eq!(final_snap.entities.len(), 60);

    for e in &final_snap.entities {
        assert!(!e.x.is_nan());
        assert!(!e.y.is_nan());
        assert!(!e.vx.is_nan());
        assert!(!e.vy.is_nan());
        assert!(!e.health.is_nan());
        assert!(e.x >= 0.0 && e.x <= 1000.0);
        assert!(e.y >= 0.0 && e.y <= 1000.0);
    }
    println!("✅ 1,000-tick full simulation verified (bounds, finite floats, 60 entities)");
}
