# API & Socket Documentation

## WebSocket Events (Socket)
The primary communication happens via Colyseus WebSocket connection.

### On Join (`welcome`)
Sent by the server immediately after a client successfully joins a room.

**Payload:**
```json
{
  "message": "Welcome to map-01-sector-a!",
  "playerId": "session_id_here",
  "mapId": "map-01-sector-a",
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

### Client -> Server Messages
| Message | Data | Description |
| :--- | :--- | :--- |
| `player_input_move` | `{ vx: number, vy: number }` | Authoritative movement input request |
| `player_input_action` | `{ action: string, pressed: boolean }` | Action request (e.g. 'attack') |
| `player_toggle_bot` | `{ enabled: boolean }` | Toggle bot mode for the player |
| `player_respawn` | `null` | Request respawn |

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
