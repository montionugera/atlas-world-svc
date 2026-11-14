---
title: "Remove unreferenced scripts and the first-generation Python atlas chain"
id: I-298
status: idea
---

# Remove finished one-shot scripts and superseded tools

Owner approved this batch on 2026-11-14 on the condition that each file is re-verified first.
Verification (5 checks per file, incl. imports, globs and external hooks):
`~/.local/state/atlas-lane/cleanup-audit-2026-11-14/verify-I-298-scripts.md`; the deletion list below was
re-checked with `git grep` on release/1.34.

## Problem

The first audit searched by basename only and called about 1.8 MB of Python "dead". Verification refuted
most of it: `run_atlas_iteration_loop.py`, `studio_world_governance.py`, `tall_dungeon_expansion.py`,
`run_world_pipeline.py`, `epic-check.sh`, `verify-atlas-web.sh` and two Python tests are live (imported by
`scripts/catalog_explorer_web.py`, run by Gate 1, or run by the psrw epic hook). They stay.
What is really dead is smaller: finished one-shot migrations kept alive only by their own tests,
one superseded tool, one unrun test file and one rendered copy.

## Scope: delete 19 files

| Group | Files | Why dead |
|---|---|---|
| Finished migration (F-045) | `scripts/rescale_spine.mjs`, `scripts/tests/rescale.test.mjs`, `scripts/tests/fixtures/spine/rescale-basic/{spine,place-Whitsun,zone-Whitsun}.json` | Only its own test calls it. |
| Finished migration (F-185) | `scripts/rescale_units_to_metres.mjs` | Only one test case in `scripts/tests/unit-contract.test.mjs` imports it; remove that case, keep the file's other tests. |
| Finished one-shot (F-167) | `scripts/mob_body_plan_pass.py`, `scripts/tests/mob-body-plan-pass.test.mjs` | Only its own test calls it; the live gate reads the JSON directly. |
| Finished one-shot | `scripts/diversify_l2_towns_and_zones.py` | No caller. |
| Unused report | `scripts/report_absence_trap_census.mjs`, `scripts/lib/absence-trap-census.mjs`, `scripts/tests/absence-trap-census.test.mjs` | The report has 0 references; the lib and test serve only it. |
| Finished plan helper (F-046) | `scripts/tools/overlap-preflight.mjs` | No caller. |
| Superseded tool | `atelier/asset-2d-forge/` (4 files) | Replaced by `atelier/art-forge/intake-art.mjs`; its test is in no gate. |
| Unrun test | `tests/test_atlas_world_web.py` | No gate, CI job or script runs it; superseded by `scripts/tests/atlas-web-*.test.mjs`. |
| Rendered copy | `atelier/ABP-twostage-flux-pipeline.html` | 0 references; the `.md` stays. |

Edits that go with it: the mentions in `README.md` (mob_body_plan_pass), `atelier/AGENTS.md` (asset-2d-forge row),
and the comments in `scripts/lib/mob-shape.mjs`, `atelier/art-forge/intake-art.mjs`,
`atelier/atlas-world-panels/js/panels/registry.mjs`, `scripts/tall_dungeon_expansion.py`,
`atelier/mapforge/lib/basin-sheet.mjs`, `scripts/lib/places.mjs` that name a deleted file.

## Out of scope

- Kept, live: everything listed under Problem.
- Kept, generators of committed live artifacts (ungated but not dead): `scripts/gen_audio_index.mjs`
  (audio-index.json), `scripts/codegen/gen_flatbuffers_csharp.sh` (C# protocol), `scripts/generate_l2j_atlas_maps.py` (the 12 studio map plates).
- Kept, documented entry point: `scripts/run_playtest.sh` (README).
- Owner decision, human-launched tools that grep cannot judge: `scripts/run_mac.sh`, `scripts/run_mac_map_builder.sh`,
  `scripts/build_mac_observatory.sh`, `scripts/deploy_ios.py`, `atelier/asset-forge/scripts/build_meshy_humanoid.py`.

## Acceptance criteria

- [ ] A1: `git ls-files` returns nothing for the 19 paths.
- [ ] A2: `git grep -n -F` for each deleted file's stem returns no hit outside `.claude/` and `docs/`.
- [ ] A3: `node --test scripts/tests/unit-contract.test.mjs` passes with its remaining tests.
- [ ] A4: the scripts test suite passes with the same command CI uses (`npm test --prefix scripts`).
- [ ] A5: `./scripts/precheck.sh` (Gate 1) passes.

## Undo

`git revert` of the feature's squash commit restores every file.
