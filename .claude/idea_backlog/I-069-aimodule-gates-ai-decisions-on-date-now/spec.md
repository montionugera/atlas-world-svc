---
title: "AIModule gates AI decisions on Date.now() wall-clock, violating the repo's performance.now() invariant"
id: I-069
status: idea
---

# AIModule gates AI decisions on Date.now()

## Problem

`AIModule.update()` (`colyseus-server/src/ai/AIModule.ts:90-100`) only runs `updateAIDecision()` when at least 50 ms of **wall-clock** time has elapsed since the last call, measured with `Date.now()`.

This directly violates the invariant `CLAUDE.md` states for this repo:

> Use `performance.now()` for gameplay timing/cooldowns end-to-end; do not mix with `Date.now()` for deltas.

Two concrete harms:

1. **It silently invalidated a measurement.** While building F-027's load harness, an unpaced tick loop completed each tick in a few milliseconds, so this gate almost never opened — instrumentation measured **only 6 of 100 ticks running AI decision logic**. The first published capacity table described a world running AI at ~6% of production frequency, and its headline conclusion ("mob count, not player count, drives the ceiling") was wrong and had to be retracted. After pacing the loop to real time the same instrumentation measured 83 of 120 ticks.
2. **`Date.now()` is not monotonic.** It follows NTP corrections and manual clock changes. A backward step stalls AI decisions until wall time catches up; a forward step fires them in a burst. `performance.now()` has neither failure mode.

## Why now

The bug is not new, but it was invisible until F-027 gave a reason to drive the simulation at a non-production rate. Any future harness, replay tool, headless test, or fast-forward simulation hits the same wall — and will get plausible, wrong numbers rather than an error. The Stage 3 `cellSize` decision depends on exactly that kind of measurement.

## Sketch

- Switch the gate in `AIModule.update()` to `performance.now()`.
- Grep the whole server for other `Date.now()` uses in gameplay timing paths and fix or justify each. `GameSimulationSystem.updateNPCs()` already uses `Date.now()` for respawn timing — audit it in the same pass.
- Add a test that drives ticks faster than wall clock and asserts AI decisions still run once per tick, which fails against the current code.
