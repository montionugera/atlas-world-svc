# I-049 — Environment art recipe, runner, replication, and the storybook that observes it

**Date:** 2026-08-02
**Idea:** I-049 (wave 3, order 1 — *"art recipe + licence route gates every art idea"*)
**Status:** design, awaiting owner review
**Supersedes the title's framing:** the licence half is withdrawn (see §1).

---

## 1. What changed before a line was designed

The idea's title carries two claims that the owner has now settled, and both change the shape of the work.

<div class="callout warn">

**The licence half is withdrawn.** The title asks to *"settle the FLUX.1-dev non-commercial licence route per DR-002 appendix A"*. The owner's ruling on 2026-08-02: **this is not a commercial project.** A non-commercial model licence therefore does not bind, and every mitigation DR-002 appendix A proposed — the tiered licence policy, the intake tagging, closing the `check_asset_manifest.mjs` exemption — is unnecessary work. It is all dropped.

DR-002's analysis was explicitly built on the premise *"this project is a game intended to ship."* That premise is now false. The ruling is recorded as **DR-002 appendix B** (Phase 1) so the reversal is traceable rather than silent, and so a future decision to monetize knows to revisit it.

</div>

<div class="callout info">

**"Adopt the environment recipe as *default*" is the wrong shape.** `forge.config.json` today holds the **character** recipe — Z-Image Turbo, denoise 0.82 / steps 24 / cfg 3 — empirically validated by the F-024 calibration campaign, with a `_note` warning not to change it without re-running the sweep. The environment recipe is a **different pipeline**, not a competing value for the same knobs: a different model, a different latent source, and a control signal the character path does not use.

Making either one the implicit default means the other is a flag someone can forget. Forgetting it on a character run silently applies denoise 1.0 — the precise failure mode F-024 spent an entire campaign diagnosing. **There will be no default.** Callers name a profile.

</div>

---

## 2. The two recipes, as measured

Both sets of numbers are lifted from committed measurement records. Neither is reconstructed.

### 2.1 Character — `profiles.character`

Source: `forge.config.json` as it stands, validated by the F-024 campaign (`tools/art-forge/out/sweep/`, `out/costumesweep/`) against `game-client/assets/art/classes/ogre-mage.png`.

| Setting | Value |
| --- | --- |
| model | Z-Image Turbo |
| mode | img2img (flat-grey silhouette anchor) |
| denoise | **0.82** |
| steps / cfg | **24 / 3** |
| samplerName / scheduler / shift | `res_multistep` / `simple` / 3 |

`samplerName`, `scheduler` and `shift` were left at stock template values and **were never swept** — the existing `_note` says so, and that note is carried across verbatim.

### 2.2 Environment — `profiles.environment`

Source: `docs/worldbuilding/ABP-controlnet-rescue.md`, including its recorded workflow JSON.

| Setting | Value |
| --- | --- |
| model | FLUX.1-schnell |
| latent | **empty latent** — no img2img anchor; structure comes only from the control signal |
| control | ControlNet **depth**, strength **0.30** |
| denoise | **1.0** |
| steps / cfg | **8 / 1** (schnell is guidance-distilled — cfg 1 is structural, not a choice) |
| resolution | 1280 × 832 |
| hires pass | 10 steps @ **0.40**, upscaler 4x-UltraSharp |

**The counter-intuitive finding, which must survive into the config note:** the usable strength window is **0.30–0.40**. At the conventional 0.8–1.0 ControlNet does not merely over-constrain — it *"collapses schnell into flat vector art"* (−88% detail). Steps and strength interact and are not independent knobs: 8 steps at strength ≥ 0.50 produced the worst artifact of the round, a cutout halo. `end_percent` was tried at 0.70 / 0.50 / 0.30 against strength 0.8 and **all three stayed flat** — *"do not reach for `end_percent` here; reach for lower strength."*

---

## 3. Evidence quality — why Phase 3 exists

The environment recipe won its bake-off, but the ABP is candid about the limits of its own evidence, and those limits are the reason this spec does not simply write the numbers down and stop:

- **Two subjects, one seed** (Gildmark and Norhollow, seed 12345). The ABP's own next-steps asks to *"replicate across the remaining five L1 subjects and at least two seeds"* before the owner's sample-and-approve.

  <div class="callout warn">

  **Correction to that count — the replication set is four, not five.** `A1-geography-cluster1.md` §9 defines seven art briefs: `A1-ART-01` the world map, `02` Millcross, `03` Embervale, `04` Norhollow, `05` Gildmark, `06` Rooktide, `07` Cindervast. Subtracting the two already measured (`04`, `05`) leaves five — but **`A1-ART-01` is not a diffusion target**. Commit `ae74b5f` *"draw the cluster-1 world map as an authored vector, not a diffusion image"* deliberately took it out of the generated path. Replicating a diffusion recipe against it would be meaningless.

  The replication set is therefore **`A1-ART-02` Millcross, `A1-ART-03` Embervale, `A1-ART-06` Rooktide, `A1-ART-07` Cindervast.**

  </div>

- **`steps = 16` was never tested**, and strengths between **0.40 and 0.60 were never swept** — the upper edge of the usable window is unmeasured.
- **Norhollow got no strength sweep at all** — only s0.30 and s0.40, reusing the window found for Gildmark.

Phase 3 runs that replication. Adopting a recipe on two subjects and calling it settled would repeat the F-024 mistake in the opposite direction: F-024's lesson was *"sweep the axis rather than reasoning to a culprit."*

---

## 4. Design

### 4.1 Phase 1 — `forge.config.json` v2: named profiles

`version` goes `1 → 2`. `comfy` stays shared at top level — it describes the machine, not the recipe. Everything recipe-specific moves under `profiles`.

```
{
  "version": 2,
  "comfy": { ...unchanged... },
  "profiles": {
    "character":   { "model", "sampler", "silhouettes", "muscleGradient", "_note" },
    "environment": { "model", "sampler", "controlNet", "hires", "_note" }
  }
}
```

`silhouettes` and `muscleGradient` move **into** `profiles.character` — both are character-path concepts (`muscleGradient` drives the race × job matrix; silhouettes are the img2img anchor). Neither has any meaning for an empty-latent environment render.

<div class="callout warn">

**Model identity must move into the profile too — the spec's first draft missed this.** `charsheet.mjs:295` holds a frozen module-level `MODELS` const — `unet: z_image_turbo_bf16.safetensors`, `clip: qwen_3_4b.safetensors`, `clipType: lumina2`, `vae: ae.safetensors`. It is **hard-coded, not config**. The environment graph loads a schnell checkpoint via `CheckpointLoaderSimple` instead of the `UNETLoader` + `CLIPLoader` + `VAELoader` triple. A profile that cannot name its own model is not a profile, so `MODELS` becomes `profiles.<name>.models` and `buildBaseGraph` reads it from the profile rather than the module const.

</div>

**Consumers to update** — all three are character-path, which is what keeps this contained:

| File | Reads today | Becomes |
| --- | --- | --- |
| `generate/charsheet.mjs` | loads config as a frozen bundle | `config.profiles.character` |
| `generate/i2i.mjs` | `sampler.denoise`, `sampler.mode`, `silhouettes.prefix` | same, under `profiles.character` |
| `generate/batch-matrix.mjs` | `muscleGradient.raceAxis` / `.jobAxis` | same, under `profiles.character` |

Existing `--denoise` / `--steps` / `--port` CLI overrides keep working unchanged — they override whatever the named profile supplies.

**Also in Phase 1:** append **DR-002 appendix B** recording the non-commercial ruling from §1. Decision records append; the existing body is left as written.

### 4.2 Phase 2 — `generate/env.mjs`

A runner for the environment profile, ported from the workflow JSON recorded in `ABP-controlnet-rescue.md` §. Graph shape: empty latent → depth ControlNet (`ControlNetApplyAdvanced`) → schnell sampler → hires pass.

Single-path API per the repo's standing rule: one options object, no positional overloads, no boolean flags that branch behavior. It takes `{ subject, seed, profile }` and reads every tunable from the named profile — nothing hard-coded that the config already owns.

The depth map is an **input** to this runner, not something it produces. Where depth maps come from is stated as an explicit assumption in §6, not invented here.

### 4.3 Phase 3 — the replication run

Execute what the ABP asks for, against the corrected subject set from §3: **`A1-ART-02` Millcross, `A1-ART-03` Embervale, `A1-ART-06` Rooktide, `A1-ART-07` Cindervast**, at a **second seed**, at strengths 0.30 and 0.40. Record the outcome as a new ABP-class measurement record under `docs/worldbuilding/`, in the same format as the existing ones.

Review the output with `tools/art-forge/compare.sh` and `generate/contact-sheet.sh`, which already exist for exactly this job — so Phase 3 does not depend on Phase 4 landing first.

**This phase gates the recipe's status.** If replication holds, the `environment` profile's `_note` is updated from *"measured on two subjects, one seed"* to the replicated evidence. If it does not hold, the profile stays but the note records where it failed — the config is not quietly left implying more confidence than the evidence supports.

### 4.4 Phase 4 — storybook: groups, tabs, filters

`tools/asset-storybook/index.html` is a **single 103 KB file**. It already buckets art-manifest entries by their `group` field in `art-groups.json` registry order, renders one section per group, keys sidebar items `art:<groupId>`, tracks per-group health dots, and sub-groups classes by race.

What it lacks is scale: everything renders as one long page. This phase adds a **tab/section layer over the existing group buckets** plus a **filter** (by group, and free-text over title/tags), and splits the monolith into modules along the seams the code already has — `bucketArtEntries`, `buildArtCard`, `buildArtClassesBody`, the health-dot aggregator.

**Constraint that must not be broken:** `check_asset_manifest.mjs` mirrors the storybook's render-type resolution *exactly*, deliberately, so that *"the gate and the storybook can never disagree on what a render-type requires."* Any restructuring must leave that resolution order byte-identical in behavior, and the existing `scripts/tests/check_asset_manifest.test.mjs` is the guard.

---

## 5. Verification

`tools/art-forge/` has tests for `intake-art` and `artifact-gate` but **none for `generate/*`**. This spec does not attempt to retrofit coverage for the whole generate path — it adds the checks that protect what it changes.

| Phase | Evidence required |
| --- | --- |
| 1 | New config-shape test: both profiles parse; required keys present; **`profiles.character` still reads denoise 0.82 / steps 24 / cfg 3** — the regression guard proving the restructure did not move F-024's validated numbers. All three consumers run green. |
| 2 | `env.mjs` produces an image from the environment profile against the ComfyUI box; graph node types asserted against `/object_info` rather than assumed. |
| 3 | The measurement record exists and is committed, with contact sheets. An explicit hold-or-fail verdict, not a summary. |
| 4 | `scripts/tests/check_asset_manifest.test.mjs` stays green (render-type parity); storybook loads with every existing group present; tabs and filters exercised in a browser, not asserted from source. |

<div class="callout danger">

**Correction: Gate 1 does not currently run these tests.** `scripts/precheck.sh` runs exactly ten sections — `deps`, `contracts: tsc build`, `contracts: jest`, `server: tsc`, `server: jest`, `server: prettier`, `nakama: tsc`, `nakama: jest`, `client: react-client`, `combat-lab: model gates`. **None of them runs `tools/art-forge/tests`**, whose runner is `node --test tests/*.test.mjs`. The existing `intake-art` and `artifact-gate` tests are therefore already ungated.

Phase 1 must add a `run_section "art-forge: config + gate tests"` to `precheck.sh`, or the regression guard pinning 0.82 / 24 / 3 never executes and this whole verification column is decorative.

</div>

Per the standing phased quality gate, **each phase ends** implement → verify → independent adversarial review of that phase's diff → refactor → re-verify, before the next begins.

---

## 6. Assumptions, stated rather than assumed silently

1. **Depth-map provenance — resolved into a hard gap, not an assumption.** The ABP's depth generator is documented as *"derived from the EXISTING block-in spec — same masses, same polygons, same draw order as `blockin.mjs`"*, with `PLANE_DEPTH` fills `fg: #b4b4b4` / `mg: #8c8c8c` / `bg: #333333` (and an explicit warning that `#e8e8e8` for `fg` renders as a glossy boat gunwale).

   **`blockin.mjs` is not in the repository.** `git ls-files` finds no match. It was scratchpad-only — precisely the failure mode F-024 existed to fix. So **there is no committed producer for the depth control images**, and without one Phase 3 cannot run at all. Building the block-in / depth generator is therefore **Phase 2 scope**, not a Phase 3 input. This is the single largest piece of unplanned work the exploration surfaced.
2. **The ComfyUI box is a hardware dependency.** Phases 2 and 3 need `100.66.190.100:8188` (GPU 0) reachable. GPU 1 / port 8189 is the owner's own instance and is not to be touched. Phases 1 and 4 are pure code and can proceed while the box is unavailable — this is the main practical argument for the phase ordering.
3. **`4x-UltraSharp` is installed** on that box. The ABP used it; this spec assumes it is still present rather than adding an installation step.

## 7. Risks

- **Phase 4 is coupled to a hardware-dependent phase by choice.** The owner elected a single spec over a split (2026-08-02). The consequence: a ComfyUI outage during Phase 3 stalls a frontend refactor that has no technical dependency on it. Mitigation: Phases 1 and 4 are independent of the box, so Phase 4 can be pulled forward if Phase 3 blocks.
- **The config restructure touches the only validated art path in the repo.** If a consumer update is wrong, character generation breaks silently — the output is still an image, just the wrong style. The Phase 1 regression test asserting 0.82 / 24 / 3 is the specific defense.
- **Splitting a 103 KB single-file storybook is the largest single-file change in this spec** and has no unit-test safety net of its own beyond the render-type parity guard. Keep the split mechanical and seam-following; do not redesign behavior and structure in the same pass.
