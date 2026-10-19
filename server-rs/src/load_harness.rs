use crate::protocol::SnapshotBuilder;
use crate::simulation::{AtlasSimulation, LiveConfig};
use serde::{Deserialize, Serialize};
use std::time::Instant;

/// Canonical entity tiers measured by E-004 Slice 1 (`[50, 100, 200, 400]`).
pub const DEFAULT_CAPACITY_TIERS: [usize; 4] = [50, 100, 200, 400];

/// One measured row in a server-rs capacity sweep.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CapacityTierReport {
    pub entities: usize,
    pub players: usize,
    pub mobs: usize,
    pub ticks: usize,
    pub tick_p50_ms: f64,
    pub tick_p95_ms: f64,
    pub tick_max_ms: f64,
    pub snapshot_bytes_per_player: usize,
    pub bandwidth_kbps_per_player: f64,
    pub total_outbound_kbps: f64,
}

/// Complete capacity sweep across multiple entity count tiers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CapacitySweepReport {
    pub arena_width: f32,
    pub arena_height: f32,
    pub tick_rate_hz: u32,
    pub tiers: Vec<CapacityTierReport>,
}

impl CapacitySweepReport {
    /// Formats the capacity sweep as a Markdown table suitable for capacity reports and CI artifacts.
    pub fn to_markdown_table(&self) -> String {
        let mut out = String::new();
        out.push_str("| Entities | Players | Mobs | Tick p50 (ms) | Tick p95 (ms) | Tick max (ms) | Snapshot (B/player) | Bandwidth (KB/s/player @ 20Hz) | Total Outbound (KB/s) |\n");
        out.push_str("|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n");
        for row in &self.tiers {
            out.push_str(&format!(
                "| {} | {} | {} | {:.3} | {:.3} | {:.3} | {} | {:.2} | {:.2} |\n",
                row.entities,
                row.players,
                row.mobs,
                row.tick_p50_ms,
                row.tick_p95_ms,
                row.tick_max_ms,
                row.snapshot_bytes_per_player,
                row.bandwidth_kbps_per_player,
                row.total_outbound_kbps,
            ));
        }
        out
    }
}

/// Runs a deterministic simulation + FlatBuffers snapshot serialization sweep for one entity tier.
pub fn measure_tier(
    entity_count: usize,
    ticks: usize,
    arena_width: f32,
    arena_height: f32,
) -> CapacityTierReport {
    let total = entity_count.max(1);
    let players = (total / 5).max(1);
    let mobs = total.saturating_sub(players);
    let tick_count = ticks.max(1);

    let mut sim = AtlasSimulation::live(LiveConfig {
        seed: 0x1337_c0de ^ (total as u32),
        arena_width,
        arena_height,
        bot_count: players,
        mob_count: mobs,
        mob_respawn_sec: 5.0,
        player_respawn_sec: 5.0,
        map_id: Some("map-for-play".to_string()),
    });
    let mut builder = SnapshotBuilder::with_capacity(total * 64 + 256);
    let mut samples_ns = Vec::with_capacity(tick_count);
    let mut last_snapshot_bytes = 0usize;

    for tick_idx in 0..tick_count {
        let start = Instant::now();
        let frame = sim.live_tick(&[], &[]);
        let bytes = builder.build_frame(
            frame.tick,
            (tick_idx as u64 + 1) * 50,
            &frame.entities,
            &frame.removed_ids,
            &frame.events,
        );
        last_snapshot_bytes = bytes.len();
        let elapsed_ns = start.elapsed().as_nanos() as u64;
        samples_ns.push(elapsed_ns.max(1));
    }

    samples_ns.sort_unstable();
    let at = |pct: usize| samples_ns[(samples_ns.len() * pct / 100).min(samples_ns.len() - 1)];
    let to_ms = |ns: u64| ns as f64 / 1_000_000.0;

    let tick_p50_ms = to_ms(at(50));
    let tick_p95_ms = to_ms(at(95));
    let tick_max_ms = to_ms(samples_ns[samples_ns.len() - 1]);

    // At 20 Hz, each connected player receives 20 snapshots/sec (prior to AOI filtering).
    let bytes_per_sec_per_player = (last_snapshot_bytes as f64) * 20.0;
    let bandwidth_kbps_per_player = bytes_per_sec_per_player / 1024.0;
    let total_outbound_kbps = bandwidth_kbps_per_player * (players as f64);

    CapacityTierReport {
        entities: total,
        players,
        mobs,
        ticks: tick_count,
        tick_p50_ms,
        tick_p95_ms,
        tick_max_ms,
        snapshot_bytes_per_player: last_snapshot_bytes,
        bandwidth_kbps_per_player,
        total_outbound_kbps,
    }
}

/// Runs the repeatable capacity sweep across `tiers` (e.g. `[50, 100, 200, 400]`).
pub fn run_capacity_sweep(tiers: &[usize], ticks_per_tier: usize) -> CapacitySweepReport {
    let arena_width = 4000.0;
    let arena_height = 4000.0;
    let rows = tiers
        .iter()
        .copied()
        .map(|count| measure_tier(count, ticks_per_tier, arena_width, arena_height))
        .collect();
    CapacitySweepReport {
        arena_width,
        arena_height,
        tick_rate_hz: 20,
        tiers: rows,
    }
}
