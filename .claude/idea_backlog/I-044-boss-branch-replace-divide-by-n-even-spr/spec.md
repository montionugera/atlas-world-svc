---
title: "Boss branch: replace divide-by-n even-spread with the trinity sustain reading"
id: I-044
status: idea
source: "F-023 deferred scope (docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md §7)"
---

# Boss branch: replace ÷n even-spread with the trinity sustain reading

## Problem

`tools/combat-lab/CHECKLIST.md:291-295` states the boss assumption **with a qualifier
that is routinely dropped when it is quoted**:

> **Load-bearing assumption:** a boss shares its damage evenly across the party… **Without
> healing**, even sharing is the only survivable reading.

The same file already derives the alternative: `:111` — *"A boss's wall clock is bought
with healing, not HP"* — and `:129` — `sustain = 1 − n² / (R × a × d × h)`, with SSS
needing healing to replace **93.4%** of everything the boss deals.

**`÷n` even-spread is the no-healer model. Tank-absorbs-plus-healer-funds is the trinity
model.** Trinity was chosen as the endgame shape on 2026-07-31, so the boss branch's
`÷n` is itself wrong — not merely the AI that failed to satisfy it.

## Why this is not server work

No change to `colyseus-server` fixes this. It is arithmetic in `tools/combat-lab/`:
the `rankDanger` boss branch and the `R = R_solo × n²` reading both need re-deriving
against the sustain equation rather than against even spread.

## Blocked until healing exists

`docs/superpowers/specs/2026-07-30-combat-stat-model-design.md:386-389` lists healer,
mana and healing as **"does not exist"**. Until they do, the sustain branch has no
inputs to solve against.

F-023 shipped the correct *mechanism* (threat/aggro) and recorded explicitly that the
*numbers* stay unverified — see that spec's §8 and the header of
`colyseus-server/src/tests/f018-boss-spread.test.ts`.

Related: [[I-043]] is the content half of the same gap.
