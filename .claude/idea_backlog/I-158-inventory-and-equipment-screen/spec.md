---
title: "Inventory and equipment screen"
id: I-158
status: idea
---

# Inventory and equipment screen

## Acceptance criteria

- [ ] `equip_item_from_inventory` validates ownership in `PlayerInventory`, equips the item into the matching slot (`weapon`, `armor`, `accessory`), and immediately recalculates the live avatar's `CombatStats`, `Health::max`, and `EquippedWeapon` (`server-rs/tests/inventory_and_equipment_test.rs`).
- [ ] Attempting to equip an item the player does not own is rejected without mutating live avatar stats.
