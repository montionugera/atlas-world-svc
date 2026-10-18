---
title: "Measure capacity"
id: I-144
status: idea
---

# Measure capacity

## Problem

Real capacity of `server-rs` across realistic entity counts (`50`, `100`, `200`, `400` entities) and per-player outbound snapshot bandwidth at 20 Hz is unmeasured in automated tests and `/metrics` (absorbing `I-072` and `I-073`). Without a repeatable load harness and per-snapshot byte metrics, region sizing and AOI radius decisions in `E-004` would be guesswork.

## Acceptance criteria

- [ ] `server-rs` provides a deterministic load harness (`server_rs::load_harness::run_capacity_sweep`) that measures tick duration (`p50_ms`, `p95_ms`, `max_ms`), serialized snapshot size (`snapshot_bytes_per_player`), and 20 Hz bandwidth (`bandwidth_kbps_per_player`, `total_outbound_kbps`) across `[50, 100, 200, 400]` entities.
- [ ] `GET /metrics` (`ServerMetrics` in `server-rs/src/net/ws.rs`) reports `snapshot_bytes_last` (absorbing `I-072`) alongside `bytes_sent` and `frames_sent`.
- [ ] A committed capacity report (`docs/superpowers/specs/2026-10-18-server-rs-capacity-report.md`) records the measured numbers for `50`, `100`, `200`, and `400` entities on `server-rs`.
- [ ] Automated integration tests (`server-rs/tests/load_capacity.rs`) run the 4-tier sweep (`50`, `100`, `200`, `400` entities) and verify that every tier completes cleanly with finite positive tick timings and monotonic snapshot byte sizes.
