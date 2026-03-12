# 🎮 Realtime Game Server — Server-Side Spec (2.5D Layered)

## 🎯 Scope & Targets
- **Per map:** 150–300 players, ~100 monsters, ~50 companions, ~200 active AoEs
- **Authoritative:** movement, collisions, skills, cooldowns, floor changes
- **Timings:** 30 Hz server tick, 60 Hz physics sub-step, ~25 Hz AOI snapshots
- **Latency feel:** <120 ms perceived (prediction + 100–150 ms interp buffer)

## 🧱 Stack
- **Runtime:** Nakama server with **TypeScript** modules (`@heroiclabs/nakama-runtime`)
- **Physics:** **Planck.js** (Box2D) per floor (2D)
- **Transport:** WebSocket (binary) now; optional WebRTC DC later for unreliable fast lane
- **Storage:** Postgres via Nakama storage APIs (durable data only)
- **Observability:** Prometheus metrics + Grafana, JSON logs (Loki optional)
- **Orchestration:** Agones (1 match = 1 pod), Redis for presence/match routing

## 🗂 Folder Layout (server repo)
```
my-nakama/
├─ docker-compose.yml
├─ nakama-game-server-config.yml    # Nakama config
├─ modules/ts/
│  ├─ package.json / tsconfig.json
│  ├─ index.ts                       # register RPCs + matches
│  ├─ matches/battle.ts              # main match handler
│  ├─ physics/world.ts               # Planck world build/step
│  ├─ physics/bodies.ts              # player/monster factories
│  ├─ world/loader.ts                # import JSON (colliders/portals/slopes/config)
│  ├─ net/aoi.ts                     # grid AOI index & queries
│  ├─ net/codec.ts                   # binary pack/unpack (pools)
│  ├─ systems/movement.ts            # input → velocity (caps, accel)
│  ├─ systems/ai.ts                  # 6–10 Hz monster logic
│  ├─ systems/aoe.ts                 # 10–15 Hz AoE pulses & overlaps
│  ├─ events/reliable.ts             # spawn/despawn/cast/hit/death/floorChanged
│  └─ metrics/prom.ts                # tick, physics, bytes/sec, GC, entities
└─ unity-tools/ (client repo)        # exporter lives on client side
```

## 🧩 Data Contracts

### 1) Static world bundles (Unity → server)
Delivered once per match (reliable). Versioned & hashed.

**config.json**
```ts
export interface WorldConfig {
  version: string;             // semantic + content hash
  unitScale: number;           // 1.0 => 1u = 1m
  floorHeight: number;         // e.g., 5.0 meters between floors
  layers: Record<string, number>; // bit masks (Player=0x1, World=0x4, etc.)
}
```

**level-colliders.json**
```ts
export type Shape2D =
  | { kind:"box", floor:number, cx:number, cy:number, w:number, h:number, angleDeg:number, layer:string }
  | { kind:"circle", floor:number, cx:number, cy:number, r:number, layer:string }
  | { kind:"polygon", floor:number, pts:[number,number][], layer:string }
  | { kind:"edge", floor:number, pts:[number,number][], layer:string };

export interface CollidersBundle { shapes: Shape2D[] }
```

**slopes.json**
```ts
export interface SlopeZone {
  id: string; floor: number;
  poly: [number,number][];      // 2D polygon (XZ)
  origin: {x:number,y:number};  // ref in same plane
  gradient: {x:number,y:number};// dHeight/dX, dHeight/dY
  baseHeight: number;           // meters
  maxClimbAngleDeg: number;
  upMul: number;                // 0.7–0.95
  downMul: number;              // 1.0–1.1
}
export interface SlopesBundle { zones: SlopeZone[] }
```

**portals.json**
```ts
export interface StairPortal {
  id: string;
  fromFloor: number; toFloor: number;
  region: [number,number][];       // trigger polygon
  exitPos: {x:number,y:number};
  travelMs: number;                 // animation/lock time
  requiresUse?: boolean;            // if true, needs input action
}
export interface PortalsBundle { portals: StairPortal[] }
```

### 2) Ephemeral authoritative state (server RAM)
```ts
export interface PlayerState {
  id: string; floor: number;
  x: number; y: number;            // 2D plane (XZ)
  vx: number; vy: number;
  dir: number;                      // radians (yaw projected)
  hp: number; mp: number;
  flags: number;                    // bitfield (stunned, transferring, etc.)
  transferUntil?: number;           // ms epoch
  pendingTransfer?: { toFloor:number, toPos:{x:number,y:number} };
  lastInputSeq: number;
}

export interface MonsterState { /* similar minimal fields */ }

export interface CompanionState {
  id: string; ownerId: string; floor: number;
  x: number; y: number;            // 2D plane (XZ)
  vx: number; vy: number;
  dir: number;                      // radians (yaw projected)
  hp: number; flags: number;
  currentBehavior: string;          // FSM state (idle, chase, attack)
  currentAttackTarget: string;
}

export interface AoEState {
  id: number; floor: number;
  kind: "circle" | "box" | "cone";
  x: number; y: number; r?: number; w?: number; h?: number; angle?: number;
  dps: number; periodMs: number; nextPulse: number; expiresAt: number;
  casterId: string;
}

export interface MatchState {
  tick: number;
  cfg: WorldConfig;
  world: PlanckByFloor;             // floor → planck.World
  aoi: AoiIndexByFloor;             // floor → grid index
  players: Map<string, PlayerState>;
  monsters: Map<number, MonsterState>;
  companions: Map<string, CompanionState>;
  aoes: Map<number, AoEState>;
  slopes: SlopesBundle;
  portals: PortalsBundle;
  nowMs: number;                    // server time cache
}
```

## ⏱ Timing Model
- **tickRate:** 30 Hz
- **Physics:** sub-step to 60 Hz
- **Snapshots:** ~25 Hz
- **AI:** 6–10 Hz
- **AoE pulses:** 10–15 Hz

## 🔁 Tick Pipeline
1. Ingest inputs
2. Apply intentions → Planck physics step
3. Portals & transfers
4. Slopes (movement modifiers)
5. AI (cadence)
6. AoE pulses
7. Build & send snapshots (~25 Hz)
8. Send reliable events
9. Record metrics

## 📡 Networking

**Client → Server**
- `INPUT`: movement vector, cast, usePortalId
- `PONG`: latency

**Server → Client**
- `SNAPSHOT`: AOI entities (id, floor, x, y, dir, hp, flags)
- `EVENT`: spawns, despawns, floor changes, casts, hits, deaths

## 📐 AOI (Interest Management)
- Grid size: ~32×32 m
- Subscription: 3×3 cells around player
- Budget: 15–25 entities per snapshot

## 🧮 Physics
- Static: colliders from 2D footprints
- Dynamic: players/companions = circles, monsters = circles/boxes
- AoEs = simple geometry checks
- Slopes = modifiers only (not colliders)

## 🧰 Systems
- Movement: input → velocity → Planck step
- Portals: trigger → lock input → transfer
- Slopes: speed mul, elevation audit
- AoE: pulses query AOI, apply damage
- AI: FSM, path on floor navmesh, 6–10 Hz (Monsters & Companions)

## 🔒 Security
- Server authoritative
- Input rate clamp
- Sanity caps
- Elevation audits
- Bundle hash validation

## 📊 Metrics
- Tick durations
- Physics step ms
- Snapshot bytes/sec
- Unreliable drops
- Entities per floor
- GC pauses

## 🎛 Budgets
- Tick time: ≤7 ms p50, ≤20 ms p95
- Physics: ≤5 ms p50
- Snapshot: ≤800 B avg
- Bandwidth: 20–40 KB/s per client
- AOI: 15–25 entities per snapshot

## 🧪 Testing
- Bot harness (30–60 Hz inputs)
- Hotspot clustering, AoE spam
- Soak tests at 300 players
- Chaos (loss, latency injection)

## 🛠 Migration hooks
- WebRTC DC for unreliable fast lane
- Rust sidecar for hot loops
- 3D physics service option (add Z fields)
