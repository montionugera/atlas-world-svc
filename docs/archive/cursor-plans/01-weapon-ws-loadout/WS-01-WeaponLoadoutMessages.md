# Epic: Weapon loadout over WS

## Stories

1. ✅ Server: remove schema sync for `equippedWeaponId`; `welcome` + ack + loadout request
2. ✅ REST: `serializePlayerData` merges `equippedWeaponId`; Jest covers merge
3. ✅ Client: hook state + `App` UI; remove `Player.equippedWeaponId` from client types

## Tasks

- ✅ `Player.ts` — no `@type` on equipped weapon
- ✅ `GameRoom` — welcome payload
- ✅ `PlayerInputHandler` — `weapon_equipped`, `player_request_loadout` → `loadout`
- ✅ `serializers.ts` + `serializers.test.ts`
- ✅ `useColyseusClient.ts`, `App.tsx`, `game.ts`, `App.test.tsx`
