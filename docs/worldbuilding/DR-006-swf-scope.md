# DR-006 — how much of the existing world research may overturn

**Date:** 2026-08-06
**Settles:** `docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md` §7, the contract's
one open decision, whose status line has read *"proposed — awaiting one decision (§7)"* since it
was written.
**Raised by:** I-051 (L1 cosmology), wave 5.

## The question, as the contract asks it

> **How much of the existing world may research overturn?** The owner said "it can be changed",
> which changes the shape of every SWF run.
>
> 1. **Additive only** — canon, the 152 story nodes and the novel are fixed; research may only
>    explain and extend.
> 2. **Canon amendable** — `canon.md` may be revised where research finds something better, but
>    the shipped novel and story graph stay.
> 3. **Everything on the table** — including the 5-act epic and the 116-monster bestiary.
>
> Each later level inherits this answer, so it is settled once, here.

## Ruling — option 3, everything on the table

The owner decided on 2026-08-06, during the I-051 brainstorm, to remove the king theme from the
world: the claim that the land had exactly one king in all history, and the land-wide taboo that
made "king" a curse word.

That decision was not reachable under option 1 or option 2. The theme is not confined to
`canon.md` or to working documents — it is carried in the **shipped narrative artifacts**:

| File | Sites carrying the theme |
| --- | --- |
| `docs/story/undertow/core-story.md` | 20 |
| `docs/story/undertow/novel-complete.md` | 5 |
| `docs/story/undertow/novel-illustrated-edition.html` | 4 |
| `docs/story/undertow/glossary-th.md` | 4 |

Amending the shipped novel is exactly what option 2 forbids and option 3 permits. **The ruling is
therefore option 3**, and it is recorded here rather than left implicit in a feature spec, because
SWF §7 states every later level inherits it.

## What option 3 does and does not license

**It licenses:** amending `canon.md`, the story graph, the shipped novel and its illustrated
edition, the bestiary, and the five-act structure, when a researched artifact finds something
better.

**It does not license any of the following**, which remain governed by their own decisions:

- **The Widow may not be resolved** — no defeat event, no boss fight, no redemption arc
  (`DR-001-L1-scope.md:190`, `role-narrative-director-scope.md:255`). Option 3 does not reopen it.
- **No gods on stage, no sacrifice rites.** Reaffirmed by the owner on 2026-08-05 in its strongest
  reading: no god exists; there is only belief. Option 3 licenses changing the world's history,
  not adding a deity to it.
- **Silent drift.** Every amendment names its collisions and ships the fix in the same commit
  (`canon.md` §6). Option 3 is permission to change things deliberately, never permission to leave
  two files disagreeing.

## Consequence for the contract

`2026-08-01-synthesis-workflow-contract.md` should move from `status: proposed` to accepted, its
§7 replaced by a pointer to this record. That edit is part of the I-051 change set.

## Confidence

**High on the ruling, and it was forced rather than chosen.** The owner's instruction and the
grep results together leave no consistent reading other than option 3. What is *not* settled here
is how often option 3 should actually be exercised — a licence to amend shipped narrative is not
an instruction to do it, and each future exercise still has to justify itself against the cost of
re-rendering the novel.
