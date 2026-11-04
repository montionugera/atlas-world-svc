use server_rs::load_harness::{run_capacity_sweep, DEFAULT_CAPACITY_TIERS};

#[test]
fn test_capacity_sweep_50_100_200_400_entities_reports_timings_and_bandwidth() {
    let report = run_capacity_sweep(&DEFAULT_CAPACITY_TIERS, 25);
    assert_eq!(report.tiers.len(), 4);
    assert_eq!(report.tick_rate_hz, 20);

    let mut prev_bytes = 0usize;
    for (&expected_entities, row) in DEFAULT_CAPACITY_TIERS.iter().zip(report.tiers.iter()) {
        assert_eq!(row.entities, expected_entities);
        assert_eq!(row.players + row.mobs, expected_entities);
        assert_eq!(row.ticks, 25);
        assert!(row.tick_p50_ms > 0.0 && row.tick_p50_ms.is_finite());
        assert!(row.tick_p95_ms >= row.tick_p50_ms && row.tick_p95_ms.is_finite());
        assert!(row.tick_max_ms >= row.tick_p95_ms && row.tick_max_ms.is_finite());
        assert!(
            row.snapshot_bytes_per_player > prev_bytes,
            "snapshot bytes should grow monotonically with entity count ({} <= {})",
            row.snapshot_bytes_per_player,
            prev_bytes
        );
        prev_bytes = row.snapshot_bytes_per_player;
        assert!(row.bandwidth_kbps_per_player > 0.0);
        assert!(row.total_outbound_kbps > row.bandwidth_kbps_per_player);
    }

    let md = report.to_markdown_table();
    assert!(md.contains("| 50 |"));
    assert!(md.contains("| 100 |"));
    assert!(md.contains("| 200 |"));
    assert!(md.contains("| 400 |"));
}
