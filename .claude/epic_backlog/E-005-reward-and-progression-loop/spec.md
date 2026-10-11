---
title: "Reward and progression loop"
id: E-005
status: epic
---

# Reward and progression loop

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

Fighting pays off and it shows: kills give experience and loot, the player sees
their level rise, picks up and equips items, changes weapon and skills, and
follows quests authored in the story content. All of it is still there next
session.

## Evidence of the gap

- No experience grant exists in `server-rs/src/systems`; the wire `EntityDelta` carries no level or experience field.
- No loot anywhere in `server-rs/src` or the client; `GameEventKind` has only Hit and Kill. `nakama/src/rpc/grantLoot.ts` and `grantXp.ts` have no caller.
- The client's `requestLoadout` / `requestEquipment` are no-ops (`client/react-client/src/hooks/useServerRsClient.ts:889-895`); there is no inventory screen.
- Weapon switch only changes client state (`useServerRsClient.ts:882-887`); skill slots are hard-wired to `skill_1..4` (`server-rs/src/systems/skill_execution.rs:236-241`).
- No quest reference in `server-rs/src` beyond an unused `active_quest_ids`; `contracts/content/quests.json` holds 3 quests, not 6 (28 in `content/story/quests.json` is right).

## Slices

Order matters: earlier slices unblock later ones.

1. Experience and levels — grant experience on mob kills, advance player levels on thresholds, and synchronize level and experience to the client.
2. Minimal item catalogue — the smallest set of item definitions loot needs (the wider scheme stays in I-066).
3. Idempotent server-only grants — every grant of experience, items or currency is made by the server, exactly once, with a test for two players racing for one pickup.
4. Loot drops and pickup — mobs drop items into the world, a player picks them up, and the item lands in their saved inventory.
5. Inventory and equipment screen — the client lists owned items and equips them; the server applies the change to the live avatar.
6. Weapon switching and skill loadout in play — the switch key and equipped skills change what the server actually does.
7. Death, bind point and travel — a death penalty, a respawn location the player sets, and a way to travel across a 400 by 400 world.
8. Currency and vendor — a currency earned in play and a server-authoritative vendor to spend it.
9. Quests at runtime — wire the full 28-quest authored set (this is existing ideas I-052 and I-017; link them).

## Depends on

All of E-003; slice 1 needs E-006 slice 2; slice 7's travel needs E-004 slice 4.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- Sign-in and saving (E-003); this epic depends on it.
- Item balance and the wider item scheme (I-066).

## Open questions

- Whether experience is granted per kill by the game server or only through quest claims, as Nakama does today.
