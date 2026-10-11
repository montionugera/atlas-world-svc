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
3. When two players send simultaneous pickup requests for a single loot drop in a race test, the pickup race yields exactly one owner.
4. A mob kill drops loot in the world, which can be picked up and appears in the player's saved inventory.
5. Equipping an item from the inventory screen sends the change to the server and modifies avatar combat attributes.
6. An equipped skill changes what the server casts during combat execution instead of hard-wired defaults.
7. Dying applies the death penalty and respawns at the player-set bind point, and travel mechanics allow moving across the 400 by 400 world.
8. Defeating mobs or completing objectives awards currency, which can be spent at a server-authoritative vendor to buy items.
9. Quests from the 28 authored story set can be accepted, tracked through kill and visit objectives, and claimed for rewards.
