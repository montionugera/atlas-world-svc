---
title: "Sharpen the five the-unsealed-years lore bodies - shipped as gate-passing drafts under world-first-prose-later"
id: I-081
status: idea
origin: I-051
---

# Sharpen the five `the-unsealed-years` lore bodies

## Problem

The five fragments added to `content/story/lore.json` by I-051 are **drafts**. The owner's
instruction during the brainstorm was explicit — *world first, prose polish later* — so they were
written to pass the content gate and the voice rules, not to be the best version of themselves.

They have not been through `story-content-writer` craft review, and they are the only content in
the corpus carrying the new cosmology to a player.

| id | anchor |
| --- | --- |
| `lore-the-ground-that-keeps-count` | `region-ashvale-front` |
| `lore-nothing-left-to-bury` | `region-cindervast` |
| `lore-the-first-seal` | `faction-bellfaith` |
| `lore-the-vacuum-holds` | `char-the-ash-prophet` |
| `lore-what-the-ice-gives-back` | `region-icefield` |

The independent gate review of `A1-cosmology.md` scored **Q2 Specificity as the artifact's weakest
item**, and noted that what countable detail exists lives in *these nodes* rather than the artifact
("four lines", "sixth crate this season"). That makes their quality load-bearing for the whole
level, not decorative.

## Why now

Not blocking. The nodes pass the gate, obey `style.md`, and contain no ban-list or real-world-noun
violations.

The argument for doing it before wave 6+ is the same as for [[I-080]]: later content is written
against whatever is already on the page. These five are the first and currently only expression of
the unsealed years in player-facing text, so they set the register for everything that follows.

## Sketch

Run `story-content-writer` over the five bodies with `content/story/style.md` §6 and
`docs/worldbuilding/A1-cosmology.md` §6 (known-wrong) as the brief. Constraints that must survive
any rewrite:

- **The Ash Prophet stays wrong and stays uncorrected.** `A1-cosmology.md` forbids any content
  from correcting him.
- **None of the four permanent unknowns may be answered** — what the age was called, who those
  people were, how the weapons work, why they were used.
- **No god, no creation event, no afterlife, no soul.**
- Anchors, ids and the thread name must not change — `check_content.mjs` resolves anchors, and
  `docs/story/story-graph.md` must be regenerated with `gen_story_graph.mjs --write` if node ids
  move.

Worth considering while in there: the gate reviewer flagged the artifact's own phrase
*"industrial accident"* as modern-analytic register that must never migrate into player-facing
prose. Check the rewrite does not import it.
