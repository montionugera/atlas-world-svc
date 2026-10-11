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
- No quest reference in `server-rs/src` beyond an unused `active_quest_ids`; `contracts/content/quests.json` has 6 quests against 28 in `content/story/quests.json`.

## Slices

Order matters: earlier slices unblock later ones.

1. Experience and levels — kills grant experience on the server, levels raise stats, and level and experience are sent to and shown by the client.
2. Loot drops and pickup — mobs drop items into the world, a player picks them up, and the item lands in their saved inventory.
3. Inventory and equipment screen — the client lists owned items and equips them; the server applies the change to the live avatar.
4. Weapon switching and skill loadout in play — the switch key and the equipped skills change what the server actually does.
5. Quests at runtime — accept, track kill and visit objectives from live play, and claim rewards, using the full authored quest set.

## Out of scope

- Sign-in and saving (E-003); this epic depends on it.
- Item balance and the wider item scheme (I-066).

## Open questions

- Whether experience is granted per kill by the game server or only through quest claims, as Nakama does today.
