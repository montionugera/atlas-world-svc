# F-051 completion scope — the five recommendations

**Status:** pre-plan, AUDITED (see appendix). This is the spec the completion plan argues from.
**State (measured 2026-08-29):** branch `feat/F-051`, 40/40 zone records written,
`check_content --require-complete` = **1 failure** (`bestiary/placement-thornveil.json`),
14 of 16 Plan E tasks done (Tasks 1-14), nothing pushed, release 1.8 open since 2026-08-09.

## EXECUTION ORDER (corrected by audit — not the order these are numbered)

**R4 -> R1 -> R5a -> R3 -> R5b -> R2.** Rationale, each measured:
- **R4 first**: Task 16's deliverable DEFINES R1's success condition. If R16 re-derives it to
  "Gate 2 green" rather than "one clean 1286/1286 whole-directory `node --test`", R1 shrinks
  to isolating a single file. Scoping R1 before R4 risks solving the wrong problem.
- **R5a (ship) is NOT blocked by R1.** Verified: Gate 1 (`scripts/precheck.sh`) contains no
  `scripts/tests` section at all (0 hits for `prefix scripts`). **Correction (wedge lane):
  CI runs `npm test --prefix scripts` on EVERY PR** (`.github/workflows/ci.yml:96`, inside
  the colyseus-server job) as well as Gate 2 (`integration.sh:113`) — so a PR pays the ~500 s
  cost, and with **no `timeout-minutes` anywhere** a real wedge would burn GitHub's 360-minute
  default before reddening. Slow, not blocking.
- **The wedge is UNVERIFIED and probably not real.** 3/3 clean runs at 1287/1287
  (476/499/515 s). The reported "3 failures" were kill artifacts from `tools/mapforge/tests/`
  — a different directory — all three blocked in `spawnSync`. The default `node --test`
  reporter DISCARDS `signal:`, so a killed run is indistinguishable from a failed one; only
  `--test-reporter=tap` exposes it.
- **R2 last.** Z8 lands a new hard rule in the very Gate 2 that promote must pass, and the
  `claims[]` schema change touches all 40 records. Landing it before R5b would gate our own
  ship on brand-new machinery.

## R1 — Fix the test-runner wedge (blocks PROMOTE, not ship)

`scripts/tests/geometry-exact.test.mjs` runs ~460 s standalone (51 tests). A whole-directory
`node --test` run *intermittently* wedges with it as the last live worker and never prints a
summary; it has also completed cleanly at 1286/1286 at least twice. Three separate lanes this
week could not obtain a clean full-suite result and substituted targeted runs.
Task 16's deliverable IS a trustworthy full-suite green. **Correction from audit:** this
blocks *promote*, not *ship* — the suite runs only in Gate 2 (`integration.sh:113`), and
Gate 1 (`precheck.sh`) never runs it. R4 must fix Task 16's success condition before R1 is
scoped, or R1 may solve a larger problem than required.
Secondary hazard, already cost us once: a killed run reports SIGTERM'd files that look
identical to failures (`# fail 3`, zero subtests `not ok`).

## R2 — Gate the absence trap

Publishing "absent in the surveyed subset" as "absent in the world". Five confirmed
occurrences this week, every one caught by human review, none by any machine.
Measured design input (independent lane, 2026-08-29):
- Live surface is `content/zones/*.json` = 40 records / 294 prose fields. Every other corpus
  trips 0 — the earlier defects were excised in `bc393a4` / `e5600ce`.
- No clean regex: marker-only trigger = 36/40 records, 111 sentences, catches all five
  archetypes; the tighter marker+scope tier = 19/40, 40 sentences, but MISSES two archetypes.
- No machine-readable evidence exists today: `zone-content.schema.json` is
  `additionalProperties:false` with no claims field; the only evidence is
  `landmarks[].source`, a document anchor not a measure. Of 40 tripped sentences only 16
  carry a number, all as prose.
- **The measurement itself is fully computable.** `content/world/fabric/*.json` holds 160
  regions (40 surveyed / 120 reported) with `biomeShares`, `areaKm2`, `roads[].points[]`.
  The loader is already imported by the gate (`scripts/lib/survey.mjs:68
  loadFabricRegionIndex`, used at `check_content.mjs:64,1335`). The trap is one line:
  `.filter(r => r.survey === "surveyed")` -> 40 vs the fabric's 160.
- Zone rules run in **Gate 2 only** (`integration.sh:81`); `precheck.sh:142` runs only
  `--only=spine`, so no zone rule reaches Gate 1.
- Proposed: Z8 "registered claims" — marker-only trigger, pass condition a new `claims[]`
  array `{field,quote,measure,population,value,rank}` with `population` never a
  survey-filtered set, recomputed by the gate from the fabric. Unmeasurable claims take
  `population:"none"` + mandatory reason (precedent: `freeze-reasons.json`).
- Rollout must be staged: warn+ledger -> hard-fail on diff-touched records -> corpus-wide.
- **Kill criterion TESTED AND NOT MET — zone content is NOT frozen.**
  `docs/worldbuilding/A4-zone-allocation.md:158` files a re-pack for the 7 deferred E-C9
  zones, and 120 of 160 fabric regions are still `reported` — Z2 mints a record the moment
  one is surveyed. So R2 survives, but scoped down (below).
- **SCOPE CUT (audit H1/H2):** build the **fabric recompute helper** now — it is the whole
  mechanical value and carries no gate risk — and land Z8 as **warn-tier only**, AFTER
  promote. Defer the `claims[]` schema change (`zone-content.schema.json` is
  `additionalProperties:false`, 8 props, 40 records) until the helper has proven itself.
- **Reproducibility (audit M2):** R2's census numbers (294 fields / 36 records / 111
  sentences / 19 / 40 / 16) have NO saved script in the repo and are currently
  unreproducible. The plan must save the query before relying on any of them.

## R3 — Triage the filed backlog

`world-fill-STATE.md` section 28's filed-not-fixed list has grown across every task this
week. Each item must be re-verified as still true (several may be fixed or obsoleted), then
classed REAL DEFECT / ENFORCEMENT GAP / SCOPE-DEFERRED / STALE and the real ones tracked as
backlog items rather than left in an appendix.

## R4 — Re-scope Tasks 15 and 16 from measurement

All four plan premises were measured false in EACH of Tasks 12, 13 and 14 (wrong region ids,
invented slugs, kinds the licence gate forbids, citations to files carrying none of the
names).
**Correction from audit + my own re-measure:** Task 15's "22 `AMENDED-PENDING` re-voicings"
is CORRECT, not stale. Live census: `content/story/canon.md` 5, `content/spine/edges.json` 5,
`content/spine/nodes/n-atlas.json` 1, `docs/worldbuilding/A1-geography-cluster1.md` 7,
`A0-current-world.md` 3, `A2-zones-cluster1.md` 1 = **22**. (A further 22 occurrences live in
plan/spec docs that merely discuss the marker; those are not re-voicings.)
Task 15 HAS however inherited work beyond those 22 — `hollowmarch`'s unlicensed `ore`, the A2
contradictions filed from three continents, the legacy ten's placeholder status and broken
citations, and `placement-thornveil`. The plan must size the real job, not the 22.
Task 16's premises remain genuinely unmeasured, and **only 1 of Gate 2's 16 sections has been
measured** (`--require-complete`); the other 15 (G-NET, G-EMIT-DRIFT, G-REPRO, …) are unknown
starting distance.

## R5a — Ship F-051 to release/1.8 (NOT blocked; do early)

Gate 1 only. **R1/R2 classification: R1** (merges into the release branch, revertible).
Undo: revert the merge commit on release/1.8.

## R5b — Promote 1.8 to main (blocked by R1)

**R0 under global rule 5 — irreversible.** The PR from release/1.8 to main squash-merges and
that merge DEPLOYS TO PRODUCTION. Requires: Gate 2 fully green (all 16 sections, not just
`--require-complete`), explicit owner authorisation, and a named rollback — revert the squash
commit on main and redeploy the prior tag. Open ~3 weeks; long-lived release branches
accumulate exactly the drift this programme keeps discovering.

## Known history the plan must weigh

- **Seven** rules that could not fail were found this week (a gate seeing a wrong freeze but
  not a missing one; a promotion dropping the freeze and exiting 0; a citation rule reading a
  hand-list that exempted all seven records at 77 pass/0 fail; a memo leak printing zero
  failures on a second run; a budget assertion hardcoding a pre-redraw count).
- **Three** recorded "green" claims in STATE were falsified on re-run.
- Code reviews have repeatedly come back clean while the prose was wrong.

## Appendix — audit trail

- 2026-08-29 self-grill-audit: verdict **safe-with-fixes**. Corrected: R1 does not block the
  ship half (Gate 1 never runs the wedge-prone suite) so R5 split into R5a/R5b; execution
  order changed to R4 -> R1 -> R5a -> R3 -> R5b -> R2 because Task 16 defines R1's success
  condition and Z8 would gate our own promote; R2's kill criterion tested and NOT met (7
  deferred E-C9 zones, 120 reported regions) so R2 survives but cut to helper-now,
  warn-tier-later, schema change deferred; R5b marked R0 with a named rollback; R3 given a
  destination mechanism and a second sink; two missing debt items added; Task 15's "22"
  confirmed correct against my own per-file census rather than overstated as unmeasured;
  `check_content.mjs:1335` corrected to `:234`; task count corrected to 14 of 16.
- Auditor claims I verified before applying: Gate 1 has no `scripts/tests` section (0 hits
  for `prefix scripts` in `precheck.sh`; `integration.sh:113` runs it) — CONFIRMED. The 22
  markers — CONFIRMED by per-file census. The transient `csharp` deletions and dirty tree the
  auditor saw were Task 14 mid-flight and are now committed; tree is clean.
- Open R0 items: **R5b promote** (production deploy) — requires explicit owner authorisation.
