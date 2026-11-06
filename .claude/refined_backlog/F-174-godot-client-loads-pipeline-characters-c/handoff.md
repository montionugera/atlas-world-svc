# F-174 handoff

**Goal (owner, verbatim):** "fewer future issues; 3D model + animation generation with almost zero human need; multi-component characters (body + weapons); more assets, high quality, faster, lower cost." F-174 = Phase 6: the Godot client loads the pipeline sergeant, with combat states and a runtime weapon swap.

**Plan:** `.claude/refined_backlog/F-174-godot-client-loads-pipeline-characters-c/plan.md` (Tasks 0-11 in waves A-D, plus a spec coverage map and self-review).
**Spec:** `spec.md` beside it (owner-approved rev 2).

**State (2026-11-06, plan rev 2):** the plan is rewritten for the owner's R0 decision **"pull, don't commit"**: the repo is public, so the sergeant stays in Asset Studio and the manifest records asset `01a1a97a…`, tag `p4b-11050912`, sha256 `7f1c54c3…c75f` and the licence `studio-private`. The bytes go to the gitignored `game-client/studio-cache/` (new Task 1a). Note: the approved sha is **not** the local pack `out.glb` (`0ac13d97…`). The planned `studio-pull` code and the `godot-verify.sh` tests were dry-run in a scratch copy (8/8 and 7/7 pass), and the pull fetched the sergeant from the live Asset Studio and verified its sha. No repo code has changed yet. Audit fixes are listed in plan.md §Audit trail.
**Spec:** Design §1 + an appendix line were updated for pull-by-manifest.

**State (2026-11-06, plan rev 3):** the re-audit fixes are in (plan.md §Audit trail, "rev 3" lines): the thumbnail baker no longer queues pull entries and guard (W) fails on any `studio-cache/` thumbnail row or tracked `.import`/`.tscn`/`.tres`; the report fixture moved out of the gitignored `fixtures/` to `atelier/asset-forge/tests/studio-report.fixture.json`; Task 2 now holds the whole `intake.mjs`; **local Gate 1 never accepts `ATLAS_SKIP_STUDIO=1`** (only `ci.yml` skips, with a `::warning::`); `PIPELINE_CHAR_PATHS` widened; `--import` has its own 900 s bound, fetch 30 s, kubectl 20 s, 401/403 = `studio auth failed`; the strip asserts tier Bespoke; `export_presets.cfg` excludes `studio-cache/*`; intake prints wall time plus the batch's `credits_spent` / `credits_est`.

**Next step:** `subagent-driven-development` from **Task 1a** (a scoped re-check of Tasks 1a, 2, 8 is optional; the rev-3 code blocks were syntax-checked with `node --check`).

## Next feature idea (file with `psrw idea` after F-174 ships)

**Title:** Batch-loop intake: every PASS row of an atlas-char batch report becomes a pull-only manifest entry in one command (ranger, warden first).
**Why (owner goal):** "almost zero human need … more assets … faster, lower cost". F-174 proves one row (`--from-report <report.json> --slug <slug>`); the next step loops it.
**Shape:** `node atelier/asset-forge/intake.mjs --from-report <report.json> --all [--kind pipelineCharacter]` intakes each `status: PASS` row in report order, deriving `--key` and `--dest-name` from the slug (`npc-<x>` → `npc:<x>`, `<x>.glb`); one drift-gate run at the end; per-row result lines plus a summary with total wall time and the batch's `credits_spent` / `credits_est`; any row failure rolls back only that row's manifest entry and the command exits 1. Ledger rows in `art-source/LICENSES.md` are still required per character (validate's ledger rule), so the feature either writes them or fails naming the missing ones.
**Inputs ready (read 2026-11-06):** `batches/p5-acceptance/report.json` has `npc-outpost-marksman-ranger` PASS (asset `01a1aba5…`, tag `p5-11051917`) and `npc-lantern-hollow-gate-warden` PASS (asset `01a1af98…`, tag `p5-11061342`), beside the sergeant; both need the same `pipelineCharacter` budgets (warden is 2.8 MB, at the cap).
**Out of scope there too:** server wire flags (I-255), NPC identity mapping. The controller does Task 0, the design brief, before Task 10.
**Owner items (do not block):** D3 budget plus a frame-time number; the `combat_idle → block_idle` mapping; the release app shows the wiki text but not the private strip (it lives on the edit host). The CC0 question is closed: the licence is `studio-private`.
