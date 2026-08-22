# World Fill — running state

**A living handover file. Read this before starting any of Plans B, C, D or E.**

It exists so a new session does not need the previous session's conversation. If something here
is wrong, fix the file — do not work around it in a prompt.

Last updated: 2026-08-22, after **Plan B shipped** (F-047 → release/1.8, merge `65006fe`),
**Plan C was claimed** as F-048, and **Plan C seam 1 (Tasks 1-2) was reviewed and fixed** — see
the new §9, and eight more confirmed plan errors in §5.

---

## 1. Where the programme is

| Plan | Feature | State |
| --- | --- | --- |
| A — Unblock and Afford | F-046 | **SHIPPED** to release/1.8, 2026-08-19. All 15 acceptance criteria verified. |
| B — Vocabulary and Render | F-047 | **SHIPPED** to release/1.8, 2026-08-22. All 12 tasks; Gate 1 13/13. |
| C — The Fabric Layer | F-048 | **IN FLIGHT** — claimed 2026-08-22, worktree `.claude/worktrees/F-048-…`, base tag `plan-c-base`. |
| D — Pinned, Bound, Relations | — | not started |
| E — Redraw and Prose | — | not started |

Design: `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md`
Plans: `docs/superpowers/plans/2026-08-16-world-fill-{a..e}-*.md`

---

## 2. Measured baselines — compare against these, do not re-derive

**Re-measured 2026-08-22 in the F-048 worktree** (release/1.8 merged in, Plan B present,
Node v26.5.0). The Plan A column is kept alongside so a mover is visible.

| Command | At `plan-c-base` (F-047 merged) | Was, at Plan A |
| --- | --- | --- |
| `node scripts/check_content.mjs --only=spine` | 44 nodes / 0 failures / 19 warnings, **0.76 s** | 0.79 s |
| `node --test 'scripts/tests/*.test.mjs'` | **854 pass / 1 skip / 0 fail, 35.6 s** | 698 pass, 44.8 s |
| `node --test 'tools/mapforge/tests/*.test.mjs'` | **251 pass / 0 fail, 11.1 s** | 34 pass |
| `node --test 'tools/asset-storybook/tests/*.test.mjs'` | **54 pass / 0 fail, 0.5 s** | 32 pass |
| `node scripts/check_spine_emit.mjs --check` | clean, **47 files** | 46 files |
| `node scripts/check_render_lock.mjs --check` | clean, **3 artifacts** | 2 artifacts |
| `( cd colyseus-server && npx jest mapDimensions )` | **5 passed** | 5 passed |

The three movers are all Plan B's and all expected: the `derived.json` sidecar makes the emit
census 47, the synthetic canary sheet makes the render lock 3, and the lexicon/schema/render
work is the +156 scripts and +217 mapforge tests. **Plan C's acceptance criterion 7 reads
`clean, 47 files` — that is this number, not a target to move.**

The older whole-suite readings, unchanged and not re-measured here:

| Command | Result |
| --- | --- |
| `node scripts/check_content.mjs --require-complete` | exit 0 — 12 sheets, 1 maps, 158 story, 1 placements, 10 zones, 1 towns, 44 nodes, 0 failures, 32 warnings |
| `node scripts/tools/overlap-preflight.mjs` | 133 pairs, 0 non-triangulable, 0 verdict differences, max deviation 0.002692 km² |
| `( cd colyseus-server && npx jest mapDimensions )` | 5 passed |
| `./scripts/precheck.sh --no-install` (Gate 1) | PASS 12/12 |
| `./scripts/integration.sh --no-install` (Gate 2) | PASS 11/11 |

**Measure timing on a QUIET machine.** With concurrent agents the same suite read 60–76 s
against its 60 s cap; idle it is 44.8 s. Never quote the flattering run — but do not accept a
contended one as a regression either.

---

## 3. The invariant — what "nothing moved" means

Tag the starting commit as the very first act of any plan, then compare against it:

```bash
git tag plan-<x>-base HEAD
git diff --stat plan-<x>-base -- colyseus-server/
git diff --stat plan-<x>-base -- game-client/assets/art/maps/
```

Both must print **nothing** on every commit, in every plan except E's single redraw commit.
`colyseus-server/src/tests/mapDimensions.test.ts` staying green is an acceptance criterion on
**every** commit in **every** plan.

**Keep an enumerated list of which files under `content/` a plan is allowed to change**, and
make agents check it every commit. It is what stopped scope creep four times in Plan A. If a
task legitimately needs a sixth file, that is a finding to raise — never a diff to widen quietly.

**The one carve-out, agreed once:** Plan B Task 12 may re-baseline
`content/world/render-lock.json` and the two committed SVGs. Nothing else, ever, outside Plan E's
redraw commit.

**What Task 12's carve-out ACTUALLY moved — measured 2026-08-22 by the seam-4 fix pass, because
the seam's own commit messages overstate it in two places and a commit message cannot be
amended.** Counted with `grep -o` against `plan-b-base`, not with a remembered figure:

| | `<path d=` | `<rect ` | `<text` | `rotate(` | canvas |
| --- | --- | --- | --- | --- | --- |
| `cluster1-world.svg` base → head | 297 → **297** | 28 → **28** | 100 → **100** | 12 → **12** | 1614x1396, **unchanged** |
| `atlas-world.svg` base → head | 39 → **44** | 4 → **32** | 37 → **52** | 28 → **2** | 1542 → **1672 tall** |

- **"nothing moved" is true of the BASIN sheet's element census and of every `<path d>` on both
  sheets — and of nothing else.** On the atlas, every `<text class="lbl">` moved: 26 of the 28
  `rotate()` transforms were dropped along with `text-anchor`, the canvas grew 130 px, 28 legend
  rects and 5 patterns were added. All of that is *permitted* by the carve-out. The phrasing
  oversold it, and a later plan reading "nothing moved" would draw the wrong conclusion.
- **The basin sheet has 277 DRAWN paths, not 289.** 297 `<path d=` occurrences in the file, of
  which 13 belong to `<clipPath>` blocks and 7 to `<pattern>` blocks. The pattern `<rect>`
  geometry DID change on all 13 zones — that was the point of the raster-cost fix — while the
  drawn paths did not.

---

## 4. What Plan A built that the later plans consume

All exported and under test. Signatures are contracts — do not change them casually.

| Signature | Consumed by |
| --- | --- |
| `exactIntersectionArea({ a, b })` | C, E |
| `ringVertexCount({ placement })`, `bboxOfPlacement({ placement })`, `buildBBoxIndex({ items })` | C, E |
| `resolveWorld({ spine, tree, descriptor, fabric, civil }) -> { doc, problems }` | D |
| `loadPlaces({ contentRoot }) -> { doc, problems }` | D |
| `WORLD_DOC_KEYS: string[]` | D, E |
| `computeLock({ repoRoot, sheets, extraPaths })`, `checkLock`, `unifiedDiff` | C, E |
| `runSpineGateInProcess({ argv })`, `summaryLines(...)` | C, D, E — new gate fixture tests should use this, not a spawn |
| the `subjects` descriptor block in `sheet.json` / `sheet-atlas.json` | B, E |
| the three-term `content/spine/load-budget.json` shape | C, E |
| `GENERATOR_VERSION` | B Task 9 Step 3b **deletes Plan A's literal** and re-exports from `tools/mapforge/lib/version.mjs` |

Notes carried forward:

- **`buildBBoxIndex` is exported but deliberately NOT wired into the gate.** Measured: the
  governing variable is *disjointness*, not n. On the real spine it is 1.24× **slower**; at 24
  children with 160-point disjoint rings it is 10.8× faster. Full measurement table in commit
  `a780a4e`. Its grid extent is derived from the items, so **one out-of-frame item degrades the
  scan 23× at n=1,740** — a frame-spanning sea strip costs nothing.
- **`loadPlaces`' mirror fallback is load-bearing, not vestigial.** Three fixture suites build a
  content root with no `content/spine/` at all. **Plan D removes the fallback only together with
  migrating those three roots** — `scripts/tests/zone-content.test.mjs:355`,
  `town-plan.test.mjs:493`, `bestiary-placement.test.mjs:95`.

---

## 5. Where the plan documents are WRONG

Nine confirmed. Each was found by running code, not by reading. **Verify a brief against the
tree before trusting it** — this is the single most reliable source of defects in the programme.

| Where | The plan says | Actually |
| --- | --- | --- |
| A, acceptance criterion 4 | four `content/` entries | five — it omits `load-budget.json`, which Task 4 requires |
| A, Task 7 Step 4c | all 12 region children carry `lore.order` | only 10 do; the rule as literally written goes **RED on correct content** |
| A, Task 10 file list | — | omits the asset-storybook `Dockerfile` + `.dockerignore`; without them the *containerised* storybook 404s and every card reads "NOT LOCKED" |
| A, Task 10 Step 8 | `cd tools/asset-storybook && python3 -m http.server` | wrong document root — assets escape the directory. Serve from the **repo root**, open `/tools/asset-storybook/index.html` |
| A, Task 11 Step 9 (a) | `check_map_render.test.mjs` still uses `git checkout --` | it does not; Task 10 had already replaced it |
| A, Task 12 Step 1 allowlist | — | omits three real reads: `scripts/tests/season1.test.mjs:183` (module-level — deletion would throw at import), `season1.test.mjs:301`, `town-millcross.test.mjs:237` |
| A, Task 12 file list | — | omits four suites whose coverage the deletion would have silently voided |
| A, Risk A7 | four module-level mutable bindings | **six**: `placesByRoot:154`, `failures:225`, `warnings:226`, `zoneHazardsTotal:231`, `zoneHazardsUnmapped:232`, `townPlansCache:1255` |
| A, Task 3 fixture | the `g-children-cap` fixture triggers the rule | unreachable as written — the base fixture has no parent with 2 children |
| **C, Task 1 Step 8** | call `checkWorld` after `gSpineBudgets` (:1682) | **unreachable for exactly the roots that step describes.** `checkSpine` returns at its own first statement on a root with no `spine/`, which is before `gSpineBudgets` — so the world gate printed nothing at all. It is called from the TOP of `checkSpine`. Verified both ways by the reviewer. |
| **C, Task 1 Step 6** | `(budget ${fam.maxFiles}, ${fam.maxTotal ?? fam.maxPer})` | prints `civil`'s PER-FILE cap in the aggregate slot; `civil` has no aggregate cap at all. Reproduced: 3 files of ~5 KB read as `civil 3 files, 15030 bytes (budget 600, 8192)` and exit 0. Every term now carries its unit. The plan's own Task-1 test asserted the wrong line. |
| **C, Task 2 preamble** (and line 1341, and `budgets.json` `cellKmWhy`) | "640,000 cells x 9 fields is ~14.7 MB resident" | **13 fields, 23,680,000 bytes = 22.58 MB.** The four pinned-constraint fields (`landform`, `fetchKm`, `depthM`, `freshKm`) landed in the same commit and were counted in none of the three places. 14.7 MB was an ESTIMATE, never a budget — **do not shrink the grid to reach it.** |
| **C, Task 2 continuity fixture** (~:1113) | samples a named stream via `stream: "seedseedseedseed"` | not hex: `Number.parseInt(…, 16)` is `NaN`, `NaN \| 0` is `0`, so **every non-hex stream collapses onto the same field, deterministically, green**. `streamInt` now throws; fixtures were re-based onto real 16-hex streams. |
| **C, Task 2 `makeGrid` signature** | `({ w = 800, h = 800, cellKm = 0.5 })` | no `= {}`, so `makeGrid()` throws. The default was added and is now under test. |
| **C, Task 1 Step 3 manifest** | Global Constraints says 20 biomes / 18 terrain kinds / 40 glyph families / 12 groups are "gated against `content/world/manifest.json`" | the plan's own manifest carries **none of the four**, and `additionalProperties: false` means a later task cannot add one without a schema edit. 20 is already `BIOMES.length` in `scripts/lib/spine.mjs`; `dungeonCapableTypes: 23` lives in Plan B's `budgets.landforms`. **The manifest is not the authority for those four.** |
| **C, Task 1 manifest schema** | `landmasses: { minItems: 1 }` | no ceiling, while the neighbouring `oceans`/`seas` are pinned 3/3 and 9/9 — a 14-row manifest was schema-legal. Now `minItems: 13, maxItems: 13`. |

The plan text already self-corrects two more: spec §8.6's "checkSpine is already parameterised
with an injected collector" (it is not — it closes over module-level bindings) and §8.2's
"G-DEPTH gains a real depth for sea" (`TIER_DEPTH` already has `sea: 2`).

**Numbers the plans disagree on — Plan B Task 1 is the sole authority:**
**170** landform types / **178** group memberships (not the spec's 164/172), 8 dual-listed,
23 `dungeonCapable`. The `requires` predicate vocabulary is closed at exactly **11 keys** under
`additionalProperties: false`.

---

## 6. Traps that will bite again

**Setup, every plan:**

1. `psrw claim` branches from **`main`**, not from `release/<v>`. The fresh worktree will not have
   the map machinery. Run `git merge release/1.8 --no-edit` in it before anything else.
2. The worktree's root `plan.md` is a **stale leftover from whichever feature ran last**, and
   `psrw claim` tells you to read it. Overwrite it with a pointer to the real plan document
   before dispatching any agent.
3. A fresh worktree has no `node_modules`. `scripts/` installs with `npm install --prefix scripts`.
   `colyseus-server` and `nakama` are **pnpm workspace members** — `npm install` there dies on
   `workspace:*`. Use `pnpm install --frozen-lockfile`; `npx jest` works directly.

**Testing:**

4. `node --test` needs a FILE LIST. Locally use the **quoted** glob `node --test 'path/*.test.mjs'`.
   In CI and any `bash -e` step it must be **UNQUOTED** — `.github/workflows/ci.yml` pins Node 18,
   which has no Node-side glob. Quoting it there runs **zero tests and still goes green**.
5. `node --test` runs files **in parallel**. Two files that mutate the same tracked artifact will
   collide — in Plan A that reproduced 1 run in 3 and could have permanently written truncated
   bytes over a committed map. **Run a suite more than once**, and check `git status` after.
6. Deleting a small test file does **not** speed up a parallel suite — it removes a worker, not
   critical path. One file dominates the wall time.
7. A gate that "passes" may have stopped checking. **Assert the printed record counts**, not just
   exit 0. All three gate joins `return 0` on a failed load.
8. **Mutation-test every new rule**: delete it, watch the suite go red, restore. A rule whose
   deletion leaves the suite green protects nothing. A test comparing two hardcoded constants is
   not a test.

**Coordination:**

9. This repo has **13 live worktrees**, six for features that already shipped. A session that
   believes it owns its worktree may be editing a sibling's branch. Always pass `-C <worktree>`
   to git — the shell's working directory silently reset to the main checkout during Plan A, and
   a git command run there does not error, it answers a different question plausibly.
10. `general-purpose` is an agent **type**, not a routable identity. Several sessions message
    under it; replies fail and authorship gets mis-assigned. Only agent IDs route.
11. Concurrent reviewers detect each other's deliberate break-and-observe probes as bugs. Say in
    the brief that other sessions may be probing.

---

## 7. How to run a plan

What worked for Plan A, in one paragraph. Claim the feature, merge the release branch in, tag the
base, then run the tasks in seams of two or three as background workflows — each task being
implement → two independent adversarial reviewers → one fix pass that adjudicates rather than
obeys. Reviewers must **re-run the commands themselves**; an implementer's green run is not
evidence. The fix agent must be told to **refute** wrong findings with evidence rather than
"fix" correct code — in Plan A a fixer overturned a remedy three reviews had agreed on, by
building the counterexample, and was right. Between seams, verify the baselines in §2 yourself
before dispatching the next one.

**Keep the orchestrator thin.** Point agents at this file and at their task section; do not read
plan preambles into the main conversation. Have workflows return a per-task
`{task, verdict, commit, status}` summary — not the full findings objects — and have long review
reports written to a file that returns only its path.

---

## 8. Open follow-ups

**From the F-047 seam-4 (Tasks 10-12) fix pass, 2026-08-22.** Each was reproduced before being
filed; none is a guess.

- **`SHEETS.cluster1.maxLabelRank` is INERT.** `basin-sheet.mjs` never calls `placeLabels` — it
  draws its names directly — so the number nothing reads sits beside a test asserting it exists.
  Wiring it in re-inks `cluster1-world.svg`, which is **Plan E's redraw**, not a fix. The
  registry row now says so, and `render-sheet.test.mjs`'s "which sheets actually RUN a label
  declutter" test pins the fact from the source so the note cannot rot.
- **`bake_thumbnails.mjs`'s call to `carryForwardFiltered` has no test on its WIRING** (the pure
  function is covered 4/4). Covering it means running `main()`, which needs `sharp` and Blender.
  Recorded rather than chased because the failure is LOUD: without it a `--only` run wipes the
  other 640 index rows, and `check_asset_manifest.mjs` guard (U) fails on every one of them —
  `thumb_freshness.test.mjs` pins that case. Worth doing when the baker is next refactored.
- **~200 lines of `scripts/tests/world-budget.test.mjs` were reformatted by prettier** during
  seam 4, unrelated to the tasks. Verified: no semantic change, and `scripts/`+`tools/` are NOT
  in the repo's prettier scope (husky/lint-staged runs it on `colyseus-server/src/**/*.ts` only),
  so this was an out-of-scope reformat. NOT reverted — the fix pass has since added ~280 lines to
  the same file, so undoing it now costs a large diff for no behavioural gain.
- **Two recorded mutation SURVIVORS, both benign and both explained at the call site**, so the
  next reviewer does not re-derive them: (a) restoring `atlas-sheet.mjs`'s `checkBiomeInk`
  self-comparison stays green — on that sheet the emitted and painted pattern sets coincide by
  construction (measured: 3 and 3, at every legend tier), so no fixture can separate them;
  (b) dropping `asked` from the atlas's `checkLabels` call stays green — the three label buckets
  always reconcile there. Both arguments are defence for a future sheet whose draw pass can skip
  a subject; the rules themselves are killed by direct fixtures.
- **`G-RASTER-BUDGET` still runs in ONE venue (Gate 2) and that is a DECISION, not an oversight.**
  Review A observed it correctly: `ci.yml` installs no librsvg, so all six raster tests skip
  there. Installing `librsvg2-bin` in CI was considered and REJECTED — it would put a wall-clock
  performance assertion on a shared, contended GitHub runner, which is the exact condition that
  produced review A's own 1-in-8 red on a developer box. What DOES run in CI is the deterministic
  half, and it now reads the same defects out of committed bytes: the aggregate pattern-area cap,
  the new per-clip direct rule, and the ink floor. Verified on Node 18 in a container: mapforge
  251 tests / 245 pass / 6 skipped, storybook 54/54, content gate 0 failures — and blanking the
  atlas thumb reds the storybook suite and prints three `G-SHEET-BUDGET` failures on that same
  Node 18.
- **The determinism ban is now an INVENTORY, not a prose rule.** "`Math.hypot` BANNED" named one
  function while the committed-byte path uses hypot x7, `atan2` x6, `Math.PI` x8, and — in
  `world-gen.mjs`, which builds the *committed* canary sheet — `Math.cos`, `Math.sin` and `**`.
  All predate `plan-b-base` and all are empirically byte-identical on CI's Node 18 and local
  Node 26, which is what `check_render_lock` measures on every run. They are frozen by file and
  count in `tools/mapforge/tests/determinism-inventory.test.mjs`; a NEW one goes red. `Math.sqrt`
  is explicitly outside the rule (IEEE 754 mandates correct rounding for it and not for the
  others). **Plans B-E should stop repeating the hypot-only wording.**


- **I-098** — stale references to what Plan A deleted: two committed schema `description` fields
  still name the deleted mirror as the authority (→ Plan D); three comments describe deleted code
  as present, one asserting test coverage that no longer exists (→ any time); and
  `tools/mapforge/lib/basin-sheet.mjs:143,:729` name the deleted `render-map.mjs` **inside the
  committed SVG's drawn bytes** (→ **Plan B Task 12**, the one commit permitted to re-ink).
- **I-096** — `check_spine_emit.mjs` silently drops any region it cannot resolve. Real in today's
  map, independent of this programme.
- Unclaimed work Plan A left on the table: a path-keyed ajv memo. `lib/story.mjs:51-55` builds a
  fresh `Ajv` and recompiles on **every** call — none of Task 13's speed-up came from schema
  reuse, it was all process startup.

---

## 9. Plan C seam 1 (Tasks 1-2) — settled, do not re-raise

Appended 2026-08-22 by the seam-1 adjudicating fix pass, after two independent adversarial
reviews (A: 1 major / 9 minor, 23 mutations killed / 0 survived; B: 4 major / 7 minor, 20 killed
/ **12 survived**). The two survivor counts were not a disagreement about rigour — they covered
different files. Every one of B's twelve was checked.

**What the seam now guarantees that it did not.**

- **The noise field is pinned to VALUES, not only to itself.** This was the seam's real defect:
  six mutations — `hash3`'s multiplier, `hash3`'s final xor-shift, `toSigned`'s divisor, `fbm`'s
  `freq *= lacunarity`, `mintSeed` sha256→sha512, `mintSeed`'s join order — each produced a
  **different world** with the whole suite green. Golden literals now pin `hashNoise2D` (one
  positive and one negative sample), `fbm`, `smoothstep` and `falloff`, and `mintSeed` is joined
  to **all 176 committed streams in `content/spine/derived.json`** (44 nodes × 4 names), which
  ties `tools/mapforge/lib/seed.mjs` to `scripts/lib/spine.mjs`'s `streamSeed()` at the same
  time. **If a later plan deliberately changes the field, those literals are what must be
  re-baselined — that is the point of them, not an obstacle.**
- **One comment policy for the two determinism scans.** `tools/mapforge/tests/_source-scan.mjs`
  holds the single stripper; `determinism-inventory.test.mjs` and `noise-determinism.test.mjs`
  both use it. Before this, a `/* … Math.cos … */` block or a `/** @see Math.hypot */` JSDoc
  reddened the suite on prose, and a legitimate `Math\n  .floor()` reddened it on correct code,
  while the inventory three files away deliberately stripped comments and its header said why.
  Stripping preserves line numbers, and the `Math` scan takes its tail **across newlines**.
- **The two scans are COMPLEMENTARY, not redundant — REFUTED as a contradiction.** The inventory
  reads the whole of `lib/` by directory (so it covers new files, e.g. Task 3's passes) and
  catches dotted forms; the whitelist covers three files by name and catches indirect spellings.
  Keep both.
- **`tools/mapforge/*.mjs` — one level ABOVE `lib/` — is now scanned too.** A `Math.cos` helper
  there evaded both scans while being importable from `lib/`. Measured clean today, so its
  inventory is empty; Task 10's CLI lands in exactly that directory.

**Decisions taken deliberately — with the evidence, so they are not re-litigated.**

- **`idx` is NOT bounds-guarded, and cost was not the reason.** `idx({cx: 800, cy: 10})` returns
  8800, which decodes to (0, 11): the east edge wraps to the west, one row up. Measured cost of a
  guard inside `idx`: ~0.7 ns/call, 13.5 ms over 20 M calls — **0.34 % of the 4 s generate
  budget, affordable.** It is still not there because of SHAPE: a guard returning −1 makes the
  typed-array read `undefined`, which is equally silent, and one that throws can abort a pass at
  cell 639,999. The guard is a **named accessor** instead — `inBounds` and `neighbourIdx` (−1 off
  grid) in `tools/mapforge/lib/grid.mjs` — with the wrap pinned as a fixture, including the
  corner-has-3-neighbours / edge-has-5 counts a wrap would silently report as 8.
  **Tasks 3-9 must use `neighbourIdx` for D8 walks.**
- **The `civil` byte budget was NOT invented; the PRINT was fixed.** There is no aggregate byte
  cap for `civil` by design (600 × 8 KB is unbounded in aggregate) — so adding one would have been
  a design decision the plan never made, while the line was simply untrue. `world-budget:` lines
  for file-measured families now name every term's unit and print only terms the family has.
- **The ban's "indirect route" scan is ACCIDENT prevention, not an adversarial sandbox.** Measured
  by the reviewer: `globalThis["Ma"+"th"].cos`, `Reflect.get`, `const E = eval`,
  `[].constructor.constructor`, `(1/3).toFixed(4)` and `toLocaleString` all evade it. Every form
  that SPELLS `Math` is caught, which is every form a later pass reaching for `Math.cos` by name
  will use. The comment claiming completeness was the defect and is now what is true; `CODEGEN`
  was broadened to ban `eval` and `Function` by NAME rather than by call shape. **Do not build the
  sandbox.**
- **`SUBSTRATE_MASK`'s test is not a tautology — REFUTED.** The reviewer's first mask mutation
  (`0x2c0`) was not a mutation at all (`64|128|512 === 0x2c0`); a genuinely different mask IS
  killed, by the `deepEqual` on `SUBSTRATE_FLAGS`.
- **`streamInt` keys the field on 32 bits, not 64 — verified harmless and left alone.** All 176
  committed streams have 176 distinct 8-character prefixes and all 176 pass the hex guard.

**Recorded mutation SURVIVOR, benign, explained at the call site** (`grid.mjs`): deleting
`regionId`'s `< 0` guard stays green — `regionIds` is a plain array, `regionIds[-1]` is
`undefined`, and the `?? null` tail answers `null` for both paths, so no fixture can separate
them. The companion `?? null` rule IS live and is killed by a fixture. Do not re-file this.

**Open, recorded rather than chased.**

- **`./scripts/precheck.sh` (Gate 1) has no scripts-suite lane and no mapforge lane.** So the
  whole determinism ban, and every `world-gates.test.mjs` rule that is not reachable through
  `check_content.mjs --only=spine`, runs only in Gate 2 (`integration.sh`) and CI. Pre-existing
  wiring, outside this seam. It is why `content/world/manifest.json` being deleted was green at
  Gate 1 until this pass added the gate rule.
- **Substrate mutual exclusion is prose, not code.** `setFlag(CARBONATE)` then `setFlag(VOLCANIC)`
  leaves both bits set; there is no `setSubstrate` that clears `SUBSTRATE_MASK` first. **P2 must
  either clear the mask itself or add that helper.** Likewise `hasFlag` on a multi-bit mask has
  ANY semantics (`hasFlag(SUBSTRATE_MASK)` is true with only `SAND` set) — reasonable, and now
  written down.
- **`budget.interstitialComposition` is the single object the manifest schema leaves open**
  (`additionalProperties: {type: number}`; the reviewer's probe found 42 of 43 object paths
  locked). It is joined to `BIOMES` by a test rather than closed with an enum in the schema,
  because a second copy of the biome vocabulary is the exact drift the `n-atlas` join exists to
  prevent.
- **`content/world/manifest.json` and `content/spine/nodes/n-atlas.json` are now joined** on seed,
  frame, grid tiling and interstitial composition. **Plan D and E: add to that join, do not start
  a second one.**
