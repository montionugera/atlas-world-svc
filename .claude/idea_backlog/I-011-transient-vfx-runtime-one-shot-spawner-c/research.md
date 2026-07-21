# VFX library policy + event binding

- verdict: needs-work  |  effort: L  |  dependsOn: ['registry-binding']
- proposed idea: Transient VFX event contract + one-shot runtime spawner (parallel to SFX) + CC0 expansion policy

## VFX event contract + transient-effect runtime + CC0 expansion policy

**Domain:** `vfx-events` · **Effort:** L · **Deferred epic slot:** F-C (VFX runtime) of the F-A/F-B/F-C content epic

### Goal
Build a transient-VFX runtime **parallel to the already-shipped SFX system** and bind it to gameplay events that **actually exist**. A null-safe `VfxRegistry` autoload spawns one-shot, auto-freeing billboarded effects, co-fired at the exact three client-derived combat edges SFX already uses. Then ship a CC0 sourcing/expansion policy that grows the thin 4-effect library only against real events. **Server stays fully authoritative — VFX is a pure client render reaction, never a gameplay driver.**

### Grounding (verified in-repo)
The client already derives **three** combat edges from **synced** server state and co-fires positional SFX at each — no new network traffic is invented for VFX:

| Edge | Source of truth (synced) | Fires today | New VFX co-fire |
|---|---|---|---|
| **hit** | `WorldLife.currentHealth` decrease | `EntityView.ApplyLife` (~L131-135) → `sfx:hit` | `fx:explosion` |
| **death** | `WorldLife.isAlive`→false | `AnimationController.FireAudioForState` → `sfx:death` | `fx:fireball` |
| **attack/cast** | `WorldLife.isAttacking` | `AnimationController.FireAudioForState` → `sfx:attack` | `fx:magic_rune` |
| **heal** (Phase 4) | `currentHealth` increase | *(new edge, same file)* | `fx:heal_sparkle` |

The 4 transient `fx:*` sprite sheets (explosion/fireball/magic_rune/barrier, CC0, `render:spritesheet`) already live in `catalog-manifest.json` and as PNGs under `game-client/assets/vfx/` — but are **bound to no event** and **absent from any runtime manifest**. That is the gap.

**Keyspace decision (locked):** transient VFX use the existing `fx:*` namespace as **client render vocabulary, parallel to `sfx:*`** — it stays **OUT** of `render-spec.json` `codegenReservedNamespaces` (unlike `projectile:`/`zone:`, which are schema-derived). No server schema or asset-keys codegen change.

---

### Phase 1 — VFX event contract, keyspace & runtime manifest
**Tasks**
- Record the keyspace decision (above) in `docs/superpowers/specs/2026-07-20-vfx-event-binding-design.md`.
- Author the event→VFX binding table (above) in the spec. **No skill system exists** — "skill VFX" binds to the `attack` edge; a real skill/cast EventBus event is flagged **deferred cross-domain**, not invented here.
- Create `game-client/assets/vfx-manifest.json` as a **dedicated runtime manifest mirroring `audio-manifest.json`** (do NOT pollute the shared render `manifest.json`). **Generate** it from `catalog-manifest.json` fx:* so catalog stays single source of truth.
- Add `scripts/gen_vfx_manifest.mjs` (+ extend `scripts/check_content.mjs`): regenerate + validate every fx:* against `render-spec.json` spritesheet `require` (license+source+oneOf frame/frames/atlas), grid divisibility (sheet dims vs frame w/h × count), PNG presence, and `art-source/LICENSES.md` ledger.

**Verify (evidence):** `node scripts/gen_vfx_manifest.mjs && node scripts/check_content.mjs` → exit 0; node/jest assertion that `vfx-manifest.json` fx:* set === catalog `kind:vfx` spritesheet subset (metadata match, no missing/extra).

**Quality gate:** implement → run the gate (evidence) → independent adversarial review of the diff (fresh subagent / `/code-review`) → refactor (kill drift, dead code) → re-run the gate green.

---

### Phase 2 — `VfxRegistry` autoload + one-shot auto-freeing spawner
**Tasks**
- `game-client/src/World/Vfx/VfxManifest.cs` — never-throw loader parallel to `Audio/AudioManifest.cs`.
- `game-client/src/World/Vfx/VfxRegistry.cs` — sealed partial `Node` autoload mirroring `AudioRegistry` **exactly**: static `Instance` in `_Ready`, `LoadManifest`, frames cache, `ResolveFrames(key)` building a `SpriteFrames` by slicing a **uniform grid** with **loop FORCED OFF** (catalog marks explosion/fireball/rune `loop:true` — transient one-shots must play **once**), and **single-path** `Spawn(VfxSpawnOptions options)` — one options object `{ Key, WorldPos, Scale=1f }`, **no positional overloads / no boolean flag params** — instantiating a billboarded `AnimatedSprite3D`, parented under the autoload, playing once, `QueueFree()` on `AnimationFinished`. Unknown key = one `PushWarning` + silent null no-op; C#-nullable-safe.
- Register `VfxRegistry` autoload in `game-client/project.godot` beside `AudioRegistry`.
- `game-client/src/World/Vfx/VfxVerify.cs` — headless probe mirroring `AudioVerify.cs`; wire into `GameRoot.cs` behind `ATLAS_VERIFY_VFX=1`.

**Verify (evidence):** headless Godot `ATLAS_VERIFY_VFX=1` → per-case PASS + `RESULT: PASS`, exit 0 covering resolve, positioned one-shot spawn, **loop-forced-off**, auto-free, unknown-key no-op.

**Quality gate:** implement → run probe (evidence) → adversarial diff review → refactor → re-run probe green.

---

### Phase 3 — Bind VFX to the three existing client combat edges
**Tasks**
- `AnimationController.cs`: extend the existing edge handler (`FireAudioForState`, ~L121-135) to **also** co-fire VFX on the same already-computed edge — attack→`fx:magic_rune`, death→`fx:fireball`. Additive, null-safe (`Instance?.`), **no second edge-detector**, **no SFX change**.
- `EntityView.cs` `ApplyLife` (HP-decrease hit edge, ~L131-135): co-fire hit→`fx:explosion` beside the existing `sfx:hit`, under the SAME `isAlive && currentHealth<lastHealth` guard (death never double-counts as hit).
- Assert: no new synced field, no new network traffic — all edges derive from already-synced `isAttacking`/`isAlive`/`currentHealth`; positions in world units × scale. **Server-authoritative invariant preserved.**
- Extend `VfxVerify` to drive a fake `WorldLife` through hit/death/attack edges: exactly one VFX per edge at correct `GlobalPosition`, **no re-spawn while state persists** (edge-triggered).

**Verify (evidence):** `ATLAS_VERIFY_VFX=1` → PASS for per-edge single-spawn + position + no-repeat, exit 0; **AND** re-run `ATLAS_VERIFY_SFX=1` (`AudioVerify`) → still PASS (no SFX regression).

**Quality gate:** implement → run both probes (evidence) → adversarial diff review (focus: SFX-regression risk on shared edge sites) → refactor → re-run both green.

---

### Phase 4 — CC0 library expansion policy + sourcing against real events
**Tasks**
- Write the sourcing/expansion policy in the spec: CC0-preferred (CC-BY-4.0 tagged fallback via `scripts/lib/license-policy.mjs`), uniform-grid requirement, `art-source/LICENSES.md` ledger, expansion driven **only** by events that exist.
- Expand 4→~8-10 via the proven OpenGameArt CC0 uniform-grid pipeline (F-A): hit-flash, blood-spurt, death-burst, cast-glow, heal-sparkle. Add to `catalog-manifest.json`, ledger, regen `vfx-manifest.json`.
- Add the **heal edge** (`EntityView.ApplyLife`, `currentHealth>lastHealth` while alive) → `fx:heal_sparkle`; update the contract table. Still derived from synced HP — no server change.
- Record the **`fx:fireball.png` ~3.0MB downscale/re-atlas decision** for the 20FPS budget.

**Verify (evidence):** `node scripts/check_content.mjs` green (license + render requires + grid divisibility for every new fx); **eyeball** each fx flipbook in `tools/asset-storybook` (plays once, slices clean); re-run `ATLAS_VERIFY_VFX=1` incl. heal edge green.

**Quality gate:** implement → gate + storybook eyeball + probe (evidence) → adversarial diff review → refactor → re-verify green.

---

### Phase 5 (stretch) — zone/cast surfaces + sign-off, or documented deferral
**Tasks**
- Decide + record: (a) bind `fx:barrier`/`fx:magic_rune` as a **transient** cast-glow at `zoneEffect` entity-add in `EntitySync.cs` (layered over the existing **persistent** glb zone view, auto-freeing independently via `readyToBeRemoved`-style cleanup), OR (b) **defer** — document that zone/cast transient VFX needs a real server skill/cast `RoomEventType` + client broadcast (cross-domain: server + `registry-binding`/`sfx-events`), **not absorbed here**.
- Finalize the spec (render dark-theme HTML per convention); add a one-line VFX invariant to `.cursor/rules`/`CLAUDE.md`.

**Verify (evidence):** storybook full eyeball; if bound, `ATLAS_VERIFY_VFX` asserts cast-glow spawns on simulated zone entity-add + auto-frees; final `check_content.mjs` green. If deferred, the deferral + cross-domain dep is written into the spec and closes on doc review.

**Quality gate:** implement/decide → verify (evidence or doc review) → adversarial review → refactor → re-verify.

---

### Dependencies
- **dependsOn `registry-binding`** — the two-manifest asset contract + `render-spec.json` spritesheet `require` semantics must be stable; VFX promotes/generates a runtime manifest and relies on that render contract.
- **dependsOn `sfx-events` (already shipped)** — VFX co-fires at the exact edge sites SFX established (`AnimationController.FireAudioForState`, `EntityView.ApplyLife` HP-edge) and reuses the `ATLAS_VERIFY_*` probe harness. Landed, so not blocking; listed because the firing surface is shared and owned there.

### Shared infra (don't duplicate)
Client combat-edge firing sites (SFX-owned); two-manifest + render-spec spritesheet contract (registry-binding); asset-keys codegen `kind:vfx` classification (VFX stays codegen-unreserved); CC0 license gate + `LICENSES.md` ledger + OpenGameArt uniform-grid pipeline; `ATLAS_VERIFY_*` probe harness in `GameRoot.cs`.

### Cross-domain needs (flagged, NOT absorbed)
A real **skill/cast** effect and any **server-decided** VFX need a new `RoomEventType` on `colyseus-server/src/events/EventBus.ts` + a client broadcast (today `BATTLE_DAMAGE_PRODUCED` is room-internal, never broadcast). That is server + `registry-binding`/`sfx-events` work — this domain binds only to already-synced client edges.

### Risks
- Co-fire at shared SFX edges → SFX-regression risk; gate on `AudioVerify` staying green.
- Catalog `loop:true` sheets must be forced to one-shot + auto-free, or effects loop/leak.
- Runtime grid-slicing of PNG atlases is off-by-one prone → grid-divisibility gate + storybook eyeball.
- "skill" has no server signal → bound to `attack` as approximation; real event deferred (scope-drift guard).
- `fx:fireball.png` ~3.0MB heavy for 20FPS → downscale decision in Phase 4.
- `vfx-manifest.json` drift → generated from catalog + equality gate; must re-run generator on catalog change.

### Definition of Done
1. `VfxRegistry` autoload ships with single-path `Spawn(options)`, one-shot auto-free, null-safe no-op — verified by `ATLAS_VERIFY_VFX=1` (exit 0).
2. hit/death/attack (and heal) edges co-fire the mapped `fx:*` at correct world positions, edge-triggered, with **zero** SFX regression (`AudioVerify` still green) and **zero** new network traffic / synced fields.
3. `vfx-manifest.json` generated from catalog, all fx:* pass `check_content.mjs` (license + render requires + grid), every asset ledgered in `LICENSES.md`.
4. Library expanded 4→~8-10 CC0 effects tied to real events; each eyeballed in storybook.
5. Binding contract + sourcing policy documented in the design spec (dark-theme HTML rendered); zone/cast either bound or explicitly deferred with its cross-domain dependency written down.
6. Every phase passed its quality gate (implement → verify → adversarial review → refactor → re-verify).

---
## Adversarial review findings

**[high]** The grid-divisibility gate is specified as 'sheet dims vs frame w/h × count' — an area/product check that misfires on the real assets. Verified pixel dims: fireball.png is 2048×1792 with 50 frames of 256×256. That is an 8-col × 7-row grid = 56 CELLS but only 50 FRAMES (a partial final row). frame area × count = 256·256·50 = 3,276,800 ≠ sheet area 2,048·1,792 = 3,670,016, so a literal 'w/h × count == sheet area' check REJECTS a valid sheet. The other three (explosion 8×8=64, rune 4×4=16, barrier 5×5=25) are exact and would pass, masking the bug until fireball.

→ _fix:_ Replace the area check with: assert sheetW % frameW == 0 AND sheetH % frameH == 0, compute cols=sheetW/frameW rows=sheetH/frameH, then assert count <= cols*rows (allow a partial final row). Do NOT require count == cols*rows.

**[high]** The runtime slicing algorithm is underspecified and will slice garbage for multi-row sheets. Catalog encodes animations as {row:0, count:N} with a single {w,h} frame — but explosion packs 64 frames across 8 rows and fireball 50 across 7 rows. A slicer that reads 'count frames along row 0' (the literal reading of row:0,count:64) needs an 8192px-wide strip and is wrong; the sheets are 2-D grids. The plan's 'slice a uniform grid (row/count/fps)' never states how columns are derived.

→ _fix:_ Derive cols = sheetW/frameW from the actual texture; index frame i at (col = i % cols, row = startRow + i / cols), treating the catalog 'row' as a start offset only, wrapping row-major, stopping at count. Add a probe assertion on cols and on the last frame's source rect, not just the frame count.

**[high]** Validation duplication + wrong script. check_asset_manifest.mjs ALREADY validates catalog-manifest.json spritesheet entries: render-spec 'require' (license+source) and the 'oneOf' field-groups (frame/animations vs frame/frames vs atlas) — for fx:* today. The plan re-implements that same check in check_content.mjs, which is the F-005 character/story/map content gate (a category mismatch), or in a new gen_vfx_manifest.mjs. The only genuinely NEW validation (pixel-grid divisibility) is being put in the wrong place.

→ _fix:_ Do not touch check_content.mjs for asset validation. Add ONLY the new grid-divisibility check to check_asset_manifest.mjs (the catalog validator), reusing its existing require/oneOf logic. Drop the re-validation of license/source/oneOf from the VFX plan.

**[medium]** The generated vfx-manifest.json + equality-gate is avoidable machinery that also mischaracterizes the precedent. audio-manifest.json is CURATED, driftGated:false, and standalone (its sfx:* keys are not even in catalog). The plan claims to 'mirror the audio-manifest precedent' while simultaneously GENERATING vfx-manifest.json from catalog and gating equality — contradictory, and it manufactures the drift it then guards.

→ _fix:_ Pick one: either (a) have VfxManifest.cs read catalog-manifest.json directly, filtering kind=='vfx' (single source of truth, no third file, no generator, no equality gate), or (b) a small hand-curated vfx-manifest.json exactly like audio-manifest.json with no generator. (a) is simplest and eliminates a whole risk row.

**[medium]** attack → fx:magic_rune is a poor binding. isAttacking is the basic-melee flag; mapping it to a spinning rune circle spawns a rune under every attacker on every swing at 20 FPS — visually wrong and unrelated to 'cast'. The plan itself admits there is no skill/cast signal and defers a real cast event, yet still misuses magic_rune on the attack edge now.

→ _fix:_ Leave the attack edge VFX-unbound for now (or bind a subtle slash/impact fx), and reserve magic_rune/cast-glow for the deferred real cast RoomEventType. Do not spawn a cast flourish on every melee swing.

**[medium]** Runtime visual correctness is not actually verified. ATLAS_VERIFY_VFX asserts frame COUNT, positioned one-shot, loop-off, auto-free, unknown-key no-op — none of which prove frames slice to the correct COLUMNS. The 'eyeball in tools/asset-storybook' exercises a SEPARATE JS slicer (tools/asset-storybook/index.html), so a green storybook does not validate the C# runtime slicer; the two slicers can silently diverge.

→ _fix:_ Add a runtime probe assertion on derived cols and on first/last frame source-rect (or a golden pixel sample), or factor the slicing rule into one shared spec both slicers consume. Treat storybook-green as necessary-not-sufficient for the C# path.

**[low]** 'Mirror AudioRegistry EXACTLY' conflicts with 'single-path Spawn(options)'. AudioRegistry.Play(string eventKey, Vector3 worldPos) is a two-positional-arg API; the plan's VfxSpawnOptions object is actually MORE compliant with the single-path-API invariant, so 'exactly' is inaccurate wording.

→ _fix:_ Keep the options-object Spawn (it is the correct choice); drop 'mirror exactly' and state it intentionally improves on AudioRegistry's positional signature.

**[low]** Process/backlog gap. No idea (I-007) or refined F-NNN exists for this work; F-A/F-B/F-C are informal MEMORY labels, not backlog IDs (backlog holds I-001..006 + only F-002 refined). ps-release-workflow expects idea → refine → claim before implementation. The named dependency 'registry-binding' maps to F-002 which is status:open in _catalog.json even though its render-spec/catalog infra is already present in-tree.

→ _fix:_ Capture as an idea and refine to F-NNN (or explicitly fold under F-002) before claiming a worktree. Reconcile F-002 status:open vs its shipped-in-tree infra so the dependency graph is honest.