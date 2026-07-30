---
title: "Handoff — combat stat model (I-028 foundation)"
id: I-028
date: 2026-07-30
status: design agreed, nothing implemented
---

# Handoff — combat stat model

This is deliberately short. Almost everything worth knowing is already written
down somewhere that **cannot go stale**, and restating it here would create a
second copy that rots. This file covers only what those artefacts don't: where
things are, what to do next, and the traps.

---

## 1. Read these, in this order

| # | file | what it gives you |
| - | ---- | ----------------- |
| 1 | `2026-07-30-combat-stat-model-design.md` | The spec. Prose is hand-written; **every table is generated** from the model. |
| 2 | `tools/combat-lab/CHECKLIST.md` | Why each number is what it is, and what was rejected. The reasoning lives here. |
| 3 | `scripts/gen_combat_model.mjs` | The model itself — every authored number with its comment. |
| 4 | `tools/combat-lab/index.html` | Open it and move the sliders. Nothing on the page is hardcoded. |

**Do not re-derive any of this from the numbers.** Every non-obvious choice has
its reasoning recorded next to it, including the ones that look arbitrary.

## 2. Run this before believing anything

```bash
node scripts/gen_combat_model.mjs      # model  -> combat-model.json
node scripts/gen_combat_spec.mjs       # model  -> the spec's tables
node tools/combat-lab/verify.mjs       # 102 assertions, expect exit 0
```

To view the lab, serve **from the repo root** (not `tools/`) — the page fetches
`combat-model.json` relative to itself:

```bash
python3 -m http.server 8421      # then open /tools/combat-lab/index.html
```

## 3. Nothing here is implemented

The model describes systems that **do not exist in the server**: mana, healing,
a healer class, rest mode, potions, resurrection, aggro/taunt, gear tiers. The
running game is a single-player debug prototype.

That is deliberate — the design was settled on its own terms first, so it would
not be bent to match a prototype. Reconciling it with what ships is the next
job, and it is not small (§5).

## 4. Start here — the two tests that need nothing built

Both are enforceable against `AIModule` / `MobCombatSystem` today, and both
defend arithmetic the design already relies on. Violating either makes every
party number optimistic by up to **1.96×**.

```
pack:  n mobs + n players, run T ticks
       assert no player takes > (1+ε)·(1/n) of total incoming damage
boss:  1 boss + n players, same assertion
```

Cheapest high-value work available, and it blocks nothing.

## 5. The blocker before any implementation

`contracts/src/meta/derivedStats.ts` is a **pinned** formula and it disagrees
with this model **structurally**, not by tuning:

| | shipped | this model |
| - | ------- | ---------- |
| growth | additive, flat base (`100 + 10·vit + 5·(L−1)`) | multiplicative (`refHp × growth^L`) |
| damage types | `pAtk`/`mAtk`, `pDef`/`mDef` | one `atk`, one `def` |
| primaries | four (`str agi int vit`) | three stats; `agi` feeds move speed only, so it is invisible to R |

At L99 this model wants 18,301 HP; the shipped formula gives `100 + 10·vit + 490`.
**Picking a side is I-028's own stated blocker** — the original `spec.md` names
it in those words — and this model resolves the design half. The code half is
unscoped.

## 6. Traps, in the order they will bite you

- **The main working tree is Edit/Write-blocked** by a PreToolUse guard that keys
  off *filesystem location*, not branch name. Work in
  `.claude/worktrees/_release/` or a sibling worktree. `.claude/idea_backlog/` is
  blocked on main even from a worktree — claim a feature first.
- **Never `git commit --amend`.** A previous incident silently dropped untracked
  files from the tree. New commit on top, always.
- **Don't run prettier on `combat-model.json`** — it is generated and listed in
  `.prettierignore`. Formatting it makes every regeneration dirty the tree.
- **The spec's tables are generated.** Hand-editing them fails `verify.mjs`. Edit
  the model, then re-run `gen_combat_spec.mjs`.
- **A gate that has never failed is not known to work.** An earlier swings gate
  compared the model against the very field it derived from, and passed happily
  with rank E set to 99. Three gates here were proven to bite by deliberately
  breaking them; do the same for any you add.

## 7. Where the risk actually is

1. **No simulation has ever run.** Every number is closed-form — no crits,
   misses, kiting, movement, line of sight. This is the largest gap by far, and
   the `BattleModule` parity test is what closes it: drive the sim with
   `mob(L, rank)` and assert TTK within ±10% of the model and HP left within
   ±5pp.
2. **SSS funds at 1.10×**, and 92% of its healing comes from two invented
   numbers (`manaBars` 8, `combatManaRegen` 0.1 %/s). Any downward move breaks it.
3. **Rank S is on a knife edge** — 67% potion uptime, healers at 53% of healing,
   barely over the role-check gate. Any potion buff flips it to an inventory
   check.
4. **Gear tiers are invented** and now load-bearing for what content is
   reachable — D5 gates rank A behind them, and `weapons.ts` has no tier field.

## 8. What was decided, and what is still open

Five decisions are settled and recorded in `combat-model.json` under
`decisions[]`, each with reasoning, consequence and the rejected alternative.
Summarised in the spec §6 and `CHECKLIST.md`.

Eight open questions remain in `openQuestions[]`. **None is waiting on a
decision** — they are measurements, unbuilt systems, or the reconciliation in §5.
