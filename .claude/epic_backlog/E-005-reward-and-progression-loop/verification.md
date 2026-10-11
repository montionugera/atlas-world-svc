---
title: "Reward and progression loop"
id: E-005
---

# How we will know E-005 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. Killing a mob raises experience, and reaching the threshold advances player level which persists across a fresh sign-in.
2. Item definitions from the minimal item catalogue load on the server with valid stats and ids.
3. A mob kill drops loot in the world, which can be picked up and appears in the player's saved inventory.
4. Two players racing for one pickup yields exactly one owner, and a replayed kill grants experience once.
5. Equipping an item from the inventory screen sends the change to the server and modifies avatar combat attributes.
6. The switch key changes the attack the server performs AND an equipped skill changes what the server casts.
7. Dying applies the stated penalty, the player respawns at the bind point they set, AND travel between two named points completes within the time bound set in this slice.
8. A kill or quest yields currency AND a vendor purchase deducts it server-side AND a purchase without enough currency is refused.
9. Quests from the 28 authored story set can be accepted, tracked through kill and visit objectives, and claimed for rewards.
