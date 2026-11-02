---
title: "Simplify Atlas web: one read-only page, agents edit files, retire the Mac edit host except Map Builder"
id: F-169
status: refined
from_idea: I-249
---

# Simplify Atlas web: make read-only vs editable obvious, drop dead edit routes

(Title kept from capture; the plan below supersedes it. It is NOT "retire the edit host" — see Critique.)

## Problem

Owner: "I want simpler and less confusing mechanic." `atlas-world.joymify.local.com` (cluster, read-only since F-168) and `atlas-edit` / `:8788` (Mac host process) look the same and the owner cannot tell which one can edit. The edit host runs old code until restarted and belongs to whichever session started it.

## Critique (Opus architect, 2026-11-02, GO-WITH-CHANGES)

The first sketch assumed two programs. It is one:
- The cluster image runs `scripts/catalog_explorer_web.py` in read-only mode (`Dockerfile.atlas-web:7,15`). Retiring routes does not remove a host.
- Map Builder cannot run without it: its screen is a tab in that file and its writes go through its proxy (`atelier/map-builder/lib/static.mjs:4-6`, `scripts/atlas_world_web/routes.py:129-137`). Keeping Map Builder keeps the edit host.
- The first retire list missed `/api/rebuild`, `/api/sim`, `studio/launch-3d`, `studio/undo`, `asset-verdicts`, `work-orders` (`catalog_explorer_web.py:1957-1981`, `routes.py:133-134`); panels call the last two.
- The canon and five-pillar gate already exists: `scripts/validate_studio_hierarchy.py:110-113,304,451`, run by `precheck.sh:269`. Do not write a second one.
- Route writes take a review-queue lock (`review_queue.py:3-4,133-148`), log to the agent log, clamp sizes (boss height 7.35-40 m, road and structure widths, `catalog_explorer_web.py:1143-1149,1384-1410`) and rebuild the catalog. File edits by an agent skip all of this, and no gate holds the clamps.
- Studio snapshots (`:771-824`) and Map Builder's own undo (`atelier/map-builder/lib/snapshots.mjs`) are two undo systems; adding `git revert` makes three.
- Edit-to-visible gets slower (gates, ship, image build, rollout). Map Builder publish leaves files uncommitted (`atelier/map-builder/lib/repo.mjs:43-47`), so a published map needs a ship before `atlas-world` shows it.
- Tests and callers that would break: `scripts/tests/atlas-web-read-only.test.mjs:59-62` (needs `/api/rebuild` and 14+ write routes), `tests/test_studio_web_perspectives.py:101-102`, frontend calls in `scripts/atlas_world_web/frontend/07_studio_perspectives_views.js:2068-2179`, `02_state_and_composable_layers.js:778-1079`, `02b_cartography_pipeline.js:732`; the refusal text and topbar link point at the edit host (`runtime.py:12`, `02_state_and_composable_layers.js:1,36`).
- In the idea's favour: most studio handlers are hard-coded to one pilot map (`freja-south-gate`, `rq-pilot-103`, `catalog_explorer_web.py:1173-1255,1368-1416`), so removing them loses little.

These are one reviewer's file reads; re-check each citation before acting.

## Revised plan

1. Keep ONE program. Do not try to retire a host.
2. Remove the pilot-map-only studio routes nothing real uses (verify with git history and graft callers first). Update the 2 tests and the frontend callers in the same change.
3. Make read-only vs editable unmistakable on screen (the F-168 version link already shows "Read-only · 1.19 · <sha>"; add the same signal, in the opposite sense, on the edit host).
4. Move the size clamps into `validate_studio_hierarchy.py --check` as an explicit `precheck.sh` step.
5. One undo per surface: drop the studio snapshot system together with its routes, keep Map Builder's.
6. Review-queue verdict routes go only after Asset Studio's approve flow is live and writes back to the Atlas repo (owner decision 2026-11-01).
7. State the cost to the owner: edit-to-visible becomes ship-time for agent edits.

## Unchecked before building

- Which studio routes were used recently (git history, panel callers).
- Is Asset Studio's approve flow live, and does it write back to the Atlas repo?
- Exact retire list: owner confirms before any deletion (costly to reverse).

## Acceptance criteria

- [ ] **Evidence list.** A committed note lists each studio write route, with its last git-history touch and its callers (panels, scripts, tests), and marks each KEEP or REMOVE. The owner confirms the REMOVE list before any deletion.
- [ ] **Removal is clean.** After the REMOVE routes go, `node --test` for `scripts/tests/atlas-web-read-only.test.mjs` and the panels suite pass with the tests updated to the new route list, and `grep` finds no frontend call to a removed route.
- [ ] **Map Builder unchanged.** Its draft, publish and undo end-to-end test (Gate 2) still passes.
- [ ] **Mode is visible.** On the release page and on the edit host the topbar states the mode ("Read-only · <release> · <sha>" versus "Editable · <host>"), proved by a phone (390x844) and a desktop (1280x800) screenshot of each.
- [ ] **Clamps are gated.** `precheck.sh` runs `validate_studio_hierarchy.py --check` as an explicit step and it fails when a boss height, road width or structure width is outside its clamp, proved by a red-then-green run.
- [ ] **One undo per surface.** No route writes a studio snapshot after the change; Map Builder's undo still works.
- [ ] **Live proof.** After `psrw ship --deploy`, `atlas-world` serves the new build and a POST there still returns 403.
