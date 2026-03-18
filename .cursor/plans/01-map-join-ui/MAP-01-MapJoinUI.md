## MAP-01 Map Join UI (Front-End)

### Epic Plan
Enable users to select a map in the UI and join the corresponding room using the existing `joinOrCreate('game_room', { mapId })` mechanism.

### Checklist (stories)
1. Add new map id support in server config (`mobSpawnConfig`) so `map-02-sector-a` works.
2. Add server unit test verifying `getMobSettingsForMap('map-02-sector-a')`.
3. Add React UI: `<select>` map picker + `Join` button.
4. Wire UI to existing `client.joinRoom(mapId)` hook.
5. Run Jest tests (server) + `npm run build` (frontend) to validate.

### Status
✅ Done
🚧 In Progress
❌ Failed
⏳ Pending

