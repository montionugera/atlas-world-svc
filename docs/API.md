# API & Socket Documentation

## WebSocket Events (Socket)
The primary communication happens via Colyseus WebSocket connection.

### On Join (`welcome`)
Sent by the server immediately after a client successfully joins a room.

**Payload (fields may vary by room version):**
```json
{
  "message": "Welcome to map-01-sector-a!",
  "playerId": "session_id_here",
  "mapId": "map-01-sector-a",
  "equipment": {
    "head": "",
    "midHead": "",
    "lowerHead": "",
    "body": "",
    "mainHand": "basic_sword",
    "offHand": "",
    "outerwear": "",
    "feet": "",
    "accessory1": "",
    "accessory2": ""
  },
  "mapConfig": {
    "mobSpawnAreas": [...],
    "terrainZones": [
      {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100,
        "friction": 0.2,
        "name": "ice"
      }
    ]
  }
}
```

`equipment` is a full snapshot of the joining player’s equipped catalog ids per slot (strings, empty if none). It is not part of the Colyseus synced schema.

### Server → Client (after join)

| Message | Payload | Description |
| :--- | :--- | :--- |
| `equipment` | `{ equipment: { ...slot ids } }` | Full equipment snapshot (same shape as `welcome.equipment`), sent on request or after a successful weapon switch |

### Client → Server Messages
| Message | Data | Description |
| :--- | :--- | :--- |
| `player_input_move` | `{ vx: number, vy: number }` | Authoritative movement input request |
| `player_input_action` | `{ action: string, pressed: boolean }` | Action request (e.g. 'attack') |
| `player_toggle_bot` | `{ enabled: boolean }` | Toggle bot mode for the player |
| `player_switch_weapon` | `{ weaponId: string }` | Validated server-side; server responds with `equipment` |
| `player_request_equipment` | `{}` | Request a fresh full `equipment` snapshot (e.g. when opening an equip UI) |
| `player_request_loadout` | `{}` | Deprecated alias of `player_request_equipment` |
| `companion_command` | `{ command: string, targetId?: string }` | Issue a command to a companion |
| `player_respawn` | `null` | Request respawn |

### Player REST shape

`GET /rooms/:roomId/players/:playerId` includes `equipment` (snapshot) and `equippedWeaponId` (convenience, same as `mainHand`).

**Unity / generated C# clients:** `WelcomeMessage` and any hand-written DTOs must be updated manually to include `equipment` (e.g. `Dictionary<string,string>` or a typed struct) if you deserialize `welcome`; regenerate or extend client code accordingly.

---

## REST API Endpoints
Used for fetching static or rarely changing data.
**Base URL:** `http://localhost:2567/api`

### Mobs
`GET /rooms/:roomId/mobs`
- Returns list of all mobs in the room.

`GET /rooms/:roomId/mobs/:mobId`
- Returns details of a specific mob.

### Players
`GET /rooms/:roomId/players`
- Returns list of all players in the room.

`GET /rooms/:roomId/players/:playerId`
- Returns details of a specific player.

### Companions
`GET /rooms/:roomId/companions`
- Returns list of all active companions in the room.

`GET /rooms/:roomId/companions/:companionId`
- Returns details of a specific companion.
