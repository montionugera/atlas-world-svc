---
title: "Simulation clock injection: gameplay takes time as an input, not from a global clock"
id: I-069
status: idea
---

# Simulation clock injection

> **Spec rewritten 2026-08-02.** The original text framed this as "`AIModule` uses
> `Date.now()` instead of `performance.now()`" and prescribed a repo-wide clock swap.
> That diagnosis was wrong — see [Correction](#correction-to-the-original-spec). The
> defect is real; the prescribed fix would not have fixed it.

## Principle

**Gameplay simulation should take time as an input, never read a global clock.**

Once time is a parameter, the simulation is deterministic by construction: the same
inputs produce the same outputs at any execution speed. Choosing between `Date.now()`
and `performance.now()` is arguing about *which* global to reach for — both lose
determinism identically, because both advance with real time regardless of how fast
the tick loop is running.

## Problem

`AIModule.update()` (`colyseus-server/src/ai/AIModule.ts:90-100`) gates
`updateAIDecision()` on 50 ms of **wall-clock** time elapsed since the last call.

The root cause is one line up the stack: `GameSimulationSystem.update(deltaTime)`
calls `this.room.state.aiModule.update()` at
`colyseus-server/src/rooms/systems/GameSimulationSystem.ts:26` — **passing no
arguments** — while `deltaTime` sits in scope and is passed to every other system in
the same loop. AI decision cadence is therefore pinned to wall clock while the rest of
the simulation runs on simulated time.

Two concrete harms:

1. **Any run not paced to real time silently under-runs AI.** While building F-027's
   load harness, an unpaced loop completed each tick in a few milliseconds, so the gate
   almost never opened — instrumentation measured **6 of 100 ticks** running AI decision
   logic. The first published capacity table described a world running AI at ~6% of
   production frequency; its headline conclusion ("mob count, not player count, drives
   the ceiling") was wrong and was retracted. Pacing the loop to real time brought the
   same instrumentation to 83 of 120 ticks. Every future harness, replay tool, headless
   test, or fast-forward simulation hits this, and gets plausible, wrong numbers rather
   than an error.
2. **`Date.now()` is not monotonic.** It follows NTP corrections and manual clock
   changes. A backward step stalls AI decisions until wall time catches up; a forward
   step fires them in a burst.

Harm 1 is the expensive one and is *not* a clock-choice problem. Harm 2 is a genuine
clock-choice problem and disappears for free once time is injected.

**The gate is completely untested.** Every AI test drives `updateAll()`, which bypasses
`update()` entirely (`ai-integration.test.ts`, `ai-performance.test.ts`). That is why
this survived.

## Correction to the original spec

The original spec attributed harm 1 to `Date.now()` and prescribed switching to
`performance.now()`. **That swap would not have changed the measurement.**
`performance.now()` is also real-time — an unpaced loop finishing ticks in 3 ms leaves a
50 ms gate closed just as often, whichever global it reads. An implementer following the
original spec would have made the change and found the harness still reporting ~6%.

## Why the repo-wide clock swap is the wrong direction

The original sketch called for grepping the server and converting every `Date.now()` in
a gameplay path. Measured: **~70 call sites**. Two of them
(`BaseCombatSystem.ts:75-77`, `MobCombatSystem.ts:170-174`) document a deliberate
two-clock split — cast/queue scheduling on `Date.now()` so `jest.setSystemTime` can
drive it, cooldowns on `performance.now()` for monotonicity, never cross-subtracted.
**9 test files and 31 `setSystemTime` calls** depend on that.

That split is not a design decision that happens to be awkward — it is a **symptom**.
Combat scheduling reads a global, so the only way to test it is to fake the global.
Injecting the clock makes the entire fake-timer apparatus unnecessary.

A global-to-global sweep keeps every one of those 31 fake-timer call sites, keeps the
simulation non-deterministic, and spends its whole budget in the most
correctness-critical code in the server. It is motion, not progress.

## Evidence the codebase already wants this

- `BaseCombatSystem.ts:34` defines `protected now(): number { return performance.now() }`
  — a clock seam, already written. **Nothing overrides it**, and the same class bypasses
  it with direct `Date.now()` calls in five places. The seam was started and abandoned.
- `deltaTime` is already threaded through the whole simulation loop; every system in
  `GameSimulationSystem.update()` receives it. `AIModule` is one of the few that ignores
  it.

## Simplicity argument

This migration **deletes** code. Each converted subsystem replaces `jest.useFakeTimers()`
+ `setSystemTime(...)` with `clock.advance(50)`, so its test file gets shorter and reads
as intent rather than as timer plumbing. The sweep alternative does the opposite: same
machinery, new global underneath.

## Plan

Four steps, each independently shippable and reversible.

1. **`SimClock`** — a monotonic clock owned by `GameRoom`, advanced by the tick with
   `deltaTime`, exposing `now()` and (for tests) `advance(ms)`. New code; touches no
   existing behavior.
2. **Convert `AIModule`** — take the clock (or `deltaTime`) as an input and gate on
   simulated time. Isolated blast radius, currently-untested path, proves the pattern.
   Add the regression test: drive 100 ticks faster than wall clock, assert ~100 decision
   passes. Red before, green after.
3. **Convert remaining subsystems, one per change** — respawn and projectile lifetimes
   first (already self-consistent, low risk), combat scheduling **last and on its own**.
   Combat's tests get rewritten either way; this way they get shorter.
4. **Lock it in** — eslint `no-restricted-properties` banning `Date.now` /
   `performance.now` under converted gameplay directories, so the seam cannot erode. Update
   the CLAUDE.md "Units & timing" invariant, which currently prescribes `performance.now()`
   end-to-end, to prescribe the injected clock instead.

**Scope of the feature minted from this idea: steps 1 and 2.** Steps 3 and 4 are
deferrable indefinitely without stranding anything — nothing in steps 1–2 depends on them
landing. That is what makes this safe to start.

## Non-goals

- Blanket `Date.now()` → `performance.now()` conversion.
- Touching combat cast/queue scheduling in this feature (step 3, separate change).
- Re-running F-027's capacity measurements. The published table was taken from a *paced*
  loop and stands; this work is what lets future harnesses run unpaced and still be
  correct.

## Risks

- **Step 2 changes AI cadence in production**, from "every 50 ms wall clock" to "every
  50 ms simulated". At the live tick rate these coincide; they diverge only when the
  server is overloaded and ticks fall behind, where simulated time is the more correct
  basis. Worth an explicit note in review.
- Step 3's combat conversion is the risky one and is deliberately not in this feature.
  Its failure mode is "attacks feel wrong" rather than a red test, so it needs its own
  budget and its own review.

## Follow-ups

- Step 3 (remaining subsystems) and step 4 (lint gate + CLAUDE.md invariant update)
  should be filed as their own ideas once step 2 lands and the pattern is proven.
