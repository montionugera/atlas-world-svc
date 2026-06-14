# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Real-time multiplayer game with a **split architecture**: **Colyseus** (`colyseus-server/`) owns the authoritative real-time simulation and state; **Nakama** owns meta-systems (auth, social, matchmaking) and allocates servers via **Agones**. The deployment model is **1 match = 1 room = 1 pod** — `GameRoom.maxClients` is currently `1` for single-player debugging, not the production cap (README targets 150–300 players/instance).

This is a **pnpm workspace** (`pnpm-workspace.yaml` → `colyseus-server`, `client`) but there is no root `package.json` with scripts — all build/test/run commands live inside each package and the README documents them as `npm`. Both work; pick one and stay consistent within a package.

## Commands

All commands run from inside a package directory.

**Server** (`cd colyseus-server`):
```bash
npm run dev          # ts-node src/index.ts (no watch)
npm run dev:watch    # nodemon + ts-node, watches src
npm run build        # tsc → dist/
npm start            # node dist/index.js (needs build first)
npm test             # jest (all tests)
npm test -- path/to/file.test.ts          # single test file
npm test -- -t "name of test"             # single test by name
npm run test:watch
npm run test:coverage
npm run format       # prettier --write src/**/*.ts
npm run format:check
```

**Client** (`cd client/react-client`):
```bash
npm start            # CRA dev server → http://localhost:3001
npm run build
npm test             # react-scripts test (React Testing Library)
```

**Docker / infra:**
```bash
docker-compose up -d atlas-colyseus-server   # build + run server only
./migrate.sh                                  # Nakama DB migration (runs inside Nakama container)
```

Husky + lint-staged run `prettier --write` on `colyseus-server/src/**/*.ts` at commit time.

## Service endpoints (local)

- `ws://localhost:2567` — Colyseus WebSocket (room id `game_room`)
- `http://localhost:2567/api` — REST for static/room data (mobs, configs); `/health`, `/rooms`
- `http://localhost:3001` — React client
- `http://localhost:9091/metrics`, Grafana `http://localhost:3000` (admin/admin)

## Server architecture (the part worth reading code to understand)

Everything is composed in **`rooms/GameRoom.ts`** — this is the wiring hub. `onCreate` constructs the core managers and handlers, connects their dependencies, and starts the loop. Read this file first to understand how a room is assembled.

**Managers** (`src/modules/`, owned by the room, mutate `GameState`):
- `PlanckPhysicsManager` (`src/physics/`) — Planck.js bodies in **world units**.
- `BattleManager` / `BattleModule` — all combat/damage logic. `BattleModule.ts` is large and central; combat must be centralized here, never duplicated in emitters or systems.
- `ProjectileManager` — projectile factories + lifecycle (see invariants below).
- `ZoneEffectManager`, `MobLifeCycleManager`.

**Handlers** (`src/rooms/handlers/`) — `PlayerInputHandler`, `DebugCommandHandler`, `RoomEventHandler` register Colyseus message + EventBus listeners.

**The simulation loop** is a single ordered pass in `src/rooms/systems/GameSimulationSystem.update(deltaTime)`: physics → projectiles → players → AI → mob lifecycle → mobs → NPCs → projectile cleanup → zone effects → battle message processing. Order matters; new per-tick work goes here in the right slot.

**State** (`src/schemas/`) — `@colyseus/schema` classes. `GameState.ts` is the root and also holds non-synced references (`battleManager`, `mobLifeCycleManager`, `aiModule`, `worldInterface`). `Entity.ts` → `Player`/`Mob`/`NPC`/`Projectile`/`WorldLife`. `@type`-annotated fields replicate to clients; server-only fields (internal cooldowns/flags) stay off sync.

**AI** (`src/ai/`) — `AIModule` (started/stopped by the room) with `behaviors/`, `strategies/`, `core/`, `interfaces/`. Combat systems for each actor type live in `src/systems/` (`MobCombatSystem`, `NPCCombatSystem`, `PlayerCombatSystem`).

**Events** (`src/events/`) — `EventBus` carries room-scoped events; emitters hand off to `BattleManager` to enqueue damage rather than applying it inline.

**REST API** (`src/api/`) — `createApiRouter(gameServer)` mounted at `/api`; rooms self-register via `registerRoom`/`unregisterRoom` so handlers can read live room state.

## Non-obvious invariants (from `.cursor/rules/` — enforce these)

- **Server-authoritative, always.** Never accept position/velocity from clients; they send input intents only (move vectors, discrete actions). All HP/combat mutation is server-side.
- **Single-path APIs.** Constructors/methods take one options object — no positional overloads, no boolean flag params that branch behavior. Use explicit keys (`mode: "attack" | "chase"`, `maxLinearSpeed`).
- **Entity lifecycle via transition methods.** Call `entity.die()` (sets flags + timestamps + side effects atomically); never set `entity.isAlive = false` by hand. For **creation** count TOTAL entities (active + inactive) to avoid over-spawning; for **capacity** count ACTIVE only. Use helper checks like `readyToBeRemoved(delay)` for cleanup — not inline `!isActive`.
- **Projectiles.** `ProjectileManager.createMelee` → `piercing = true` (cleave); `createSpear`/ranged default `piercing = false`. On a valid hit, non-piercing projectiles call `stick()` to stop; piercing keep flying. **When `stick()` zeroes `vx`/`vy`, you must call `physicsManager.syncEntityToBody(projectile, projectile.id)` in the same collision path** (in `RoomEventHandler`) or the Planck body keeps sliding until the next tick. Despawn rules live in `Projectile.shouldDespawn()`.
- **Units & timing.** Physics is in world units; rendering multiplies by `scale` (positions *and* radii). `heading` is an angle in radians — derive vectors via `(cos, sin)`. Use `performance.now()` for gameplay timing/cooldowns end-to-end; do not mix with `Date.now()` for deltas.
- **Tick reality vs README.** README/specs advertise 30 Hz, but `config/gameConfig.ts` currently runs `tickRate = 50` ms (**20 FPS**), and `GameRoom` sets `setPatchRate(50)`. Trust the config for actual behavior; treat the 30 Hz/p50 budgets as targets, not current settings.

## Tests

Jest (ts-jest) under `colyseus-server/src/tests/*.test.ts` (~55 files) plus `src/api/tests/`. Prefer adding tests next to existing ones; cover cooldown/timing, cone-angle wrapping, range checks, and collision → damage-queue flows for combat changes. Inject/mock timing to avoid flakiness.

## Conventions

- TypeScript strict mode; no unjustified `any`. Prettier + ESLint must pass.
- Trunk-based: short-lived `feature/`, `fix/`, `docs/` branches off `main`; **squash-merge only**; conventional commit subjects (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`), kept short.
- This repo is opted into **ps-release-workflow** (`.release.json` present) — backlog/feature work routes through `/ps-release-workflow:*` skills and `.claude/idea_backlog/` + `.claude/refined_backlog/`.
- C# Unity client models are generated into `colyseus-server/generated/csharp/` and kept in sync with server schemas.

## Further docs

`docs/` holds the authoritative specs — notably `docs/event-flow.spec.md`, `docs/game-server.spec.md`, `docs/companion.spec.md`. `.cursor/rules/*.mdc` contain the full coding-standard set summarized above.
