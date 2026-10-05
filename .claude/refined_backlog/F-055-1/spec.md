---
title: "1"
id: F-055
status: refined
epic: E-001
from_idea: I-126
---

# TypeScript baseline benchmark and golden deterministic trace with I-124 spatial grid and SimClock

## Problem

Before porting the game server to Rust, we must establish a verified, reproducible baseline on the current TypeScript server:
1. Land I-124 (spatial grid for mob AI) to eliminate the unindexed $O(N^2)$ loops.
2. Route all simulation time and random calls through `SimClock` and seeded PRNG so simulation runs are 100% deterministic.
3. Record a 1,000-tick golden execution trace (entity positions, mob decisions, combat events) to serve as the parity test oracle for the Rust engine.

## Acceptance criteria

- [ ] AC-1: `I-124` is landed and verified with `npm run load` under 50 ms p95 at 300 players $\times$ 1,000 mobs.
- [ ] AC-2: All non-deterministic calls (`Date.now()`, `Math.random()`) in the simulation loop route through `SimClock` and seeded PRNG.
- [ ] AC-3: A 1,000-tick golden simulation run outputs a deterministic snapshot file (`golden_sim_trace_1000.json`).
