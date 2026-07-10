# Meta systems (Nakama) spec

Player meta-state (profile/stats, inventory, equipment, skills, quests) lives in **Nakama**, not Colyseus. Colyseus is the single caller of these RPCs — no other service talks to Nakama's meta collections. Shared types/schemas/catalogs live in `@atlas/contracts` (`contracts/src/meta/`); catalog content is `contracts/content/*.json` (items/skills/quests), mirrored verbatim into `colyseus-server/generated/csharp/Runtime/Content/` for the Unity client (drift-checked, see `colyseus-server/scripts/codegen/check_drift_meta.sh`).

## Storage collections

All keyed as `{ collection, key: "main", userId }` (single doc per player per collection; `STORAGE_KEY = "main"`). `permissionRead: 2` (owner-readable), `permissionWrite: 0` (server-only — clients never write directly, only via RPCs). Schemas: `contracts/src/meta/schemas.ts`; defaults: `defaultDoc(collection)` / `DEFAULT_PROFILE`.

| Collection | Shape | Notes |
| --- | --- | --- |
| `profile` | `{ schemaVersion:1, level, xp, statPoints, allocated:{str,agi,int,vit} }` | Default: level 1, xp 0, statPoints 0, all stats 1. `xpToNext(level) = 100 * level`; level-up grants +3 statPoints (`nakama/src/leveling.ts`). |
| `inventory` | `{ schemaVersion:1, stackables:[{itemId,qty}], uniques:[{instanceId,itemId}] }` | Stackable items (per `ItemDef.stackable`) merge into `stackables`; non-stackable items each get a fresh `instanceId` (`addLoot`, `nakama/src/rpc/inventoryHelpers.ts`). |
| `equipment` | `{ schemaVersion:1, slots:{weapon?,armor?,accessory?} }` | Slots store an **instanceId** (not a bare itemId) — a player can own two uniques of the same itemId and equip one specific instance. |
| `skills` | `{ schemaVersion:1, unlocked:[{skillId,level}], loadout:string[] }` | `loadout` capped at 4 (`skillsDocSchema.max(4)`). |
| `quests` | `{ schemaVersion:1, active:[{questId,startedAt,objectives:Record<string,number>}], completed:[{questId,completedAt,claimed}] }` | An objective's progress key is the `QuestObjective.id` from the catalog (e.g. `kill_boars`), not the quest id. |
| `quests_seq` *(internal)* | `{ [matchId: string]: number }` | Not one of `COLLECTIONS` (contracts) — only `report_match_events` reads/writes it. `permissionRead: 0`: never client-readable. Tracks the last-applied `seq` per `matchId` per user for idempotent dedupe (see below). |

A doc read with a `schemaVersion` below current is treated as untrusted and reset to the collection default rather than guessed at (`nakama/src/storage.ts: migrateDoc`) — there has only ever been schema v1.

## Catalogs (read-only reference data)

`ITEMS_BY_ID` / `SKILLS_BY_ID` / `QUESTS_BY_ID`, exported from `@atlas/contracts`, validated at module-init time (zod, `itemDefSchema`/`skillDefSchema`/`questDefSchema`) plus cross-catalog referential checks (`validateCatalogIntegrity` — a quest's reward itemId must exist, a skill's prerequisites must be real skill ids). Loaded via a plain `require("../../content/*.json")` (not `fs`) so the module has **zero Node-builtin dependencies** — see "goja safety" below.

`nakama/src/catalog.ts` (`isKnownItem`, `isStackable`) and `nakama/src/questCatalog.ts` (`findQuestDef`) are thin wrappers over these — the single source of truth shared by Nakama RPCs, `colyseus-server`, and the generated C# content.

## RPC table

Ids from `contracts/src/meta/ids.ts` (`RPC.*`), registered in `nakama/src/main.ts: InitModule`.

| RPC id | Caller | Auth | Purpose |
| --- | --- | --- | --- |
| `get_loadout` | Colyseus (S2S) | `?http_key=...` | Assembles `LoadoutSnapshot` (profile + resolved equipped itemIds + skill loadout + active quest ids) from the five raw docs. Rejects a request carrying `ctx.userId` (must be S2S). |
| `report_match_events` | Colyseus (S2S) | `?http_key=...` | Folds a `MatchEventBatch` into quest progress. Idempotent by `(matchId, seq)` — see dedupe below. Rejects a request carrying `ctx.userId`. |
| `accept_quest` | Client | Bearer session token | Adds a quest (looked up in `QUESTS_BY_ID`) to `active`; rejects if already active/completed. Requires `ctx.userId`. |
| `claim_quest_reward` | Client | Bearer session token | Only succeeds if completed-and-unclaimed; grants xp + reward items and marks `claimed:true` via a single `nk.multiUpdate` (profile + inventory + quests move atomically — no partial-reward state). Requires `ctx.userId`. |
| `grant_xp` | Client | Bearer session token | Debug/admin xp grant (retries once on an optimistic-concurrency version conflict). |
| `grant_loot` | Client | Bearer session token | Debug/admin item grant via `addLoot`. |
| `equip_item` | Client | Bearer session token | Equips an owned unique instanceId into a slot. |
| `allocate_stats` | Client | Bearer session token | Spends `statPoints` into `allocated`. |
| `set_skill_loadout` | Client | Bearer session token | Sets the (≤4) equipped skill ids. |
| `healthcheck` | Anyone | none | Trivial liveness probe (`{"ok":true}`); not a contracts RPC id, scaffold-only. |

**Client RPCs** are called `POST /v2/rpc/<id>?unwrap` with `Authorization: Bearer <session token>`. **S2S RPCs** are called `POST /v2/rpc/<id>?http_key=<key>&unwrap` with no user Bearer token, and explicitly reject a call carrying an authenticated `ctx.userId` — a defense against a client somehow reaching an S2S-only endpoint with its own session.

## Colyseus ↔ Nakama seam

Single interface, `IMetaBackend` (`colyseus-server/src/meta/IMetaBackend.ts`): `verifySession`, `getLoadout`, `reportMatchEvents`. `NakamaMetaBackend` implements it over real HTTP; `FakeMetaBackend` is the in-memory test double. `GameRoom` depends only on the interface.

- **`NakamaMetaBackend`** (`colyseus-server/src/meta/NakamaMetaBackend.ts`): every call goes through `fetchWithRetry` — timeout (default 2000ms) + exponential backoff (`250ms * 2^attempt`, default 3 total attempts). A 4xx other than 429 fails fast (not retried — e.g. an expired token will never succeed on retry); 5xx/429/network errors/aborts retry. `reportMatchEvents` fails **closed**: an unrecognized response body (anything but `{deduped:true}` or `{deduped:false,...}`) is treated as `'failed'` rather than silently accepted.

## Failure semantics

- **Ephemeral join** — `loadPlayerLoadout` (`colyseus-server/src/meta/applyLoadout.ts`): if `getLoadout` resolves `null` (backend down after retries, or malformed response) or throws, the player is marked `isEphemeral = true` and kept on default/ephemeral stats — **a meta-systems outage never blocks a match from starting.** Logged via `console.error('[meta] ephemeral join', userId)`.
- **Buffered-flush retry** — `MetaEventReporter` (`colyseus-server/src/meta/MetaEventReporter.ts`): match events are buffered per-room and flushed on a timer (default every 5000ms) plus once more at room disposal (draining anything recorded since the last periodic flush). `seq` only advances on a `'ok'`/`'deduped'` result; a `'failed'` result (backend down, non-2xx, thrown error) leaves the buffer untouched so the **exact same batch is retried verbatim** on the next flush — no event loss, no silent skip. The buffer is capped (`maxBuffer`, default 500); over capacity, the oldest event is dropped and a single coalesced warning is logged at the next flush (not once per drop).
- **Idempotent dedupe** — `report_match_events` (`nakama/src/rpc/reportMatchEvents.ts`): tracks the last-applied `seq` per `matchId` in the internal `quests_seq` collection. A batch whose `seq <= lastSeq` for that `matchId` is a **no-op**, returning `{deduped:true}` without touching quest progress — this is what makes a Colyseus retry-on-`'failed'` safe (the retried batch's `seq` hasn't advanced, so if it actually landed server-side despite a client-visible failure, the replay is a safe no-op). The quests-doc write and the seq-doc write happen in a **single `nk.multiUpdate`** so they can never partially land (progress advancing without the seq bump, or vice versa, would make a later replay double-apply).
- **Mixed-user buffer guard** — `MetaEventReporter.doFlush` attributes a batch's `userId` to its first buffered event (correct only under today's 1-match-1-room-1-player model, `GameRoom.maxClients = 1`). If any other event in the buffer has a different `userId`, it's logged loudly (`console.error`) rather than silently misattributed — a signal that this assumption needs revisiting before `maxClients` ever rises. `report_match_events` also defense-in-depth checks server-side that every `event.userId` in the batch matches the batch's top-level `userId`, independent of the Colyseus-side guard.

## onAuth: token verification

`GameRoom.onAuth` (`colyseus-server/src/rooms/GameRoom.ts`) resolves the room's server-authoritative `userId` **before** the seat reservation is consumed; the result is handed to `onJoin` as `client.auth` — `onJoin` never trusts a client-supplied id.

1. If `options.token` (a Nakama session token) is present, call `metaBackend.verifySession(token)` — `NakamaMetaBackend.verifySession` hits `GET /v2/account` with `Authorization: Bearer <token>` (through the same retry/backoff policy) and returns `{ userId: body.user.id }` on success, `null` on any failure (network, non-2xx, malformed body).
2. If verification succeeds, `onAuth` returns immediately with the verified `userId`.
3. **Dev bypass:** only reachable if step 1 didn't already return. If `process.env.NODE_ENV !== 'production'` **and** `options.devBypass === true`, `onAuth` accepts the join using `client.sessionId` as the userId (no Nakama verification at all) — a `console.warn('[meta] dev bypass join', ...)` is logged so it's loud in server logs. This path is compiled out of intent (not code) in production: the `NODE_ENV` guard is the only thing preventing it, so it must never be relied on as a security boundary — it exists purely so the React debug client can join without standing up full Nakama auth locally.
4. Otherwise (no token, or verification failed, and no dev bypass): `onAuth` throws `unauthorized: missing or invalid Nakama session token`, and the join is rejected before a seat/state is ever allocated.

## Goja safety (Nakama runtime constraint)

Nakama's embedded JS runtime (goja, via esbuild bundle — see `nakama/esbuild.config.mjs`) has **no `fs`**. `contracts/src/meta/catalogs.ts` loads its catalog JSON via a plain `require("../../content/*.json")` (Node/esbuild resolve `.json` natively — no `fs`/`path` module ever appears in the compiled output), rather than `fs.readFileSync`. This matters package-wide, not just at the two call sites that read catalog data: `contracts/src/index.ts`'s `export * from "./meta/catalogs"` means that submodule is eagerly evaluated (CommonJS `export *` runs the whole target module at require time) the moment **any** file imports **anything** from `@atlas/contracts` — which is nearly every Nakama file (`COLLECTIONS`, `STORAGE_KEY`, types, ...). A stray `import ... from "fs"` anywhere in that transitive closure would crash Nakama's `InitModule` load for the entire bundle, independent of whether catalog data is ever used.

## Local dev endpoints

See README.md "Main Service Endpoints" — Nakama HTTP API `http://localhost:7350`, console `http://localhost:7351` (admin/password, from `nakama/local.yml`), CockroachDB SQL `localhost:26257` / admin UI `http://localhost:8081`. Dev server key: `defaultkey` (Nakama default, unset in `local.yml`). Dev S2S http_key: `atlas_dev_http_key` (`nakama/local.yml: runtime.http_key`).

## End-to-end verification

`scripts/e2e-meta.sh` drives the client/S2S RPC surface documented above against a live local stack (device auth → `accept_quest` → `report_match_events` ×5 → poll `quests` storage for 5/5 → `claim_quest_reward` → assert profile/inventory → replay the batch and assert dedupe). Run it after any change to catalogs, RPC contracts, or storage schemas.
