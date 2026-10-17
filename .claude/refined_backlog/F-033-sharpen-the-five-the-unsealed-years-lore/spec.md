---
title: "Sharpen the five the-unsealed-years lore bodies"
id: F-033
from_idea: I-081
status: refined
---

# F-033 — Sharpen the five `the-unsealed-years` lore bodies

> `refine` writes a fresh skeleton and does **not** copy the idea folder. The real
> problem statement, the node table and the hard constraints live in the I-081 spec,
> preserved verbatim in this folder's git history and quoted below.

## Goal

Bring the five `the-unsealed-years` lore fragments — shipped by F-032 as gate-passing
drafts under the owner's *world first, prose later* instruction — up to
`story-content-writer` craft standard, without changing a single fact.

## Scope

**In:** the `body` field of five nodes in `content/story/lore.json`.

| id | anchor |
| --- | --- |
| `lore-the-ground-that-keeps-count` | `region-ashvale-front` |
| `lore-nothing-left-to-bury` | `region-cindervast` |
| `lore-the-first-seal` | `faction-bellfaith` |
| `lore-the-vacuum-holds` | `char-the-ash-prophet` |
| `lore-what-the-ice-gives-back` | `region-icefield` |

**Out:** ids, anchors, thread names, titles, summaries, and every other node in the
corpus. No new content, no new claims, no canon amendments.

## Constraints — any violation fails the feature

1. **The four permanent unknowns stay unanswered** (`A1-cosmology.md` §8): what the age
   was called, who those people were, how the weapons work, why they were used.
2. **The Ash Prophet stays wrong and stays uncorrected** (`A1-cosmology.md` §6). He may
   not become self-aware about *why* he believes what he believes — that is the softest
   and most effective form of correction.
3. **No god, no creation event, no afterlife, no soul, no sacrifice rite.**
4. **Register is Ashen Vigil**, obeying `style.md` §1: one-read rule, plain-vocabulary
   rule, ban list, understatement over melodrama.
5. **Ids and anchors do not move**, so `check_content.mjs` keeps resolving and
   `docs/story/story-graph.md` does not drift.

## Acceptance criteria

- `node scripts/check_content.mjs` — exit 0, 0 failures, 0 warnings.
- `node --test scripts/tests/*.test.mjs` — 181 pass, 0 fail (baseline unchanged; this
  feature adds no tests because it adds no logic).
- `node scripts/gen_story_graph.mjs --write` produces **no diff** — proof no ids moved.
- `git diff` touches `content/story/lore.json` only, and only `body` fields.
- The editorial chain from the `story-content-writer` skill has run and every finding is
  either fixed or explicitly declined with a reason: **continuity/canon editor**
  (adversarial, full context), **copy editor** (line level, style bible only), **fresh
  reader** (blind, text only).

## Notes for whoever reads this next

The craft pass is cheap; the canon exposure is not. Three of the four defects that the
adversarial review caught were introduced by *adding specificity* — a compass direction,
a year count, a casualty figure. Concrete detail is what the gate review asked for, and
it is also the fastest way to contradict `A1-geography-cluster1.md` or `A0`. Add detail,
then verify each added noun against the source before committing.
