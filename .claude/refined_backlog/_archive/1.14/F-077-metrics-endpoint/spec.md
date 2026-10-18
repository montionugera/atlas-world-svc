---
id: F-077
title: "Metrics endpoint"
status: refined
created: 2026-10-16
epic: E-006
from_idea: I-167
---

# Metrics endpoint — tick time, players, entities and bytes sent, readable by a load run

## Problem
Currently `server-rs` only logs tick timing summaries to `DEBUG` every 200 ticks and exposes no HTTP `/metrics` endpoint. Load-testing scripts and monitoring tools have no machine-readable endpoint to query live tick duration (`p50`/`p95`/`max`/latest), connected player count, simulated entity count, and total outbound snapshot bytes sent.

## Solution
1. **`ServerMetrics` Snapshot & Atomic/Shared Counters on `WsServer`**:
   - Track `bytes_sent: AtomicU64`, `frames_sent: AtomicU64`, `ticks_completed: AtomicU64`, `entities_count: AtomicUsize`, and recent tick work duration metrics (`last_tick_us`, `p50_tick_us`, `p95_tick_us`, `max_tick_us`) on `WsServer`.
   - Automatically increment `bytes_sent` and `frames_sent` in `broadcast_snapshot` and `broadcast_snapshot_to_room` for each client frame delivered.
   - Add `ws_server.record_tick_metrics(work_duration: Duration, total_entities: usize)` and call it from the 20 Hz simulation tick loop in `server-rs/src/main.rs`.
2. **`GET /metrics` HTTP Endpoint**:
   - Serve `GET /metrics` on `WsServer` returning `200 OK` JSON (and when `?format=prometheus` or `Accept: text/plain` is requested, or alongside JSON fields, structured so both JSON parsers and load scripts can read `tick_time_ms` (`last`, `p50`, `p95`, `max`), `players`, `entities`, `bytes_sent`, `frames_sent`, `ticks_completed`, and `rate_limited_drops`).

## Acceptance Criteria
- [ ] `GET /metrics` returns HTTP 200 JSON containing `tick_time_ms` (`last`, `p50`, `p95`, `max`), `players`, `entities`, `bytes_sent`, `frames_sent`, and `ticks_completed`.
- [ ] Broadcasting snapshots increments `bytes_sent` and `frames_sent`, connecting players updates `players`, and `record_tick_metrics` updates `tick_time_ms` and `entities`.
