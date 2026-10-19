---
title: "Inventory and equipment screen"
id: F-141
status: refined
from_idea: I-158
---

# Inventory and equipment screen

## Acceptance criteria

- [ ] `equip_item_from_inventory` validates ownership in `PlayerInventory`, equips the item into the matching slot (`weapon`, `armor`, `accessory`), and immediately recalculates the live avatar's `CombatStats`, `Health::max`, and `EquippedWeapon` (`server-rs/tests/inventory_and_equipment_test.rs`).
- [ ] Attempting to equip an item the player does not own is rejected without mutating live avatar stats.
