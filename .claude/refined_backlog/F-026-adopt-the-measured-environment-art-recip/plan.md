# F-026 Implementation Plan

> **Canonical plan:** [`docs/superpowers/plans/2026-08-02-environment-art-recipe.md`](../../../docs/superpowers/plans/2026-08-02-environment-art-recipe.md)
> This file is a pointer. The plan travels with the feature branch.

Nine tasks, in order. Tasks 1–4 and 8–9 are pure code; 5–7 need the ComfyUI box on `100.66.190.100:8188` (GPU 0 — port 8189 is the owner's own instance, do not touch).

1. **Wire art-forge tests into Gate 1** — `precheck.sh` runs ten sections and none is art-forge, so the existing suites are already ungated. Everything else is decorative until this lands.
2. **`forge.config.json` v2** — named profiles, no implicit default, `loadForge({ profile })`.
3. **Migrate character consumers** to `forge.profile`; move the hard-coded `MODELS` const into the profile.
4. **DR-002 appendix B** — record the non-commercial ruling that withdrew the licence work.
5. **`blockin.mjs`** — the depth control producer that is not in the repo.
6. **`env.mjs`** — schnell + depth-ControlNet runner.
7. **Replication run** — four subjects, two seeds, hold-or-fail verdict.
8. **Storybook tabs + filter** over the existing group buckets.
9. **Split the storybook monolith** along seams — after task 8, never in the same pass.

Each task ends with the standing phased quality gate: implement → verify → independent adversarial review of that task's diff → refactor → re-verify.
