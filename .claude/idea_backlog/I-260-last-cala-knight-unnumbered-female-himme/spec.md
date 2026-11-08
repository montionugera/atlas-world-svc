---
title: "Last Cala Knight: unnumbered, female, Himmel heart with Serie strength"
id: I-260
status: idea
---

# The Last Cala Knight (owner lock, 2026-11-07)

## Owner's words (verbatim)

> actually it can be like last Cala Knight ( no need to specify number ) ;
> Her setting is quite mysterious for player but real setting is
> Personality : Like Himmel in Frieren but strong like Serie

## Decision

1. Expansion I retraces **the Last Cala Knight**, not "the Ninth". No ordinal is ever stated in player-facing text; how many Cala Knights there were stays unknown. Numbering-by-person remains the internal rule for any earlier holder.
2. She is **female**. Her name, race, face, era and the unfinished thing stay **mysterious to players** (revealed by traces only, Ch 0–VIII per the F-178 §7b thread).
3. **Real setting (writers' bible, never stated to players early):** personality like Himmel (Frieren): kind, cheerful, vain in a charming way, chooses people over glory, remembered through the small things she did for others. Strength like Serie: the strongest being of her age, far beyond any living warrior, which makes her leaving work unfinished the central mystery.
4. No names, lines or designs borrowed from Frieren; the comparison is a design benchmark only.

## Changes

- `docs/superpowers/decisions/2026-11-07-cala-knight-legendary-title.md`: amend items 1, 3, 4 and §4 open item 1.
- `content/studio/canon/glossary.json`: add `last_cala_knight` with the player-facing and writers' facts; the canon card prints only the player-facing part.
- `content/studio/world_history_and_concept.json` `player_arrival_premise`: "Ninth" -> "Last".
- Guard: `scripts/check_canon_names.mjs` retired list gains "Ninth Cala Knight".
- ChatGPT project: memory updated and canon-card.md re-uploaded.

## Acceptance criteria

- [ ] No "Ninth Cala Knight" in `content/`, `docs/superpowers/decisions/` (except as a retired term) or the canon card; guard goes red on it.
- [ ] glossary.json `last_cala_knight` present; canon-card.md regenerated and re-uploaded; ChatGPT readback matches.
