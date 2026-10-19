---
title: "Minimal item catalogue"
id: I-155
status: idea
---

# Minimal item catalogue

## Acceptance criteria

- [ ] `ItemCatalog` (`server-rs/src/content/item_catalog.rs`) defines the canonical minimal item catalogue covering weapons (`w_sword`, `w_bow`, `w_staff`), armor (`a_cloth`, `a_leather`, `a_plate`), accessories, and consumables with typed stat modifiers (`bonus_atk`, `bonus_def`, `bonus_hp`, `slot`, `price_gold`) and loot table entries (`server-rs/tests/minimal_item_catalogue_test.rs`).
- [ ] Every item ID referenced by mob loot tables and starter loadouts resolves deterministically in `ItemCatalog::global()`.
