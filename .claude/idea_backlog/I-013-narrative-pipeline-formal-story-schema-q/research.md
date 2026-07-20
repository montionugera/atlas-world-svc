# Game story / narrative pipeline (schema + quests + runtime)

- verdict: needs-work  |  effort: XL  |  dependsOn: ['maps-zones', 'character-content', 'registry-binding']
- proposed idea: I-NNN Narrative pipeline: formal story schema + quest narrative fields + live objective wiring (F-005 roadmap #3)

## narrative-story — Game story / narrative pipeline (schema + quests + runtime)

### Goal
The quest **mechanics** substrate already exists end-to-end (F-001, shipped release/1.1): a `QuestDef`/`QuestObjective` schema, a pure `questEngine.applyEvents` fold, `accept_quest`/`claim_quest_reward` RPCs, S2S `report_match_events` with idempotent dedupe, and a live `MOB_KILLED` emitter. What is missing is the **narrative** layer and its linkage:

- `content/schemas/story.schema.json` is an explicit stub consumed by nothing; `bible.md` is free prose with no machine-readable structure.
- The content gate (`scripts/check_content.mjs`) validates only characters — `links.story` is a dangling, unchecked reference.
- `QuestDef` is pure mechanics — no title/description/giver/prereq/region/faction; nothing ties a quest to the bible.
- The quest catalog is disconnected from real entities: `q_boar_5` targets `"boar"`, which is **not** a real `mobTypeId` (real ids: `aggressive|defensive|spear_thrower|hybrid|balanced|double_attacker`), so the only runtime-wired quest can never progress.
- 2 of 3 objective event types (`ITEM_PICKED_UP`, `ZONE_ENTERED`) are never emitted at runtime.
- There is no quest-giver / accept-gating / dialogue surface, and the client gets only `activeQuestIds` with no display text.

This plan closes all of that inside the narrative-story domain, riding the existing goja-safe `@atlas/contracts` catalog pattern, the C# drift-checked codegen mirror, and the content-gate warn-vs-fail discipline. **Invariants preserved throughout:** server-authoritative (Nakama owns quest STATE, Colyseus only reports MatchEvents over S2S http_key); combat/kill-detection stays in the `BattleModule -> EventBus -> RoomEventHandler` path (never duplicated); single-path option-object APIs (no boolean flag params); entity lifecycle via transition methods; `performance.now()` for sim timing while quest meta stamps keep `Date.now()`; TS strict; tests next to existing ones.

---

### Dependencies
- **dependsOn `maps-zones`** — live `ZONE_ENTERED` needs real zoneIds + entry detection (Phase 3's end-to-end path).
- **dependsOn `character-content`** — in-world NPC quest-giver offer needs NPC entities/sheets (Phase 4's in-world trigger; the Nakama gating + data land regardless).
- **Consumers (they dependOn us, not the reverse):** `ui-2d` renders the quest/dialogue display strings this domain generates; `registry-binding` shares the catalog + codegen infra.

### Shared infra touched
`@atlas/contracts` catalog pattern (goja-safe `require`, zod-at-import, `validateCatalogIntegrity`); the C# mirror + `check_drift_meta.sh` codegen; the `MatchEvent` enum + `MetaEventReporter`/`IMetaBackend` emitter seam; the `check_content.mjs` gate; `docs/meta-systems.spec.md`.

---

### Per-phase quality gate (applies to EVERY phase)
Each phase is **not done** until, in order: **1) Implement** the change → **2) Verify** by running the phase's evidence check (jest / gate script / drift script / e2e — never "should work") → **3) Review**: independent adversarial review of *this phase's diff* (fresh subagent / `superpowers:requesting-code-review` / `ecc:code-review`), self-review does not count → **4) Refactor** the findings while the diff is small (dedup, dead code, over-defensiveness) → **5) Re-verify** step 2 still passes. Only then advance. This is automatic, not a permission checkpoint. Commit one logical unit per phase (new commit, never `--amend`).

---

### Phase 1 — Formalize the story schema + machine-readable story catalog + content gate
**Tasks**
- Replace the stub `content/schemas/story.schema.json` with a real draft-07 schema: a story entry discriminated by `kind` (`region` | `faction` | `era`); common `id` (kebab-case), `title`, `kind`, `summary`; `region` adds optional `{approxPosition, dangerTier}`; `faction` adds required `mobFamily` (a `mob:*` asset-key family) + `disposition`; `links[]` of story ids.
- Add a `STORY` catalog to `@atlas/contracts` mirroring QUESTS/ITEMS/SKILLS: `contracts/content/story.json` (regions + factions + era extracted from `bible.md`), `StoryEntry` type + `storyEntrySchema` zod in `contracts/src/meta/catalogs.ts`, loaded via `require('../../content/story.json')` (**no fs/path — goja-safe**), `STORY`/`STORY_BY_ID` exports.
- Extend `validateCatalogIntegrity()`: every `faction.mobFamily` is a known `mob:*` family; every `links[]` id resolves to a `STORY` id; throw naming the offender (fail-fast at import).
- Keep `content/story/bible.md` as the human prose companion; its kebab-case heading ids are the authority `story.json` must match — add a header note documenting the id-sync contract.
- Extend `scripts/check_content.mjs`: load `story.schema.json`, validate every story entry, and **resolve character `links.story` ids against the `STORY` id set — a dangling ref becomes a hard FAIL** (currently unchecked); honor warn-vs-fail + `--require-complete`.

**Verify (evidence):** `contracts/src/meta/catalogs.test.ts` asserts `STORY` loads and `validateCatalogIntegrity` throws on (a) an unknown `mobFamily` and (b) a dangling `links[]` id. `node scripts/check_content.mjs` validates story entries and exits 1 on a scratch character with a broken `links.story`. Goja-safety proof: `cd contracts && npm run build` + an esbuild/Nakama bundle smoke showing no `fs`/`path` in the barrel.

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Phase 2 — Narrative fields on QuestDef + reconcile targetIds to real entities
**Tasks**
- Extend `QuestDef` + `questDefSchema` (`contracts/src/meta/catalogs.ts`) with a single strict narrative object: `title`, `description`, optional `giver` (npc id), optional `region` (STORY id), optional `faction` (STORY id), optional `prereq` (questId). Objectives/rewards untouched. No flag params.
- Extend `validateCatalogIntegrity()`: `quest.faction/region` resolve to `STORY` ids; `quest.prereq` is a real questId; `quest.giver` is a real npc id (thread the npc id set in goja-safe — a small `contracts/content/npcs.json` or asset-key-derived allowlist; **do not import colyseus mob defs into contracts**).
- Fix `contracts/content/quests.json`: retarget `q_boar_5`'s `"boar"` to a real mob id (per `colyseus-server/src/config/mobs/definitions/*.ts`) and attach `faction-ashfang` / `region-spawn-meadow` + title/description.
- Add a **colyseus-server** jest test asserting every quest `MOB_KILLED` `targetId` is a real mob-definition id (this cross-check lives server-side because mob defs can't be goja-imported into contracts).
- Regenerate the C# mirror (`gen-csharp-meta.ts`) so `generated/csharp/Runtime/Content/quests.json` carries the new fields.

**Verify (evidence):** `catalogs.test.ts` integrity throws on bad faction/giver/prereq refs; the new colyseus test fails on a synthetic `"boar"` target and passes on reconciled data. `colyseus-server/scripts/codegen/check_drift_meta.sh` green. `scripts/e2e-meta.sh`: accept the reconciled quest → report a real `MOB_KILLED` → progresses active→completed→claim (the sole runtime quest is no longer dead).

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Phase 3 — Wire the missing live objective emitter (ZONE_ENTERED)
**Tasks**
- Add a `ZONE_ENTERED` producer **without touching combat**: a zone-entry detector (`ZoneEffectManager` / AOI grid) emits a room-scoped `EventBus` event; `RoomEventHandler` translates it to `metaEventReporter.record({type:'ZONE_ENTERED', userId: <verified Nakama userId>, targetId: zoneId, count:1})`, deduped per `(userId, zoneId)` like the existing `reportedMobKills` set. **No enum change** — `ZONE_ENTERED` already exists in `types.ts`/`schemas.ts`, so the "schema and emitter move together" invariant is already satisfied.
- Zone ids come from **maps-zones** (real zoneIds + entry detection) through the registry/asset-key seam — do not invent zone ids locally.
- `ITEM_PICKED_UP` stays schema-defined-but-not-live (no loot-pickup sim producer exists, grep-confirmed): leave `q_gather_ore` as authored data, emit a gate WARN, and land emitter scaffolding + a fake-producer test so it activates the moment a pickup event exists (cross-domain).
- Preserve the Nakama-owns-STATE / Colyseus-reports-EVENTS split — no progress computation moves into Colyseus.

**Verify (evidence):** `colyseus-server/src/tests` jest: drive a synthetic zone-entry `EventBus` event through `RoomEventHandler` with `FakeMetaBackend`; assert exactly one `ZONE_ENTERED` MatchEvent is buffered and a repeat is deduped. Extend `scripts/e2e-meta.sh` (or a `questEngine.test.ts` case) to show `q_explore_forest` folds to completed on a `ZONE_ENTERED` report.

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Phase 4 — Quest-giver / dialogue data model + server-authoritative accept-gating
**Tasks**
- Add player-facing display strings to the quest catalog: `offerText` / `completeText` on `QuestDef` (strict fields), generated into the C# mirror. Rendering is `ui-2d`'s job; this phase produces only the data.
- Add accept-gating in `nakama/src/rpc/quests.ts` `accept_quest` (server-authoritative): reject when `quest.prereq` is not in the player's completed set, and (when `giver` is set) when the accept context doesn't match the offering giver. Preserve existing dup/already-completed rejections and the single-options-object RPC shape.
- Leave `questEngine.applyEvents` unchanged — gating is an accept-time guard only.
- Scope boundary: the in-world NPC offer trigger (NPC entity surfaces an offer; client sends accept) depends on `character-content` (NPC entities) and `ui-2d` (dialogue rendering) — wire only the Nakama gating + data here; record the in-world trigger as a cross-domain handoff.

**Verify (evidence):** `nakama/src/rpc/quests.test.ts`: `accept_quest` rejected when prereq incomplete, accepted once completed; giver mismatch rejected, match accepted; existing dup/completed rejections still pass. `check_drift_meta.sh` green with new display fields in the C# mirror.

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Phase 5 — Client content generation, gate wiring into the release, and docs
**Tasks**
- Confirm `gen-csharp-meta.ts` emits the full narrative payload (`title/description/offerText/completeText/giver/region/faction`) into `generated/csharp/Runtime/Content/quests.json` (+ any story mirror) so the Godot client has display strings, not just `activeQuestIds`.
- Wire story validation into the release gate: ensure the now-story-aware `scripts/check_content.mjs` runs in the repo's precheck/test path, and that `--require-complete` escalates story coverage warns (every faction referenced by a character link exists; every faction's `mobFamily` exists) to failures.
- Update `docs/meta-systems.spec.md` (quest narrative fields, giver/prereq gating, `ZONE_ENTERED` emitter, dedupe); mark the "roadmap #3" section of `docs/superpowers/specs/2026-07-19-content-pipeline-design.md` delivered; update `bible.md`'s id-sync header note.

**Verify (evidence):** `node scripts/check_content.mjs --require-complete` exits 0 with story + character coverage satisfied. Full suites green: contracts, colyseus-server, nakama jest; `check_drift_meta.sh`; `scripts/e2e-meta.sh`. `grep` the generated `quests.json` to confirm display strings are present.

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Risks
- **`ITEM_PICKED_UP` has no runtime producer** — full closure of that objective type is out of scope; ship `ZONE_ENTERED` live, leave `ITEM_PICKED_UP` documented-not-live with a gate WARN rather than faking a producer.
- **`ZONE_ENTERED` live path blocks on maps-zones** (real zoneIds + entry detection); scaffolding + fake-producer test still land, but end-to-end zone-quest progress can't be verified until maps-zones lands.
- **goja hazard**: any accidental `fs`/`path` import into contracts crashes Nakama `InitModule` for every consumer — reuse the exact `require('../../content/*.json')` pattern and keep the esbuild bundle smoke in Phase 1.
- **`quest.giver` referential check** must not import colyseus NPC defs into contracts — use a contracts-local npc allowlist / asset-key-derived set.
- **Drift discipline**: every catalog-shape change regenerates the C# mirror and passes `check_drift_meta.sh`; uncommitted regen is the classic failure — baked into each gate.
- **Reconciling `q_boar_5`** changes live content — update `e2e-meta.sh` and any `"boar"`-pinned fixtures in lockstep.
- **Dialogue scope creep**: capped at offer/complete display strings + accept-gating; a branching dialogue tree is a separate future feature.

### Definition of Done
- `story.schema.json` is real and consumed by both the content gate and a `STORY` catalog in `@atlas/contracts`; `bible.md` regions/factions/era exist as validated data with an id-sync contract.
- `check_content.mjs` validates story entries and fails on dangling `links.story` refs; wired into the release gate with `--require-complete` escalation.
- `QuestDef` carries narrative + giver/prereq/region/faction; `validateCatalogIntegrity` enforces every cross-ref; quest `MOB_KILLED` targets are real mob ids (a server-side test guards it).
- `ZONE_ENTERED` is emitted live and deduped; `q_explore_forest` progresses end-to-end; `ITEM_PICKED_UP` is scaffolded + documented-not-live.
- `accept_quest` enforces prereq/giver gating server-side; quest display strings are generated into the C# client mirror and drift-checked.
- All suites (contracts / colyseus-server / nakama jest), `check_drift_meta.sh`, `e2e-meta.sh`, and `check_content.mjs --require-complete` are green; `docs/meta-systems.spec.md` updated and F-005 roadmap #3 marked delivered; every phase passed its implement→verify→review→refactor→re-verify gate.

---
## Adversarial review findings

**[blocker]** Phase 4 'server-authoritative giver accept-gating' is not implementable as described. accept_quest (nakama/src/rpc/quests.ts) receives ONLY {questId}; there is no accept-context carrying a giver. To reject on 'accept context does not match the offering giver' the server must know which NPC the player is standing at — which requires the in-world offer trigger the plan itself DEFERS to character-content/ui-2d. The only alternative is trusting a client-supplied giver id in the payload, which violates the server-authoritative invariant (clients send intents, server does not trust client-asserted world state). So the phase either can't gate on giver or does so insecurely.

→ _fix:_ Split Phase 4: keep prereq gating (enforceable now — read doc.completed via readDoc(quests)) and drop giver ENFORCEMENT. Ship giver as data/display only. Record real server-authoritative giver-gating as a cross-domain item that lands with the in-world NPC trigger (character-content + the proximity check in colyseus), not as a client-trusted accept param.

**[blocker]** Phase 2 makes title/description required fields on QuestDef but only reconciles q_boar_5. questDefSchema is parsed at IMPORT time via validateCatalogIntegrity + loadCatalog (contracts/src/meta/catalogs.ts), and QUESTS is consumed by nakama (questCatalog.ts -> QUESTS_BY_ID) AND colyseus AND the C# codegen. If q_gather_ore and q_explore_forest are not ALSO backfilled with the new required fields, the zod .strict() parse throws on module load and crashes @atlas/contracts for every consumer, including Nakama InitModule.

→ _fix:_ Backfill required narrative fields (title/description) on ALL three existing quests in the same commit, or make them optional in phase 1 and tighten later. Add a test asserting every quest in quests.json parses and that QUESTS.length is unchanged.

**[high]** Phase 2 giver referential check has no id source to validate against. There is NO npc kind in colyseus-server/generated/asset-keys.json (grep count = 0) and no npcs.json; the bible marks 'the camp npc' as roadmap #1 (unwritten). So a contracts-local npc allowlist would be empty/invented, and 'quest.giver must be a real npc id' can't be enforced until character-content produces NPC sheets/keys. This is a hard dependency, not a nicety.

→ _fix:_ Make giver validation depend on character-content delivering an npc id set (asset-key kind:'npc' or a contracts-local npcs.json derived from it). Until then, leave giver unvalidated/optional and gate the check behind that dependency landing.

**[high]** Phase 3's 'live ZONE_ENTERED' overstates what lands. There is no zone-entry detection nor any zoneId concept in colyseus/GameState today (ZoneEffectManager handles zone EFFECTS, not named-region entry; regions live only as prose ids in bible.md). q_explore_forest targets 'forest_zone', which matches NO real id (regions are region-spawn-meadow / region-icefield / region-thornveil). e2e-meta.sh has ZERO zone references (only the boar MOB_KILLED path). So Phase 3 delivers plumbing + a synthetic RoomEventHandler test, not a runtime feature; the end-to-end zone-quest verification cannot pass without maps-zones providing real zoneIds + entry detection.

→ _fix:_ Re-title Phase 3 as 'scaffold the ZONE_ENTERED emitter seam (+ fake-producer test)'; move the end-to-end q_explore_forest e2e assertion into a maps-zones-gated follow-up. Reconcile q_explore_forest.targetId to a real region id (e.g. region-thornveil) once zone ids exist, and build the new e2e path rather than assuming it exists.

**[medium]** Phase 1's mobFamily validation and Phase 3's zoneId consumption both require goja-safe id sets (mob:* families, zoneIds) to be reachable INSIDE @atlas/contracts, but the asset-key registry lives at colyseus-server/generated/asset-keys.json — outside contracts. The plan says 'consume through the registry/asset-key seam, do not invent ids locally', which is precisely registry-binding's deliverable, yet registry-binding is listed as a peer/consumer rather than a dependency. Without it, Phases 1-3 must either invent local allowlists (the anti-pattern the plan forbids) or block.

→ _fix:_ Add registry-binding to dependsOn as the source of the goja-safe mob-family / zone / npc id sets exposed to contracts. If registry-binding is not ready, explicitly own a small contracts-local mob-family constant (the 6 families are stable) and note it as tech debt to fold into the registry seam later.

**[medium]** check_content.mjs is a standalone node script that reads JSON/markdown and does NOT import @atlas/contracts. The plan says it should 'resolve links.story against the STORY id set' — but importing the compiled TS catalog into an mjs gate would drag the build. This is glossed over.

→ _fix:_ Have check_content.mjs read contracts/content/story.json directly (plain JSON, same as it reads manifest/asset-keys) to build the story-id set, and validate story entries with the already-imported Ajv against story.schema.json. State this explicitly so no one wires a TS import into the gate.

**[low]** Lore/id inconsistency in the reconciliation target: Phase 2 attaches region-spawn-meadow to q_boar_5 (kill 5 aggressive/Ashfang mobs), but bible.md defines spawn-meadow as the safe-ish landing with 'practice hazards, not threats' — Ashfang packs are wilds hunters. faction-ashfang -> mob:aggressive is correct, but the region ref contradicts the bible the plan is trying to make authoritative.

→ _fix:_ Attach a wilds region (or leave region unset) for the aggressive-mob kill quest; keep faction-ashfang. Have the mobFamily/region cross-check catch this class of mismatch if possible.

**[low]** Era/kind naming friction: bible.md's only era is under heading 'Timeline (timeline)' (id 'timeline'), but Phase 1 introduces kind:'era'. The id-sync contract (story.json ids must match bible kebab headings) would force an id of 'timeline' with kind 'era', which is inconsistent and will confuse the validator authors.

→ _fix:_ Either rename the bible heading to an era-* id or drop kind:'era' for v0 (bible has a single stub era). Keep the discriminated schema to region|faction only until history is actually needed (bible says 'expand when quests need history').