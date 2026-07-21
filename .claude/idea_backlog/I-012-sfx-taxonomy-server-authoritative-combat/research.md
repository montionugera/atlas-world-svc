# SFX taxonomy + combat/event binding

- verdict: needs-work  |  effort: L  |  dependsOn: ['registry-binding', 'character-content']
- proposed idea: SFX taxonomy + server-authoritative combat event to SFX binding

## sfx-events — SFX taxonomy + server-authoritative combat event→SFX binding

### Goal
Turn 31 untaxonomized `kind:unknown` SFX into a categorized library, and make a **landed hit map to a material-appropriate impact sound** through a **server-authoritative, discrete server→client SFX event channel**. Audio is a **read-only reaction**: the server decides which sound a gameplay event produces and broadcasts a lightweight message; the client only resolves + plays. Bind the event keys to the manifest **drift-proof** via the shared codegen key-set.

### Architecture decision (explicit — NO MAGIC)
The prompt states *"server emits gameplay events; client resolves to SFX"* → we build **(B) a discrete `room.broadcast('sfx', {key,x,y})` channel**, not the existing **(A)** client-side HP-inference. This fixes the fidelity losses (multiple hits per 50ms patch, block/miss/HP-unchanged) and enables material-aware selection the client cannot infer from synced state. **Confirm this fork before starting Phase 2.**

### Invariants honored
- **Server-authoritative always** — clients send input intents only; SFX is a reaction to server-decided events, never a client-driven mutation.
- **Single-path APIs** — `resolveSfx({category, material, weight})`, `Play({...})`; explicit keys, no boolean flags / positional overloads.
- **Combat stays centralized in BattleModule** — SFX derivation is a *pure resolver* reading event payloads; it never duplicates damage logic.
- **EventBus for events** — the relay subscribes to existing `BATTLE_DAMAGE_PRODUCED`/`BATTLE_ATTACK`; entity death still flows through `entity.die()`.
- **World-units + `performance.now()`** for any timing; **TS strict, no unjustified `any`**; **tests colocated** in `colyseus-server/src/tests/`.

---

### Phase 1 — Unblock Godot imports + taxonomize the manifest (client-only)
**Tasks**
- Re-import the **29** `.ogg` lacking `.import` siblings: `godot --headless --path game-client --import` (only `chop`, `knifeSlice` have them today → `ResolveStream` currently `ResourceLoader.Exists==false` for the other 29).
- Add a taxonomy block to each of the 31 entries in `game-client/assets/audio-manifest.json`: `kind:'audio'`, `category` (`impact|attack|death|shatter|chime|ui`), `material` (`flesh|metal|wood|plate|generic`), `weight` (`light|medium|heavy`); group interchangeable takes (`_alt`) for variant picking. Leave `stream`/`license`/`source` untouched.
- Verify render-spec compat: `kind:'audio'` → `kindDefaultRender['audio']='audio'`; audio renderer `require:['license']` only, so new fields are additive.
- Bump manifest `version 1→2`; update `tools/asset-storybook/index.html` so tiles show `category`/`material` badges instead of `entry.kind || 'unknown'`.

**Verification (evidence)**
- `ls game-client/assets/audio/*.import | wc -l == 31`.
- `node colyseus-server/scripts/check_asset_manifest.mjs` → exit 0.
- New `colyseus-server/src/tests/audioTaxonomy.test.ts`: every entry has valid `category/material/weight` enum values (fails on any missing/typo).
- `node scripts/gen_audio_index.mjs` + eyeball storybook soundboard = real badges, no `unknown`.

**Quality gate:** implement → run the four checks above → independent adversarial review of the diff (fresh subagent / `/code-review`) → refactor (dedupe taxonomy enums into one shared const, kill dead fields) → re-run checks green.

---

### Phase 2 — Server SFX derivation + discrete broadcast channel
**Tasks**
- New pure resolver `colyseus-server/src/modules/sfx/SfxEventResolver.ts`, single-path `resolveSfx({category, material, weight}) → key` (or variant list). **No combat math** — BattleModule stays the sole owner of damage.
- Material source: add `surfaceMaterial` (`flesh|metal|wood|plate`, default `flesh`) to `mobTypesConfig.ts`; map `WEAPON_TYPES → category/weight`; pick `weight` from damage magnitude. Unknown → `'generic'`.
- New `SfxRelayHandler` (`colyseus-server/src/rooms/handlers/`) subscribes to `BATTLE_DAMAGE_PRODUCED` (+`BATTLE_ATTACK` for whiff) and calls `room.broadcast('sfx', { key, x, y })` at the taker's world position — the **first `broadcast()` in `rooms/`**. Discrete per-hit message (preserves fidelity the 50ms schema patch would coalesce).
- Wire in `GameRoom.onCreate` next to `RoomEventHandler`. Read-only; no client input path.

**Verification (evidence)**
- `colyseus-server/src/tests/sfxEventResolver.test.ts` — material/weight/category matrix, `'generic'` fallback, whiff path.
- `colyseus-server/src/tests/sfxRelayHandler.test.ts` — mocked `BATTLE_DAMAGE_PRODUCED` (metal vs flesh taker) → `room.broadcast('sfx',...)` with expected key + position (mock `broadcast`, mock timing).
- `npm test -- sfx` green; `npm run build` (tsc strict) clean.

**Quality gate:** implement → run tests+build → adversarial review (does it leak into gameplay? is combat still centralized? single-path?) → refactor → re-verify.

---

### Phase 3 — Drift-proof the event-key ↔ manifest binding (shared codegen + gate)
**Tasks**
- Add `'sfx:'` to `render-spec.json` `codegenReservedNamespaces` (today: `player/npc/mob:/projectile:/zone:/item:`).
- Emit `sfx:` keys from `colyseus-server/scripts/codegen/gen-asset-keys.ts` from a declared `SFX_EVENTS`/taxonomy matrix (never hand-copied); tag `kind:'audio'`; deterministic output.
- Regenerate `generated/asset-keys.json` + `generated/csharp` constants bridge → server emit keys and client manifest keys become **one generated source** (kills the `'sfx:hit'` magic-string duplication).
- Flip `audio-manifest.json` to `driftGated:true` in `check_asset_manifest.mjs` — **R1, reverses an intentional decision; PR flags owner sign-off.**

**Verification (evidence)**
- `ts-node gen-asset-keys.ts` → `git diff generated/asset-keys.json` shows new `sfx:` keys.
- `check_asset_manifest.mjs` (now gating audio) → exit 0.
- **Negative test:** delete one manifest entry (or one codegen key) → gate exits non-zero → restore.

**Quality gate:** implement → run gen+gate (incl. negative) → adversarial review of the drift contract → refactor → re-verify.

---

### Phase 4 — Client taxonomy-aware resolution + consume server events
**Tasks**
- Extend `game-client/src/Audio/AudioRegistry.cs`: `ResolveByTaxonomy({category,material,weight})` variant pick; **keep** `Play(eventKey, worldPos)` + never-throw/warn-once contract.
- Client net handler subscribes to the Colyseus `'sfx'` broadcast → `AudioRegistry.Instance?.Play(msg.key, new Vector3(msg.x, 0, msg.y))`. **Remove the `sfx:hit` HP-inference in `EntityView.cs`** (server now authors hits with material fidelity; a block/miss correctly plays nothing).
- Keep death/attack `AnimationController` state-edge as cosmetic fallback OR migrate to server events; use the **generated C# key constants** from Phase 3 instead of `SfxAttack/SfxDeath/'sfx:hit'` literals.

**Verification (evidence)**
- Extend `game-client/src/Audio/AudioVerify.cs` (`ATLAS_VERIFY_SFX=1`): every taxonomy combo resolves non-null; a synthetic `'sfx'` message → `Play` returns a spawned `AudioStreamPlayer3D`.
- Godot headless build + probe pass; confirm hit fires **once** per server event (no double-trigger).

**Quality gate:** implement → run probe+build → adversarial review (did the inference removal regress anything? key constants used?) → refactor → re-verify.

---

### Phase 5 — End-to-end binding coverage gate + real-hit verification
**Tasks**
- Binding-coverage gate (extend `check_asset_manifest.mjs` or new `scripts/check_sfx_bindings.mjs`): every server-emittable key resolves to a taxonomized manifest entry, and every combat outcome (hit-per-material, death, attack/whiff, shatter) has ≥1 reachable key — closes the "no gate tying events↔SFX" gap.
- Full loop: boot server + Godot client (or headless integration), land hits on a **flesh** vs **metal/plate** target with the same weapon; confirm distinct broadcast keys + distinct played impacts.
- Document the event→SFX contract (payload shape, enums, how to add a SFX) so **vfx-events** reuses the channel.

**Verification (evidence)**
- New gate runs in CI, exit 0; a deliberately unmapped material fails it.
- Captured server log: `room.broadcast('sfx',{key:'sfx:impact_metal_heavy'...})` for metal, `sfx:impact_flesh_*` for flesh, same weapon.
- Client probe/eyeball: the two play different streams. Real output attached — no "should work".

**Quality gate:** implement → run gate + e2e → adversarial review → refactor → re-verify.

---

### Dependencies
- **`registry-binding` (hard)** — owns `generated/asset-keys.json` (D3 source of truth), `render-spec.json`, and `check_asset_manifest.mjs`. Phase 3 extends these; must be stable first.
- **`character-content` (soft)** — per-creature `surfaceMaterial` values live on mob/character sheets. Plan ships a `'flesh'` default so it is executable standalone; real values arrive with character-content.

### Shared infra (owned jointly / handed to vfx-events)
- The `'sfx:'` codegen namespace + audio-key emission; the discrete `room.broadcast` gameplay-event channel + payload contract; the generated C# key-constants bridge; the drift-gate extension. **vfx-events** should reuse the same broadcast channel (`room.broadcast('vfx',...)`).

### Definition of Done
1. All 31 SFX carry valid `category/material/weight`; storybook shows badges, not `unknown`.
2. A server-decided hit broadcasts a discrete `'sfx'` event; client plays a **material-appropriate** impact (metal ≠ flesh), verified with captured evidence.
3. `sfx:` keys are codegen-emitted and `audio-manifest.json` is `driftGated:true` — deleting a key/entry fails CI.
4. Client consumes server events (HP-inference for hits removed); no double-triggers; never-throw preserved.
5. Binding-coverage gate green in CI; every combat outcome has a reachable SFX.
6. Every phase passed implement→verify→review→refactor→re-verify.

### Effort: **L** (server event channel + payload material dimension + manifest taxonomy + codegen/gate + client resolver upgrade + Godot reimport + colocated tests). Not XL — the client resolver, manifest, gate, and EventBus emitters already exist and are extended, not built from scratch.

---
## Adversarial review findings

**[blocker]** Phase 3 flips audio-manifest.json to driftGated:true, but the gate's guard (A) in scripts/check_asset_manifest.mjs is `if (source.driftGated && !r.sceneLoadable) FAIL`. The `audio` renderer in render-spec.json is `sceneLoadable:false`. So flipping the flag makes ALL 31 audio entries hard-fail with 'codegen-keyed entry cannot use render=audio (not Godot-instantiable)'. Phase 3 verification 'check_asset_manifest.mjs (now gating audio) -> exit 0' and Phase 5's --require-complete gate are IMPOSSIBLE as written. music-manifest is deliberately curated for exactly this reason. The plan treats this as R1 sign-off only; it is actually a gate-CODE conflict that is never addressed.

→ _fix:_ Before flipping driftGated, modify the gate: guard (A) must exempt non-sceneLoadable renderers (e.g. add a per-source `sceneLoadableRequired` flag, or make (A) only apply when `r.pathField==='scene'`). This is a change to a registry-binding-owned file and must be coordinated with that domain. Add it as an explicit Phase-3 task with its own test (a driftGated audio entry passes). Until then, keep audio-manifest driftGated:false and enforce the binding with a separate JS coverage check (see below).

**[high]** The 31 existing manifest keys are IRREGULAR, not a clean category×material×weight matrix: sfx:attack, sfx:hit, sfx:death, sfx:punch_medium(_alt), sfx:punch_heavy(_alt), sfx:impact_tin, sfx:impact_plank, sfx:chime_soft/bright, plus _alt variants and uneven weight coverage (flesh has soft/soft_alt/heavy but no medium; wood has no _alt; plate has no _alt). A codegen matrix (Phase 3) cannot reproduce these exact ids. Once driftGated:true with --require-complete (which the DoD 'deleting a key fails CI' implies), every generated-but-absent key is an UNMAPPED failure and every manifest-but-ungenerated key is an UNKNOWN warning. The 'never hand-copied' claim collapses: you must either hand-declare all 31 irregular ids in SFX_EVENTS (that IS hand-copying) or restructure/rename the manifest (churn + breaks legacy keys the client already plays).

→ _fix:_ Decide the key model explicitly: (a) keep the manifest as the source of truth and derive the gate's expected set FROM the manifest keys (not a matrix), so codegen emits exactly what exists; OR (b) commit to restructuring to a strict matrix and migrate legacy keys, accepting the client-side churn. Do not claim a generated matrix drift-proofs an irregular hand-authored key set — reconcile them in Phase 1 before any codegen work.

**[high]** sharedInfra and Phase 3 assume a 'generated/csharp shared event-key constants bridge' that you 'regenerate'. It does not exist. generated/csharp/ holds only meta contracts (gen-csharp-meta.ts) and Runtime/; grep for asset-keys/AssetKey/sfx in generated/csharp returns nothing. There is no C# emitter for asset/sfx key constants today (gen-asset-keys.ts emits only asset-keys.json). Phase 4 'use the generated C# key constants instead of literals' therefore depends on an artifact that must be BUILT, not regenerated — a new codegen emitter wired into gen-csharp + consumed by the Godot client build. This is a NO-MAGIC violation (asserting infra that isn't there).

→ _fix:_ Add an explicit task+verification to create a C# asset-key-constants emitter (new gen-csharp-assetkeys.ts or extend gen-csharp), wire it into the codegen scripts, ensure the generated .cs compiles in the Godot build, and only then have Phase 4 consume it. Re-estimate effort accordingly.

**[medium]** The resolver's declared inputs aren't in the event payloads. DamageProducedData = {attacker: WorldLife, taker: WorldLife, impulse?} — no weapon, no category, no material. BattleAttackData = {actorId, targetId?, damage, range, roomId} — no x/y. So Phase 2's 'read attacker weapon + damage magnitude to choose category/weight' and 'broadcast at taker world position' have gaps: weapon/category must be sourced from the attacker entity (no weapon field found on WorldLife) or the payload extended; and the BATTLE_ATTACK whiff path has no position and no taker at all — it must look up the actor by actorId in GameState for x/y.

→ _fix:_ Specify the material/category/weight sourcing precisely: read taker.x/taker.y (WorldLife has them) for hit position; for whiff, resolve the actor entity by actorId from GameState. If weapon-derived category is required, either add a weapon/equipped field to the attacker entity or extend BattleAttackData/DamageProducedData — and note that extending a payload touches all 5 BATTLE_DAMAGE_PRODUCED emit sites (BattleModule x2, DeflectionResolver, ProjectileCollisionResolver x3).

**[medium]** surfaceMaterial resolution path is underspecified. The field is placed on mobTypesConfig.ts, but the taker in the event is a WorldLife instance; only Mob carries mobTypeId (WorldLife base, Player, NPC do not). So material is resolvable only for mobs (via mobTypeId->config lookup); players/NPCs always fall to the 'flesh' default. The plan implies per-actor material generally but the bridge from a WorldLife event payload to a config material value is not defined.

→ _fix:_ Define the entity->material function explicitly: mob taker -> MOB_TYPES[mobTypeId].surfaceMaterial; Player/NPC -> a documented default. Put it in the pure resolver module and unit-test the mob vs player vs unknown branches.

**[medium]** Three of five phases' 'evidence' depend on a Godot binary being present: Phase 1(a) headless reimport of 29 .ogg (ls *.import | wc -l == 31), Phase 4 AudioVerify.cs headless probe, Phase 5 e2e boot of the Godot client. The plan's own risk #5 admits CI may lack Godot. If so, these verification steps are unrunnable and the .import files must be committed as generated artifacts (churn/diff risk), and Phase 5's 'real-hit' proof degrades to manual-only.

→ _fix:_ State the CI reality up front: if no Godot in CI, commit the .import siblings as artifacts (document generation), make the server-side gates (jest, check_asset_manifest, binding-coverage) the CI-enforced evidence, and mark the Godot probe/e2e as local-only manual verification — do not present them as automated gates.

**[low]** BattleModule emits BATTLE_DAMAGE_PRODUCED for both the attack path (line ~139) and the damage-action path (line ~521), and PlayerCombatSystem/MobCombatSystem/NPCCombatSystem separately emit BATTLE_ATTACK. A single SfxRelayHandler subscribing to both BATTLE_ATTACK (swing) and BATTLE_DAMAGE_PRODUCED (hit) may double-fire SFX for one swing that lands (attack sound + impact sound in the same tick), or fire twice across the two DAMAGE_PRODUCED sites. The plan does not address dedup/ordering across the 5 emit sites.

→ _fix:_ Define the event->SFX mapping table explicitly (which RoomEventType produces which category) and decide intended layering (swing whiff vs landed impact are distinct sounds = OK; but guard against the same logical hit emitting DAMAGE_PRODUCED twice). Add a relay test asserting one hit => exactly one impact broadcast.

**[low]** The per-hit room.broadcast('sfx') is invoked from the EventBus callback, which fires synchronously during the sim tick (physics/projectile/battle processing), not from GameSimulationSystem's ordered pass. At maxClients=1 it's fine, but this adds unbounded per-hit, per-client fan-out work into the tick path for the 150-300 player target. The plan flags AOI as a follow-up (good) but does not flag that the broadcast executes inside tick-time event handling.

→ _fix:_ Keep the flag that unfiltered broadcast is not the prod answer, and additionally note the broadcast runs in tick-time event handlers; the AOI/relevance follow-up must bound both fan-out AND per-tick cost.