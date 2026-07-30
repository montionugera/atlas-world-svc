---
title: "Boss target rotation / aggro — bosses structurally cannot stop focus-firing"
id: I-035
status: idea
source: "F-018 Phase 5 measurement — docs/superpowers/specs/2026-07-30-combat-model-split-handoff.md"
---

# Boss target rotation / aggro — bosses structurally cannot stop focus-firing

## Problem

`nearest-opposite-team` target selection plus knockback forms a closed loop the boss
cannot exit:

1. The boss picks the nearest player as its victim.
2. Knockback pushes that victim away.
3. The boss then *chases* the victim it just hit.
4. Chasing keeps that victim nearest.

The target is never handed to anyone else. Nothing in the loop is random or time-based,
so this is not a tuning problem — it is structural.

The balance model's boss branch prices a rank as though damage split `n` ways across the
party. Because it does not split at all, at S/SS/SSS **one player absorbs 8× / 20× / 50×
the intended pressure** and dies in `swings` swings while the rest of the party is
untouched.

Measured during F-018 Phase 5. The divergence is pinned as `it.failing` in
`colyseus-server/src/tests/f018-*.test.ts`, so it turns red the moment someone fixes it
rather than silently passing.

## Why now

This blocks the boss `n²` branch of the balance model from meaning anything. Every
party-size number the model produces for S and above is currently unverified against the
simulation, and F-018 shipped with that stated rather than fixed. Any future tuning of
boss ranks builds on a number that does not describe the game.

## Sketch

Not a design yet — this needs a decision before it needs code. Two families:

- **Aggro / threat table.** Each boss keeps per-player threat; target selection reads
  threat rather than distance. Gives designers a lever (taunt, threat decay,
  healing-generates-threat) and is the conventional answer.
- **Multi-target boss attacks.** Cleaves / AoE that hit several players per swing, so
  pressure spreads without changing target selection at all. Cheaper, but it changes
  what a boss *is* rather than how it picks.

Whichever is chosen, the acceptance signal is the same: the `it.failing` boss assertion
in the F-018 test file inverts to a passing even-spread assertion.

Explicitly **not** in scope of the balance model — no arithmetic in `tools/combat-lab/`
can fix this.

Related: [[I-036]] is the test-harness half of the same finding.
