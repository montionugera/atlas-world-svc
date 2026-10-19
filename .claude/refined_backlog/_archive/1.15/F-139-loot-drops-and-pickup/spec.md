---
title: "Loot drops and pickup"
id: F-139
status: refined
from_idea: I-156
---

# Loot drops and pickup

## Acceptance criteria

- [ ] Defeating a mob spawns a world `LootDrop` entity at the mob's position containing deterministic item/gold rewards from the minimal item catalogue (`server-rs/tests/loot_drops_and_pickup_test.rs`).
- [ ] When an alive player moves within pickup radius (`<= 25.0` units) of a `LootDrop`, `loot_pickup_system` despawns the drop and appends the item into the player's `PlayerInventory`.
