# Character/mob content depth + content->server number binding

- verdict: needs-work  |  effort: L  |  dependsOn: ['registry-binding']
- proposed idea: I-006 character roster depth + content→server config binding gate

## Goal

Close BOTH halves of the character-content gap in atlas-world-svc:

1. **Depth** — author the 5 owed sheets (unaligned mobs `mob:balanced`, `mob:hybrid`, `mob:double_attacker`; the camp `npc`; the `player` skin), stabilize the `faction-unaligned` bible roster, and resolve the boss question for `double_attacker`.
2. **Binding** — install a **data-driven, server-authoritative** bridge that validates the sheet ↔ asset-key ↔ server-config **triple** and closes the two currently-unchecked string couplings, **without moving balance numbers out of server TypeScript**. The v1 boundary is crossed only as a *validated reference/consistency check*, never a source-of-truth move.

**Central design decision (R1, needs user sign-off):** numbers STAY in `colyseus-server/src/config/mobs/definitions/*.ts` + `combatStats.ts`. The sheet gains a validated reference + an advisory enum↔number-band consistency check. Sheets never originate numbers; the client never sends them.

---

## Dependencies

- **dependsOn: `narrative-story`** — sheets' `links.story` must anchor to stable bible ids. This plan adds the `faction-unaligned` + player/camp nouns to the free-prose `content/story/bible.md` v0 itself (Phase 0), but the *formal* story schema (narrative-story's roadmap #3) stays out of scope; if narrative-story reworks bible ids, re-anchor.
- **sharedInfra (built here, consumed by `registry-binding`):** `generated/character-bridge.json`, the `check_content.mjs` triple-validation, the prefix-transform, the `NPCTypeConfig` registry pattern, and the codegen guard-test.

---

## Phase 0 — R1 design decision + bible roster stabilization

**Tasks**
- Record the R1 decision (numbers stay server-side; sheet gets a validated *reference*, not the numbers) and get explicit user sign-off before any Phase-3 code.
- Resolve two product questions: (a) is `mob:double_attacker` (hp 810, radius 8, `boss_area`) authored as `role:boss` or `role:enemy`? (b) one visual per `npc`/`player` or skins per `player-skin`? Confirm against `game-client/src/World/EntityKeys.cs` `Npc()/Player()` resolvers.
- Extend `content/story/bible.md` `faction-unaligned` section: give `mob:balanced`, `mob:hybrid`, `mob:double_attacker`, and the camp `npc` stable kebab-case headings so `links.story` targets exist (bible rule: add the noun first). Stay free-prose v0.
- Add a player/camp anchor (e.g. `expedition-party`, `meadow-camp`) for the player sheet.

**Verify (evidence):** grep the new ids back out of `bible.md`; confirm each intended `links.story` target resolves to a real heading; decision doc written + sign-off captured.

**Quality gate:** implement → verify (grep + sign-off) → independent adversarial review of the bible diff (tone rules: hard consonants for hostiles, soft compounds for places; id stability) → refactor wording/ids → re-verify grep.

---

## Phase 1 — Unaligned mob roster depth (3 sheets)

**Tasks**
- Author `content/characters/mob-balanced.md`, `mob-hybrid.md`, `mob-double-attacker.md` from `_template.md`; `id` == filename slug; `assetKey` = `mob:balanced|mob:hybrid|mob:double_attacker`.
- Set `status`/`tier` honestly vs `game-client/assets/manifest.json` (gate cross-checks tier for forged/shipped).
- Pick `stats` enums to match the shipped server numbers in intent (double_attacker → durability:high; balanced → mid) — these feed the Phase-4 enum↔band assertion. Keep the "numbers stay server-side (v1 boundary)" note in Design Notes.
- `links.story` → Phase-0 `faction-unaligned` ids; non-empty Lore + Visual Brief. If Phase 0 chose boss, set `role:boss`.

**Verify (evidence):** `node scripts/check_content.mjs` → 0 failures; then `--require-complete` → the three balanced/hybrid/double_attacker coverage warns are gone. Storybook eyeball if characters are rendered.

**Quality gate:** implement → run gate (both modes) → adversarial review of the 3 sheets (enum honesty vs server numbers, id/filename, story anchors) → refactor → re-run gate.

---

## Phase 2 — Player + NPC content and the NPC data home

**Tasks**
- Author `content/characters/player-expedition.md` (`player`, `role:player-skin`) and `npc-camp-quartermaster.md` (`npc`, `role:npc`); slug==id; story anchors from Phase 0.
- Give NPC depth a real data home: add `colyseus-server/src/config/npcs/` mirroring `src/config/mobs/` — an `NPCTypeConfig` interface (single options object, MobTypeConfig style, no boolean-flag branching), `index.ts` `NPC_TYPES` registry, `getNpcTypeById(id)`. Seed ONE camp-NPC config referencing `combatStats` `PLAYER_STATS` baselines (numbers stay server-side).
- Wire `GameState.addNPC(options)` (`src/schemas/GameState.ts:133`) to optionally take `npcTypeId`, resolved via `getNpcTypeById` into `NPCOptions.stats`, preserving the existing single-options-object `NPCOptions` contract + `DEFAULT_NPC_STATS` fallback. No lifecycle (`die()`/`readyToBeRemoved`) or combat changes; combat stays in BattleModule.

**Verify (evidence):** `colyseus-server/src/tests/npc/npcTypesConfig.test.ts` — `getNpcTypeById` hit + undefined-on-miss; `addNPC({npcTypeId})` applies config stats, no-id falls back to defaults. `cd colyseus-server && npm test -- npcTypesConfig` green + `npm run build` (strict, no `any`). `node scripts/check_content.mjs --require-complete` → npc + player coverage warns gone.

**Quality gate:** implement → run tests+build+gate → adversarial review (single-path API adherence, no lifecycle bleed, server-authoritative) → refactor → re-run tests+build.

---

## Phase 3 — Data-driven binding: triple validation + generated bridge

**Tasks**
- Add codegen producing `colyseus-server/generated/character-bridge.json`: per character asset-key, record the **explicitly prefix-stripped** bare server id (mirror `EntityKeys.cs` `Mob()`; never assume prefixed==bare) and whether a `MobTypeConfig`/`NPCTypeConfig` exists. Transform lives in ONE place.
- Extend `scripts/check_content.mjs` to validate the TRIPLE per key: asset-key ↔ server config ↔ sheet. Missing edges = WARN by default, FAIL under `--require-complete` (follows the existing warn-vs-fail / exit-code discipline).
- Close the SECOND coupling: validate `mapConfig.mobSpawnAreas[].mobType` + `mobSpawnConfig` ids against `getMobTypeById` (bare id) so a typo can't silently `undefined`→skip a spawn (`MobLifeCycleManager.ts:144`) — FAIL (hard bug, not coverage).
- Bridge is generated FROM server config; nothing lets a sheet/client inject numbers.

**Verify (evidence):** `colyseus-server/src/tests/codegen/gen-character-bridge.test.ts` (mirrors `gen-asset-keys.test.ts`) — regenerate + assert equals committed file (drift guard), green. Run the gate three ways and capture exit codes: clean → 0; sheet→config-less key → WARN(0)/FAIL(1 under --require-complete); typo mapConfig mobType → FAIL(1).

**Quality gate:** implement → run drift test + 3-way gate probes → adversarial review (prefix transform correctness, warn-vs-fail contract, server-authoritative) → refactor (dedupe transform) → re-run probes.

---

## Phase 4 — Enum↔number band consistency + CI wiring

**Tasks**
- Add an advisory enum→band table (data) + a `check_content.mjs` check asserting each sheet's `archetype/durability/speed/threat` are consistent with the bound server config's hp/speed/damage — WARN on divergence (design intent vs shipped numbers drifting is a smell, not a build break). This is the mechanism that stops sheet and server silently disagreeing.
- Wire `node scripts/check_content.mjs --require-complete` into Gate 1 (`precheck.sh` / repo check script) so coverage + triple + spawn validation run every ship — only AFTER Phases 1-2 close the sheet gaps.
- Update `docs/superpowers/specs/2026-07-19-content-pipeline-design.md` (or a decision doc) recording the crossed v1 boundary. Keep any new template field (e.g. optional `serverConfigId`) optional so existing sheets stay valid.

**Verify (evidence):** deliberately mismatched sheet (archetype:tank on low-hp config) → enum-band WARN at exit 0; revert. Full gate + `cd colyseus-server && npm test && npm run build`. Run wired precheck end-to-end → exit 0. Confirm `--require-complete` FAILs if any character key regresses to no-sheet.

**Quality gate:** implement → run mismatch probe + full gate + tests + precheck → adversarial review (advisory-not-hard-fail, band table honesty, docs match behavior) → refactor → re-verify.

---

## Definition of done

- All 8 character asset-keys have exactly one sheet; `node scripts/check_content.mjs --require-complete` exits 0 with no coverage warns.
- `faction-unaligned` roster (+ boss decision) is stable in `bible.md`; every `links.story` resolves.
- `player` and `npc` sheets exist; NPC has a real config home (`src/config/npcs/` registry) consumed via the single-options-object `addNPC` path, unit-tested both branches.
- `generated/character-bridge.json` exists, drift-guarded by a codegen test; `check_content.mjs` fails on a broken triple (under `--require-complete`) and on a `mapConfig.mobType` typo (always).
- Enum↔number-band divergence emits a WARN; numbers remain 100% server-side (server-authoritative preserved).
- `--require-complete` gate wired into CI; `npm test` + `npm run build` green; R1 boundary decision recorded with user sign-off.

---

## Invariants honored
- **Server-authoritative:** numbers never leave server TS; bridge is generated FROM config; client/sheet inject nothing.
- **Single-path APIs:** `NPCTypeConfig`/`addNPC` take one options object, no boolean-flag branching (matches `MobTypeConfig`/`NPCOptions`).
- **Entity lifecycle untouched:** no `die()`/`readyToBeRemoved`/count-semantics changes; combat stays centralized in BattleModule.
- **Prefix conventions reconciled explicitly** (mob:x ↔ x ↔ mapConfig x), one transform, drift-guarded.
- **TS strict, no unjustified `any`; tests next to existing** (`src/tests/npc/`, `src/tests/codegen/`).
- **Gate discipline:** warns at exit 0, hard fails exit 1, `--require-complete` escalates coverage.

---
## Adversarial review findings
