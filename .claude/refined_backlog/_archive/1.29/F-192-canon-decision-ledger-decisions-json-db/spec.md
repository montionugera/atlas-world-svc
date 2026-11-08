---
title: "Canon decision ledger: decisions.json + DB table + gate, class/prologue proposals as proposed rows"
id: F-192
from_idea: I-277
status: refined
---

# I-277 Canon decision ledger

## Goal
One file records every ChatGPT-lore decision, who/when decided it, and whether it is applied. The Game DB loads it; a gate keeps the ledger honest.

## Scope
1. `content/studio/canon/decisions.json`: rows `{id, text, source_chat, date, status, applied_in, owner_answer}`. status = decided | applied | design-intent | proposed | rejected.
2. Replace the loose `canon_decisions` block in `glossary.json` (5 rows migrate as `applied`) and the loader in `scripts/build_catalog_db.py` (`canon_rows`) with a `canon_decisions` table built from the ledger.
3. Gate (extend `scripts/tests/catalog-canon.test.mjs`): fails when an `applied` row's `applied_in` path is missing, or an id repeats.
4. Seed rows (2026-11-08 owner answers, status `decided`, owner_answer "taken as recommended"):
   - Swiftblade is the 5th base class (Resource Tempo; specs Brass Runner Ch I, Katar Vanguard Ch III).
   - Katar is exclusive to Swiftblade; dagger shared with Ranger.
   - Acolyte is hybrid damage+support (Light resource, Radiant/Lantern stances, Borrowed Second ultimate).
5. Seed rows as `proposed` (not owner-locked): Knight/Ranger/Arcanist/Acolyte specialisations, six race prologues, race hook threads, lean-year token, Volunteers' Road 3 examples, Warden membership never gates main story/dungeons/markets/combat progression, players never earn "Cala Knight", Expansion II seeds.

## Out of scope
Class mechanics detail, NPC casts, items/economy (next ChatGPT questions).

## Acceptance criteria
- [ ] `node --test scripts/tests/catalog-canon.test.mjs` green; DB has `canon_decisions` with >= 5 applied + 3 decided + proposed rows.
- [ ] Deleting an applied row's `applied_in` file turns the gate red.
