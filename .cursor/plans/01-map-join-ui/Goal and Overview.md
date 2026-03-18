## Goal and Overview
Add a **map selection + join** option from the React frontend.

### Scope
- Frontend: UI control to pick a `mapId` and call existing `joinRoom(mapId)` flow.
- Backend: enable a second map id (ex: `map-02-sector-a`) so mob spawning and `GameState.mapId` work.
- Minimal verification: unit test for new map spawn settings + run existing test suite.

### Notes / Assumptions
- The server already passes `mapId` into `GameRoom` -> `GameState(mapId, roomId)`.
- Map-specific behavior currently mainly affects mob spawn settings via `getMobSettingsForMap(mapId)`.

