# Maps / zones authoring + runtime pipeline

- verdict: needs-work  |  effort: L  |  dependsOn: ['registry-binding']
- proposed idea: map-authoring-and-runtime-loader (regions, spawn points, static zone hazards, mob spawn tables)

# Maps / Zones — Authoring + Runtime Pipeline (domain: `maps-zones`)

## Goal
Turn the empty `content/maps/` + stub `map.schema.json` into a working authoring→runtime pipeline: a real map spec schema, the 3 bible regions authored as machine-readable specs, a content-gate map branch, and a **server map-loader** that populates a room from a spec (world dims, player + per-region spawn points, mob spawn tables, and **static map-driven zone hazards** through `ZoneEffectManager`). The loader **falls back to today's hardcoded `mapId` configs** so every existing test map (`map-01-sector-a`, `map-for-play`, `map-for-test-*`) is behaviorally untouched.

## Grounding (verified against the repo)
- `content/schemas/map.schema.json` is an 11-line stub (`id`/`title`/`links` only; title literally says "expand in roadmap #4"). `content/maps/` is empty (`.gitkeep`).
- Map behavior today is **hardcoded, keyed by `mapId`**: `config/mapConfig.ts` (`getMapDimensions`, `MAP_CONFIG.mobSpawnAreas`, `terrainZones`, `getMobSpawnAreasForMap`), `config/mobSpawnConfig.ts` (`getMobSettingsForMap`).
- `GameState` constructor calls `getMapDimensions`; `addPlayer()` hardcodes `spawnX/Y = width/2, height/2`. `MobLifeCycleManager` constructor reads `getMobSettingsForMap` + `getMobSpawnAreasForMap`.
- `ZoneEffectManager.createZoneEffect(x, y, ownerId, skillId, effects, …)` **requires an entity owner** and only fires from skill casts (`PlayerInputHandler`) / debug commands. No map-driven hazard placement exists.
- `scripts/check_content.mjs` validates **characters only** (Ajv + `js-yaml` frontmatter). No map validation.
- `bible.md` names the 3 regions with stable kebab ids but only **relative prose** coordinates (`~175u north of camp`, `east of the meadow`) — real rects **do not exist and must be authored**.
- `MAP_CONFIG.terrainZones` / `getFrictionAtPosition` have **zero runtime callers** (dead config).

## Scope boundary
IN: map schema, authored region specs, gate map branch, loader + legacy fallback, spec-driven dims/spawn/mob-tables, static zone hazards via `ZoneEffectManager`, synced region state on `GameState`.
OUT (note as cross-domain, do NOT absorb): making friction/terrain live (physics decision), Godot map rendering contract (`ui-2d`), formal story schema (`narrative-story`, roadmap #3), env/tile art coverage (`registry-binding`), multi-region → multi-room routing.

## Key design decisions (author these, don't infer)
- **One world, regions as sub-rects.** 1000×1000, `playerSpawn` at camp center (500,500). Icefield = north band, Thornveil = east band, Spawn Meadow = center. Multi-room routing is out of scope (deployment is 1 match = 1 room = 1 pod).
- **Authoring format = md + YAML frontmatter** (same as `content/characters/*.md`) so `splitFrontmatter`/`js-yaml` in `check_content.mjs` reuse applies; machine-readable data in frontmatter, prose (incl. coordinate rationale) in the body.
- **Loader always returns one `ResolvedMapSpec`** — from a spec file when present, else from a **legacy adapter** over the existing hardcoded configs. One downstream shape, zero behavior change for test maps.
- **Environmental hazards get a sanctioned no-owner path** (`ownerId: 'env:map'` sentinel) inside `ZoneEffectManager` that skips caster casting/interrupt logic — reusing the existing effect vocabulary and `ZoneEffect` schema, still routing damage through `BattleModule`. No parallel hazard system.

---

## Phase 1 — Real map schema + authored region specs + gate map branch (content only)
**Tasks**
- Expand `content/schemas/map.schema.json` (draft-07): `world{width,height}`; `regions[]{id,title,bounds{x,y,width,height},spawnPoint?}`; `playerSpawn{x,y}`; `zoneHazards[]{type∈freeze|stun|burn|poison|regen|heal|damage,x,y,radius,value,interval?,duration?,castTime?,regionId?}`; `mobSpawnAreas[]{id,x,y,width,height,mobType,count,spawnIntervalMs?,regionId?}` (mirror exported `MobSpawnArea`); `spawnSettings{…}` (mirror `MobSpawnSettings`); `terrainZones[]?` (mirror `TerrainZone`, authoring-only); `links[]`. **All positions/dims are world units.**
- Author `content/maps/atlas-frontier.md`: one 1000×1000 world, `playerSpawn` 500,500, the 3 regions as sub-rects with **explicit authored coords** (documented rationale in the body), faction→mobType per bible (aggressive/defensive/spear_thrower), icefield freeze+stun hazards.
- Extend `scripts/check_content.mjs` with a **map branch** (peer to characters, same warn=exit0 / fail=exit1 / `--require-complete`): Ajv-validate `content/maps/*.md` vs schema; forward-check `mobType`→`mobTypesConfig`, `regionId`→declared regions, region ids→stable bible `##` kebab ids (WARN coverage on unmatched bible regions); WARN on unresolved env/tile asset keys vs `asset-keys.json`/`manifest.json`.
- Add a deliberately-broken fixture to prove the FAIL path.

**Verify (evidence):** `node scripts/check_content.mjs` → **exit 0** clean with `atlas-frontier`; broken fixture (or `--require-complete`) → **exit 1** with the expected FAIL line. Capture both exit codes.

**Quality gate:** implement → verify (gate green **and** red, show exit codes) → **independent adversarial review** of the schema+gate diff (catches dangling `regionId`, dup region ids, out-of-bounds rects? warn-vs-fail correct?) → refactor (extract shared frontmatter/link-check helpers between character & map branches) → re-verify.

---

## Phase 2 — Server `MapSpec` loader (parse + resolve + legacy fallback)
**Tasks**
- Add `MapLoader` (`colyseus-server/src/config/mapSpec/` or `src/modules/`): `loadMapSpec({ mapId }): ResolvedMapSpec` — **single options object**, no positional/boolean-flag args.
- `ResolvedMapSpec` interface (TS strict, no `any`) reusing `MobSpawnArea` / `TerrainZone` / `MobSpawnSettings` + world/playerSpawn/regions/zoneHazards.
- Resolution: file exists → read, split frontmatter (`js-yaml`), **validate vs schema at load, throw on invalid**; file missing → build spec from **legacy adapters** (`getMapDimensions`, `getMobSpawnAreasForMap`, `getMobSettingsForMap`, `MAP_CONFIG.terrainZones`, center spawn) → one shape, zero legacy drift.
- `src/tests/mapLoader.test.ts` next to existing tests.

**Verify (evidence):** `npm test -- src/tests/mapLoader.test.ts` green: (a) `atlas-frontier` → 1000×1000, 3 regions, spawn 500,500, authored areas+hazards; (b) **golden legacy-equality** — resolved `mobSpawnAreas`/`spawnSettings` deep-equal `getMobSpawnAreasForMap(...)`/`getMobSettingsForMap(...)` for each current mapId; (c) invalid spec throws. Plus `npm run build` clean.

**Quality gate:** implement → verify (jest + tsc, paste output) → **independent adversarial review** (fallback truly identical for ALL mapIds? schema validation actually runs? any single-path violations?) → refactor (dedupe legacy adapter) → re-verify.

---

## Phase 3 — Wire loader into room assembly (dims, spawn, mob table, synced regions)
**Tasks**
- `GameRoom.onCreate`: `loadMapSpec({ mapId })` **once**, thread the spec into `GameState` + `MobLifeCycleManager` constructors (options object; `GameRoomOptions.mapId` injection point already exists).
- `GameState`: accept the spec via one options object; set `width/height` from `spec.world`; add synced `@type` region structures (`ArraySchema<MapRegion>`: id+bounds) + spawn reference; `addPlayer()` uses `spec.playerSpawn` (+ per-region `spawnPoint`) instead of `width/2,height/2`.
- `MobLifeCycleManager`: constructor takes resolved `spawnAreas` + `spawnSettings` from the spec (not direct config calls); **preserve the TOTAL-count overspawn rule and `entity.die()`/`readyToBeRemoved` lifecycle** — do not bypass the manager.
- Regenerate + commit `generated/csharp` models for the new synced fields (**R1** client contract change).

**Verify (evidence):** `npm test` green — from a room built with `atlas-frontier`: player at `spec.playerSpawn`, `width/height == spec.world`, mob areas seeded with correct TOTAL counts (no overspawn); legacy maps' existing tests still pass. `npm run build` clean. Headless: `npm run dev` → `GET /rooms` (or `/api`) shows the spec's mapId + dims.

**Quality gate:** implement → verify (jest + tsc + `/rooms` probe, paste evidence) → **independent adversarial review** (per-region spawn respects bounds? overspawn intact? no client-authoritative leak? codegen regenerated & committed?) → refactor (retire superseded direct config calls or gate them behind fallback with a comment) → re-verify.

---

## Phase 4 — Static map-driven zone hazards through `ZoneEffectManager` (env no-owner path)
**Tasks**
- Add a sanctioned environmental path to `ZoneEffectManager` — single options-object API (e.g. `seedStaticHazards({ hazards })`) reusing the freeze/stun/burn/poison/regen/heal/damage vocabulary and the **same `ZoneEffect` schema**, with an `ownerId: 'env:map'` sentinel that **skips caster casting-state mutation** (`createZoneEffect` lines 41-48) and owner interrupt/cleanup (`update()` lines 62-73). Damage/status still flow through `BattleModule`. No parallel system.
- Wire `GameRoom.onCreate` to seed `spec.zoneHazards` into `state.zoneEffects` at room start so the Icefield's natural freeze/stun zones become real, persistent, map-owned hazards.
- `src/tests/mapHazards.test.ts` with injected timing to avoid flakiness.

**Verify (evidence):** `npm test -- src/tests/mapHazards.test.ts` green: seeding populates `state.zoneEffects` with env-owned zones; advancing `ZoneEffectManager.update()` applies freeze/stun to an entity inside an icefield hazard via `BattleModule`; **no crash from the missing entity owner**. Headless: `npm run dev` on `atlas-frontier` → hazards present at room start, no owner-cast errors in logs.

**Quality gate:** implement → verify (hazard jest + headless log/zoneEffects check, paste evidence) → **independent adversarial review** (env owner truly bypasses cast/interrupt/cleanup without leaking casting state? centralized through `ZoneEffectManager`+`BattleModule`? never-expiring map hazards handled by cleanup?) → refactor (unify env path with `createZoneEffect` internals, drop dead branches) → re-verify (hazard test + full suite + build).

---

## Dependencies
- **Hard `dependsOn`: none.** Everything the core pipeline needs (schema, `js-yaml`, `mobTypesConfig`, `asset-keys.json`/`manifest.json`, `bible.md` kebab ids, `ZoneEffectManager`/`BattleModule`) exists today.
- **Soft (non-blocking) cross-domain couplings:**
  - `narrative-story` — owns `bible.md` region ids; the map gate cross-references them by regex (no formal story schema required). If roadmap #3 reworks region ids, maps re-sync.
  - `registry-binding` — env/tile prop asset-key resolution + the F-002 open-vs-actual status discrepancy; kept as WARN so it never blocks authoring.
  - `ui-2d` — the new synced `GameState` region/spawn/hazard fields are the Godot client render contract; consumed downstream, not required to land first.

## Shared infra
- `scripts/check_content.mjs` (content gate) — extended with a map branch as a peer to the character check (shared with `character-content`, `narrative-story`).
- `asset-keys.json` + `manifest.json` bridge — reused for env/tile prop link-check (owned by `registry-binding`).
- `GameState` synced schema + `generated/csharp` codegen — new region/spawn/hazard fields regenerate client models (shared with `ui-2d`).
- md+YAML-frontmatter convention (`splitFrontmatter`/`js-yaml`).

## Definition of Done
- `map.schema.json` is a full spec; `content/maps/atlas-frontier.md` authored with 3 regions and explicit documented coords.
- `check_content.mjs` validates maps (green on authored, red on broken); exit codes captured.
- `loadMapSpec` resolves file specs and falls back to legacy **byte-identical** for existing mapIds (golden test green).
- A room booted on `atlas-frontier` uses spec dims, spawns the player at the spec point, seeds mobs from the spec table (overspawn invariant intact), and seeds static freeze/stun hazards via `ZoneEffectManager` with no owner-cast errors — all proven by jest + `npm run build` + a headless `/rooms` (+ log) probe.
- `generated/csharp` regenerated & committed. Every phase passed its implement→verify→review→refactor→re-verify gate. Conventional commits, squash-merge; routed through `/ps-release-workflow:*` (I-NNN → F-NNN).

## Effort: **L**
Four phases; the weight is the synced `GameState` schema change (triggers codegen / client contract, R1), the loader-with-legacy-fallback golden equality, and the new environmental hazard path. Reuse of existing shapes (`MobSpawnArea`/`TerrainZone`/`MobSpawnSettings`) and the single-player-debug scope (`maxClients=1`) keep it from XL.

---
## Adversarial review findings

**[blocker]** Content packaging gap — loadMapSpec reads content/maps/<id>.md, but content/ is a repo-ROOT sibling of colyseus-server, and tsc (rootDir ./src, outDir ./dist, include src/**/*) does NOT copy it into dist/. Works in ts-node dev only; breaks in `npm start` (dist) and in the pnpm-workspace Docker image (per F-005 memory, the image copies the colyseus-server package, not repo-root content/). The plan never ships content into the server runtime. This is a prod FAIL, not a nit.

→ _fix:_ Add an explicit packaging step: COPY content/maps into the Docker image AND resolve the spec base-dir from config/env (a MAP_CONTENT_DIR), never from relative cwd. Add a smoke test that runs against the BUILT dist (node dist/...), not just ts-node, proving atlas-frontier loads. Consider vendoring specs into colyseus-server/ at build time (prebuild copy script) so the package is self-contained.

**[high]** The content gate's mobType forward-check (declared a FAIL check) has no mechanism. check_content.mjs is repo-root plain-ESM node and CANNOT import the mob-type ids, which live only in colyseus-server TypeScript (mobTypesConfig.ts re-exporting mobs/definitions/*.ts). No generated mob-types.json exists (asset-keys.json is assets only). As written the check either can't run or silently passes.

→ _fix:_ Either (a) add a small codegen that emits generated/mob-types.json from the TS definitions and have the gate read it (this is a registry-binding concern → same-PR sub-task or a dependsOn), or (b) downgrade the mobType check to WARN until such a source exists. Do not hardcode the id list in the gate (drift). Name the chosen mechanism in Phase 1.

**[high]** Understated blast radius + scope drift on constructor changes. GameState (`constructor(mapId, roomId)`) and MobLifeCycleManager (`constructor(roomId, state)`) are POSITIONAL today and instantiated across ~55 test files (mob-lifecycle.test.ts even mocks getMapDimensions/getMobSpawnAreasForMap). The plan casually 'accepts the spec through a single options object', which forces converting both constructors and rewriting every call site + those config mocks. Note the single-path invariant governs NEW APIs; retrofitting existing constructors is a voluntary refactor smuggled into a loader feature.

→ _fix:_ Pick and state one strategy: (a) minimal — keep the existing signatures, have GameState/MobLifeCycleManager receive the already-resolved ResolvedMapSpec via the loader without a full options-object rewrite; or (b) do the options-object refactor as its own separately-reviewed task with a counted list of touched test files. Quantify the test churn either way; don't present it as a one-liner.

**[medium]** Static region geometry is being pushed through the 20Hz-patched synced schema. regions/bounds/spawn never change after load, yet ArraySchema<MapRegion> on GameState is included in state patches and bloats replication. The repo already serves static room/map data (mobs, configs) over REST /api — that is the established channel for immutable data.

→ _fix:_ Default to delivering map geometry via REST /api/rooms/:id (static), keeping only genuinely dynamic entities in the schema. If it must be synced, justify why and confirm codegen emits a BRAND-NEW nested C# schema class (MapRegion.cs), not just field additions — new-class emission is a different codegen path than the field-add cases shipped so far.

**[medium]** Verification softness: the Phase 3 headless probe 'GET /rooms confirms mapId + dimensions' targets an endpoint that does not appear to exist — src/api only mounts /rooms/:roomId/* (mobs, players), no bare /rooms returning width/height/mapId, and no room-state dims endpoint.

→ _fix:_ Replace with a concrete check: either add a /rooms/:roomId endpoint that returns state.mapId/width/height (and test it), or assert directly against a booted GameState via the room registry in a jest integration test. Do not verify against an assumed endpoint.

**[medium]** js-yaml (and Ajv) become colyseus-server RUNTIME deps. The plan's 'add js-yaml if not present; scripts already use it' conflates repo-root scripts deps with the server package — js-yaml/ajv are NOT in colyseus-server today. Adding runtime parse+validate to the server is R1 and the deps must be prod (not dev) so they land in the Docker image.

→ _fix:_ Add js-yaml + ajv as colyseus-server production dependencies explicitly, and verify the built image includes them (tie to the dist smoke test above).

**[medium]** Env-hazard no-owner path: the plan scopes the sentinel bypass to createZoneEffect lines 41-48, but update() dereferences getEntity(zone.ownerId) at ~4 sites (owner casting-start, casting-end, interrupt, cleanup). For ownerId 'env:map', getEntity returns undefined at ALL of them. The plan must prove no NPE across every update() branch, and that never-expiring map hazards (no duration) are not purged by cleanup.

→ _fix:_ Guard every getEntity(ownerId) site in update() for the env sentinel (or return early on env-owned zones before owner logic), and add an explicit test that advances update() many ticks on an env hazard with no duration and asserts it persists and never touches owner casting state. Also note ZoneEffectManager uses Date.now() (not performance.now(), the repo invariant) — inject a clock for the test, and confirm duration semantics for 'infinite' map hazards.

**[low]** Double-population risk: atlas-frontier is a NON-test map, and the plan says 'keep seedDemoNPCs behavior for non-test maps' while also seeding mobs from the spec table — demo NPCs and spec mobs could coexist unintentionally.

→ _fix:_ Define precedence explicitly: a spec-driven map should suppress seedDemoNPCs (or seedDemoNPCs only fires when the spec omits mob areas). Assert the chosen behavior in a test.

**[low]** terrainZones carried in schema + gate but knowingly dead (getFrictionAtPosition has zero callers — confirmed). Adds authoring/schema surface for something with no consumer; mild over-scope even though correctly flagged as authoring-only.

→ _fix:_ Keep it, but mark the schema field clearly authoring-only/experimental and exclude it from any 'complete' coverage gate so it never blocks --require-complete.