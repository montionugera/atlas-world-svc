# Registry reconciliation + cross-cutting content->runtime spine

- verdict: needs-work  |  effort: M  |  dependsOn: []
- proposed idea: I-007 — Registry reconciliation + content→runtime binding spine (event contracts, kind taxonomy, CI-verified client resolver)

## registry-binding — Registry reconciliation + content→runtime binding spine

**ps-release-workflow idea:** I-007 — Registry reconciliation + content→runtime binding spine (event contracts, kind taxonomy, CI-verified client resolver)
**Effort:** M · **Depends on:** none (this is the foundational shared-infra lane) · **Blocks:** maps-zones, narrative-story, sfx-events, vfx-events, character-content, ui-2d

### Goal
Reconcile the stale F-002 `status:open` catalog row against shipped reality, then harden the *already-existing* content→runtime registry into one documented, CI-verified binding contract — `gen-asset-keys.ts` (D3 SSOT) ↔ `render-spec.json` taxonomy ↔ the four manifests ↔ `check_asset_manifest.mjs`/`check_content.mjs` gates ↔ the Godot `AssetRegistry` three-tier resolver — plus a formal **event→asset-key binding contract** so every downstream content lane binds against one authoritative spine instead of convention.

### Recon correction (verified against the repo, 2026-07-20)
The gap is **smaller and more reconciliation-shaped** than framed:
- **All 7 F-002 tasks are effectively delivered.** The client-side residual is present: `game-client/src/Content/AssetRegistry.cs` (three-tier resolve), `EntityView.cs`/`EntityVisuals.cs` (render wiring), and env-gated headless probes (`RegistryVerify`, `ManifestVerify`, `EntityViewVerify`, `AnimationVerify`, `AudioVerify`, `FacingVerify` in `GameRoot.cs`).
- **render-spec already defines `skybox` + `video`** (and `theme`/`material`/`texturemap`) — the recon's "undefined renderer" inconsistency is already fixed.
- **True residual:** (1) stale catalog bookkeeping; (2) the Godot verify probes are **not wired into CI** (`.github/workflows/ci.yml` has no Godot step); (3) audio taxonomy hole (`audio-manifest.json`: 31 entries, 0 carry `kind`; `prop`/`vfx` have no `kindDefaultRender`); (4) no single registry-contract doc; (5) no formalized event→asset-key contract.

---

### Phase 1 — Reconcile F-002 truth vs catalog
**Tasks**
- Map each of I-003/F-002's 7 tasks (`docs/superpowers/plans/2026-07-12-asset-pipeline.md`) to the commit/release that delivered it (Task 3 = `AssetRegistry.cs`, Task 4 = `EntityView`/`EntityVisuals`, Task 5 = `check_asset_manifest.mjs`, Task 7 = CC0 seed ingest, etc.).
- Fill the empty skeleton `.claude/refined_backlog/F-002-.../spec.md` with the delivered architecture + a provenance table (task → commit → release).
- **R1, user-owned decision:** retro-mark F-002 promoted (documenting delivery) **or** close I-003/F-002 as delivered-under-others and re-scope Phases 2–5 into I-007. Route through the ps-release-workflow `_release` worktree — **never hand-edit `_catalog.json`**.

**Verify:** `/ps-release-workflow:status` shows F-002 is no longer the lone `open` row; provenance table cross-checks against `git log` hashes; the `_release` worktree diff shows only toolkit-authored catalog changes.

**Quality gate:** implement → run status/log verification → independent adversarial review of the spec + provenance diff (fresh subagent: is every task→commit claim real? any off-process catalog edit?) → refactor the doc for accuracy → re-run status.

---

### Phase 2 — Single registry contract doc + close taxonomy holes
**Tasks**
- Author `docs/superpowers/specs/2026-07-20-asset-registry-contract.md`: the one-page index tying `asset-keys.json` → `render-spec.json` → four manifests (guards G/H disjoint) → `check_asset_manifest.mjs` (A/B/C/E/G/H + license-policy) → `check_content.mjs` → Godot `AssetRegistry`.
- In `render-spec.json`, add `kindDefaultRender` for `prop` and `vfx` (→`model3d`) so every declared `AssetKind` has a default renderer; record that `skybox`/`video` already exist.
- Decide the audio `kind` policy (soft-guard requiring `kind:audio`, **or** sanctioned ext-based resolution) and make gate behavior match the doc. Single-path `--flag` API only.
- Add a jest/gate assertion that every `AssetKind` in `gen-asset-keys.ts` has a `kindDefaultRender` or provably carries explicit `render` — future kinds can't silently lack a renderer.

**Verify:** `node scripts/check_asset_manifest.mjs` + `node scripts/check_content.mjs` → exit 0; new taxonomy-completeness test green; storybook (`tools/asset-storybook/index.html`) eyeball → no undefined-renderer console warnings; `/render-spec` the contract doc.

**Quality gate:** implement → run both gates + test + storybook → adversarial review of the render-spec diff (do both consumers — gate & storybook — read it identically?) → refactor → re-run gates.

---

### Phase 3 — Formalize the event→asset-key binding contract
**Tasks**
- Document the checked mapping: `Mob.mobTypeId`→`mob:<id>`, `Projectile.type`→`projectile:<Type>`, `ZoneEffect.type`→`zone:<type>`, `Player`→`player`, `NPC`→`npc` — the forms `gen-asset-keys.ts` emits and `AssetRegistry.Resolve` consumes. This is what sfx-events/vfx-events bind to (they add `sfx:`/`vfx:` forms downstream — their dependsOn on this contract).
- Add a colyseus-server jest test (`src/tests/codegen/`) asserting round-trip completeness: every `asset-keys.json` key is reconstructible from its schema field's value space, and no asset-bearing field lacks a key. Keys derive from **synced schema only** (server-authoritative — never client input).
- Extend the Godot `RegistryVerify` fixture (`res://assets/tests/registry_fixture.json`) with one case per key form; confirm `AssetRegistry.Resolve`'s accepted forms match `codegenReservedNamespaces`.

**Verify:** `npm test -- src/tests/codegen` green; `ATLAS_VERIFY_REGISTRY=1 godot --headless` → per-case PASS + exit 0 covering every form; grep confirms no combat logic leaked outside `BattleModule`, no hand-listed key.

**Quality gate:** implement → run jest + headless probe → adversarial review (could a schema field bypass the contract? is binding still server-authoritative?) → refactor → re-run both.

---

### Phase 4 — Wire the client verify probes into CI
**Tasks**
- Add a Godot headless job to `.github/workflows/ci.yml` (after node/jest/gate) that imports `game-client` and runs `ATLAS_VERIFY_MANIFEST=1`, `ATLAS_VERIFY_REGISTRY=1`, `ATLAS_VERIFY_ENTITYVIEW=1`, each surfacing its exit code (today the client half can silently drift — no Godot step exists).
- Ensure committed fixtures (`res://assets/tests/*`) are present + license-clean; scope the job to `game-client/**` + `assets/**` changes to keep the pipeline fast, seed-tier warnings-only per Stage-0 discipline.
- Document the local env-var probe matrix in the contract doc.

**Verify:** `gh pr checks` shows the new Godot job green; break a fixture path locally → corresponding probe returns exit 1 (gate bites) → revert; existing node/jest/forge steps unchanged.

**Quality gate:** implement → watch CI green + prove the failure path → adversarial review of the workflow diff (flake surface? does it actually fail on regression?) → refactor (cache/scope) → re-run CI.

---

### Phase 5 — content→server binding seam + final integration
**Tasks**
- Spec the content→server-config codegen **seam** in the contract doc honoring the v1 boundary: content/ owns design/identity/enum-stats; server balance NUMBERS stay in `src/config` until a future stats-codegen (roadmap #2). Mark number-emitting codegen **deferred**, not built here.
- Implement only the additive slice: strengthen `check_content.mjs` link-check so a character sheet whose `assetKey` has no codegen key (or wrong kind/tier) warns today, hard-fails under `--require-complete`; jest case in `scripts/lib/check_content.test.mjs`. No server config emitted/mutated.
- Add the extension recipe: new key type (enumerate from a REAL config in `gen-asset-keys.ts`, never hand-list), new renderer/kind (edit `render-spec.json` only), new curated keyspace (disjoint, non-reserved, license-clean).

**Verify (definition-of-done sweep):** `npm run build && npm test` (colyseus-server) + `check_asset_manifest.mjs` + `check_content.mjs` + `check_content.mjs --require-complete` + `tools/asset-forge/validate.mjs` + all three Godot probes → all exit 0; storybook resolves every source; `/ps-release-workflow:status` shows ready to ship.

**Quality gate:** implement → full sweep → adversarial review of the whole diff (did anything violate the content/server ownership boundary or server-authoritative rule?) → refactor → re-run the full sweep.

---

### Definition of Done
- F-002 catalog row reconciled through ps-release-workflow (no lone `open`, no off-process edit).
- One authoritative `asset-registry-contract.md` describes the full spine + event→asset-key contract + extension recipe.
- `render-spec.json` taxonomy is hole-free (every `AssetKind` has a default renderer; audio policy documented + enforced).
- Event→asset-key binding is contract-checked in jest + the Godot `RegistryVerify` probe.
- CI runs the Godot headless verify probes — the client half of the spine can no longer silently drift.
- content gate is strictly additive; server balance numbers untouched; every gate + probe exits 0.

### Cross-domain notes (do NOT absorb — track as edges)
- **sfx-events / vfx-events** depend on this lane's event→asset-key contract (Phase 3) to add `sfx:`/`vfx:` key forms.
- **character-content** depends on the strengthened content link-check (Phase 5) + the contract doc.
- **maps-zones / narrative-story** depend on the taxonomy + reserved-namespace rules; their stub schemas (`content/schemas/{map,story}.schema.json`) are downstream consumers, promoted in their own lanes.
- **stats-codegen (roadmap #2)** — content→server *number* emission — is a future dependency direction, explicitly out of scope here.

---
## Adversarial review findings

**[high]** Phase 2 edits render-spec.json (adds kindDefaultRender for prop/vfx) but its verification only re-runs the .mjs gate and eyeballs storybook. The repo comment at check_asset_manifest.mjs:147-149 states resolveRender is 'mirrored byte-for-byte' in a THIRD consumer: game-client/src/Content/AssetRegistry.cs (Resolve), which reads render-spec.json at RUNTIME. So this is a client-behavior change, not tooling-only. Verifying gate+storybook but not the C# resolver is exactly the 2-of-3 coverage that lets the mirror silently diverge, the precise failure the shared-file design prevents.

→ _fix:_ Add 'ATLAS_VERIFY_REGISTRY=1 godot --headless' (plus ManifestVerify) to Phase 2 verification, run after every render-spec edit, not deferred to Phase 3/4. Treat all three resolveRender consumers (.mjs gate, AssetRegistry.cs, storybook JS) as one atomic change set.

**[medium]** Defaulting vfx->model3d bakes the current 3D-projectile assumption into the taxonomy the downstream vfx-events lane depends on. gen-asset-keys emits kind:vfx only for projectiles+zones, and manifest.json already gives all 11 an EXPLICIT render:model3d, so the default is redundant today and hostile tomorrow: a future particle/spritesheet vfx: key that omits explicit render resolves to model3d (either hard-failing guard E on a non-3D ext, or per the ambiguous exts-exemption at line 219, silently loading a 2D asset as a 3D scene). This narrows the keyspace of a lane this plan claims to unblock.

→ _fix:_ Do NOT add vfx->model3d as a kindDefaultRender. Use the completeness test's 'OR provably carries explicit render' branch as the sanctioned path for vfx: require vfx entries to declare explicit render. Keeps vfx open to spritesheet/scene renderers downstream. prop->model3d is also redundant (catalog .glb already ext-resolve to model3d); add it only if it makes the completeness invariant simpler to state.

**[medium]** Phase 2 over-frames the 'audio taxonomy hole'. audio-manifest entries carry NO kind and NO render field; they resolve correctly today via extRender (.ogg->audio). The task-brief 'kind:unknown' framing is misleading, the field is simply absent and ext resolution is authoritative and working. The 'add a soft guard requiring kind:audio' option would force a 31-entry data migration for zero functional gain.

→ _fix:_ Pick the document-ext-based-resolution option (the plan's second alternative) and drop the guard idea. If a guard is still wanted, list the 31-entry backfill of kind:audio as an explicit task, do not leave it implicit inside a decision bullet.

**[medium]** Phase 4 adds a Godot .NET headless CI job but specifies no Godot version pin, no .NET/Mono runner setup action, and no import/cache strategy. project.godot and GameClient.csproj exist but the job is the largest-blast-radius item and its single hardest detail (getting godot-dotnet to import+run headless deterministically in Actions) is unspecified. 'Install the Godot .NET runtime' is hand-wavy for the one step most likely to flake.

→ _fix:_ Pin an exact Godot .NET version (matching project.godot), use a known godot-dotnet setup action or a cached container image, run a headless import pass (godot --headless --import) before the probes, and gate the job to game-client/** + assets/** paths as the plan already notes. Add a smoke run in the plan's verification proving the runner boots before asserting the probes gate.

**[low]** Phase 3's jest round-trip test and the RegistryVerify fixture must enumerate MOB_TYPES/WEAPON_TYPES/SKILLS/zoneTypes the SAME way gen-asset-keys.ts does. gen-asset-keys.ts already emits from those configs; a second enumerator in the test that drifts from the generator's logic would produce false green/red. The plan says 'enumerate the same way' but does not require the test to IMPORT the generator's enumeration rather than re-implement it.

→ _fix:_ Have the round-trip test import gen-asset-keys.ts's key-building function (or its exported enumerators) directly and assert generated/asset-keys.json equals its output, so there is one enumeration source, not two. This also subsumes the existing gen-asset-keys.test.ts, check for overlap before adding a parallel test.

**[low]** check_content.mjs --require-complete is a boolean CLI flag that branches behavior (warnings vs hard-fail). This is adjacent to the single-path-API invariant ('no boolean flag params that branch behavior; use explicit keys like mode:'). It is an established/pre-existing flag (CI comment references it) so it is acceptable, but Phase 5's 'strengthen --require-complete' should not proliferate more boolean mode flags on the gate.

→ _fix:_ Keep the single --require-complete flag; if more modes are ever needed use --mode <coverage|strict> rather than stacking booleans. Note in the plan that CLI flags are exempted from the constructor options-object rule but mode-explicitness still applies.