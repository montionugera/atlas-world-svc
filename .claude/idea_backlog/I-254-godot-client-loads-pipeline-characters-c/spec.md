---
title: "Godot client loads pipeline characters: combat states and runtime weapon swap"
id: I-254
status: idea
---

# Godot client loads pipeline characters: combat states and runtime weapon swap

This is Phase 6 of the character automation plan (`~/asset-studio-private/atlas-3d-plan/automation-plan/PLAN.md` §Phase 6). The owner's goal for that plan: fewer future issues, almost no human work to make 3D characters and animation, multi-component characters (body + weapons), and more assets with high quality, faster and at lower cost.

## Problem

The pipeline has published three owner-accepted characters: sergeant `p4b-11050912`, ranger `p5-11051917` and warden `p5-11061342`. The Godot client has never loaded any of them, and loading them today fails in four places:

1. **Intake refuses them.** `atelier/asset-forge/intake.mjs:128` runs `validate.mjs` first. On the sergeant that gives `FAIL height 1.05u (character kind 1.6-2.0)`, `FAIL triangles 14448 > 10000`, and `FAIL skeleton` against `forge.config.json` `rigReference`. `intake.mjs:113` also rejects `anims` keys outside `requiredStates`, which rules out `combat_idle`, `block` and `hit`. `AssetManifest.cs:223` silently drops non-string `anims` values.
2. **Clip names don't match.** `game-client/src/World/AnimationController.cs:15-29` knows idle/walk/run/attack/death, with the Kenney names `sprint`, `attack-melee-right` and `die` as fallbacks. `death` is not in the die fallback list (`:136-137`). Per-entry `anims` overrides already exist (`AssetRegistry.ResolveAnimOverrides`, `game-client/src/Content/AssetRegistry.cs:102`), but they cover only the 5 base states.
3. **There is no combat stance.** There is no `InCombat` flag and no `combat_idle`, `block` or `hit` state, so the pipeline's `block_idle` is never played.
4. **The weapon is baked in.** The body + N weapons goal needs a runtime swap.

## Facts this design relies on (verified 2026-11-06, scout + adversarial audit)

- Sergeant pack output: `~/asset-studio-private/atlas-3d-plan/characters/npc-lantern-hollow-watch-sergeant/build/pack/ce4a9452b38d/out.glb`, 2.5 MB, sha256 `0ac13d97…`, 14,448 triangles, 1 skinned mesh. Its 12 clips are `attack, attack_2, attack_3, block, block_idle, cast, death, hit, idle, idle_look, run, walk`.
- The weapon `held_shaft_r` is a rigid, unskinned mesh. The glTF parenting is `mixamorig:RightHand` → `prop_weapon_r` → `handslot.r` → `held_shaft_r`. The shield is `prop_shield_l` → `held_shield_l`. **After Godot import** the names change: the bone is `mixamorig_RightHand` (`:` becomes `_`), `handslot.r` becomes a `BoneAttachment3D` named `handslot_r`, and `prop_weapon_r` exists only as a bone. Code must look nodes up by their imported names, or by `BoneAttachment3D.BoneName`, never by the glTF names.
- The library axe is `game-client/assets/weapons/axe.glb` (15 KB, tracked).
- The manifest already has `player` and `npc` entries with `anims` blocks. `AssetRegistry.cs:172` classifies `npc:*` keys as Player-kind, and the client only ever asks for `npc`.
- **Godot binary:** `godot` on PATH is the non-mono build. It reports `Can't load script` on C# and still exits 0. The mono 4.7.2 build is `~/Applications/godot-mono-4.7.2/Godot_mono.app`; after `dotnet build` it ran a C# probe and exited 0. `--headless` uses the dummy renderer and produces no pixels.
- **Existing probe pattern:** `game-client/src/World/AnimationVerify.cs` is run by `GameRoot` when `ATLAS_VERIFY_ANIM=1`. It prints `PASS`/`FAIL` lines and a verdict. This feature extends that pattern; it does not add a new harness.
- **Server wire:** `schemas/game_protocol.fbs` carries `state_flags` (alive/bot) and the events `Hit`/`Kill` only. There are no attack or block flags. The player's attack comes from local input (`VerticalSliceRoot.cs:2033`).
- **Asset Studio:** library assets carry `sha256` + `/media` (`collections.go:236`), and collections hold `approved_sha256`. The API needs a token.
- **Gate 1** (`scripts/precheck.sh`) runs neither `check_asset_manifest.mjs` (only `ci.yml:70` does, and atlas promotes direct, without CI) nor any dotnet/Godot build.

## Design (slice 1)

1. **Intake accepts pipeline characters.**
   - Add a validate kind `pipelineCharacter`: height 0.95-1.15 u, triangles <= 15,000, bytes <= 2.8 MB. These are provisional: owner D3 accepted "~14k / 2.6 MB" on 2026-11-04, and the warden is 2.8 MB.
   - Add a Mixamo bone reference `atelier/asset-forge/rig-reference/mixamo-65.bones.json` to `forge.config.json` `rigReference`. It is selected by kind, so no new `--skeleton` flag.
   - Widen the `anims` schema in intake, validate and `AssetManifest.cs`: a value is a string or a list of strings (attack variants), and the allowed keys grow by `combat_idle, block, hit, ready_in, ready_out`.
   - New key `npc:lantern_hollow_watch_sergeant`. Provenance records Asset Studio asset `01a1a97a-8e45-71d6-885f-459aa1cebf7f`, tag `p4b-11050912`, and sha256. Intake refuses a glb whose sha256 differs from the recorded `approved_sha256`. The red test runs offline against a committed fixture JSON, so no token is needed in tests.
   - Intake is one non-interactive command, so a batch report row can drive it later.
2. **Combat state machine** in `AnimationController.cs`:
   - Add `InCombat`, `Block()`, `Hit()` and `Attack()` inputs. States: idle, walk, run, combat_idle, attack, block, hit, death. `ready_in` and `ready_out` are used only when they are mapped; the sergeant has none and crossfades.
   - Flow: `idle → (InCombat) → [ready_in] → combat_idle ↔ attack → (!InCombat) → [ready_out] → idle`.
   - Loops: idle, walk, run, combat_idle, block. One-shots: attack, hit, death, ready_in and ready_out. When a one-shot ends it returns to combat_idle if InCombat is set, otherwise to idle. Death holds its last frame. Attack variants rotate.
   - Blend: 0.15 s into attack, but **only for entries that map `combat_idle`**. Existing mobs keep 0.05 s, so the blast radius stays at zero for current content. The fallback list gains `death` (die) and `run` (sprint).
   - **Wire inputs (client-only, server-authoritative):** InCombat comes from the entity having a `target_id`, and hit comes from `GameEvent.Hit`. The player's attack stays local input, as today. Block and remote-entity attack have no server signal yet. They are filed as server work (I-NNN, "wire attack/block flags in game_protocol.fbs"). Slice 1 tests drive them through the controller API.
3. **Weapon swap** `WeaponSocket.Equip(PackedScene)` / `Unequip()`:
   - Find the `BoneAttachment3D` whose `BoneName` is `handslot.r` or `prop_weapon_r`, or whose imported name is `handslot_r`. If none exists, create one on `prop_weapon_r`, or else on `mixamorig_RightHand`.
   - Free its children (the baked `held_shaft_r`) and instance the weapon under it.
   - Grip alignment is the weapon's own origin until the Phase 1 weapon contract provides `grip_main`. That is a known limit, and the render strip makes it visible.
4. **Gates.**
   - `check_asset_manifest.mjs`: every `anims` value names a clip that exists in its glb (read the glb JSON chunk). An entry that maps `combat_idle` must also map idle, walk, run, attack and death.
   - `scripts/precheck.sh` gets a path-gated section that runs when `game-client/`, `atelier/asset-forge/` or the manifest changes: `check_asset_manifest.mjs`, the asset-forge `node --test` suite, `dotnet build` of `GameClient.csproj`, and the Godot verify. Godot runs the pinned mono 4.7.2 binary (`ATLAS_GODOT_MONO` env, default that path), and the section requires a `[PipelineCharVerify] VERDICT PASS` line on stdout. An exit code alone is not accepted.
5. **Review surface.** A render strip PNG shows one frame per state plus one with the axe swapped in. It is made by a windowed render with `--write-movie` (headless has no pixels), stored next to the glb, and shown in an atlas-world panel in the release app. A friendly wiki page explaining combat stances and the weapon swap goes in the lore/wiki panel (`atelier/atlas-world-panels/js/panels/lore.mjs` is the current wiki host; the plan confirms it).

## Non-goals (filed, not built here)

- An upper-body layer (attack while walking).
- Off-hand IK with `SkeletonModifier3D`.
- A shield swap (the shield stays baked).
- Ranger and warden intakes, and intake driven automatically from a batch report.
- Server wire flags for attack and block.
- Mapping server NPC identities to the new key.
- A Godot job in CI.

## Acceptance criteria

- [ ] With `ATLAS_VERIFY_PIPELINE_CHAR=1`, the pinned mono 4.7.2 binary prints `[PipelineCharVerify] VERDICT PASS` and exits 0. A FAIL line exits 1, proven by renaming one mapped clip.
- [ ] That probe loads `npc:lantern_hollow_watch_sergeant` from the manifest and asserts that idle, walk, run, combat_idle, attack (3 variants rotate), block, hit and death each play the mapped clip. Loop modes must match the design, and death must hold its last frame.
- [ ] It toggles InCombat and asserts the sequence `idle → combat_idle → attack → combat_idle → idle`. The attack blend is 0.15 s for the sergeant and 0.05 s for one existing mob.
- [ ] It calls `Equip(axe.glb)` and asserts: no `held_shaft_r` remains, one axe node sits under the hand `BoneAttachment3D`, and across two attack frames the axe moves more than 1 cm while its offset to `mixamorig_RightHand` stays within 1 mm. `Unequip()` leaves 0 children.
- [ ] The existing `AnimationVerify` (`ATLAS_VERIFY_ANIM=1`) still passes, so the base content does not regress.
- [ ] `check_asset_manifest.mjs` passes, and is proven red when a mapped clip is renamed and when the `death` mapping is removed.
- [ ] `validate.mjs --kind pipelineCharacter` passes on the sergeant and is proven red on a KayKit mob glb (skeleton) and on a 16k-triangle fixture.
- [ ] Intake is proven red on a glb whose sha256 differs from the recorded `approved_sha256`.
- [ ] Gate 1 (`./scripts/precheck.sh`) runs the new section and is green. It is proven red by breaking the manifest.
- [ ] The render strip panel and the wiki page load in the release app through a tested deep link. Phone (390×844) and desktop (1280×800) screenshots must be viewed.

## Risks / assumptions

- **Budget (D3):** 15k triangles / 2.8 MB is provisional. It goes to the owner with a Godot frame-time number, once that number exists.
- **Laptop cost:** the precheck Godot step adds `dotnet build` plus a boot, about 30-60 s (not measured). It is path-gated so other ships don't pay it.
- **Git size:** the 2.5 MB glb in git is R1, the same as `4gtn.glb` today.
- **Clip-name drift** between the pipeline and the client is the main future failure, and the manifest gate guards it.

## Appendix — audit trail

- 2026-11-06 self-grill-audit: verdict **no**, fixed in this revision. Corrected:
  - intake/validate refused the sergeant (new kind + Mixamo rig ref + widened anims);
  - glTF vs Godot-imported node names (`handslot_r`, `mixamorig_RightHand`);
  - the server sends no attack/block (inputs re-scoped, wire work filed);
  - `--headless` has no pixels (`--write-movie`);
  - the PATH `godot` exits 0 vacuously (pinned mono binary + PASS marker);
  - Gate 1 ran none of the checks (precheck section);
  - stale claims removed (the `npc` and anims overrides already exist; Kenney, not KayKit, names);
  - the blend change was scoped to combat-mapped entries;
  - sha256 checked against `approved_sha256` with an offline fixture.

  Open: D3 budget numbers (owner, once perf is measured).
