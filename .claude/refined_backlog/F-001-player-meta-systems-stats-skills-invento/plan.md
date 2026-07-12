# Player Meta-Systems (F-001) — Multi-Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Multi-lane:** Phase 0 is sequential and freezes every inter-lane interface. Phase 1 runs as 4 parallel subagent lanes, each in its own git worktree. Phase 2 integrates. The orchestrator (main session) dispatches all Phase-1 lanes in ONE message.

**Goal:** Persistent player stats, skills, inventory, and quests: Nakama (+CockroachDB) as durable home, Colyseus loads/reports via S2S, Flutter renders all meta-UI.

**Architecture:** Per spec `docs/superpowers/specs/2026-07-09-player-meta-systems-design.md` — definitions in a new `contracts/` pnpm workspace package; player state in Nakama storage collections mutated only via RPCs; Colyseus fetches a loadout snapshot at join and flushes idempotent event batches; Nakama's quest engine owns quest rules and pushes realtime notifications to Flutter.

**Tech Stack:** Nakama 3.x (TS runtime, heroiclabs/nakama:3.21.1), CockroachDB, Colyseus (existing), zod, jest/ts-jest, Flutter + `nakama` Dart SDK (joymify-app repo).

## Global Constraints

- TypeScript strict mode, no unjustified `any`; prettier + eslint must pass (`npm run format:check`).
- Use `performance.now()` for gameplay timing in colyseus-server; never mix with `Date.now()` for deltas.
- Single-path APIs: one options-object per constructor/method, no boolean branching flags.
- Conventional commits, short subjects; **new commits only, never `git commit --amend`**.
- Every task ends with the phased quality gate: implement → verify (run the command, read output) → review → refactor → re-verify.
- Storage collections and RPC ids come from `contracts/src/meta/ids.ts` — never hardcode strings at call sites.
- All Nakama writes go through RPCs; client read permission 2 (owner read), write permission 0 (no client writes).

## Lane map & dependencies

```
Phase 0 (sequential, feature worktree):  T0.1 contracts pkg → T0.2 nakama+db compose
Phase 1 (parallel, one worktree per lane):
  Lane A  nakama/ runtime          (depends: T0.1, T0.2)
  Lane B  colyseus-server/ meta    (depends: T0.1 only — uses FakeMetaBackend)
  Lane C  contracts/ content       (depends: T0.1)
  Lane D  joymify-app Flutter UI   (separate repo; depends: T0.1 shapes + T0.2 for live testing)
Phase 2 (sequential, after A+B+C merge): E2E integration, onAuth token verify, docs
```

Merge order back into the F-001 feature branch: **C → A → B** (C defines catalogs A consumes at runtime-load; B only shares `contracts` imports). Lane D merges in joymify-app whenever ready.

---

# Phase 0 — Interface freeze (sequential; blocks all lanes)

### Task 0.1: `contracts` workspace package with all shared meta types

**Files:**
- Create: `contracts/package.json`, `contracts/tsconfig.json`, `contracts/jest.config.js`
- Create: `contracts/src/meta/ids.ts`, `contracts/src/meta/types.ts`, `contracts/src/meta/schemas.ts`, `contracts/src/index.ts`
- Test: `contracts/src/meta/schemas.test.ts`
- Modify: `pnpm-workspace.yaml` (add `contracts`)

**Interfaces:**
- Consumes: nothing.
- Produces (every lane imports these — exact):
  - `COLLECTIONS = { profile:'profile', inventory:'inventory', equipment:'equipment', skills:'skills', quests:'quests' }`, `STORAGE_KEY = 'main'`
  - `RPC = { getLoadout:'get_loadout', reportMatchEvents:'report_match_events', grantLoot:'grant_loot', grantXp:'grant_xp', equipItem:'equip_item', allocateStats:'allocate_stats', setSkillLoadout:'set_skill_loadout', acceptQuest:'accept_quest', claimQuestReward:'claim_quest_reward' }`
  - `PrimaryStats { str:number; agi:number; int:number; vit:number }`
  - `ProfileDoc { schemaVersion:1; level:number; xp:number; statPoints:number; allocated:PrimaryStats }`
  - `InventoryDoc { schemaVersion:1; stackables:{itemId:string;qty:number}[]; uniques:{instanceId:string;itemId:string}[] }`
  - `EquipmentDoc { schemaVersion:1; slots:{ weapon?:string; armor?:string; accessory?:string } }`
  - `SkillsDoc { schemaVersion:1; unlocked:{skillId:string;level:number}[]; loadout:string[] }` (loadout max 4)
  - `QuestsDoc { schemaVersion:1; active:{questId:string;startedAt:number;objectives:Record<string,number>}[]; completed:{questId:string;completedAt:number;claimed:boolean}[] }`
  - `MatchEventType = 'MOB_KILLED'|'ITEM_PICKED_UP'|'ZONE_ENTERED'`
  - `MatchEvent { type:MatchEventType; userId:string; targetId:string; count:number }`
  - `MatchEventBatch { matchId:string; seq:number; events:MatchEvent[] }`
  - `LoadoutSnapshot { schemaVersion:1; profile:ProfileDoc; equippedItemIds:{weapon?:string;armor?:string;accessory?:string}; skillLoadout:string[]; activeQuestIds:string[] }`
  - zod schema per doc: `profileDocSchema`, `inventoryDocSchema`, `equipmentDocSchema`, `skillsDocSchema`, `questsDocSchema`, `matchEventBatchSchema`, `loadoutSnapshotSchema` (each `z.ZodType` of the above, `.strict()`)
  - `DEFAULT_PROFILE: ProfileDoc = { schemaVersion:1, level:1, xp:0, statPoints:0, allocated:{str:1,agi:1,int:1,vit:1} }` and `defaultDoc(collection)` factory for the other four.

- [ ] **Step 1: Scaffold package + failing test.** `contracts/package.json`: name `@atlas/contracts`, scripts `test: jest`, `build: tsc`, devDeps `typescript`, `jest`, `ts-jest`, `@types/jest`, dep `zod@^3`. Copy `jest.config.js` preset from `colyseus-server/jest.config.js` (ts-jest). Add `- contracts` to `pnpm-workspace.yaml`. Test first:

```ts
// contracts/src/meta/schemas.test.ts
import { profileDocSchema, matchEventBatchSchema, DEFAULT_PROFILE } from './schemas'

test('DEFAULT_PROFILE validates', () => {
  expect(profileDocSchema.parse(DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE)
})
test('unknown keys are rejected (strict)', () => {
  expect(() => profileDocSchema.parse({ ...DEFAULT_PROFILE, hax: 1 })).toThrow()
})
test('batch requires monotonic-friendly shape', () => {
  const b = { matchId: 'm1', seq: 0, events: [{ type: 'MOB_KILLED', userId: 'u1', targetId: 'boar', count: 1 }] }
  expect(matchEventBatchSchema.parse(b)).toEqual(b)
})
```

- [ ] **Step 2: Run to fail.** `cd contracts && pnpm install && pnpm test` → FAIL (module not found).
- [ ] **Step 3: Implement** `ids.ts` (COLLECTIONS, STORAGE_KEY, RPC as `as const`), `types.ts` (interfaces above), `schemas.ts` (zod schemas + `DEFAULT_PROFILE` + `defaultDoc`), `index.ts` re-exports.
- [ ] **Step 4: Run to pass.** `pnpm test` → 3 passed. Also `pnpm build` → exit 0.
- [ ] **Step 5: Commit.** `git add contracts pnpm-workspace.yaml && git commit -m "feat(contracts): meta types, ids, zod schemas (F-001 T0.1)"`

### Task 0.2: Nakama + CockroachDB in docker-compose

**Files:**
- Modify: `docker-compose.yml`
- Create: `nakama/local.yml` (Nakama config: `runtime.js_entrypoint: index.js`, console user/pass for local, `session.http_key: atlas_dev_http_key`)

**Interfaces:**
- Produces: Nakama HTTP `http://localhost:7350` (`http_key=atlas_dev_http_key` for S2S), console `http://localhost:7351`, CockroachDB `26257`. Service names `atlas-nakama`, `atlas-database` on the existing `atlas-network`.

- [ ] **Step 1: Add services.** `atlas-database`: image `cockroachdb/cockroach:latest-v23.1`, command `start-single-node --insecure --store=attrs=ssd,path=/var/lib/cockroach/`, volume `atlas_database_data:/var/lib/cockroach`, healthcheck `curl -f http://localhost:8080/health?ready=1`. `atlas-nakama`: image `heroiclabs/nakama:3.21.1`, entrypoint runs `/nakama/nakama migrate up --database.address root@atlas-database:26257` then `exec /nakama/nakama --config /nakama/data/local.yml --database.address root@atlas-database:26257`, volume `./nakama:/nakama/data`, ports `7349-7351`, `depends_on: atlas-database: condition: service_healthy`.
- [ ] **Step 2: Verify.** `docker-compose up -d atlas-database atlas-nakama && sleep 15 && curl -s http://localhost:7350/ | head -1` → JSON (Nakama banner) and `docker-compose ps` shows both healthy/running.
- [ ] **Step 3: Commit.** `git commit -m "feat(infra): nakama + cockroachdb services (F-001 T0.2)"`

---

# Phase 1 — Parallel lanes

> Orchestrator: dispatch Lanes A–D as 4 subagents **in one message**, each with `isolation: worktree` (Lane D targets `~/workspace/repos/joymify-app`, branch `feature/meta-ui-nakama`). Each lane runs subagent-driven development internally (per-task TDD + review). Lanes must not modify files outside their lane's directory list.

## Lane A — Nakama runtime (`nakama/`) — depends T0.1+T0.2

### Task A1: TS runtime scaffold that builds to `nakama/build/index.js`

**Files:**
- Create: `nakama/package.json`, `nakama/tsconfig.json`, `nakama/rollup.config.mjs` (or esbuild script), `nakama/src/main.ts`, `nakama/jest.config.js`
- Modify: `docker-compose.yml` (mount `./nakama/build:/nakama/data/modules`), `nakama/local.yml` (`runtime.js_entrypoint: modules/index.js`)

**Interfaces:**
- Consumes: `@atlas/contracts` (workspace dep).
- Produces: `InitModule` registering all RPC ids from `RPC`; `nakama/src/deps.ts` exporting `type Nk = nkruntime.Nakama` helpers for testability.

- [ ] Step 1: package with `nakama-runtime` devDep (types), build script bundling `src/main.ts` → `build/index.js` (single file, ES5-compatible per Nakama JS runtime docs — Context7 lookup `heroiclabs/nakama` runtime docs if needed).
- [ ] Step 2: `main.ts` `InitModule` registers a `healthcheck` RPC returning `{"ok":true}`. Build, `docker-compose restart atlas-nakama`, then verify: `curl -s "http://localhost:7350/v2/rpc/healthcheck?http_key=atlas_dev_http_key&unwrap" -d '{}'` → `{"ok":true}`.
- [ ] Step 3: Commit `feat(nakama): TS runtime scaffold + healthcheck RPC (A1)`.

### Task A2: storage repo helpers + profile + `grant_xp`

**Files:**
- Create: `nakama/src/storage.ts`, `nakama/src/leveling.ts`, `nakama/src/rpc/grantXp.ts`
- Test: `nakama/src/leveling.test.ts`, `nakama/src/storage.test.ts` (pure parts, jest with mocked `nkruntime`)

**Interfaces:**
- Produces (used by A3/A4):
  - `readDoc<T>(nk, userId, collection): { doc: T; version: string }` — creates `defaultDoc(collection)` on miss; runs `migrateDoc(collection, raw)` when `raw.schemaVersion < CURRENT`.
  - `writeDoc(nk, userId, collection, doc, version)` — conditional write (throws on version conflict); permissions read=2/write=0.
  - `xpToNext(level:number): number` = `100 * level` (pinned). `applyXp(profile, amount): ProfileDoc` — loops level-ups, +3 statPoints per level.
  - `grant_xp` RPC (S2S only: reject when `ctx.userId` is set): payload `{ userId:string, amount:number }`.

- [ ] Step 1: failing jest for `applyXp`: `applyXp(DEFAULT_PROFILE, 250)` → level-ups at 100 then 200 → assert `{level:2, xp:150, statPoints:3}`.
- [ ] Step 2: implement `leveling.ts` pure; pass.
- [ ] Step 3: `storage.ts` using `nk.storageRead/storageWrite` with version; unit-test migration path with a stubbed `nk`.
- [ ] Step 4: `grantXp.ts` RPC: guard `if (ctx.userId) throw 'server-only'`; read profile → `applyXp` → conditional write, one retry on conflict. Verify live via curl RPC with http_key.
- [ ] Step 5: Commit `feat(nakama): profile storage, leveling, grant_xp (A2)`.

### Task A3: inventory/equipment/skills RPCs

**Files:**
- Create: `nakama/src/rpc/grantLoot.ts`, `nakama/src/rpc/equipItem.ts`, `nakama/src/rpc/allocateStats.ts`, `nakama/src/rpc/setSkillLoadout.ts`
- Test: `nakama/src/rpc/inventory.test.ts` (pure helpers `addLoot(doc, itemId, qty|unique)`, `equip(equipDoc, invDoc, slot, instanceId)`)

**Interfaces:**
- Consumes: `readDoc`/`writeDoc` (A2), item catalog from `@atlas/contracts` (C2) — until C merges, use `isStackable(itemId)` stub reading a local `TEST_ITEMS` map, replaced in Phase 2 Task I1 (explicit, not silent).
- Produces: client RPCs `equip_item {slot, instanceId}`, `allocate_stats {str,agi,int,vit}` (validates against `statPoints`), `set_skill_loadout {loadout: string[]}` (≤4, must be unlocked); S2S `grant_loot {userId, itemId, qty}`.

- [ ] Step 1: failing tests for `addLoot` (stack merge; unique gets `instanceId` = injected `uuid()`) and `equip` (rejects instanceId not in inventory).
- [ ] Step 2: implement pure helpers; pass.
- [ ] Step 3: wire 4 RPCs (client ones read `ctx.userId`, reject unauthenticated; zod-parse payloads with schemas from contracts); curl-verify `equip_item` happy + reject paths with a dev session token.
- [ ] Step 4: Commit `feat(nakama): inventory, equipment, stats, skill-loadout RPCs (A3)`.

### Task A4: quest engine + `accept_quest` / `claim_quest_reward` / `report_match_events`

**Files:**
- Create: `nakama/src/questEngine.ts`, `nakama/src/rpc/quests.ts`, `nakama/src/rpc/reportMatchEvents.ts`
- Test: `nakama/src/questEngine.test.ts`

**Interfaces:**
- Consumes: `QuestDef { id:string; objectives:{id:string; type:MatchEventType; targetId:string; required:number}[]; rewards:{xp:number; items:{itemId:string;qty:number}[]} }` from `@atlas/contracts` (C2 shape, pinned here).
- Produces:
  - `applyEvents(doc: QuestsDoc, defs: QuestDef[], events: MatchEvent[]): { doc: QuestsDoc; progressed: string[]; completedNow: string[] }` — PURE, no nk.
  - `report_match_events` (S2S): payload `MatchEventBatch` + `userId`; dedupe via storage doc collection `quests_seq`, key `main`, per user `{ [matchId]: lastSeq }` — batch with `seq <= lastSeq` is a no-op returning `{deduped:true}`.
  - On progress: `nk.notificationSend(userId, 'quest_progress', {questId, objectives}, 1)`; on completion: code 2.
  - `claim_quest_reward {questId}`: only when completed && !claimed → grant xp+items via A2/A3 helpers in the same RPC, set `claimed:true`.

- [ ] Step 1: failing tests: kill 3/5 boars progresses; 5/5 moves quest to completed; duplicate batch (same seq) changes nothing; event for non-active quest ignored.
- [ ] Step 2: implement `applyEvents`; pass.
- [ ] Step 3: wire RPCs + dedupe doc + notifications; curl-verify a two-batch replay (second identical batch → `{deduped:true}`).
- [ ] Step 4: Commit `feat(nakama): quest engine, accept/claim, idempotent event ingest (A4)`.

### Task A5: `get_loadout` S2S RPC

**Files:**
- Create: `nakama/src/rpc/getLoadout.ts`; Test: `nakama/src/rpc/getLoadout.test.ts` (pure assembly)

**Interfaces:**
- Produces: S2S `get_loadout {userId}` → `LoadoutSnapshot` (assembles profile + equipment→itemIds via inventory + skills.loadout + active quest ids; zod-validated before return).

- [ ] Step 1: failing test for assembly from 4 stub docs. Step 2: implement; pass. Step 3: curl-verify. Step 4: Commit `feat(nakama): get_loadout snapshot RPC (A5)`.

## Lane B — Colyseus integration (`colyseus-server/`) — depends T0.1 only

### Task B1: `IMetaBackend` + `NakamaMetaBackend` + `FakeMetaBackend`

**Files:**
- Create: `colyseus-server/src/meta/IMetaBackend.ts`, `colyseus-server/src/meta/NakamaMetaBackend.ts`, `colyseus-server/src/meta/FakeMetaBackend.ts`
- Test: `colyseus-server/src/tests/nakama-meta-backend.test.ts` (against a tiny `http.createServer` stub)
- Modify: `colyseus-server/package.json` (add `"@atlas/contracts": "workspace:*"`)

**Interfaces:**
- Produces:
  - `interface IMetaBackend { verifySession(token:string): Promise<{userId:string}|null>; getLoadout(userId:string): Promise<LoadoutSnapshot|null>; reportMatchEvents(batch:MatchEventBatch & {userId:string}): Promise<'ok'|'deduped'|'failed'> }`
  - `NakamaMetaBackend` ctor: `({ baseUrl, httpKey, timeoutMs = 2000, retries = 3 })` — POST `/v2/rpc/<id>?http_key=...&unwrap`; `verifySession` = GET `/v2/account` with Bearer token. Exponential backoff 250ms·2^n.
  - `FakeMetaBackend` — in-memory, records batches (`batches: MatchEventBatch[]`), configurable `failNextN`.

- [ ] Step 1: failing test — backend retries a 500 twice then succeeds; returns 'failed' after `retries`. Step 2: implement; pass (`npm test -- nakama-meta-backend`). Step 3: Commit `feat(colyseus): IMetaBackend + Nakama impl + fake (B1)`.

### Task B2: `MetaEventReporter`

**Files:**
- Create: `colyseus-server/src/meta/MetaEventReporter.ts`; Test: `colyseus-server/src/tests/meta-event-reporter.test.ts`
- Modify: `colyseus-server/src/rooms/handlers/RoomEventHandler.ts` (emit MOB_KILLED etc. into reporter), `colyseus-server/src/rooms/GameRoom.ts` (construct/start/stop; flush in `onDispose`)

**Interfaces:**
- Consumes: `IMetaBackend` (B1), existing `EventBus` events.
- Produces: `MetaEventReporter` ctor `({ backend, matchId, flushIntervalMs = 5000, maxBuffer = 500 })`; methods `record(event: MatchEvent)`, `start()`, `stop()`, `flush(): Promise<void>` (increments `seq` only on 'ok'/'deduped'; on 'failed' keeps events in buffer; drops oldest past `maxBuffer` with a counted `console.warn`).

- [ ] Step 1: failing tests with FakeMetaBackend + injected fake timer: batches carry monotonic seq; failed flush retains events; buffer cap drops oldest and warns once with count.
- [ ] Step 2: implement; pass. Step 3: wire into GameRoom + RoomEventHandler (kill events include mob type id as `targetId`). Run full suite `npm test` → all green. Step 4: Commit `feat(colyseus): MetaEventReporter with idempotent batching (B2)`.

### Task B3: loadout at join + ephemeral fallback

**Files:**
- Modify: `colyseus-server/src/rooms/GameRoom.ts` (`onJoin`), `colyseus-server/src/schemas/Player.ts` (apply snapshot: level/allocated feed `recalculateStats`; add server-only `isEphemeral: boolean`)
- Test: `colyseus-server/src/tests/join-loadout.test.ts`

**Interfaces:**
- Consumes: `IMetaBackend.getLoadout` (B1), `derivedStats` from `@atlas/contracts` (C1 — pinned signature `derivedStats({ level, allocated, weaponItemId? }): { maxHealth,pAtk,mAtk,pDef,mDef,maxMoveSpeed }`).
- Produces: `applyLoadout(player: Player, snap: LoadoutSnapshot): void`; join flow: `getLoadout` → on null after backend retries, `player.isEphemeral = true` + `console.error('[meta] ephemeral join', userId)` and defaults stay.

- [ ] Step 1: failing tests: snapshot with level 5 → player stats = `derivedStats` output; backend null → `isEphemeral=true` and default stats. Step 2: implement; pass; full `npm test` green. Step 3: Commit `feat(colyseus): loadout snapshot application at join (B3)`.

### Task B4: simulation integration test

**Files:**
- Test: extend `colyseus-server/src/tests/game-simulation-integration.test.ts`

- [ ] Step 1: scenario — player kills a mob over real ticks; assert FakeMetaBackend received a batch containing `{type:'MOB_KILLED', targetId:<mobType>}` with seq 0, and a dispose-flush drains the buffer. Step 2: green; commit `test(colyseus): meta event flow in simulation loop (B4)`.

## Lane C — Content + codegen (`contracts/`) — depends T0.1

### Task C1: `derivedStats` pure function

**Files:** Create `contracts/src/meta/derivedStats.ts`; Test `contracts/src/meta/derivedStats.test.ts`

**Interfaces:**
- Produces (B3 + Flutter display + Nakama use the SAME numbers): `derivedStats({ level, allocated, weaponItemId? }: { level:number; allocated:PrimaryStats; weaponItemId?:string })` → `{ maxHealth: 100 + 10*vit + 5*(level-1), pAtk: 10 + 2*str + weapon.pAtk, mAtk: 10 + 2*int + weapon.mAtk, pDef: 5 + vit, mDef: 5 + int, maxMoveSpeed: 20 + 0.2*agi }` (weapon terms 0 when no weapon; values pinned here, tune later in one place).

- [ ] Step 1: failing tests (level 1 defaults; level 5 str build with weapon). Step 2: implement; pass. Step 3: commit `feat(contracts): derivedStats shared formula (C1)`.

### Task C2: catalogs (items, skills, quests) + validation

**Files:** Create `contracts/content/items.json`, `contracts/content/skills.json`, `contracts/content/quests.json`, `contracts/src/meta/catalogs.ts` (zod defs: `ItemDef`, `SkillDef` (with reserved `requires: string[]`), `QuestDef` as pinned in A4; loader validates at import); Test `contracts/src/meta/catalogs.test.ts`

- [ ] Step 1: failing test — all three JSON files parse against their zod defs; every `QuestDef.rewards.items[].itemId` exists in items.json; every objective `targetId` non-empty. Step 2: author starter content (≥5 items incl. existing weapon ids from `colyseus-server/src/config/combat` weapons, ≥4 skills, ≥3 quests e.g. `q_boar_5` kill 5 boars → 100 xp + potion). Step 3: pass; commit `feat(contracts): starter item/skill/quest catalogs (C2)`.

### Task C3: C# codegen for contracts

**Files:** Modify `colyseus-server/scripts/codegen/*` (extend to emit `MetaTypes.cs` + catalog JSON copy into `colyseus-server/generated/csharp/Runtime/`); Test: extend `colyseus-server/scripts/test_contracts.sh`

- [ ] Step 1: read the existing codegen entry to follow its pattern (drift-proof check stays green: `bash colyseus-server/scripts/test_contracts.sh`). Step 2: generate C# records for `LoadoutSnapshot`, docs, `MatchEvent*`; run codegen; run test script → exit 0. Step 3: commit `feat(contracts): C# codegen for meta types (C3)`.

## Lane D — Flutter meta-UI (`~/workspace/repos/joymify-app`, branch `feature/meta-ui-nakama`)

> Different repo — this lane's subagent works there; follow that repo's own CLAUDE.md/conventions. Verify with `flutter analyze` + `flutter test` per task; use `ecc:flutter-reviewer` for the lane review. Nakama shapes/ids come from Task 0.1 (mirror as Dart constants in one file `lib/meta/meta_ids.dart`).

### Task D1: Nakama session service
- Add `nakama` Dart package; `MetaService`: `authenticateDevice(deviceId)` (dev auth) → session; secure token storage + refresh; realtime socket connect; expose `Stream<Notification>` filtered to codes 1 (quest_progress) / 2 (quest_completed).
- Unit-test with mocked client. Commit.

### Task D2: Character screen — profile + allocate
- Read `profile` collection key `main` via `client.readStorageObjects`; level/xp bar (xpToNext = `100 * level`, same curve as A2); "+" buttons per stat → `allocate_stats` RPC; optimistic update, rollback + snackbar on error. Widget test with mocked MetaService. Commit.

### Task D3: Inventory + equipment screens
- Grid of stackables + uniques from `inventory`; equip-slot panel from `equipment`; tap unique → `equip_item` RPC; on version-conflict error: snackbar + refetch. Widget test. Commit.

### Task D4: Skills screen
- Unlocked list + 4-slot loadout editor → `set_skill_loadout`; disable >4; skill names/costs from bundled catalog JSON copied from `contracts/content/skills.json` at build (single source — document the copy step in the app README). Widget test. Commit.

### Task D5: Quest log + live updates
- Active quests with objective progress bars from `quests`; subscribe MetaService notification stream → update rows in place; claim button → `claim_quest_reward` → refresh profile + inventory. Widget test simulating a code-1 notification. Commit.

---

# Phase 2 — Integration (sequential, after C → A → B merged into feature branch)

### Task I1: replace A3's `TEST_ITEMS` stub with catalog lookup
- [ ] Import catalogs from `@atlas/contracts` in `nakama/src/rpc/*`; delete stub; jest + curl re-verify. Commit `refactor(nakama): catalog-backed item lookup (I1)`.

### Task I2: end-to-end docker test
- [ ] Script `scripts/e2e-meta.sh`: compose up all; dev-auth an account via Nakama; `accept_quest q_boar_5`; connect a Colyseus client (reuse patterns from `colyseus-server/src/tests/`), drive kill events (bot mode or debug command) → poll Nakama until objectives read 5/5, claim, assert xp+item granted. Visible exit code. Commit `test(e2e): join→kill→quest-progress→reward loop (I2)`.

### Task I3: Colyseus `onAuth` verifies Nakama session token
- [ ] `onAuth(client, options)` → `backend.verifySession(options.token)`; reject on null **unless** `NODE_ENV !== 'production'` and `options.devBypass === true` (keeps the React debug client working). Test both paths. Commit `feat(colyseus): nakama session verification at onAuth (I3)`.

### Task I4: docs
- [ ] Update `docs/game-server.spec.md` (S2S flows), new `docs/meta-systems.spec.md` (collections, RPC table, failure semantics from spec §3), README service endpoints (7350/7351). Commit `docs: meta-systems spec + endpoints (I4)`.

---

# Orchestration protocol (main session)

1. Claim: `/ps-release-workflow:claim F-001` → feature worktree; execute Phase 0 there (subagent-driven, sequential).
2. Push feature branch; dispatch Lanes A/B/C as three subagents **in one message**, each `isolation: worktree` branched off the feature branch; Lane D subagent in joymify-app. Each lane: implementer → spec-review → code-review loop per task (superpowers:subagent-driven-development).
3. Merge back C → A → B (rebase each lane branch on the feature branch; run `pnpm -r test` + `npm run format:check` after each merge; fix forward with new commits, never amend).
4. Phase 2 tasks sequentially in the feature worktree.
5. Gate 1 + ship: `/ps-release-workflow:ship` from the feature worktree (runs precheck).
6. Lane D merges via PR in joymify-app once I2 passes against the local stack.

**Verification gates (hard):** a lane may not report done until its package test suite passes (`pnpm test` in its dir) AND prettier/eslint clean AND its curl/live verifications printed expected output. The orchestrator re-runs suites after every merge — trust diffs, not subagent claims.
