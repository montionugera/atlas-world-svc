---
title: "2"
id: F-056
status: refined
epic: E-001
from_idea: I-127
---

# Headless server-rs ECS simulation core with Rapier2D physics verified against golden trace

## Problem

Build the pure Rust simulation crate (`server-rs`) without networking:
1. Archetypal ECS (`bevy_ecs`) storing components in dense Struct-of-Arrays (SoA) layout.
2. `rapier2d` 2D physics world with sensor colliders for projectiles.
3. Mob AI systems (separation, wander, chase, attack) utilizing SIMD spatial partitioning.
4. Verify behavioral parity against the golden TypeScript simulation trace.

## Acceptance criteria

- [ ] AC-1: `server-rs` compiles cleanly with `cargo check` and `cargo test`.
- [ ] AC-2: Headless simulation executes the 1,000-tick scenario with output matching the TypeScript golden trace within acceptable float epsilon.
- [ ] AC-3: `cargo bench` demonstrates $\ge 10,000$ active entities simulated in $\le 2.0\text{ ms}$ per tick with 0.0 ms GC pauses.
