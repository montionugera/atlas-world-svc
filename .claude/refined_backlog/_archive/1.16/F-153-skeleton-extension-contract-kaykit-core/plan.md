# F-153 Skeleton extension contract: implementation plan

**Spec:** `spec.md` next to this file. That spec is P1 of the private modular-parts spec v2.1.
**Worktree:** `.claude/worktrees/F-153-skeleton-extension-contract-kaykit-core` (branch `feat/F-153`).
**Package:** `atelier/asset-forge`. Tests: `npm test` (pretest regenerates fixtures via `tests/make-fixtures.mjs`). Run `npm ci` first, since a fresh worktree has no `node_modules`.
**Goal (verbatim):** characters on the 23-joint `kaykit-core` skeleton may carry `sec_*` / `prop_*` bones that pass a checkable grammar. Today's behaviour stays the same for every existing asset and test.

Every task is TDD: write the failing test → run it red → implement → run it green → commit.

## Task 1: Parent links in `lib/gltf.mjs`
- Add `jointParents(doc)` → `{ [jointName]: parentJointName | null }`. The parent is the **nearest ancestor that is a skin joint**, else `null`. Walk up through non-joint nodes such as `Rig`, `Rig_Medium` and `rig`.
- Tests in `tests/gltf.test.mjs`:
  - A fixture where `root` sits under a non-joint `Rig` node gives `root: null`.
  - A chain `hips → spine` gives `spine: "hips"`.

## Task 2: Reference format + `kaykit-core.bones.json`
- `extract-bones.mjs` also writes `parents`. Add an `--allow-extras` flag that writes `allowExtras: true` and the default S3 allow-lists.
- Generate `rig-reference/kaykit-core.bones.json` from `game-client/assets/characters/cleric.glb`, which has 23 joints. Commit it with:
  - `allowExtras: true`
  - `secParents`: `[head, chest, spine, hips, upperleg.l, upperleg.r]`
  - `sleeveParents`: `[upperarm.l, upperarm.r, lowerarm.l, lowerarm.r]`
  - `propParents`: `[hand.l, hand.r, wrist.l, wrist.r, lowerarm.l, lowerarm.r, handslot.l, handslot.r, head, chest, spine, hips, root]`. Drop any of these names that aren't in the 23-joint set, and record which ones were dropped.
- Check: its 23 joints equal `kaykit-adventurer` minus the 18 `IK-*` / `*IK.*` / `control-*` joints.
- Add it to the global `rigReference` list in `forge.config.json`, **after** the legacy references.

## Task 3: S1–S4 in `validate.mjs` (with negative fixtures first)
- **Fixtures** (`tests/make-fixtures.mjs`). Base: the 23-joint core with correct parents.
  - **pass cases:**
    - core plus `sec_hair_c0_1`/`_2` under `head`
    - `sec_bag_c0_1` under `hips`
    - `prop_weapon_r` under `handslot.r`
    - `sec_sleeve_l0_1` under `upperarm.l`
    - `root` under a non-joint `Rig`
  - **fail cases**, each with its expected rule id:

    | case | rule id |
    |---|---|
    | missing `hips` | `skeleton-core` |
    | `head` re-parented under `hips` | `skeleton-core` |
    | `hair_1` | `skeleton-grammar` |
    | `sec_hair_c0_4` | `skeleton-grammar` |
    | `sec_hair_c0_1` under `foot.l` | `skeleton-topology` |
    | orphan `sec_hair_c0_2` under `head` | `skeleton-topology` |
    | `sec_hem_l0_1` under `upperarm.l` (sleeve-only parent) | `skeleton-topology` |
    | 31 extras | `skeleton-cap` |
- **Logic.** The exact-match rule is unchanged for references without `allowExtras`.
  - For an `allowExtras` reference R, the joints **engage** R when R.core ⊆ joints.
  - If any reference matches exactly, PASS, which keeps today's behaviour.
  - Else, if some `allowExtras` reference is engaged, run S1 parents, S2 regex, S3 topology and S4 cap. Report each violation as `report("skeleton-core" | "skeleton-grammar" | "skeleton-topology" | "skeleton-cap", detail)`.
  - Else, keep today's single `skeleton` FAIL naming the closest reference.
- **S4 weights, skinned primitives only:** ≤ 4 influences (JOINTS_0 only; WARN if `JOINTS_1` is present), no all-zero vertex, |Σw−1| ≤ 1e-3 → rule `skin-weights`. Unskinned meshes are skipped.
- Keep the existing `/skeleton/` test regexes passing. The new ids all start with `skeleton`.

## Task 4: S5 in `lib/normalize-anim.mjs:31`
- Extend `NON_CORE_BONE` so it also excludes `^(sec_|prop_)`.
- Test: a `prop_hat_c` translation track isn't counted as crushing.

## Task 5: `intake.mjs --kind`
- Add a `--kind <kind>` flag, default `character`, used at :103, :120 and :162 in place of the hard-coded `character`. Unknown kinds error out.
- Test in `tests/intake.test.mjs`: `--kind chibiPlayer` uses the chibiPlayer height range.

## Task 6: Real-asset verification (no commit of private assets)
- Copy `~/asset-studio-private/char-loop/remake/it11/it11.glb` to `/tmp/f153/`.
- Write `/tmp/f153/strip_rename.py`, a Blender or pure-glTF script that:
  - deletes the 18 helper joints, after asserting they carry zero weight
  - remaps the skin indices
  - applies the rename map: `sec_hair_{l,c,r}.{0,1}` → `sec_hair_{l,c,r}0_{1,2}`, `sec_bag.0` → `sec_bag_c0_1`
- `node validate.mjs /tmp/f153/it11_core.glb --kind chibiPlayer --tier bespoke` must PASS.
- Intake `--kind chibiPlayer` in a sandbox output dir must land it.
- `node validate.mjs --manifest ../../game-client/assets/manifest.json` must stay green. This covers player_knight and mob_spear_thrower.
- Record the commands and output in the PR body. The script and the glb stay in /tmp and private.

## Task 7: Gate + docs
- `npm test` in asset-forge green. Then Gate 1: `./scripts/precheck.sh` from the worktree root.
- Update `atelier/asset-forge/README.md`: the skeleton contract section (references, grammar, rule ids).
- Independent review (code-reviewer + typescript-reviewer), fix the findings, re-run the tests.
- `psrw ship` (merges into release/1.16). No promote.
