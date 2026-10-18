---
title: "Decide the world model"
id: I-145
status: idea
---

# Decide the world model

## Problem

Slices 3–10 of `E-004` (`One continuous open world`) require an explicit, authoritative decision on region dimensions, Area-of-Interest (AOI) radius, tick budget, world state storage backend, and border crossing / authority handoff mechanism derived from the `F-081` capacity numbers and the prior `F-027` seamless-world design.

## Acceptance criteria

- [ ] An architecture decision record (`docs/superpowers/decisions/2026-10-18-e004-world-model-decision.md`) explicitly names the region size (`4000 × 4000` units), AOI radius (`600` units enter / `640` units exit hysteresis), tick budget (`50 ms` @ 20 Hz, `< 15 ms` simulation target), world state store (`WorldStateStore` trait backed by atomic JSON snapshot file + Nakama storage), and border-crossing mechanism (border ghost band `250` units + hysteresis authority handoff `32` units), referencing `F-027` and `F-081` measurements.
- [ ] `server-rs` exports `WorldModelConfig` (`server_rs::content::world_model::WorldModelConfig`) encoding these canonical parameters so Slices 3–10 consume one source of truth.
- [ ] Automated tests verify the `WorldModelConfig` geometric/timing invariants and verify that the decision record contains all required sections and inputs (`F-027`, `F-081`).
