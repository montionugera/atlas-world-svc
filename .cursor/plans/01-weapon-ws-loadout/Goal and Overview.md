# Weapon loadout via WebSocket (not schema)

## Scope

- Server: `equippedWeaponId` is not a Colyseus `@type`; clients learn loadout from `welcome`, `weapon_equipped`, and optional `loadout` after `player_request_loadout`.
- Client: `useColyseusClient` holds local `equippedWeaponId`; REST serializers merge it for APIs.

## Status

✅ Done — server messages, serializer merge + test, React hook + App + types, tests/build green.
