# Session Handoff — 2026-08-15 (world arc: F-043 + F-044 + F-045)

**For the next session. Every claim below was verified in-session; still, re-verify before building on any of it — handoffs have shipped wrong premises before.**

## Where we are, in two lines

Release **1.8** is in progress and now holds **F-041, F-042, F-043, F-044, F-045** — all shipped to `release/1.8`, none promoted. The game world is complete (named continents/seas/ice on the chart), observable (storybook Maps tab), and coherently scaled (400×400 km, hour-scale travel).

## What shipped today (2026-08-15, plus F-043 finishing from 08-14)

| Feature | What it is | Key verified facts |
| --- | --- | --- |
| **F-043 wider world** | Continents Coldreach/Stonemoor (ports Tallowquay/Netstead), chains Driftholt/Reedstrand/Brightfall, the Rimewall Cap, seas Keelbreak/Galereach/Tarnmark; canon A2 doc + DR-006 amendments; new gate **G-ATLAS-ROLLUP** | rollup CHECKED (ocean 96.1/rock ~0.9→2/ice ~1.9); basin sheet byte-untouched by F-043; gate perf fix (union scan→pairwise sum, 5 min→7 s) |
| **F-044 Maps tab** | Storybook "Map Sheets" section, pan/zoom viewer, PNG thumbs; **SHEETS↔maps-index parity gate** | Owner rule in CLAUDE.md/vault/memory: *every artifact must be observable in a review surface* |
| **F-045 world rescale** | ÷5 uniform geography scale → **400×400 km frame**, towns keep physical size, day-counts → **hours** (11 km/h) | war towns 33 min apart; Gildmark ≤1.7 h direct (2.5 h long-leg + 3.5 h Cindervast haul accepted); `scripts/rescale_spine.mjs` committed; **playroot subtree deliberately unscaled** (runtime u-mirror) |

Verification state at handoff: scripts suite 567/567; mapforge 24/24; storybook 30/30; `--only=spine` / `--require-complete` / `spine-emit --check` / `check_map_render` all exit 0; precheck 13/13 (ship re-ran it green twice).

## Deployed local state

- OrbStack k8s (`orbstack` context), namespace `atlas-world`. Storybook at **http://192.168.139.2:6006/** (302 → `/tools/asset-storybook/index.html`) — serving the **F-045 hour-scale sheets** (verified: served SVG contains "travel-hour").
- Nakama's rollout **timed out** during today's deploy and cockroachdb crash-looped during a cluster wobble — storybook/colyseus fine; **check those pods before relying on the game stack**.
- Docker buildx: OrbStack's restart unlinked it; fixed via `~/.docker/cli-plugins/docker-buildx` symlink. Storybook image builds **require `DOCKER_BUILDKIT=1`** (per-Dockerfile dockerignore) — without it you get an asset-less image.

## Open threads (in priority order)

1. **Promote release 1.8** when the owner calls it: `psrw promote` (release-manager; five features aboard). Worktrees for F-043/F-044/F-045 still exist under `.claude/worktrees/` — cleanup happens post-promote.
2. **Chart densification (unfiled)** — the atlas chart *looks identical* after the rescale **by construction** (uniform scale × matching render density). The owner's "map looks so empty" ask is NOT yet solved visually. Agreed direction from discussion: crop the atlas viewport to charted extent + mariners' chart furniture (rhumb lines, wreck marks in the Keelbreak — canon supports it, current arrows, phantom-isle "reported positions"). File as an idea when resumed.
3. **Story-prose re-voice (deferred by owner ruling: "forget about story")** — ~20 `AMENDED-PENDING (I-095)` markers across canon.md / A0 / A1 / A2 / node lore / edge notes mark every day-count/distance contradiction. A future feature re-voices prose to hour-scale; the markers are the worklist (grep `AMENDED-PENDING`).
4. **I-093** (filed): G-ATLAS-ROLLUP union-key hardening (rogue-biome bound ~6pp, actual ~1.1pp).
5. Cosmetics parked with rulings in ledgers: label crowding on the majors; leftover first-sealane validation block in `atlas-sheet.mjs`.

## Traps the next session must not re-learn (details in project memory)

- **canon.md citation rot** — SIX occurrences now. Insert into canon.md ⇒ every `canon.md:N` citation below shifts. Repair by QUOTED TEXT only, never arithmetic offsets. `seal-provenance.test.mjs` is the gate that catches it.
- **The playroot subtree (n-playroot, n-frontier-shelf, sites, fixtures) never scales/moves** — it mirrors the runtime u-world.
- **Full-map visual pass** is part of done for any sheet change — label-crop reviews miss composition defects (chrome once buried a continent).
- **Port 6007 squatter**: an Aug-9 `http.server` from another session may still serve a stale worktree. Never trust "the feature isn't there" in a browser without confirming which tree the server roots.
- Fresh worktrees need `cd scripts && npm install` (gate needs ajv/js-yaml) — Gate 1 fails cryptically otherwise.
- Background `psrw ship` runs got killed twice; run it **foreground** with `--no-deploy` (fits the 10-min tool timeout; deploy separately from `_release`).
- Sonnet implementer subagents park on background test runs — dispatch prompts need explicit "FOREGROUND only, timeout 600000".
- `curl` without `-L` lies about pages behind redirects; a pipeline's `$?` is the last command's, not the gate's.

## Resume rituals

- Status: `psrw status` (or `/ps-release-workflow:status`).
- SDD ledgers (per-feature task/review trail): `.claude/worktrees/F-045-*/.superpowers/sdd/plan/progress.md` (F-043's was deleted post-ship; F-044's under `.superpowers/sdd/`).
- Project memory index: `MEMORY.md` → `f-043-world-geography-status`, `f-045-world-rescale-status`, `every-artifact-observable`, `canon-line-citations-rot-on-insert`.
- Ship report (F-043, rendered): `docs/superpowers/specs/2026-08-15-f-043-world-geography-ship-report.md`.
