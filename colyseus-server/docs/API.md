# 🌐 REST API Documentation

RESTful endpoints for retrieving static game data. This offloads rarely-changing data from real-time WebSocket sync, reducing bandwidth and improving performance.

## Base URL

```
http://localhost:2567/api
```

## Endpoints

### GET /api/mob-types

Returns list of all mob types.

**Query Parameters:**
- `light` (optional, boolean): If `true`, returns lightweight list (IDs, names, spawn weights only)

**Response (lightweight):**
```json
{
  "mobTypes": [
    {
      "id": "spear_thrower",
      "name": "Spear Thrower",
      "spawnWeight": 20
    },
    {
      "id": "goblin",
      "name": "Goblin",
      "spawnWeight": 50
    }
  ]
}
```

**Response (full):**
```json
{
  "mobTypes": [
    {
      "id": "spear_thrower",
      "name": "Spear Thrower",
      "spawnWeight": 20,
      "bodyRadius": 2,
      "stats": {
        "attackRange": 5,
        "chaseRange": 20
      },
      "atkStrategies": [
        {
          "id": "melee",
          "attacks": [...]
        },
        {
          "id": "spearThrow",
          "attacks": [...]
        }
      ]
    }
  ]
}
```

**Example:**
```bash
# Lightweight list
curl http://localhost:2567/api/mob-types?light=true

# Full definitions
curl http://localhost:2567/api/mob-types
```

---

### GET /api/mob-types/:id

Returns full definition of a specific mob type.

**Path Parameters:**
- `id` (string): Mob type identifier (e.g., `spear_thrower`, `goblin`)

**Response:**
```json
{
  "mobType": {
    "id": "spear_thrower",
    "name": "Spear Thrower",
    "spawnWeight": 20,
    "bodyRadius": 2,
    "stats": {
      "attackRange": 5,
      "chaseRange": 20,
      "maxHealth": 100,
      "attackDamage": 10,
      "defense": 0,
      "armor": 0
    },
    "atkStrategies": [
      {
        "id": "melee",
        "attacks": [
          {
            "atkBaseDmg": 10,
            "atkRadius": 2,
            "castingTimeInMs": 0,
            "atkCharacteristic": {
              "type": "projectile",
              "projectile": {
                "speedUnitsPerSec": 50,
                "projectileRadius": 1,
                "atkRange": 5
              }
            }
          }
        ]
      }
    ]
  }
}
```

**Error Response (404):**
```json
{
  "error": "Mob type not found",
  "id": "invalid_id",
  "availableTypes": ["spear_thrower", "goblin", ...]
}
```

**Example:**
```bash
curl http://localhost:2567/api/mob-types/spear_thrower
```

---

### GET /api/mob-types/:id/stats

Returns combat stats for a specific mob type (merged with defaults).

**Path Parameters:**
- `id` (string): Mob type identifier

**Response:**
```json
{
  "mobTypeId": "spear_thrower",
  "stats": {
    "radius": 4,
    "maxHealth": 100,
    "currentHealth": 100,
    "attackDamage": 10,
    "attackRange": 5,
    "attackDelay": 1000,
    "defense": 0,
    "armor": 0,
    "density": 1,
    "chaseRange": 20
  }
}
```

**Example:**
```bash
curl http://localhost:2567/api/mob-types/spear_thrower/stats
```

---

### GET /api/game-config

Returns game configuration constants.

**Response:**
```json
{
  "config": {
    "tickRate": 50,
    "serverFPS": 20,
    "worldWidth": 100,
    "worldHeight": 100,
    "mobSpeedRange": 60,
    "mobSpawnMargin": 10,
    "attackImpulseMultiplier": 0.5,
    "recoilImpulseMultiplier": 0.2,
    "minImpulse": 1,
    "maxImpulse": 20
  }
}
```

**Example:**
```bash
curl http://localhost:2567/api/game-config
```

---

### GET /api/mob-stats/default

Returns default mob stats (MOB_STATS constants).

**Response:**
```json
{
  "stats": {
    "radius": 4,
    "maxHealth": 100,
    "attackDamage": 10,
    "attackRange": 5,
    "attackDelay": 1000,
    "defense": 0,
    "armor": 0,
    "density": 1
  }
}
```

**Example:**
```bash
curl http://localhost:2567/api/mob-stats/default
```

---

### GET /api/rooms/:roomId/players

Returns list of players in a room (non-real-time data only).

**Path Parameters:**
- `roomId` (string): Room identifier

**Query Parameters:**
- `ids` (optional, string): Comma-separated list of player IDs to fetch. If not provided, returns all players.
  - Example: `?ids=session-abc,session-def`
- `ids[]` (optional, array): Alternative format for multiple IDs
  - Example: `?ids[]=session-abc&ids[]=session-def`

**Response:**
```json
{
  "roomId": "room-123",
  "players": [
    {
      "id": "session-abc",
      "sessionId": "session-abc",
      "name": "Player-123",
      "maxLinearSpeed": 20,
      "radius": 1.3,
      "maxHealth": 100,
      "currentHealth": 100,
      "isAlive": true,
      "attackDamage": 10,
      "attackRange": 5,
      "attackDelay": 1000,
      "defense": 0,
      "armor": 0,
      "density": 1,
      "isAttacking": false,
      "lastAttackedTarget": ""
    }
  ],
  "count": 1
}
```

**Note:** Real-time fields (`x`, `y`, `vx`, `vy`, `heading`, `isMoving`) are excluded and should be fetched via WebSocket.

**Examples:**
```bash
# Fetch all players
curl http://localhost:2567/api/rooms/room-123/players

# Fetch specific players by IDs
curl http://localhost:2567/api/rooms/room-123/players?ids=session-abc,session-def

# Alternative array format
curl "http://localhost:2567/api/rooms/room-123/players?ids[]=session-abc&ids[]=session-def"
```

---

### GET /api/rooms/:roomId/players/:playerId

Returns non-real-time data for a specific player instance.

**Path Parameters:**
- `roomId` (string): Room identifier
- `playerId` (string): Player session ID

**Response:**
```json
{
  "player": {
    "id": "session-abc",
    "sessionId": "session-abc",
    "name": "Player-123",
    "maxLinearSpeed": 20,
    "radius": 1.3,
    "maxHealth": 100,
    "currentHealth": 100,
    "isAlive": true,
    "attackDamage": 10,
    "attackRange": 5,
    "attackDelay": 1000,
    "defense": 0,
    "armor": 0,
    "density": 1,
    "isAttacking": false,
    "lastAttackedTarget": ""
  }
}
```

**Error Response (404):**
```json
{
  "error": "Player not found",
  "roomId": "room-123",
  "playerId": "invalid-id",
  "availablePlayers": ["session-abc", "session-def"]
}
```

**Example:**
```bash
curl http://localhost:2567/api/rooms/room-123/players/session-abc
```

---

## Client Usage

### React Client

Use the `gameDataManager` utility:

```typescript
import { gameDataManager } from './utils/gameDataManager'

// Fetch mob types list
const mobTypes = await gameDataManager.getMobTypesList()

// Fetch specific mob type
const mobType = await gameDataManager.getMobType('spear_thrower')

// Fetch game config
const config = await gameDataManager.getGameConfig()

// Fetch all players in a room
const allPlayers = await gameDataManager.getRoomPlayers('room-123')

// Fetch specific players by IDs
const specificPlayers = await gameDataManager.getRoomPlayers('room-123', ['session-abc', 'session-def'])

// Fetch specific player (single)
const player = await gameDataManager.getPlayerInstance('room-123', 'session-abc')

// Preload all mob types (on app start)
await gameDataManager.preloadMobTypes()
```

### Caching

All endpoints are cached client-side. Use `forceRefresh: true` to bypass cache:

```typescript
const mobType = await gameDataManager.getMobType('spear_thrower', true)
```

---

## Performance Benefits

### Before (Real-time Sync)
- All mob data synced every tick (~20 times/second)
- Static fields (mobTypeId, stats, etc.) sent repeatedly
- Estimated: ~500-1000 bytes per mob per second

### After (REST API)
- Static data fetched once on demand
- Only dynamic fields synced in real-time (position, velocity, health)
- Estimated: ~50-100 bytes per mob per second
- **~90% reduction in bandwidth**

---

## Error Handling

All endpoints return standard HTTP status codes:
- `200 OK`: Success
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses include an `error` field with a descriptive message.

---

## CORS

All endpoints support CORS and can be accessed from any origin (configured for development). For production, restrict origins in `colyseus-server/src/index.ts`.

