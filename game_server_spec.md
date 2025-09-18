# 🎮 `atlas-world-svc` — Game Server Specification (2.5D Realtime)

## 0) Overview
Authoritative realtime simulator responsible for match/map instances. Implements a 2.5D model (per-floor 2D physics + 3D visual metadata), AOI, skills, and snapshots.

- **Tick/time:** 30 Hz server tick, 60 Hz physics sub-step, ~25 Hz snapshots.
- **Transport:** WebSocket (binary) first; optional WebRTC DC later.
- **Scale target (per instance):** 150–300 players, ~100 monsters, ~200 AoEs.
- **Orchestration:** Deployed as Agones `GameServer` Pod; allocated via Nakama/Router.

---

## 1) Responsibilities & Boundaries
**Owns**
- Authoritative state for one *map instance* (players, monsters, AoEs).
- Physics & collision (Planck.js per floor).
- AOI filtering, delta snapshots, reliable events.
- Skill/cooldown rules, damage application.
- Token verification (admit/deny player connections).

**Delegates**
- Auth, matchmaking, social, leaderboards, storage → **Nakama**.
- Lifecycle (start/allocate/shutdown), capacity → **Agones**.

---

## 2) Process & Lifecycle
1. **Boot:** load map bundles (`config.json`, `level-colliders.json`, `slopes.json`, `portals.json`).
2. **Agones Ready:** call `SDK.Ready()`; start health pings `SDK.Health()`.
3. **Allocated:** on allocation, start accepting player connections.
4. **Run:** tick loop until empty or timed shutdown.
5. **Shutdown:** graceful drain; `SDK.Shutdown()`; exit 0.

**Drain policy**
- Reject new joins when `players >= capacity` or `shutdown_at` scheduled.
- Persist match summary via Nakama RPC (`/match/summary`) if configured.

---

## 3) Network API

### 3.1 Endpoints
- **WebSocket**: `ws://<address>:<port>/game`
  - Querystring: `?t=<joinToken>`
  - Protocol: binary frames
- **Health (HTTP)**: `GET /healthz` → `200 OK`
- **Metrics (HTTP)**: `GET /metrics` (Prometheus)

### 3.2 Admission (token)
- **Join token** (JWT/HMAC) issued by Nakama:
  - Claims: `sub=userId`, `mapKey`, `instanceId`, `exp`, `region`, `build`.
  - Verify signature + expiry + `instanceId` matches process.

### 3.3 Wire Messages (binary)
**Frame header (all)**
```
u8  type    // 1=INPUT, 2=SNAPSHOT, 3=EVENT, 9=PONG
u16 seq
u32 serverTimeMs
```

**Client → Server**
- `INPUT` (type=1):
  ```
  u16 inputSeq
  i8  moveX, i8 moveY        // -100..100 (normalized*100)
  u8  castId                 // 0 if none
  u16 usePortalId            // 0 if none
  u8  flags                  // sprint, block, etc.
  ```

**Server → Client**
- `SNAPSHOT` (type=2):
  ```
  u16 ackInputSeq
  u16 count
  repeat count:
    u32 id
    u8  kind     // 0 player,1 monster,2 aoe
    u8  floor
    i16 xQ, i16 yQ       // pos * 10 (decimeters)
    i16 dirQ             // radians * 100
    u16 hp               // 0xFFFF if unchanged by delta
    u16 flags
  ```
- `EVENT` (type=3) subtypes (compact):
  - `Spawn, Despawn`
  - `CastStart{caster,skill}`
  - `CastHit{caster,targets[]}`
  - `Death{id,killer}`
  - `FloorChanged{toFloor(u8), exitX(i16), exitY(i16), travelMs(u16)}`
  - `Error{code,msgId}`

**Backpressure**
- Ring buffer per connection; **drop oldest pending SNAPSHOT** if full; never queue indefinitely.

---

## 4) Simulation Model

### 4.1 Timing
- `tickRate = 30` (tick every 33.33ms)
- Physics sub-step: `1/60s` accumulator.
- Snapshots: **time-based** at ~25 Hz (every ~40ms).
- AI: **6–10 Hz** (every 3–5 ticks).
- AoE pulses: **10–15 Hz** (every 2–3 ticks).

### 4.2 AOI (Interest Management)
- Per-floor grid, **cell≈32×32m**.
- Each player subscribes to **3×3** cells around self (expand temporarily for speed/telegraphs).
- **Budget:** 15–25 entities per client/update; prioritize by distance & activity.

### 4.3 Physics (Planck.js, 2D)
- Static fixtures from `level-colliders.json` (box/circle/convex poly/edge).  
  - Concave shapes must be triangulated on export.
- Dynamic bodies:
  - Player: circle r≈0.35, `fixedRotation=true`
  - Monster: circle/box by type
  - Projectile: circle or raycast
- Filters: `categoryBits/maskBits` mirroring Unity layers.

### 4.4 Slopes & Portals
- **Slopes:** not colliders; provide gradient + speed multipliers.  
  - Server applies speed mul (uphill/downhill) & audits elevation.
- **Portals:** polygon triggers for floor transfer with `travelMs`.

---

## 5) Data & State

### 5.1 Runtime State (RAM)
- `players: Map<userId, PlayerState>`
- `monsters: Map<u32, MonsterState>`
- `aoes: Map<u32, AoEState>`
- `worlds: Map<floor, planck.World>`
- `aoi: Map<floor, GridIndex>`
- `slopes, portals, cfg`

### 5.2 Persistence
- Long-term (account, inventory, leaderboards): via Nakama APIs only.
- Match summary (optional): on shutdown.

---

## 6) Systems

### 6.1 Movement
- Clamp input rate; last-wins per tick.
- Accel & max-speed caps; friction on idle.
- Physics step (60 Hz) updates authoritative pos/vel.

### 6.2 Skills & AoE
- Server validates cooldowns, resources, ranges.
- AoE represented as 2D circle/box/cone; pulses on cadence.
- Overlap tests limited to AOI cells only.

### 6.3 AI
- Perception via AOI; simple FSM (idle→chase→attack).
- 2D navmesh per floor (optional); portals as nav links.
- Runs 6–10 Hz, never every tick.

---

## 7) Configuration

### 7.1 Environment Variables
- `MAP_KEY` — template/map name.
- `REGION` — region tag (e.g., ap-southeast-1).
- `BUILD_ID` — build/patch version.
- `CAPACITY` — max players (default 300).
- `TICK_RATE=30`, `PHYS_HZ=60`, `SNAPSHOT_HZ=25`.
- `PORT=7350` — game socket port.
- `METRICS_PORT=9090`, `HEALTH_PORT=8080`.
- `NAKAMA_RPC_URL` — optional for summary/persistence.
- `TOKEN_PUBLIC_KEY` or `TOKEN_HMAC_SECRET` — join token verify.

### 7.2 Files
- `/data/config.json`, `/data/level-colliders.json`, `/data/slopes.json`, `/data/portals.json`.

---

## 8) Health, Readiness, and Draining
- **Agones SDK**:
  - `Ready()` on boot complete.
  - `Health()` every 2s.
  - `Shutdown()` on drain complete.
- **HTTP**:
  - `GET /healthz` → 200 when main loop healthy.
  - `GET /readyz` → 200 when accepting joins.
- **Drain triggers**: empty-server timeout, admin RPC, version mismatch.

---

## 9) Metrics (Prometheus)
- `atlas_world_tick_duration_ms{p50,p95}`
- `atlas_world_phys_step_ms{p50,p95}`
- `atlas_world_snapshot_bytes_total`
- `atlas_world_unreliable_drops_total`
- `atlas_world_entities{type,floor}`
- `atlas_world_aoi_entities_avg`
- `atlas_world_gc_pause_ms{p50,p95}`
- `atlas_world_connects_total`, `atlas_world_denied_total{reason}`

---

## 10) Security
- **Token verify** on join (signature, exp, instanceId).
- **Input clamp** (rate + magnitude).
- **Sanity caps** (speed, cast range, AoE size/duration).
- **Bundle hash** check for map data.
- **No trust** of client Y/elevation (computed client-side for visuals only; server audits via slope).

---

## 11) Build & Run

### 11.1 Dockerfile (Node 20)
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
EXPOSE 7350 8080 9090
CMD ["node", "dist/server.js"]
```

### 11.2 Agones Fleet (HostPort)
```yaml
apiVersion: "agones.dev/v1"
kind: Fleet
metadata:
  name: atlas-world-fleet
spec:
  replicas: 10
  template:
    spec:
      ports:
      - name: game
        portPolicy: HostPort
        containerPort: 7350
        hostPort: 7350
        protocol: TCP
      template:
        spec:
          containers:
          - name: atlas-world
            image: ghcr.io/yourorg/atlas-world-svc:1.0.0
            env:
            - name: MAP_KEY
              value: "TowerF5"
            - name: CAPACITY
              value: "300"
```

---

## 12) Testing & Soak
- **Bot harness** (headless clients) @ 30–60 Hz input.
- Scenarios: hotspot clustering, AoE spam, portal churn, reconnect storm.
- **Soak** 60 min at target load; assert:
  - tick p50 ≤ 7ms, p95 ≤ 20ms
  - phys p50 ≤ 5ms
  - per-client ≤ 40KB/s avg
  - no memory creep or queue build-up

---

## 13) Migration Hooks
- **WebRTC DC** for unreliable fast lane (keep WS reliable).
- **Rust sidecar** for hot loops if CPU-bound.
- **3D physics service** (Rapier) with compatible packet schema (extend with Z).

---
