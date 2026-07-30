---
title: "Pack no-focus-fire, properly tested + a parity test that runs a real fight"
id: I-036
status: idea
source: "F-018 Phase 5 measurement — docs/superpowers/specs/2026-07-30-combat-model-split-handoff.md"
---

# Pack no-focus-fire, properly tested + a parity test that runs a real fight

## Problem

**Two F-018 Phase 5 tests do not prove what they were written to prove.**

**1. The pack test's even damage spread is explained by lane geometry, not by the AI
declining to converge.** Measured: only **1 of 49 swings (2%)** landed while a mob's own
lane-mate was not already its nearest player. The mobs never had the opportunity to
converge, so the even spread is an artifact of the setup. The assertion pins 2% as an
*upper* bound with the reasoning written into the test; it is not the `>= 0.2` it wants
to be. Consequence: both `2n/(n+1)` (pack) and `n²` (boss) are **unverified against the
simulation**.

**2. The parity test is a per-hit damage probe, not a simulated fight.** Every number it
reports is reproducible in closed form without instantiating a room, so it does not close
the foundation spec's "no simulation has ever run" gap on its own — the pack and boss
tests are what actually drove rooms. Its two derived quantities are guarded only by an
`it.failing`, which passes on **any** throw rather than only on the intended divergence,
so an unrelated crash would read as the expected result.

## Why now

F-018 shipped the balance model with these gaps stated rather than closed. Until they are
closed, no party-size term in the model is known to describe the game, and the
`it.failing` guards are weak enough that a regression could hide inside one.

Distinct from [[I-035]]: that is a real behavioural defect needing a design decision.
This is test-harness work on behaviour that may already be correct — we do not know yet,
which is exactly the point.

## Sketch

**Pack test, properly set up.** A clustered party where target choice stays live while
damage lands: every mob must be able to reach every player, so convergence is possible
and declining to converge becomes a real observation. **Inverting the assertion to
`>= 0.2` is the signal the work landed.** If the mobs *do* converge, that is a finding
about the AI, not a test to loosen.

**Parity test, run to completion.** Drive a real fight with `mob(L, rank)` from the model,
to death, and measure **TTK** and **HP remaining** against the model's prediction rather
than probing single hits. Replace the blanket `it.failing` with a guard that tolerates
only the *named* divergence.

**The honest ceiling on this.**
`colyseus-server/src/modules/combat/DamageCalculator.ts` is subtractive, 80%-capped and
1-floored while the model is divisive and uncapped. They are different functions and
cannot agree in general, so a parity test can only ever validate *shape and ordering*,
never absolute damage. Reconciling those two functions is its own separate question.

Also relevant: `GameRoom.maxClients` is `1` for single-player debugging, so multi-player
tests must construct the room directly rather than going through client connection —
follow whichever existing test in `colyseus-server/src/tests/` already does this.
