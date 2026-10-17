# F-051 completion — Plan E Tasks 15-16, hardening, and ship

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Plan E (Tasks 15-16), pay the measured hardening debt, ship F-051 to
release/1.8, and put 1.8 in front of the owner for promote.

**Architecture:** Six tasks in a measured order. Prose reconciliation first (it defines what
"final green" must cover), then the one real performance defect, then ship, then backlog
triage, then the R0 promote, then the absence-trap gate last so it never gates our own
release.

**Tech Stack:** Node 26 ESM, `node --test`, `scripts/check_content.mjs` gate rules,
ps-release-workflow (Gate 1 `precheck.sh`, Gate 2 `integration.sh`).

**Spec:** `.claude/refined_backlog/F-051-world-fill-plan-e-redraw-and-prose/completion-scope.md`
(audited 2026-08-29, verdict safe-with-fixes; its appendix carries the audit trail).

## Global Constraints

- **No hand edit of a generated artifact.** Fix the generator and regenerate.
- **A test you did not watch fail is not proven.** Mutation-test every new or re-baselined
  assertion. EIGHT rules that could not fail were found in this programme this week.
- **Never widen an assertion to make it pass.** A rule that can no longer fail is a defect;
  report it instead.
- **Derive, never retype.** `content/spine/trunk-census.json` is the census authority
  (helper: `scripts/tests/helpers/census.mjs`).
- **The absence trap.** Before publishing any exclusive, superlative, first/last or
  negative-existence claim, query the WHOLE corpus — surveyed AND reported ground, and the
  drawn world (dungeons, roads, settlements), not just the fabric. SIX distinct forms have
  shipped and been caught by review, never by a machine.
- **Serialise anything that runs the content suites.** Task 14 measured a concurrent
  `node --test` run rewriting `content/zones/` and `content/world/fabric/`, destroying
  uncommitted work twice and producing 4 phantom failures. **One suite-running lane at a
  time**, no exceptions.
- **A green/red claim is about a commit, not about the world.** State the sha you measured
  at. Three claims this week were true when made and stale when read.
- One commit per logical unit. **NEVER `git commit --amend`.**

## Measured starting state (2026-08-29, `54c2ee6`)

| Gate | Status |
|---|---|
| `check_content --require-complete` | **1 failure** — `bestiary/placement-thornveil.json` |
| `check_content --only=spine` | 0 failures / 8 warnings / 36 nodes |
| Gate 1 `precheck.sh --no-install` | **PASS 12/12** (was red at `149904e`, fixed by `e7840ca`) |
| `scripts` suite | **1287/1287**, 476-515 s (3/3 clean runs) |
| mapforge suite | 786 tests; `promote.test.mjs` 42/42 standalone |
| canon legs / digest / emit / render-lock | green (7/7 · matches · 39 files · 44 artifacts) |
| storybook | 86/86 |
| Zone records | 40/40, Z2 closed both directions |

---

### Task 1: Task 15 — prose reconciliation, re-scoped from measurement

The plan's Task 15 claims "22 AMENDED-PENDING re-voicings". The 22 is **exact and correct**,
but it is the small half: the measured job is **~77 discrete edits**, and the JSON half is
invisible to the plan.

**Files:**
- Modify: `content/story/canon.md` (5 markers + ~11 contradicting claims incl. "all six
  towns" at `:311`), `content/spine/edges.json` (5), `content/spine/nodes/n-atlas.json` (1),
  `docs/worldbuilding/A1-geography-cluster1.md` (7), `A0-current-world.md` (3),
  `A2-zones-cluster1.md` (1), `A2-wider-world.md:30,33`
- Modify: `content/story/lore.json` (12 tower/relay encodings), `quests.json` (9),
  `events.json` (2), `dialogue.json` (1) — **24 encodings the plan never mentions**
- Modify: `content/zones/zone-hollowmarch.json` (`ore` licensed by no c02 region), the legacy
  ten's **15 citation repairs** (13 of 20 landmark names cite docs not carrying them; 2 cite
  a nonexistent file)
- Test: `scripts/tests/` — a citation-integrity assertion and a tower/relay absence assertion

**Interfaces:**
- Consumes: `content/world/fabric/*.json` (160 regions: 40 surveyed / 120 reported) via
  `scripts/lib/survey.mjs:68 loadFabricRegionIndex`; `content/spine/trunk-census.json`
- Produces: a corpus with zero `AMENDED-PENDING` markers and zero tower/relay assertions

- [ ] **Step 1: Re-measure before editing.** Run and paste:
```bash
grep -rlo "AMENDED-PENDING" content docs/worldbuilding | while read f; do \
  echo "$(grep -o AMENDED-PENDING "$f" | wc -l)  $f"; done | sort -rn
grep -rn "tower\|relay" content/story/*.json | wc -l
```
Expected: 22 markers across 6 files (canon 5, edges 5, A1 7, A0 3, A2-zones 1, n-atlas 1);
~24 tower/relay encodings. **If the counts differ, the corpus moved — re-scope before editing.**

- [ ] **Step 2: Write the failing assertions first.** A test that the corpus contains zero
`AMENDED-PENDING` markers and zero tower/relay assertions, plus a citation-integrity test
that every `landmarks[].source` anchor resolves to a document that actually contains the
cited name. Watch all three fail on the current corpus and paste the red output.

- [ ] **Step 3: Two plan steps are already no-ops — confirm, do not perform.** Step 6
(`canon.md:<digits>` citation repair) has **zero** remaining citations anywhere in `content/`
or `docs/worldbuilding`. Step 7's G-MEANING is empty **and structurally blind** (31 relations,
21 on c02, six continents at zero, none encoding towers or town count). Record both as
verified no-ops in STATE §28 rather than inventing work.

- [ ] **Step 4: Re-voice the 22 markers**, then the 24 JSON encodings, then the 15 citation
repairs, then `hollowmarch`'s `ore`. Every claim must be licensed by measured ground. Do not
add specificity — this programme's record is that invented detail is the fastest route to
contradicting canon (4 of 6 defects in an earlier feature).

- [ ] **Step 5: `placement-thornveil` needs a ruling, not an edit.** Measured: its schema
pins `zone` to a slug pattern and **0 of 160** resolved zone ids can match it. No content edit
fixes it. It needs (a) a schema change, (b) a ruling on the c02/r30 alphabetical join, and
(c) a G8 band conflict resolved (`[15,28]` vs `[8,20]`). Produce the three options with
consequences and STOP for a ruling; do not invent a join.

- [ ] **Step 6: Run the assertions green**, then `check_content --require-complete`.
Expected: markers 0, tower/relay 0, citations resolve; the gate at 0 or 1 failure depending on
Step 5's ruling.

- [ ] **Step 7: Commit** — `git commit -m "content: reconcile prose to the redrawn world"`

- [ ] **Step 8: Phase gate** — verify → TWO independent reviews (one CODE, one CONTENT/truth;
the code has come back clean while the prose was wrong four times this week) → act on
findings as a NEW commit → re-verify.

---

### Task 2: Pin the grid-sampler equivalence scan as a lock

**The measured defect:** the redraw took `geometry-exact.test.mjs` from **1.20e8 to 2.118e10
edge tests — 176x in one commit** (`bc393a4`). Hot path `scripts/lib/spine.mjs:194-204`
`gridIntersectionArea`, called from `equivalenceScan()` at `geometry-exact.test.mjs:492`.
Grid 492.6 s vs exact 106.5 ms. 40 of 138 sibling pairs carry ~all of it; one pair
(`n-galereach ∩ n-keelbreak`) is 110.6 s.

**The wedge is UNVERIFIED** — 3/3 clean runs at 1287/1287 (476/499/515 s), no child
processes, timers, sockets or watchers, 190 MB peak RSS, 0 swaps. Treat it as a 500 s tail
that people killed, not a hang.

**REJECTED options, with the measurement that rejected them:** coarsening the cell 0.05→0.1
cuts to ~4 s **but the sampler then finds zero overlaps at every pair, making all three
equivalence assertions vacuous** — the exact defect class this programme keeps producing.
Rewriting the reference as a scanline (prototype 2.2 s) drops `tGrid/tExact` to ~10x, failing
the live **20x floor**. Splitting the file saves no runtime. `--test-timeout` is event-loop
based and let a 60 s `spawnSync` test report `ok`.

**Files:**
- Create: `content/spine/geometry-lock.json` (committed grid-sampler results, keyed to a hash
  of `content/spine/nodes`), `scripts/check_geometry_lock.mjs` (`--check` / `--write`)
- Modify: `scripts/tests/geometry-exact.test.mjs:492` (read the lock; keep the 20x timing
  assertion live on a bounded fixed pair-set so both kernels still run)
- Test: `scripts/tests/geometry-lock.test.mjs`

**Interfaces:**
- Consumes: `gridIntersectionArea` (`scripts/lib/spine.mjs:194`), the existing
  `check_render_lock.mjs` / `check_spine_emit.mjs --check` pattern
- Produces: `checkGeometryLock({repoRoot, write})` → `{ok, drifted[]}`

- [ ] **Step 1: Write the failing test** — the lock's hash must not match a mutated
`content/spine/nodes`, and every pair's committed area must equal a freshly computed one.

- [ ] **Step 2: Run it, watch it fail** (no lock file yet). Paste the red output.

- [ ] **Step 3: Implement `check_geometry_lock.mjs`** following `check_render_lock.mjs`'s
shape exactly — `--write` baselines, `--check` exits non-zero on drift.

- [ ] **Step 4: Baseline the lock and re-point the scan.** `--write` once; then
`equivalenceScan()` reads committed areas for the 138 pairs and runs both kernels only on the
bounded pair-set that backs the 20x assertion.

- [ ] **Step 5: Prove the assertions kept their teeth.** THREE mutations, each watched red:
(a) change a node ring in `content/spine/nodes` without re-baselining → lock hash reds;
(b) corrupt one committed area → equality reds; (c) make the exact kernel wrong → the 20x
pair-set reds. **If any mutation stays green the task has reintroduced the vacuity it exists
to avoid** — stop and report.

- [ ] **Step 6: Measure the win.** Run the scripts suite and paste before/after wall-clock.
Expected: ~500 s → well under 60 s, with 1287 tests still passing.

- [ ] **Step 7: Commit** — `git commit -m "perf: pin the grid-sampler scan as a lock"`

- [ ] **Step 8: Phase gate** — verify → independent review (`code-reviewer`, `model: sonnet`,
diff is small) → `/simplify` → re-verify.

---

### Task 3: Test-runner observability — a kill must never read as a failure

**The measured defect:** the default `node --test` reporter **discards `signal:`**, so a
killed run is indistinguishable from a failed one. This has already cost this programme
directly: three `tools/mapforge/tests/` files (`promote`, `raster`, `render-sheet`, all
blocking in `spawnSync`) were reported as real failures when they had been SIGTERM'd, and
`promote.test.mjs` is **42/42 standalone**. Under `--test-reporter=tap` both shapes are
distinguishable: parent-kill prints `# Interrupted while running:` with no summary; child-kill
prints a summary with `signal: 'SIGTERM'`, `exitCode: ~`, and zero `not ok` subtests.
Separately `.github/workflows/ci.yml:96` runs `npm test --prefix scripts` on **every PR** with
**no `timeout-minutes` anywhere**, so a genuine wedge burns GitHub's 360-minute default.

**Files:**
- Create: `scripts/classify-test-run.mjs` (CLEAN/FAILED/KILLED → rc 0/1/2)
- Modify: `scripts/package.json` (test script → `--test-reporter=tap`),
  `.github/workflows/ci.yml:96` (add `timeout-minutes`)
- Test: `scripts/tests/classify-test-run.test.mjs`

**Interfaces:**
- Produces: `classifyTestRun(tapText)` → `"CLEAN" | "FAILED" | "KILLED"`

- [ ] **Step 1: Write the failing test** with all four fixture shapes: clean summary; a real
`not ok`; a child-kill summary carrying `signal: 'SIGTERM'` and zero `not ok`; a parent-kill
with `# Interrupted while running:` and no summary.

- [ ] **Step 2: Run it, watch it fail.** Paste the red output.

- [ ] **Step 3: Implement the classifier** (~15 lines) and switch the suite to
`--test-reporter=tap`.

- [ ] **Step 4: Add `timeout-minutes` to the CI job.** Set it from the measured worst case
after Task 2's speedup, with headroom — state the number and why.

- [ ] **Step 5: Run all four fixtures green**, plus the real suite once end to end.

- [ ] **Step 6: Commit** — `git commit -m "test: a killed run must not read as a failure"`

- [ ] **Step 7: Phase gate** — verify → review → re-verify. (Tasks 2 and 3 are the same
subsystem and under 200 lines together; they MAY share one gate.)

---

### Task 4: Task 16 — final green and the rollback drill, re-derived

**Five plan premises measured false — fix the plan's steps, do not follow them:**
1. Step 5's drill greps `"redraw the world from the seed"` → **0 matches**; the commit is
   `bc393a4 "feat: THE REDRAW…"`, so `REDRAW` resolves empty and
   `git checkout -b rollback-drill ""` fails. **The drill is unrunnable as written.**
2. Step 7 expects **18** indexed sheets; `maps-index.json` has **17** (cluster1 retired by
   ruling 8; `budgets.json:95` says so itself).
3. Step 3's inline survey script **crashes as written** (`world.json` has no `.regions`);
   filtered to `continent-*` it gives the expected 40/120.
4. Step 9 briefs the reviewer on `git diff main...HEAD` = **1109 files / 265k insertions**
   (all of Plans A-D). Correct scope is `release/1.8...HEAD` = **50 commits / 249 files /
   18.7k insertions**. Its q(2) on `mapDimensions.ts` is a false positive (changed once at
   `724ad6b`, F-041 P4, unrelated to the redraw).
5. Step 1's "every section PASS" is false in **three** sections, not one.

**Files:** Modify `docs/superpowers/plans/2026-08-16-world-fill-e-redraw-and-prose.md`
(Task 16 steps), then execute them.

- [ ] **Step 1: Correct the five premises in the plan text**, each with the measurement that
refutes it, so the next reader inherits facts.

- [ ] **Step 2: Run the rollback drill for real** against `bc393a4`. Prove revert restores the
pre-redraw tree with zero diff and the old world comes back green, then restore forward.
(This was already proven once this session — reproduce it as the drill, and record the sha.)

- [ ] **Step 3: Full green, serialised.** Run every gate and suite ONE AT A TIME (Global
Constraints: no concurrent suite runs). Paste each with counts: `--only=spine`,
`--require-complete`, canon legs, spine-emit, world-digest, render-lock, A4, scripts suite,
mapforge suite, storybook, art-forge, `precheck.sh --no-install`, `integration.sh`.

- [ ] **Step 4: Write the ship report** naming every remaining red and its owner. **Report
what is true, not what is tidy** — if something is red, it goes in the report.

- [ ] **Step 5: Commit** — `git commit -m "docs: Task 16 — final green and the ship report"`

---

### Task 5: Ship F-051 to release/1.8

**R1 (costly to reverse).** Undo: revert the merge commit on `release/1.8`.
Gate 1 is green at `54c2ee6`. CI will run the scripts suite on the PR — after Task 2 that is
under a minute rather than 500 s.

- [ ] **Step 1:** Merge `release/1.8` into `feat/F-051` FIRST and resolve conflicts (this
repo's rule: merge the release into the feature branch BEFORE Gate 1, not after).
- [ ] **Step 2:** Run Gate 1 `precheck.sh --no-install`; paste PASS.
- [ ] **Step 3:** Ship via `ps-release-workflow-ship` from inside the worktree.
- [ ] **Step 4:** Confirm the catalog marks F-051 shipped and paste the release status.

---

### Task 6: Triage the filed backlog

**Measured: 51 filed items — 14 REAL DEFECT · 20 ENFORCEMENT GAP · 6 SCOPE-DEFERRED · 11
STALE.** The three most embarrassing if shipped: the POI warning-literal tripwire, the legacy
ten's fabricated citations, and `iceEdge` null on both ice caps.

- [ ] **Step 1: Re-verify every item is still true** before tracking it — 11 were already
stale. Do not copy text forward; run the check.
- [ ] **Step 2: File the 14 REAL DEFECTs and 20 ENFORCEMENT GAPs** as `I-NNN` ideas via
`ps-release-workflow-idea`. Note the second sink `.claude/idea_backlog/_FILED-OFF-GOAL.md`,
whose 194/200 ring-cap item targets Plan E's own redraw.
- [ ] **Step 3: Record the two accepted-debt items** that appear nowhere today: 25 of 83 zone
hazards have no runtime effect (gate WARN only), and `townPlans` ships 1 of 8.
- [ ] **Step 4: Prune STATE §28** to a pointer list once the items are tracked, so the next
session reads a ledger and not an archaeology site.
- [ ] **Step 5: Commit.**

---

### Task 7: Promote 1.8 to main — **R0, STOP FOR THE OWNER**

**This is irreversible: the PR from `release/1.8` to `main` squash-merges and that merge
DEPLOYS TO PRODUCTION.** Under global rule 5 this requires explicit owner authorisation; the
standing "babysit + merge" phrase is the authorisation, and it covers the prod deploy.

- [ ] **Step 1:** Gate 2 `integration.sh` fully green — **all 16 sections**, not just
`--require-complete`. Only 1 of 16 has been measured; paste every one.
- [ ] **Step 2:** Present the ship report and the named rollback (revert the squash commit on
`main`, redeploy the prior tag) and **STOP.** Do not open the PR without authorisation.
- [ ] **Step 3 (only on authorisation):** `ps-release-workflow-promote --babysit`, watch the
deploy to success, then cleanup.

---

### Task 8: The absence-trap gate — helper now, warn-tier after promote

**Deliberately last** (audit H1): Z8 lands a hard rule in the very Gate 2 that promote must
pass, and the `claims[]` schema change touches all 40 records. Its kill criterion was TESTED
and NOT met — zone content is not frozen (`docs/worldbuilding/A4-zone-allocation.md:158` files
a re-pack for 7 deferred E-C9 zones; 120 of 160 regions are still `reported` and Z2 mints a
record the moment one is surveyed).

**Measured design inputs:** 40 records / 294 prose fields. Marker-only trigger = 36/40 records
/ 111 sentences, catches all five original archetypes; the tighter marker+scope tier = 19/40
but MISSES two. No machine-readable evidence exists today (`zone-content.schema.json` is
`additionalProperties:false`; the only evidence is `landmarks[].source`, a document anchor).
**The measurement itself is fully computable** — the trap is one line:
`.filter(r => r.survey === "surveyed")` gives 40, the fabric gives 160.

- [ ] **Step 1: Save the census query** — audit M2 found R2's numbers (294/36/111/19/40/16)
have no saved script and are unreproducible. Commit the query, re-run it, report the delta.
- [ ] **Step 2: Build the fabric recompute helper ONLY** — `measureOverWholeFabric({measure,
population})` reading all 160 regions via `loadFabricRegionIndex`. This is the whole
mechanical value and carries no gate risk.
- [ ] **Step 3: Prove it on a known case** — withybar's bramble: exactly 8 regions,
top `c08/r08 = 43.9`. Paste the output.
- [ ] **Step 4: Z8 as WARN-tier only**, printing an inventory to
`content/zones/claims-ledger.json`. **Zero records fail.** Hard-fail is a later decision, and
the sixth absence-trap form proves the fabric alone is not enough — "the only lava tube in the
world" is true of the fabric's one landform and false of the drawn world's **nine** lava-tube
dungeons, so the helper must read the drawn world too.
- [ ] **Step 5: Arm it.** Mutation: edit a reported region's `biomeShares` so it outranks a
registered claim → Z8 must warn **on fabric data alone with the prose untouched**. Watch it.
- [ ] **Step 6: Commit.**

---

## Appendix — audit trail

- 2026-08-29 self-grill-audit on the scope (verdict safe-with-fixes) reordered this plan to
  R4→R1→R5a→R3→R5b→R2 and split ship from promote. Three measurement lanes then corrected the
  scope again: the wedge is UNVERIFIED (3/3 clean runs), CI runs the suite on every PR (not
  Gate 2 only), and Gate 1 was red at `149904e` but fixed by `e7840ca`.
- Open R0: **Task 7 promote** — production deploy, owner authorisation required.
