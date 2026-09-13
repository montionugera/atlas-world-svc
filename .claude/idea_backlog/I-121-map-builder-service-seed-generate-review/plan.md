# I-121 Map Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `atelier/map-builder/` — one local Node process that serves the asset-storybook and a `/api` job runner — plus a **Map Builder** storybook tab, so a world map can be drafted from a seed, watched step by step, reviewed against the current world, published (promote + render + lock, no git commit) and undone, with every job persisted and re-runnable.

**Owner goal (verbatim, 2026-09-13):** "all feature now, for long term greater good + consider about UX + montoring + rre-run".

**Architecture:** A dependency-free ES-module package (`node:http`, `node:child_process`, `node:fs`) with one exported factory per unit (`createJobStore`, `createJobQueue`, `createRunner`, `createApp`…), each taking a single options object. Jobs run the existing mapforge CLIs as child processes; stdout is parsed for `stage:` lines; records persist as JSON + log under `build/map-builder/`. The storybook tab is a normal storybook module (`js/map-builder.mjs`) with a pure, node-testable view-model (`js/map-builder-model.mjs`), mounted from `js/main.mjs` like `mountMaps`.

**Tech Stack:** Node ESM (CI pins Node **18** via `.release.json` `nodeMajor`; local is 26 — use nothing newer than Node 18: no `Array.prototype.toSorted`, no `import … with { type: "json" }`, read JSON with `readFileSync`), `node --test` + `node:assert/strict`, `node:http` SSE, vanilla DOM in the storybook. Existing CLIs: `atelier/mapforge/generate-world.mjs`, `promote-world.mjs`, `render-sheet.mjs`, `scripts/check_spine_emit.mjs`, `scripts/check_render_lock.mjs`, `scripts/check_content.mjs`.

**Spec:** `.claude/idea_backlog/I-121-map-builder-service-seed-generate-review/spec.md` (approved by owner 2026-09-13; self-grill-audit verdict safe-with-fixes, all fixes applied at 580d0e7).

## Global Constraints

- **No new runtime dependency** in any `package.json` (spec §11.10). `atelier/map-builder/` gets a 4-line `package.json` like `atelier/art-forge/package.json` (`{"name","private":true,"type":"module","scripts":{"test":"node --test tests/*.test.mjs"}}`) — no `dependencies` key.
- **Node 18 compatible** source (CI pin). Local runs are on Node 26, so the ONLY binding check is the CI step Task 11 adds to `.github/workflows/ci.yml` (audit 2026-09-13: nothing else runs this suite on 18; Gate 1/2 are local). Do not use APIs added after 18; `node:test` `before()` needs ≥ 18.8 (CI resolves latest 18.x).
- **Bind `127.0.0.1`, port `6016`**, no silent fallback: busy port → exit non-zero with a message; `--port <n>` overrides; `--port 0` (tests/Gate 2) picks an ephemeral port; the bound URL is printed on start.
- **Start command:** `node atelier/map-builder/server.mjs` from the repo root (no root `package.json`, no pnpm script).
- **Static layout mirrors `k8s/local/storybook-nginx.conf`:** document root = repo root; `GET /` → `302 /atelier/asset-storybook/index.html`; `GET /healthz` → `200 ok`; `.json`/`.mjs` → `Cache-Control: no-store`; reject any path containing `..`; directory → 404 (**deliberate deviation**, audit 2026-09-13: the nginx conf has `autoindex on`; the builder never lists directories).
- **Seed grammar:** `^[0-9a-f]{16}$` (import `SEED_GRAMMAR` from `atelier/mapforge/generate-world.mjs`; its `main()` is guarded by the `import.meta.url === pathToFileURL(process.argv[1]).href` check at `generate-world.mjs:1556`, so importing is side-effect free). Random seed = `crypto.randomBytes(8).toString("hex")`.
- **Out dir:** `build/mapforge/<seed8>-<GENERATOR_VERSION>` via `runIdOf({ seed, version })` (`generate-world.mjs:56`). One active job per out dir (409 otherwise).
- **Generator flags (verified):** `--seed <s> --out <dir> --no-png --stage-report --json-report`. `--no-png` is **required** (raster is unimplemented in the generator; omitting it exits 2).
- **Stage line grammar:** `stage: <name> <label> <ms> ms` (18 distinct names: `P1 P2 P2b P3 P5 P6 P7 P8 P9 P10 P7b P11p P11 P11b P12 P13 P14 P14w`; `P11` has 2 and `P11b` 3 separate `time()` call sites, so those names repeat — 18 + 3 = 21 stage lines), plus two budget lines that are NOT steps: `stage: generate TOTAL <ms> ms (budget <b>, fail <f>)` and `stage: sheets <ms> ms (budget <b>, fail <f>)`.
- **Timeouts:** service backstop only. `draft` = 2 × (generate `failMs` 12000 + sheets `failMs` 8000) = **40000 ms**; `publish` = 2 × Σ all six `loop` rows' `failMs` (119000) = **238000 ms**. Values are computed from `content/world/budgets.json` at boot, never hard-coded. SIGTERM, then SIGKILL after 5 s; job `failed`, `error: "hung"`.
- **Concurrency:** default 2, hard cap 2 (`config.json`; a higher value is clamped with a logged warning).
- **Publish/undo refused (409) on `main` or detached HEAD**; serialised (409 while another publish/undo is queued/running). Git is never written.
- **Snapshot set is computed, never hand-listed** (spec §5): promote's `toCopy` + `REPLACED_FAMILIES` dirs + spine-emit outputs + `content/world/render-lock.json` + `lockExtraPaths()` + `game-client/assets/art/maps/` + `atelier/asset-storybook/maps-index.json`. Keep last 3.
- **Status strings are exactly the canvas set** (spec §6): `Queued`, `Building · step k of N`, `Ready to review`, `Failed · took too long`, `Failed · <first error line>`, `Failed · hung`, `Rejected · <reason>`, `Published`, `Cancelled`, `Interrupted`.
- **Every action has a text label; statuses are words, not colours alone; keyboard reachable.** Tab must work with SSE down (poll `GET /api/jobs` every 2 s).
- **Coding invariants:** single options object per factory/method; TypeScript-strict-equivalent JS (no implicit globals); Prettier style as in `atelier/mapforge/*.mjs`. New commits only, conventional subjects (`feat(map-builder): …`, `test(map-builder): …`, `docs(map-builder): …`).
- **Quality gate per task group (rule 7):** verify → independent review (`code-reviewer` + `typescript-reviewer`, `model: sonnet` for < 200-line diffs) → `/simplify` → re-verify. Marked "Phase gate" below.

---

## Verified codebase facts (do not re-derive; cite when in doubt)

| Fact | Where |
|---|---|
| `parseArgs(argv,{fail})`, flags `--seed --out --no-png --stage-report`; unknown arg → exit 2 | `atelier/mapforge/generate-world.mjs:1340-1375` |
| `SEED_GRAMMAR`, `runIdOf`, `clearRun`, `RUN_ENTRIES = ["content","baseline","sheets","manifest.json","report.md","civil-resolved.json"]` | `generate-world.mjs:1338, 56, 1401, 1380` |
| `renderReport({run})` — per-continent rows from `run.fabric[]` (`continent`, `cellCensus.land/lake`, `regions.length`, `settlements.length`, `instances.length`), `run.coverage.placed/total`, `run.timings` | `generate-world.mjs:1305-1323`, written at `:1154` |
| Loop budget: `loopBudget({timings,budgets})` prints the two budget lines; overrun → `generate-world: LOOP BUDGET …` on stderr, `process.exitCode = 1`, no `generate-world: OK` | `generate-world.mjs:1420-1426, 1546-1550` |
| Foreign-files refusal (exit 2): `generate-world: --out … holds …, which no mapforge run wrote — refusing …` | `generate-world.mjs:1478-1480` |
| Raster unimplemented → without `--no-png` exit 2 | `generate-world.mjs:1522-1526` |
| `promoteWorld({repoRoot, runDir, dryRun})`; `REPLACED_FAMILIES`; `toCopy` = spine nodes + `content/spine/edges.json` + replaced families; dry-run returns `{written,deleted,errors,notes,ratio,landKm2}` before any write | `atelier/mapforge/promote-world.mjs:251, 101-109, 301-305, 398` |
| Dry-run stdout: `promote-world: DRY RUN — N written, M deleted`, `promote-world: ratio R (land L km²)`, `  DELETE f`, `  WRITE  f` | `promote-world.mjs:458-470` |
| Real promote runs spine-emit `--write`, renders every `SHEETS` id with `--no-png`, then `check_content.mjs --only=spine`; errors → exitCode 1 | `promote-world.mjs:408-438, 499` |
| `readPromotionDeclaration({repoRoot})` → `budgets.promotion.gateRulesThatMustBeGreen` (`G-ALIAS G-PARENT G-TOWN-FRAME G-FROZEN`) | `promote-world.mjs:177-199` |
| `export const SHEETS` (17 ids; `outSvg`/`outPng` under `game-client/assets/art/maps/<id>.svg|.png`); `parseArgs`: `--sheet <id> --png --png-width --check --no-png`; one sheet per invocation | `atelier/mapforge/render-sheet.mjs:61-150, 171-194` |
| PNG needs `rsvg-convert`; missing → skip with install hint (not a failure) | `atelier/mapforge/lib/raster.mjs:8-17` |
| `check_spine_emit.mjs --check|--write --content-root <dir>`; outputs: spine nodes, `content/spine/derived.json`, `content/maps/atlas-frontier.md`, `colyseus-server/src/config/generated/mapDimensions.ts`; success line `spine-emit: (write|check) clean, N files`; drift → `spine-emit: DRIFT …`, exitCode 1; exports `collectOutputs` | `scripts/check_spine_emit.mjs:98-160, 170-194` |
| `check_render_lock.mjs --check|--write [--repo-root d]`; lock at `content/world/render-lock.json`; `lockExtraPaths({repoRoot})` = `content/world/{fabric,handles}/*.json`; exit 1 on drift/problems, 2 on bad args, never `process.exit()` | `scripts/check_render_lock.mjs:51-98`, `scripts/lib/render-lock.mjs:68-76` |
| `budgets.loop` rows failMs: generate 12000, join 4000, gates 20000, sheets 8000, rasterise 60000, commit-lock 15000 (Σ 119000) | `content/world/budgets.json` |
| Seed of record `content/world/fabric/world.json` `"seed"`; band `content/world/manifest.json` `ratio.min/max` (1.2/1.8) | verified 2026-09-13 |
| Storybook mount: `main.mjs:39` imports `{ mountMaps, mountMapsNav }`; nav at `:84,:221`, mount at `:85,:352`; sidebar item via `buildSidebarItem(cls,total)` (`js/sidebar.mjs:111`); tab switch `setActiveClass` dispatches `storybook:class-change`; badge via `initHealth/bumpHealth/renderSidebarBadge` (`js/health.mjs`); `REPO_ROOT_REL="../../"`, `repoPath()` (`js/state.mjs:106-111`) | fact sheet |
| Pan-zoom viewer is a module-level singleton in `js/maps.mjs:86-284` (`buildOverlay`, `openMapViewer`, `closeMapViewer`) — NOT a factory | fact sheet |
| `maps-index.json` is hand-maintained; parity enforced by `atelier/asset-storybook/tests/maps-index.test.mjs` importing `SHEETS`. Publishing redraws the same 17 ids, so the index does not change — publish step 4 = run the parity test, not regenerate | fact sheet (resolves spec §13.3) |
| No `README.md` in `atelier/asset-storybook/` (create one); no jsdom, no `fetch('/api')` precedent in the storybook | fact sheet |
| nginx conf: `root`, `absolute_redirect off`, `/` → 302, `/healthz` 200, `.json|.mjs` no-store, `try_files $uri $uri/ =404` | `k8s/local/storybook-nginx.conf` |
| Gate 1 `scripts/precheck.sh`: `run_section "<name>" <fn>` (lines 63-76, 184-185); Gate 2 `scripts/integration.sh` same helper (49-62, 170-173), unquoted glob `node --test atelier/mapforge/tests/*.test.mjs` | fact sheet |
| `build/` gitignored (`.gitignore:12`) | fact sheet |
| `docs/diagrams/map-asset-pipeline.drawio` exists (boxes 1 Seed … 8 View), hand-edited, no export step | fact sheet |
| `atelier/AGENTS.md` tools table lists every atelier package + test command | `atelier/AGENTS.md:10-20` |

## File structure

```
atelier/map-builder/
  package.json                 4 lines, no deps
  README.md                    Phase 3
  config.json                  { "port":6016, "bind":"127.0.0.1", "concurrency":2, "snapshotKeep":3, "killGraceMs":5000 }
  steps.json                   grouped checklist keyed by stage name (18 stages)
  server.mjs                   CLI: parse --port/--bind/--repo-root/--data-dir, build app, listen, print URL
  lib/repo.mjs                 repoRoot detection + refusal; read-only git (branch, dirty files); budgets/manifest/world readers
  lib/stage-parser.mjs         pure: line → { kind:"step"|"budget"|"noise", … }
  lib/jobs.mjs                 createJobStore({ dir }) — JSON records + logs, interrupted-on-boot
  lib/commands.mjs             kind → argv[] plan (draft/dry-run/publish/undo) — the ONLY place CLI flags live
  lib/runner.mjs               createRunner({ commands, log, onStep, killGraceMs }) — spawn, stream, kill
  lib/queue.mjs                createJobQueue({ store, runner, concurrency, timeouts, events })
  lib/world.mjs                createWorldReader({ repoRoot }) — GET /world payload
  lib/static.mjs               createStaticHandler({ root }) — nginx-equivalent
  lib/sse.mjs                  createEventHub() — fan-out with Last-Event-ID replay
  lib/app.mjs                  createApp({ … }) → node:http request handler; all /api routes
  lib/report.mjs               Phase 2: read draft report.json, dry-run capture → review payload
  lib/snapshots.mjs            Phase 2: snapshotSet({repoRoot}), createSnapshots({ repoRoot, dir, keep })
  lib/publish.mjs              Phase 2: the six publish steps + undo, as runner command plans with hooks
  tests/*.test.mjs             one per lib unit + api + static + e2e helper
atelier/mapforge/generate-world.mjs        add --json-report (writes report.json)
atelier/asset-storybook/js/map-builder-model.mjs   pure view-model (status strings, step grouping, review deltas)
atelier/asset-storybook/js/map-builder.mjs         DOM: Start/Build (P1), Review/Publish (P2), History/Log (P3)
atelier/asset-storybook/js/panzoom.mjs             Phase 2: viewer factory extracted from maps.mjs
atelier/asset-storybook/js/main.mjs                mount lines
atelier/asset-storybook/index.html                 CSS for the tab (inline style block)
atelier/asset-storybook/tests/map-builder-model.test.mjs
scripts/precheck.sh, scripts/integration.sh        gate wiring
docs/diagrams/map-asset-pipeline.drawio            Phase 2: add builder boxes
atelier/AGENTS.md                                  tools table row
```

---
# Phase 1 — Service + jobs + Start/Build UI

Shippable on its own: from the storybook you can enter a seed, build up to two drafts at once,
watch the 18-stage checklist fill in live, cancel, and see failures verbatim. No review, no
publish yet. Every task runs from the repo root of the claimed feature worktree.

### Task 1: Package skeleton, config, steps.json, repo.mjs

**Files:**
- Create: `atelier/map-builder/package.json`, `atelier/map-builder/config.json`, `atelier/map-builder/steps.json`, `atelier/map-builder/lib/repo.mjs`
- Test: `atelier/map-builder/tests/repo.test.mjs`

**Interfaces:**
- Produces: `createRepo({ repoRoot, git = execFileSync })` → `{ repoRoot, budgets, timeouts: { draft, publish }, branch(), dirtyWorldFiles(), currentSeed(), ratioBand(), generatorVersion }`; `assertRepoRoot({ repoRoot })` throws `Error("map-builder: <dir> is not the atlas-world-svc repo root (no atelier/mapforge/generate-world.mjs)")`; `loadConfig({ dir })` → clamped config; `loadSteps({ dir })` → `{ groups:[{ id, label, stages:[{ name, label }] }], stageCount }`.

- [ ] **Step 1: Write the failing tests**

```js
// atelier/map-builder/tests/repo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRepoRoot, createRepo, loadConfig, loadSteps } from "../lib/repo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const REPO = path.resolve(PKG, "..", "..");

test("assertRepoRoot accepts the repo and refuses a package dir", () => {
  assert.doesNotThrow(() => assertRepoRoot({ repoRoot: REPO }));
  assert.throws(() => assertRepoRoot({ repoRoot: PKG }), /not the atlas-world-svc repo root/);
});

test("timeouts are 2× Σ failMs of the rows each kind runs", () => {
  const repo = createRepo({ repoRoot: REPO });
  const rows = Object.fromEntries(repo.budgets.loop.map((r) => [r.stage, r]));
  assert.equal(repo.timeouts.draft, 2 * (rows.generate.failMs + rows.sheets.failMs));
  const all = repo.budgets.loop.reduce((s, r) => s + r.failMs, 0);
  assert.equal(repo.timeouts.publish, 2 * all);
});

test("branch() and dirtyWorldFiles() use read-only git and parse detached HEAD", () => {
  const calls = [];
  const git = (cmd, args) => { calls.push(args.join(" ")); return args[0] === "rev-parse" ? "HEAD\n" : " M content/world/fabric/world.json\n?? content/spine/nodes/x.json\n"; };
  const repo = createRepo({ repoRoot: REPO, git });
  assert.deepEqual(repo.branch(), { name: null, detached: true });
  assert.deepEqual(repo.dirtyWorldFiles(), ["content/world/fabric/world.json", "content/spine/nodes/x.json"]);
  assert.ok(calls.every((c) => /^(rev-parse --abbrev-ref HEAD|status --porcelain --)/.test(c)), calls);
});

test("currentSeed() reads fabric/world.json, ratioBand() reads manifest ratio", () => {
  const repo = createRepo({ repoRoot: REPO });
  assert.match(repo.currentSeed(), /^[0-9a-f]{16}$/);
  const band = repo.ratioBand();
  assert.ok(band.min < band.max && band.min > 0);
});

test("loadConfig clamps concurrency to 2 and keeps port 6016", () => {
  const cfg = loadConfig({ dir: PKG });
  assert.equal(cfg.port, 6016);
  assert.equal(cfg.bind, "127.0.0.1");
  assert.equal(loadConfig({ dir: PKG, overrides: { concurrency: 5 } }).concurrency, 2);
});

test("steps.json names exactly the generator's 18 distinct stages", () => {
  const steps = loadSteps({ dir: PKG });
  const names = steps.groups.flatMap((g) => g.stages.map((s) => s.name));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(new Set(names), new Set(["P1","P2","P2b","P3","P5","P6","P7","P8","P9","P10","P7b","P11p","P11","P11b","P12","P13","P14","P14w"]));
  assert.equal(steps.stageCount, 18);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test atelier/map-builder/tests/repo.test.mjs`
Expected: FAIL — `Cannot find module '../lib/repo.mjs'`

- [ ] **Step 3: Create the package files**

`atelier/map-builder/package.json`:
```json
{ "name": "@atlas/map-builder", "private": true, "type": "module",
  "scripts": { "test": "node --test tests/*.test.mjs" } }
```

`atelier/map-builder/config.json`:
```json
{ "port": 6016, "bind": "127.0.0.1", "concurrency": 2, "maxConcurrency": 2,
  "snapshotKeep": 3, "killGraceMs": 5000, "pollMs": 2000 }
```

`atelier/map-builder/steps.json` (labels are the human copy from the canvas Build board; stage
names/labels must match `generate-world.mjs` `time("<name>", "<label>", …)` calls):
```json
{ "version": 1,
  "groups": [
    { "id": "terrain",     "label": "Terrain",     "stages": [
      { "name": "P1",   "label": "Premise masks" }, { "name": "P2",  "label": "Elevation" },
      { "name": "P2b",  "label": "Substrate" },     { "name": "P3",  "label": "Sea level & rank" } ] },
    { "id": "climate",     "label": "Climate & water", "stages": [
      { "name": "P5",   "label": "Winds" },         { "name": "P6",  "label": "Hydrology" },
      { "name": "P7",   "label": "Lakes, deltas, glaciers" }, { "name": "P7b", "label": "Pinned water" },
      { "name": "P8",   "label": "Biomes" } ] },
    { "id": "land",        "label": "Regions & landforms", "stages": [
      { "name": "P9",   "label": "Region partition" }, { "name": "P10", "label": "Landforms" } ] },
    { "id": "civil",       "label": "Settlements & roads", "stages": [
      { "name": "P11p", "label": "Pinned places" },  { "name": "P11", "label": "Settlements" },
      { "name": "P11b", "label": "Level bands" },    { "name": "P12", "label": "Roads & lanes" },
      { "name": "P13",  "label": "Dungeon anchors" } ] },
    { "id": "fabric",      "label": "Fabric",      "stages": [
      { "name": "P14",  "label": "Arcs, polygons, fabric" }, { "name": "P14w", "label": "Water trunk" } ] }
  ] }
```

`atelier/map-builder/lib/repo.mjs`:
```js
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { GENERATOR_VERSION } from "../../mapforge/lib/version.mjs";

const WORLD_PATHS = ["content/world", "content/spine", "content/maps", "game-client/assets/art/maps",
  "colyseus-server/src/config/generated", "atelier/asset-storybook/maps-index.json"];

export function assertRepoRoot({ repoRoot }) {
  if (!existsSync(join(repoRoot, "atelier/mapforge/generate-world.mjs")))
    throw new Error(`map-builder: ${repoRoot} is not the atlas-world-svc repo root (no atelier/mapforge/generate-world.mjs)`);
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadConfig({ dir, overrides = {} }) {
  const cfg = { ...readJson(join(dir, "config.json")), ...overrides };
  const cap = cfg.maxConcurrency ?? 2;
  if (cfg.concurrency > cap) { console.warn(`map-builder: concurrency ${cfg.concurrency} clamped to ${cap} (budgets.json failMs tolerates at most ${cap} parallel drafts)`); cfg.concurrency = cap; }
  return cfg;
}

export function loadSteps({ dir }) {
  const steps = readJson(join(dir, "steps.json"));
  const names = steps.groups.flatMap((g) => g.stages.map((s) => s.name));
  return { ...steps, stageCount: new Set(names).size };
}

export function createRepo({ repoRoot, git = (cmd, args) => execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }) }) {
  assertRepoRoot({ repoRoot });
  const budgets = readJson(join(repoRoot, "content/world/budgets.json"));
  const row = (stage) => budgets.loop.find((r) => r.stage === stage);
  const timeouts = {
    draft: 2 * (row("generate").failMs + row("sheets").failMs),
    publish: 2 * budgets.loop.reduce((s, r) => s + r.failMs, 0),
  };
  const generatorVersion = GENERATOR_VERSION; // audit 2026-09-13: manifest.json has NO generatorVersion (its `version: 1` is a schema number) and fabric/world.json nests it at generator.version — import the constant, never read JSON for it
  return {
    repoRoot, budgets, timeouts, generatorVersion,
    branch() {
      const name = git("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      return name === "HEAD" ? { name: null, detached: true } : { name, detached: false };
    },
    dirtyWorldFiles() {
      return git("git", ["status", "--porcelain", "--", ...WORLD_PATHS]).split("\n").filter(Boolean).map((l) => l.slice(3).trim());
    },
    currentSeed() { return readJson(join(repoRoot, "content/world/fabric/world.json")).seed; },
    ratioBand() { const r = readJson(join(repoRoot, "content/world/manifest.json")).ratio; return { min: r.min, max: r.max, target: r.target }; },
    promotionGates() { return Object.keys(budgets.promotion.gateRulesThatMustBeGreen); },
    contentGateDeps() { return existsSync(join(repoRoot, "scripts/node_modules/js-yaml")); },
  };
}
```
`GENERATOR_VERSION` is settled (audit 2026-09-13): `repo.mjs` imports it from `../../mapforge/lib/version.mjs` (`version.mjs:14`; `generate-world.mjs:43` only imports it and does not re-export). `contentGateDeps()` exists because `promote-world.mjs:438` runs `scripts/check_content.mjs --only=spine`, which needs `scripts/node_modules` (`js-yaml`, `ajv`, `sharp` — `scripts/package.json:9-11`); a repo without it fails every publish at step 2.

- [ ] **Step 4: Run tests** — `node --test atelier/map-builder/tests/repo.test.mjs` → PASS (6 tests).

- [ ] **Step 5: Commit** — `git add atelier/map-builder && git commit -m "feat(map-builder): package skeleton, config, steps roster, repo reader"`

### Task 2: Stage parser

**Files:** Create `atelier/map-builder/lib/stage-parser.mjs`; Test `atelier/map-builder/tests/stage-parser.test.mjs`; Fixture `atelier/map-builder/tests/fixtures/stage-report.txt` (captured real output).

**Interfaces:**
- Produces: `parseStageLine(line)` → `{ kind:"step", name, label, ms } | { kind:"budget", stage:"generate"|"sheets", ms, budgetMs, failMs, total:boolean } | { kind:"noise", line }`; `createStageTracker({ stageCount })` → `{ push(line) → event|null, steps() → [{name,label,ms,status:"done",runs}], current(), stepIndex() }`.

- [ ] **Step 1: Capture a real fixture** (fast, ~6 s):
```bash
node atelier/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/mb-fixture --no-png --stage-report 2>&1 | grep -E '^stage:|^generate-world:' > atelier/map-builder/tests/fixtures/stage-report.txt
rm -rf build/mapforge/mb-fixture
wc -l atelier/map-builder/tests/fixtures/stage-report.txt   # expect ~24 lines: 21 stage steps + 2 budget lines + generate-world lines
```

- [ ] **Step 2: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStageLine, createStageTracker } from "../lib/stage-parser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(path.join(HERE, "fixtures/stage-report.txt"), "utf8").split("\n").filter(Boolean);

test("parses a step line", () => {
  assert.deepEqual(parseStageLine("stage: P2b substrate 41 ms"), { kind: "step", name: "P2b", label: "substrate", ms: 41 });
});
test("budget lines are not steps", () => {
  assert.deepEqual(parseStageLine("stage: generate TOTAL 5412 ms (budget 6000, fail 12000)"),
    { kind: "budget", stage: "generate", ms: 5412, budgetMs: 6000, failMs: 12000, total: true });
  assert.deepEqual(parseStageLine("stage: sheets 310 ms (budget 5000, fail 8000)"),
    { kind: "budget", stage: "sheets", ms: 310, budgetMs: 5000, failMs: 8000, total: false });
});
test("noise passes through", () => {
  assert.equal(parseStageLine("generate-world: wrote 40 files to x").kind, "noise");
});
test("tracker over the real fixture yields 18 distinct steps, loop stages count runs", () => {
  const t = createStageTracker({ stageCount: 18 });
  for (const l of FIXTURE) t.push(l);
  const steps = t.steps();
  assert.equal(steps.length, 18);
  assert.ok(steps.find((s) => s.name === "P11").runs >= 2);
  assert.equal(steps[0].name, "P1");
  assert.equal(t.stepIndex(), 18);
  assert.ok(steps.every((s) => s.status === "done" && Number.isInteger(s.ms)));
});
test("push returns a job.step event for steps and null for noise", () => {
  const t = createStageTracker({ stageCount: 18 });
  assert.equal(t.push("hello"), null);
  const ev = t.push("stage: P1 premise-masks 12 ms");
  assert.equal(ev.type, "job.step");
  assert.equal(ev.step.name, "P1");
  assert.equal(ev.stepIndex, 1);
});
```

- [ ] **Step 3: Run to verify failure** — `node --test atelier/map-builder/tests/stage-parser.test.mjs` → FAIL (module missing).

- [ ] **Step 4: Implement**

```js
// atelier/map-builder/lib/stage-parser.mjs
const STEP = /^stage: (P\d+[a-z]*) (\S+) (\d+) ms$/;
const BUDGET = /^stage: (generate|sheets) (?:(TOTAL) )?(\d+) ms \(budget (\d+), fail (\d+)\)$/;

export function parseStageLine(line) {
  let m = STEP.exec(line);
  if (m) return { kind: "step", name: m[1], label: m[2], ms: Number(m[3]) };
  m = BUDGET.exec(line);
  if (m) return { kind: "budget", stage: m[1], ms: Number(m[3]), budgetMs: Number(m[4]), failMs: Number(m[5]), total: m[2] === "TOTAL" };
  return { kind: "noise", line };
}

export function createStageTracker({ stageCount }) {
  const order = []; const byName = new Map(); let budget = null;
  return {
    push(line) {
      const p = parseStageLine(line);
      if (p.kind === "budget") { budget = { ...(budget ?? {}), [p.stage]: p }; return { type: "job.budget", budget: p }; }
      if (p.kind !== "step") return null;
      let s = byName.get(p.name);
      if (!s) { s = { name: p.name, label: p.label, ms: 0, runs: 0, status: "done" }; byName.set(p.name, s); order.push(p.name); }
      s.ms += p.ms; s.runs += 1;
      return { type: "job.step", step: { ...s }, stepIndex: order.length, stepCount: stageCount };
    },
    steps() { return order.map((n) => ({ ...byName.get(n) })); },
    current() { return order.length ? { ...byName.get(order[order.length - 1]) } : null; },
    stepIndex() { return order.length; },
    budget() { return budget; },
  };
}
```

- [ ] **Step 5: Run tests** → PASS (5). **Step 6: Commit** — `git add atelier/map-builder && git commit -m "feat(map-builder): stage-report parser with real fixture"`

### Task 3: `--json-report` in the generator

**Files:** Modify `atelier/mapforge/generate-world.mjs:1357-1375` (parseArgs) and `:1528-1541` (main, after `writeRun`); Test: add a block to `atelier/mapforge/tests/generate-world.test.mjs` "THE CLI FLAG LAYER" section.

**Interfaces:**
- Produces: `report.json` in the out dir:
```jsonc
{ "seed", "version", "seaLevel", "rank", "landKm2", "waterKm2", "seaToLandRatio", "interstitialKm2",
  "totals": { "continents", "regions", "settlements", "landformInstances" },
  "continents": [ { "id", "landKm2", "regions", "settlements", "instances" } ],
  "coverage": { "placed", "total" }, "timings": { "<stage>": ms }, "problems": [ "…" ] }
```
Exported pure helper `export function jsonReport({ run })` so the test can assert on the object without a full run where a run fixture exists (`generate-world.test.mjs` already builds real runs; reuse its helper).

- [ ] **Step 1: Write the failing test** (append inside the existing CLI-flag test block; follow its helper names — read the block first with `grep -n "THE CLI FLAG LAYER" -A40 atelier/mapforge/tests/generate-world.test.mjs`):

```js
test("--json-report writes report.json with per-continent totals; flag is opt-in", () => {
  const out = mkdtempSync(join(tmpdir(), "mb-json-"));
  execFileSync(process.execPath, [CLI, "--seed", "7c9e4a2f8b1d6e03", "--out", out, "--no-png", "--json-report"], { encoding: "utf8" });
  const rep = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
  assert.equal(rep.seed, "7c9e4a2f8b1d6e03");
  assert.ok(rep.totals.settlements > 0 && rep.totals.regions > 0 && rep.continents.length > 0);
  assert.equal(rep.totals.continents, rep.continents.length);
  assert.equal(rep.totals.settlements, rep.continents.reduce((s, c) => s + c.settlements, 0));
  assert.ok(Object.keys(rep.timings).includes("P1"));
  const out2 = mkdtempSync(join(tmpdir(), "mb-json-"));
  execFileSync(process.execPath, [CLI, "--seed", "7c9e4a2f8b1d6e03", "--out", out2, "--no-png"], { encoding: "utf8" });
  assert.equal(existsSync(join(out2, "report.json")), false, "report.json is opt-in");
  rmSync(out, { recursive: true, force: true }); rmSync(out2, { recursive: true, force: true });
});
```
Also add `"report.json"` to the `RUN_ENTRIES` expectation if a test asserts the exact entry list (grep `RUN_ENTRIES` in the test file).

- [ ] **Step 2: Run** — `node --test atelier/mapforge/tests/generate-world.test.mjs` → the new test FAILS (`unknown arg --json-report`).

- [ ] **Step 3: Implement**
  - `parseArgs`: after the `--stage-report` branch add `else if (a === "--json-report") opts.jsonReport = true;` and default `jsonReport: false`.
  - `RUN_ENTRIES` (`:1380`): add `"report.json"` so `clearRun` wipes it on re-run (otherwise a re-run is refused as "foreign files").
  - Add:
```js
export function jsonReport({ run }) {
  const m = run.runManifest;
  const continents = run.fabric.map((f) => ({
    id: f.continent, landKm2: Number(((f.cellCensus.land + f.cellCensus.lake) * 0.25).toFixed(1)),
    regions: f.regions.length, settlements: f.settlements.length, instances: f.instances.length }));
  const sum = (k) => continents.reduce((s, c) => s + c[k], 0);
  return { seed: m.seed, version: m.version, seaLevel: m.seaLevel, rank: m.rank, landKm2: m.landKm2, waterKm2: m.waterKm2,
    seaToLandRatio: m.seaToLandRatio, interstitialKm2: m.interstitialKm2,
    totals: { continents: continents.length, regions: sum("regions"), settlements: sum("settlements"), landformInstances: sum("instances") },
    continents, coverage: { placed: run.coverage.placed, total: run.coverage.total }, timings: run.timings, problems: run.problems };
}
```
  - In `main()` right after `writeRun(...)`: `if (opts.jsonReport) writeFileSync(join(outDir, "report.json"), JSON.stringify(jsonReport({ run }), null, 2) + "\n");`
  - Update the `--help`/usage text if the file prints one (grep `usage`).

- [ ] **Step 4: Run the whole mapforge suite** — `node --test atelier/mapforge/tests/*.test.mjs 2>&1 | tail -n 12` → all pass (was 786). Also `node atelier/mapforge/render-sheet.mjs --sheet atlas --no-png --check` still exits 0.

- [ ] **Step 5: Commit** — `git add atelier/mapforge && git commit -m "feat(mapforge): --json-report writes report.json with world and per-continent totals"`

- [ ] **Step 6: Phase gate (Tasks 1–3)** — verify (three suites above), `code-reviewer` + `typescript-reviewer` on `git diff main...HEAD -- atelier/map-builder atelier/mapforge/generate-world.mjs`, `/simplify`, re-run the three suites.

### Task 4: JobStore

**Files:** Create `atelier/map-builder/lib/jobs.mjs`; Test `atelier/map-builder/tests/jobs.test.mjs`.

**Interfaces:**
- Produces: `newJobId(now = new Date(), rand = crypto)` → `j_YYYYMMDD_HHMMSS_<8hex>`; `createJobStore({ dir })` → `{ create(fields) → job, get(id) → job|null, update(id, patch) → job, list({ kind, status, seed, limit }) → job[] (newest first), appendLog(id, text), readLog(id, { tail }) → string, logPath(id), recoverInterrupted() → id[] }`. Job shape = spec §3. Ids validated by `/^j_\d{8}_\d{6}_[0-9a-f]{8}$/` before any path join.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobStore, newJobId, JOB_ID } from "../lib/jobs.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "mb-jobs-"));

test("ids are sortable and match the grammar", () => {
  const a = newJobId(new Date("2026-09-13T14:02:01Z")); const b = newJobId(new Date("2026-09-13T14:02:02Z"));
  assert.match(a, JOB_ID); assert.ok(a < b);
});
test("create/get/update round-trip persists JSON", () => {
  const dir = tmp(); const s = createJobStore({ dir });
  const j = s.create({ kind: "draft", seed: "3f81c0aa9d2e5b17", reason: "x" });
  assert.equal(j.status, "queued"); assert.ok(j.createdAt);
  s.update(j.id, { status: "running", startedAt: "t" });
  assert.equal(createJobStore({ dir }).get(j.id).status, "running");
  rmSync(dir, { recursive: true, force: true });
});
test("list filters by kind/status/seed and is newest first with limit", () => {
  const dir = tmp(); const s = createJobStore({ dir });
  const ids = ["a", "b", "c"].map((_, i) => s.create({ kind: i ? "draft" : "publish", seed: "3f81c0aa9d2e5b17".replace("3f", `${i}f`) }).id);
  assert.deepEqual(s.list({}).map((j) => j.id), [...ids].reverse());
  assert.equal(s.list({ kind: "publish" }).length, 1);
  assert.equal(s.list({ seed: "1f81c0aa9d2e5b17" }).length, 1);
  assert.equal(s.list({ limit: 2 }).length, 2);
  rmSync(dir, { recursive: true, force: true });
});
test("logs append and tail", () => {
  const dir = tmp(); const s = createJobStore({ dir }); const j = s.create({ kind: "draft", seed: "3f81c0aa9d2e5b17" });
  s.appendLog(j.id, "l1\nl2\n"); s.appendLog(j.id, "l3\n");
  assert.equal(s.readLog(j.id, { tail: 2 }), "l2\nl3\n");
  rmSync(dir, { recursive: true, force: true });
});
test("recoverInterrupted marks queued/running as interrupted", () => {
  const dir = tmp(); let s = createJobStore({ dir });
  const q = s.create({ kind: "draft", seed: "3f81c0aa9d2e5b17" }); const r = s.create({ kind: "draft", seed: "4f81c0aa9d2e5b17" }); s.update(r.id, { status: "running" });
  const d = s.create({ kind: "draft", seed: "5f81c0aa9d2e5b17" }); s.update(d.id, { status: "succeeded" });
  s = createJobStore({ dir });
  assert.deepEqual(new Set(s.recoverInterrupted()), new Set([q.id, r.id]));
  assert.equal(s.get(d.id).status, "succeeded"); assert.equal(s.get(r.id).status, "interrupted");
  rmSync(dir, { recursive: true, force: true });
});
test("get rejects a malformed id without touching the filesystem", () => {
  const s = createJobStore({ dir: tmp() });
  assert.throws(() => s.get("../etc/passwd"), /invalid job id/);
});
```

- [ ] **Step 2: Run** → FAIL (module missing). **Step 3: Implement**

```js
// atelier/map-builder/lib/jobs.mjs
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

export const JOB_ID = /^j_\d{8}_\d{6}_[0-9a-f]{8}$/;
const pad = (n, w = 2) => String(n).padStart(w, "0");
export function newJobId(now = new Date(), rand = crypto) {
  const d = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const t = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `j_${d}_${t}_${rand.randomBytes(4).toString("hex")}`;
}
const assertId = (id) => { if (!JOB_ID.test(id)) throw new Error(`invalid job id: ${id}`); return id; };

export function createJobStore({ dir }) {
  mkdirSync(dir, { recursive: true });
  const recPath = (id) => join(dir, `${assertId(id)}.json`);
  const logPath = (id) => join(dir, `${assertId(id)}.log`);
  const write = (job) => { const p = recPath(job.id); writeFileSync(p + ".tmp", JSON.stringify(job, null, 2)); renameSync(p + ".tmp", p); return job; };
  const read = (id) => (existsSync(recPath(id)) ? JSON.parse(readFileSync(recPath(id), "utf8")) : null);
  return {
    create(fields) {
      const job = { id: newJobId(), status: "queued", createdAt: new Date().toISOString(), startedAt: null, endedAt: null,
        durationMs: null, steps: [], exitCode: null, error: null, rerunOf: null, rerunMatch: null, metrics: null,
        review: { decision: null, reasons: [], at: null }, ...fields };
      return write(job);
    },
    get: read,
    update(id, patch) { const j = read(id); if (!j) throw new Error(`no job ${id}`); return write({ ...j, ...patch }); },
    list({ kind, status, seed, limit } = {}) {
      let jobs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => read(f.slice(0, -5))).filter(Boolean);
      if (kind) jobs = jobs.filter((j) => j.kind === kind);
      if (status) jobs = jobs.filter((j) => j.status === status);
      if (seed) jobs = jobs.filter((j) => j.seed === seed);
      jobs.sort((a, b) => (a.id < b.id ? 1 : -1));
      return limit ? jobs.slice(0, limit) : jobs;
    },
    appendLog(id, text) { appendFileSync(logPath(id), text); },
    readLog(id, { tail } = {}) {
      if (!existsSync(logPath(id))) return "";
      const txt = readFileSync(logPath(id), "utf8");
      if (!tail) return txt;
      const lines = txt.split("\n"); if (lines[lines.length - 1] === "") lines.pop();
      return lines.slice(-tail).join("\n") + "\n";
    },
    logPath,
    recoverInterrupted() {
      return this.list({}).filter((j) => j.status === "queued" || j.status === "running")
        .map((j) => { write({ ...j, status: "interrupted", endedAt: new Date().toISOString(), error: "service restarted" }); return j.id; });
    },
  };
}
```

- [ ] **Step 4: Run** → PASS (6). **Step 5: Commit** — `git commit -am "feat(map-builder): persisted JobStore with logs and interrupted-on-boot recovery"` (use `git add atelier/map-builder` first).

### Task 5: Command plans + Runner

**Files:** Create `atelier/map-builder/lib/commands.mjs`, `atelier/map-builder/lib/runner.mjs`; Test `atelier/map-builder/tests/runner.test.mjs`.

**Interfaces:**
- Produces (`commands.mjs`): `draftCommands({ repoRoot, job })` → `[ { label:"generate", argv:[process.execPath, "atelier/mapforge/generate-world.mjs", "--seed", seed, "--out", outDir, "--no-png", "--stage-report", "--json-report"] }, { label:"dry-run", argv:[process.execPath, "atelier/mapforge/promote-world.mjs", "--dry-run", "--from", outDir] } ]`; `dryRunCommands({ repoRoot, job })` → the second only; `outDirFor({ repoRoot, seed, version })` → `build/mapforge/<runIdOf>` (repo-relative string). Phase 2 adds `publishCommands`/`undoCommands`.
- Produces (`runner.mjs`): `createRunner({ killGraceMs = 5000 })` → `{ run({ job, commands, cwd, timeoutMs, onLine, onCommandStart, onCommandEnd }) → Promise<{ ok, exitCode, error, timedOut, cancelled, captured: { [label]: string[] } }>, cancel(jobId) → boolean }`. `onLine({ label, stream:"stdout"|"stderr", line })` fires per line (stdout and stderr both go to the job log with a `[label] ` prefix). A non-zero exit stops the sequence; `error` = the generator's first `generate-world:`/`promote-world:` line on stderr, else the last stderr line, else `exit <code>`. `cancel` → SIGTERM, SIGKILL after `killGraceMs`, result `{ cancelled:true }`. Timeout → same kill, `{ timedOut:true, error:"hung" }`.

- [ ] **Step 1: Write the failing tests** (a "fake generator" = `node -e` scripts, exercising the REAL spawn/kill/parse path):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRunner } from "../lib/runner.mjs";
import { draftCommands, outDirFor } from "../lib/commands.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const nodeE = (label, src) => ({ label, argv: [process.execPath, "-e", src] });

test("draft command plan uses the verified generator flags and out dir", () => {
  const job = { id: "j_20260913_000000_00000000", seed: "3f81c0aa9d2e5b17" };
  const cmds = draftCommands({ repoRoot: REPO, job, version: "3.0.0" });
  assert.equal(cmds.length, 2);
  assert.deepEqual(cmds[0].argv.slice(1), ["atelier/mapforge/generate-world.mjs", "--seed", job.seed, "--out", "build/mapforge/3f81c0aa-3.0.0", "--no-png", "--stage-report", "--json-report"]);
  assert.deepEqual(cmds[1].argv.slice(1), ["atelier/mapforge/promote-world.mjs", "--dry-run", "--from", "build/mapforge/3f81c0aa-3.0.0"]);
  assert.equal(outDirFor({ seed: job.seed, version: "3.0.0" }), "build/mapforge/3f81c0aa-3.0.0");
});

test("runs commands in sequence, streams lines, captures stdout per label", async () => {
  const lines = [];
  const r = await createRunner({}).run({ job: { id: "j1" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("a", "console.log('stage: P1 premise-masks 3 ms'); console.error('warn')"), nodeE("b", "console.log('promote-world: DRY RUN — 2 written, 0 deleted')")],
    onLine: (l) => lines.push(l) });
  assert.equal(r.ok, true); assert.equal(r.exitCode, 0);
  assert.deepEqual(r.captured.a, ["stage: P1 premise-masks 3 ms"]);
  assert.ok(lines.some((l) => l.label === "a" && l.stream === "stderr" && l.line === "warn"));
  assert.ok(lines.findIndex((l) => l.label === "b") > lines.findIndex((l) => l.label === "a"));
});

test("non-zero exit stops the sequence and surfaces the tool's own first error line", async () => {
  let ranB = false;
  const r = await createRunner({}).run({ job: { id: "j2" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("a", "console.error('generate-world: LOOP BUDGET generate 13000 ms > fail 12000'); process.exitCode = 1"), nodeE("b", "process.stdout.write('x')")],
    onLine: (l) => { if (l.label === "b") ranB = true; } });
  assert.equal(r.ok, false); assert.equal(r.exitCode, 1); assert.equal(ranB, false);
  assert.equal(r.error, "generate-world: LOOP BUDGET generate 13000 ms > fail 12000");
});

test("timeout kills a hung child and reports hung", async () => {
  const t0 = Date.now();
  const r = await createRunner({ killGraceMs: 200 }).run({ job: { id: "j3" }, cwd: REPO, timeoutMs: 300,
    commands: [nodeE("hang", "setInterval(() => {}, 1000)")], onLine: () => {} });
  assert.equal(r.timedOut, true); assert.equal(r.error, "hung"); assert.ok(Date.now() - t0 < 3000);
});

test("cancel ends a running job as cancelled", async () => {
  const runner = createRunner({ killGraceMs: 200 });
  const p = runner.run({ job: { id: "j4" }, cwd: REPO, timeoutMs: 10000, commands: [nodeE("hang", "setInterval(() => {}, 1000)")], onLine: () => {} });
  await new Promise((res) => setTimeout(res, 150));
  assert.equal(runner.cancel("j4"), true);
  const r = await p; assert.equal(r.cancelled, true); assert.equal(r.ok, false);
  assert.equal(runner.cancel("j4"), false);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

```js
// atelier/map-builder/lib/commands.mjs
import { runIdOf } from "../../mapforge/generate-world.mjs";
export function outDirFor({ seed, version }) { return `build/mapforge/${runIdOf({ seed, version })}`; }
const GEN = "atelier/mapforge/generate-world.mjs", PROMOTE = "atelier/mapforge/promote-world.mjs";
export function dryRunCommands({ job, version }) {
  const out = job.outDir ?? outDirFor({ seed: job.seed, version });
  return [{ label: "dry-run", argv: [process.execPath, PROMOTE, "--dry-run", "--from", out] }];
}
export function draftCommands({ job, version }) {
  const out = job.outDir ?? outDirFor({ seed: job.seed, version });
  return [{ label: "generate", argv: [process.execPath, GEN, "--seed", job.seed, "--out", out, "--no-png", "--stage-report", "--json-report"] },
          ...dryRunCommands({ job: { ...job, outDir: out }, version })];
}
```
(`repoRoot` is accepted and ignored for forward-compatibility only if the test passes it — keep the signature `{ job, version }`; fix the test's call to match. Paths are repo-relative because the runner's `cwd` is the repo root.)

```js
// atelier/map-builder/lib/runner.mjs
import { spawn } from "node:child_process";
import readline from "node:readline";

const FIRST_TOOL_ERR = /^(generate-world|promote-world|render-sheet|spine-emit|render-lock|check_content|map-builder): /;

export function createRunner({ killGraceMs = 5000 } = {}) {
  const live = new Map(); // jobId -> { child, cancelled }
  const kill = (entry) => { if (!entry?.child || entry.child.exitCode !== null) return; entry.child.kill("SIGTERM"); setTimeout(() => { if (entry.child.exitCode === null) entry.child.kill("SIGKILL"); }, killGraceMs).unref(); };
  return {
    cancel(jobId) { const e = live.get(jobId); if (!e) return false; e.cancelled = true; kill(e); return true; },
    async run({ job, commands, cwd, timeoutMs, onLine = () => {}, onCommandStart = () => {}, onCommandEnd = () => {} }) {
      const captured = {}; const stderrLines = []; const entry = { child: null, cancelled: false }; live.set(job.id, entry);
      const deadline = Date.now() + timeoutMs; let timedOut = false;
      try {
        for (const cmd of commands) {
          if (entry.cancelled) break;
          captured[cmd.label] = []; onCommandStart(cmd);
          const t0 = Date.now();
          const code = await new Promise((resolve) => {
            const child = spawn(cmd.argv[0], cmd.argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
            entry.child = child;
            const timer = setTimeout(() => { timedOut = true; kill(entry); }, Math.max(0, deadline - Date.now()));
            for (const stream of ["stdout", "stderr"]) readline.createInterface({ input: child[stream] }).on("line", (line) => {
              if (stream === "stdout") captured[cmd.label].push(line); else stderrLines.push(line);
              onLine({ label: cmd.label, stream, line });
            });
            child.on("close", (c, sig) => { clearTimeout(timer); resolve(c ?? (sig ? 128 : 1)); });
            child.on("error", (e) => { clearTimeout(timer); stderrLines.push(String(e.message)); resolve(1); });
          });
          onCommandEnd({ ...cmd, exitCode: code, ms: Date.now() - t0 });
          if (entry.cancelled) return { ok: false, exitCode: code, error: "cancelled", cancelled: true, timedOut: false, captured };
          if (timedOut) return { ok: false, exitCode: code, error: "hung", cancelled: false, timedOut: true, captured };
          if (code !== 0) {
            const error = stderrLines.find((l) => FIRST_TOOL_ERR.test(l)) ?? stderrLines[stderrLines.length - 1] ?? `exit ${code}`;
            return { ok: false, exitCode: code, error, cancelled: false, timedOut: false, captured };
          }
        }
        return { ok: true, exitCode: 0, error: null, cancelled: false, timedOut: false, captured };
      } finally { live.delete(job.id); }
    },
  };
}
```

- [ ] **Step 4: Run** → PASS (5). **Step 5: Commit** — `git add atelier/map-builder && git commit -m "feat(map-builder): command plans and child-process runner with cancel and hung backstop"`

### Task 6: JobQueue

**Files:** Create `atelier/map-builder/lib/queue.mjs`; Test `atelier/map-builder/tests/queue.test.mjs`.

**Interfaces:**
- Consumes: `createJobStore`, `createRunner`, `createStageTracker`, `draftCommands/dryRunCommands`.
- Produces: `createJobQueue({ store, runner, repo, concurrency, stageCount, commandsFor, events })` → `{ enqueue({ kind, seed, reason, rerunOf }) → job, cancel(id) → job, activeOutDirs() → Set, running() → number, onIdle() → Promise, close() }`. `commandsFor({ kind, job, repo })` returns the command list (default: draft/dry-run from Task 5; Phase 2 extends with publish/undo). `events.emit(type, payload)` is called with `job.created`, `job.started`, `job.step`, `job.done` (`payload.job` always the fresh record). Throws `ConflictError` (`code: 409`) for a second active job on the same `outDir`. On `job.done` for a draft, `metrics` is filled from `<outDir>/report.json` (`{ seaLand: seaToLandRatio, landKm2, settlements: totals.settlements, landforms: totals.landformInstances, regions: totals.regions }`) and `dryRun` from the captured dry-run stdout (`{ written, deleted, ratio, landKm2, files:[{op,path}] }`) — parsing helper `parseDryRun(lines)` exported for Task 12.

- [ ] **Step 1: Write the failing tests** (fake `commandsFor` returning `node -e` sleepers that print stage lines; temp store; in-memory events):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobStore } from "../lib/jobs.mjs";
import { createRunner } from "../lib/runner.mjs";
import { createJobQueue, parseDryRun, ConflictError } from "../lib/queue.mjs";

const setup = ({ concurrency = 2, sleepMs = 300 } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "mb-q-")); const events = []; const repo = { repoRoot: dir, timeouts: { draft: 5000, publish: 5000 }, generatorVersion: "3.0.0" };
  const commandsFor = ({ job }) => [{ label: "generate", argv: [process.execPath, "-e",
    `console.log('stage: P1 premise-masks 1 ms'); setTimeout(() => { console.log('stage: P2 elevation 2 ms'); }, ${sleepMs})`] }];
  const queue = createJobQueue({ store: createJobStore({ dir: join(dir, "jobs") }), runner: createRunner({ killGraceMs: 100 }), repo,
    concurrency, stageCount: 18, commandsFor, events: { emit: (type, p) => events.push({ type, job: p.job }) } });
  return { dir, events, queue, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};
const seed = (i) => `${i}f81c0aa9d2e5b17`;

test("FIFO with at most `concurrency` running", async () => {
  const s = setup(); const jobs = [1, 2, 3].map((i) => s.queue.enqueue({ kind: "draft", seed: seed(i) }));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(s.queue.running(), 2); assert.equal(s.queue.store.get(jobs[2].id).status, "queued");
  await s.queue.onIdle();
  const done = s.events.filter((e) => e.type === "job.done").map((e) => e.job.id);
  assert.deepEqual(done.slice(0, 2).sort(), [jobs[0].id, jobs[1].id].sort()); assert.equal(done[2], jobs[2].id);
  assert.ok(s.events.some((e) => e.type === "job.step")); s.cleanup();
});
test("same out dir twice → 409 while active", async () => {
  const s = setup(); s.queue.enqueue({ kind: "draft", seed: seed(1) });
  assert.throws(() => s.queue.enqueue({ kind: "draft", seed: seed(1) }), (e) => e instanceof ConflictError && e.code === 409);
  await s.queue.onIdle(); assert.ok(s.queue.enqueue({ kind: "draft", seed: seed(1) })); await s.queue.onIdle(); s.cleanup();
});
test("cancel queued removes it; cancel running kills it", async () => {
  const s = setup({ concurrency: 1, sleepMs: 2000 }); const a = s.queue.enqueue({ kind: "draft", seed: seed(1) }); const b = s.queue.enqueue({ kind: "draft", seed: seed(2) });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(s.queue.cancel(b.id).status, "cancelled"); assert.equal(s.queue.cancel(a.id).status, "running");
  await s.queue.onIdle(); assert.equal(s.queue.store.get(a.id).status, "cancelled"); s.cleanup();
});
test("succeeded draft records steps, durationMs, metrics from report.json and dryRun from stdout", async () => {
  const s = setup({ sleepMs: 10 });
  const out = join(s.dir, "build/mapforge/1f81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify({ seaToLandRatio: 1.5, landKm2: 100, totals: { settlements: 3, landformInstances: 4, regions: 5 } }));
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "console.log('stage: P1 premise-masks 1 ms')"] },
    { label: "dry-run", argv: [process.execPath, "-e", "console.log('promote-world: DRY RUN — 2 written, 1 deleted'); console.log('promote-world: ratio 1.5 (land 100 km²)'); console.log('  DELETE a'); console.log('  WRITE  b'); console.log('  WRITE  c')"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(1) }); await q.onIdle(); const done = q.store.get(j.id);
  assert.equal(done.status, "succeeded"); assert.equal(done.steps.length, 1); assert.ok(done.durationMs >= 0);
  assert.deepEqual(done.metrics, { seaLand: 1.5, landKm2: 100, settlements: 3, landforms: 4, regions: 5 });
  assert.deepEqual(done.dryRun, { written: 2, deleted: 1, ratio: 1.5, landKm2: 100, files: [{ op: "DELETE", path: "a" }, { op: "WRITE", path: "b" }, { op: "WRITE", path: "c" }] });
  s.cleanup();
});
test("parseDryRun handles the exact promote-world format", () => {
  assert.deepEqual(parseDryRun(["promote-world: DRY RUN — 0 written, 0 deleted"]), { written: 0, deleted: 0, ratio: null, landKm2: null, files: [] });
});
test("failed draft keeps the tool's error and exit code", async () => {
  const s = setup(); const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "console.error('generate-world: LOOP BUDGET generate 13000 ms'); process.exitCode = 1"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(2) }); await q.onIdle(); const done = q.store.get(j.id);
  assert.equal(done.status, "failed"); assert.equal(done.exitCode, 1); assert.match(done.error, /LOOP BUDGET/); s.cleanup();
});
```
(Expose `queue.store` and `queue.options` on the returned object so tests can re-create with a different `commandsFor`.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `lib/queue.mjs`: a `pending` array + `active` Map; `pump()` starts jobs while `active.size < concurrency`; per job: `store.update(status:"running", startedAt)`, `events.emit("job.started")`, tracker = `createStageTracker({stageCount})`, runner.run with `onLine` → `store.appendLog(id, "[label] " + line + "\n")` and for stdout `tracker.push(line)` → if event, `store.update(id, { steps: tracker.steps() })` + `events.emit("job.step", { job, step, stepIndex, stepCount })`; on result: status = cancelled ? "cancelled" : ok ? "succeeded" : "failed"; `durationMs`, `endedAt`, `exitCode`, `error`, `steps`, `metrics` (try/catch reading `<repoRoot>/<outDir>/report.json`), `dryRun: parseDryRun(captured["dry-run"] ?? [])`; `events.emit("job.done")`; `pump()`. `enqueue` validates `SEED_GRAMMAR`, computes `outDir`, checks `activeOutDirs()` → `ConflictError`, `store.create`, `events.emit("job.created")`, `pump()`. `onIdle()` resolves when `pending.length === 0 && active.size === 0`. `parseDryRun`:
```js
export function parseDryRun(lines) {
  const out = { written: 0, deleted: 0, ratio: null, landKm2: null, files: [] };
  for (const l of lines) {
    let m = /^promote-world: (?:DRY RUN — )?(\d+) written, (\d+) deleted/.exec(l); if (m) { out.written = +m[1]; out.deleted = +m[2]; continue; }
    m = /^promote-world: ratio ([\d.]+) \(land ([\d.]+) km²\)/.exec(l); if (m) { out.ratio = +m[1]; out.landKm2 = +m[2]; continue; }
    m = /^  (DELETE|WRITE)\s+(\S+)$/.exec(l); if (m) out.files.push({ op: m[1], path: m[2] });
  }
  return out;
}
export class ConflictError extends Error { constructor(msg) { super(msg); this.code = 409; } }
```

- [ ] **Step 4: Run** → PASS (6). **Step 5: Commit** — `git add atelier/map-builder && git commit -m "feat(map-builder): FIFO JobQueue with concurrency cap, cancel, metrics and dry-run capture"`

- [ ] **Step 6: Phase gate (Tasks 4–6)** — `node --test atelier/map-builder/tests/*.test.mjs`; reviewers on the diff; `/simplify`; re-run.

### Task 7: Static handler + SSE hub

**Files:** Create `atelier/map-builder/lib/static.mjs`, `atelier/map-builder/lib/sse.mjs`; Tests `atelier/map-builder/tests/static.test.mjs`, `atelier/map-builder/tests/sse.test.mjs`.

**Interfaces:**
- Produces: `createStaticHandler({ root })` → `(req, res) → boolean` (true if handled). Behaviour = nginx conf: `/` → 302 `/atelier/asset-storybook/index.html`; `/healthz` → 200 `ok`; path with `..` or not under root → 404; file → 200 with content-type from a small extension map (`html js mjs json svg png css txt md ts`), `.json`/`.mjs` add `Cache-Control: no-store`; directory → 404.
- Produces: `createEventHub({ replay = 200 })` → `{ emit(type, payload) → id, handle(req, res) (SSE endpoint: replays events after `Last-Event-ID`, heartbeat comment every 15 s), clients() → number, close() }`. Wire format: `id: <n>\nevent: <type>\ndata: <json>\n\n`.

- [ ] **Step 1: Tests** — start `http.createServer` on port 0 in each test; `static.test.mjs`: GET `/` → 302 + Location; `/healthz` → `ok`; `/atelier/asset-storybook/index.html` → 200 `text/html`; `/atelier/asset-storybook/maps-index.json` → 200 + `no-store`; `/game-client/assets/art/maps/atlas.svg` → 200 `image/svg+xml`; `/../etc/passwd` and `/atelier/%2e%2e/x` → 404; `/atelier/` → 404. `sse.test.mjs`: connect with `http.get`, `emit("job.step", {a:1})`, assert the frame text; reconnect with `Last-Event-ID: 1` after two emits → receives only event 2; `clients()` drops on socket end.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (static: `decodeURIComponent` → `path.normalize` → `resolve(root, "." + p)`, then `if (!full.startsWith(root + sep)) 404`; `statSync` guard; `createReadStream` pipe). SSE: keep `[{id,type,payload}]` ring buffer of `replay` entries; `res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" })`; write `: ok\n\n` immediately.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `feat(map-builder): nginx-equivalent static handler and SSE hub with replay`

### Task 8: World reader + HTTP app (`/api`)

**Files:** Create `atelier/map-builder/lib/world.mjs`, `atelier/map-builder/lib/app.mjs`; Test `atelier/map-builder/tests/api.test.mjs`.

**Interfaces:**
- Produces (`world.mjs`): `createWorldReader({ repo, snapshots = null, store })` → `read()` →
```jsonc
{ "seed", "ratio": { "value", "min", "max", "target" }, "sheets": { "count", "locked": bool },
  "branch": { "name", "detached" }, "dirtyFiles": [], "publishAllowed": bool, "publishReason": string|null,
  "pngTool": bool /* rsvg-convert on PATH */, "contentGateDeps": bool /* repo.contentGateDeps(): scripts/node_modules/js-yaml exists — publish refuses when false */,
  "lastPublish": job|null, "generatorVersion", "stageCount" }
```
  `ratio.value` from `fabric/world.json` `seaToLandRatio`; `sheets.count = Object.keys(SHEETS).length` (import from `render-sheet.mjs`); `sheets.locked` = `content/world/render-lock.json` exists and `--check` is not run here (cheap: report `lockedAt` from the file mtime — `render-lock.json` has no timestamp field). `publishAllowed = false` with reason `"on main"` / `"detached HEAD"` / `"a publish or undo is already running"` / `"scripts deps missing — run: npm ci --prefix scripts"` (the last from `repo.contentGateDeps() === false`; the Publish button shows the command).
- Produces (`app.mjs`): `createApp({ repo, store, queue, events, world, staticHandler, steps, version })` → `handler(req, res)`. Routes (Phase 1): `GET /api/health`, `GET /api/world`, `GET /api/steps` (serves `steps.json`), `GET /api/jobs`, `POST /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/:id/log?tail=`, `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/rerun`, `DELETE /api/jobs/:id`, `GET /api/events`; anything else under `/api` → 404 JSON; non-`/api` → `staticHandler`. Errors `{ error: { code, message } }`. `POST /jobs` body `{ kind:"draft"|"dry-run", seed?, reason?, count? }`: seed must match `SEED_GRAMMAR` (400), `count` 1–4 (400), typed seed forces `count=1`, missing seed → `count` random seeds; response `201 { jobs:[…] }`. `DELETE` refuses (409) while active; removes the record, log and `<outDir>` (only if it is under `build/mapforge/` — assert before `rmSync`). `rerun` → `queue.enqueue({ kind, seed, reason, rerunOf:id })`, 409 propagates from the queue.

- [ ] **Step 1: Tests** (`api.test.mjs`): build the app with a temp data dir, the real `createRepo({ repoRoot: REPO })`, and a fake `commandsFor` (`node -e` sleepers as in Task 6); helper `api(method, path, body)` using `http.request`. Cases: health `{ok:true}` + `branch`; world has `seed` 16-hex, `ratio.min<ratio.max`, `sheets.count === 17`; `POST /jobs` invalid seed → 400; `count:3` no seed → 3 jobs with distinct seeds; typed seed + count 3 → 1 job; `GET /jobs?status=queued`; `GET /jobs/:id/log?tail=1`; cancel queued → `cancelled`; second job same seed while active → 409; DELETE active → 409, DELETE finished → 204 and `GET` → 404; `GET /api/events` receives `job.created` for a new POST; unknown `/api/x` → 404 JSON; `GET /` → 302 (static passthrough).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with a tiny router (`[method, regex, fn]` table; body via `for await` + `JSON.parse` in try/catch → 400). **Step 4: Run** → PASS. **Step 5: Commit** — `feat(map-builder): /api routes for health, world, jobs, cancel, rerun, delete, events`

### Task 9: `server.mjs` CLI

**Files:** Create `atelier/map-builder/server.mjs`; Test `atelier/map-builder/tests/server.test.mjs`.

- [ ] **Step 1: Tests**: spawn `node atelier/map-builder/server.mjs --port 0 --data-dir <tmp>` with `cwd: REPO`; read stdout until `map-builder: listening on http://127.0.0.1:<port>` (regex), GET `/api/health` → 200, GET `/` → 302, then SIGTERM → exits 0 within 2 s. Second test: occupy a port with `net.createServer().listen(0)`, spawn with that `--port` → exit code 1 and stderr matches `map-builder: port \d+ is busy — is another builder running\? Use --port <n>`. Third: `--repo-root <tmpdir>` → exit 1, stderr matches `not the atlas-world-svc repo root`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**: parse `--port --bind --repo-root --data-dir --concurrency`; defaults from `loadConfig`; `repoRoot` default = `resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")` (the package's grandparent, same pattern as `render-sheet.mjs:49`); `dataDir` default `<repoRoot>/build/map-builder`; `store.recoverInterrupted()` at boot (log `map-builder: marked N interrupted job(s)`); `server.on("error", e => e.code==="EADDRINUSE" ? (console.error(msg), process.exit(1)) : throw)`; print `map-builder: listening on http://<bind>:<actualPort>/  (storybook: /atelier/asset-storybook/index.html, api: /api/health)`; SIGINT/SIGTERM → `queue.close()` (cancel running), `server.close()`, exit 0.
- [ ] **Step 4: Run all** — `node --test atelier/map-builder/tests/*.test.mjs` → PASS. **Step 5: Commit** — `feat(map-builder): server CLI with busy-port refusal and boot recovery`
- [ ] **Step 6: Phase gate (Tasks 7–9)** — suites; reviewers (this diff is security-relevant: static path handling — ask `code-reviewer` to check traversal explicitly); `/simplify`; re-verify.

### Task 10: Storybook tab — view-model + Start/Build screens + read-only mode

**Files:**
- Create: `atelier/asset-storybook/js/map-builder-model.mjs` (pure), `atelier/asset-storybook/js/map-builder.mjs` (DOM), `atelier/asset-storybook/tests/map-builder-model.test.mjs`
- Modify: `atelier/asset-storybook/js/main.mjs` (import at `:39` area; nav calls next to `mountMapsNav` at `:84`/`:221`; mount next to `mountMaps` at `:85`/`:352`), `atelier/asset-storybook/index.html` (append CSS before the closing `</style>` — classes prefixed `.mb-`)

**Interfaces:**
- Produces (`map-builder-model.mjs`, no DOM access at module scope):
  - `statusText(job, { stageCount })` → exact canvas strings (Global Constraints).
  - `groupSteps({ steps: job.steps, stepsJson })` → `[{ id, label, stages:[{ name, label, ms, runs, status:"done"|"pending"|"current" }] }]` with an `"other"` group for unknown names.
  - `progress(job, { targetMs, failMs })` → `{ pct (0–100 of failMs), targetPct, elapsedMs, over: "none"|"target"|"fail" }`.
  - `rowActions(job)` → array of `{ id:"watch"|"review"|"why"|"rerun"|"delete"|"cancel", label }` per spec §6 (e.g. running → Watch, Cancel; succeeded → Review, Re-run, Delete; failed → See why, Re-run, Delete; queued → Cancel).
  - `validateSeed(s)` → `{ ok, message }` (regex `^[0-9a-f]{16}$`, message copy "16 lowercase hex characters").
  - `badgeCount(jobs)` → drafts `succeeded` with `review.decision === null`.
  - `reduce(state, event)` — the tab's state machine over `{ jobs: Map, world, connected }` for SSE events `job.created/started/step/done` and `world.changed`.
- Produces (`map-builder.mjs`): `export function mountMapBuilderNav(sidebarNav)` and `export async function mountMapBuilder(main)` mirroring `maps.mjs:444/288`. Class id `MAP_BUILDER_CLASS = "map-builder"`; section `id="section-map-builder"` with `class="kind-section"`. `apiBase = "/api"` (same origin). On mount: `fetch("/api/health")` (2 s `AbortSignal.timeout`) → on failure render `<p class="mb-readonly">Builder service not running — start it with <code>node atelier/map-builder/server.mjs</code></p>` and no buttons; on success load `GET /api/world`, `GET /api/steps`, `GET /api/jobs?kind=draft&limit=50`, open `EventSource("/api/events")` with fallback polling every 2 s (`pollMs` from config is not reachable client-side — hard-code 2000 with a comment) when `onerror` fires. Screens: **Start** (header card, form, drafts table) and **Build** (per-draft progress + grouped checklist + Stop this draft). Badge via `initHealth(MAP_BUILDER_CLASS, 1)` + `renderSidebarBadge`, count from `badgeCount`. Every button has visible text; table rows have `<th scope="col">`; live regions use `aria-live="polite"` for status cells.

- [ ] **Step 1: Write the failing model tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statusText, groupSteps, progress, rowActions, validateSeed, badgeCount, reduce } from "../js/map-builder-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEPS = JSON.parse(readFileSync(path.resolve(HERE, "../../map-builder/steps.json"), "utf8"));
const job = (o) => ({ id: "j1", kind: "draft", status: "queued", steps: [], review: { decision: null, reasons: [] }, ...o });

test("status strings are the canvas set", () => {
  assert.equal(statusText(job({}), { stageCount: 18 }), "Queued");
  assert.equal(statusText(job({ status: "running", steps: new Array(11).fill({}) }), { stageCount: 18 }), "Building · step 11 of 18");
  assert.equal(statusText(job({ status: "succeeded" }), { stageCount: 18 }), "Ready to review");
  assert.equal(statusText(job({ status: "failed", error: "generate-world: LOOP BUDGET generate 13000 ms" }), { stageCount: 18 }), "Failed · took too long");
  assert.equal(statusText(job({ status: "failed", error: "hung" }), { stageCount: 18 }), "Failed · hung");
  assert.equal(statusText(job({ status: "failed", error: "generate-world: --out x holds y" }), { stageCount: 18 }), "Failed · generate-world: --out x holds y");
  assert.equal(statusText(job({ status: "succeeded", review: { decision: "rejected", reasons: ["too much sea"] } }), { stageCount: 18 }), "Rejected · too much sea");
  assert.equal(statusText(job({ status: "succeeded", publishedBy: "j9" }), { stageCount: 18 }), "Published");
  assert.equal(statusText(job({ status: "interrupted" }), { stageCount: 18 }), "Interrupted");
});
test("groupSteps marks done/current/pending and buckets unknown stages", () => {
  const g = groupSteps({ steps: [{ name: "P1", ms: 3, runs: 1 }, { name: "P2", ms: 4, runs: 1 }, { name: "PX", label: "mystery", ms: 1, runs: 1 }], stepsJson: STEPS, running: true });
  assert.equal(g[0].stages[0].status, "done"); assert.equal(g[0].stages[2].status, "pending");
  assert.equal(g.find((x) => x.id === "other").stages[0].name, "PX");
  assert.equal(g.flatMap((x) => x.stages).filter((s) => s.status === "current").length, 1);
});
test("progress against the budgets marks", () => {
  const p = progress(job({ status: "running", startedAt: new Date(Date.now() - 7000).toISOString() }), { targetMs: 6000, failMs: 12000 });
  assert.equal(p.over, "target"); assert.equal(p.targetPct, 50); assert.ok(p.pct > 50 && p.pct < 70);
});
test("row actions by status", () => {
  assert.deepEqual(rowActions(job({ status: "running" })).map((a) => a.id), ["watch", "cancel"]);
  assert.deepEqual(rowActions(job({ status: "succeeded" })).map((a) => a.id), ["review", "rerun", "delete"]);
  assert.deepEqual(rowActions(job({ status: "failed" })).map((a) => a.id), ["why", "rerun", "delete"]);
  assert.deepEqual(rowActions(job({ status: "queued" })).map((a) => a.id), ["cancel"]);
});
test("seed validation and badge", () => {
  assert.equal(validateSeed("3f81c0aa9d2e5b17").ok, true); assert.equal(validateSeed("3F81").ok, false);
  assert.equal(badgeCount([job({ status: "succeeded" }), job({ status: "succeeded", review: { decision: "rejected", reasons: [] } }), job({ status: "failed" })]), 1);
});
test("reduce applies SSE events", () => {
  let s = reduce({ jobs: new Map(), world: null, connected: false }, { type: "job.created", job: job({}) });
  s = reduce(s, { type: "job.step", job: job({ status: "running", steps: [{ name: "P1" }] }) });
  assert.equal(s.jobs.get("j1").status, "running");
  s = reduce(s, { type: "world.changed", world: { seed: "abc" } }); assert.equal(s.world.seed, "abc");
});
```

- [ ] **Step 2: Run** — `node --test atelier/asset-storybook/tests/map-builder-model.test.mjs` → FAIL. **Step 3: Implement the model**, then the DOM module and mount lines. `statusText` failed-branch: `/LOOP BUDGET/.test(error) → "Failed · took too long"`; `error === "hung" → "Failed · hung"`; else `"Failed · " + error.split("\n")[0]`. Insert into `main.mjs` exactly beside the maps lines (both the error path `:84-85` and the happy path `:221`/`:352`).
- [ ] **Step 4: Run** the model test and the whole storybook suite: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | tail -n 8` → PASS.
- [ ] **Step 5: Manual verification (required — no DOM test runner exists):** `node atelier/map-builder/server.mjs` in one shell; open `http://127.0.0.1:6016/` in Chrome (via the claude-in-chrome tools, in a **subagent** that returns a text verdict, per the image-budget rule): the sidebar shows **Map Builder**; Start shows the current seed and band; entering `zzzz` shows the validation message and disables Build; **Random** + **Build 2** produces two rows that move `Queued` → `Building · step k of 18` → `Ready to review` with the checklist filling in; **Stop this draft** on a running one ends `Cancelled`. Then serve read-only with `python3 -m http.server 6007` and confirm the notice renders with no buttons. Record the verdict lines in the commit body.
- [ ] **Step 6: Commit** — `git add atelier/asset-storybook && git commit -m "feat(storybook): Map Builder tab — Start/Build screens, live SSE, read-only mode"`

### Task 11: Gate 1 wiring, AGENTS.md row, phase gate

**Files:** Modify `scripts/precheck.sh` (after line 171 add `map_builder_tests() { ( cd "$REPO_ROOT" && node --test atelier/map-builder/tests/*.test.mjs ) }`; after line 185 add `run_section "map-builder: node --test suite" map_builder_tests`), `.github/workflows/ci.yml` (R1 — CI config; right after the "Asset storybook data-layer tests" step at line 255-256 add `- name: Map builder tests` / `run: node --test atelier/map-builder/tests/*.test.mjs` — this is the Node 18 enforcement, see Global Constraints), `atelier/AGENTS.md` (tools table: `| \`map-builder/\` | Local builder service + storybook Map Builder tab: seed → draft → review → publish/undo, jobs persisted under \`build/map-builder/\` | \`node --test map-builder/tests/*.test.mjs\` |`; quick commands: `node atelier/map-builder/server.mjs   # storybook + /api on http://127.0.0.1:6016/`).

- [ ] **Step 1:** Edit all three files. **Step 2: Verify** — `bash scripts/precheck.sh 2>&1 | grep -E "map-builder|PASS|FAIL" | head -n 20` → the new section prints PASS and the overall exit is 0 (`echo $?` right after — not after a pipe); `grep -n "map-builder" .github/workflows/ci.yml` shows the new step; `python3 -c 'import yaml,sys;yaml.safe_load(open(".github/workflows/ci.yml"))'` (or `npx -y yaml-lint`) parses. The Node-18 proof itself lands when the feature PR's CI runs — check that run is green before ship.
- [ ] **Step 3: Commit** — `git add scripts/precheck.sh .github/workflows/ci.yml atelier/AGENTS.md && git commit -m "chore(gates): run map-builder suite in Gate 1 and CI (Node 18); list the package in atelier/AGENTS.md"`
- [ ] **Step 4: Phase gate (Tasks 10–11)** — storybook + map-builder suites; `code-reviewer` + `typescript-reviewer` on the storybook diff (ask explicitly: XSS via `innerHTML` with job/error text — must use `textContent`); `/simplify`; re-run; re-do the Chrome check if the DOM module changed.
- [ ] **Step 5: Phase 1 acceptance check** against spec §11 items 1, 2, 3, 4 (cancel + took-too-long + hung), 9, 10 — list each with the command/observation that proves it in the final task report. Then `ps-release-workflow-ship` (Gate 1) from the feature worktree.

---
# Phase 2 — Review + Publish + Undo

Shippable on its own: a succeeded draft can be reviewed side by side with the current world,
rejected with a reason, or published (snapshot → promote → render PNGs → parity → lock → verify)
and undone. Gate 2 gains the real end-to-end.

### Task 12: Snapshot set + snapshots

**Files:** Create `atelier/map-builder/lib/snapshots.mjs`; Test `atelier/map-builder/tests/snapshots.test.mjs`.

**Interfaces:**
- Produces: `snapshotSet({ repoRoot })` → sorted unique repo-relative file list computed as: every file under each `REPLACED_FAMILIES` dir (import from `promote-world.mjs`) + every file under `content/spine/nodes/` + `content/spine/edges.json` + `collectOutputs(...)` paths from `scripts/check_spine_emit.mjs` (call it the way its `main()` does — read `:170-190` — and take `.outputs[].path` relative to repo) + `content/world/render-lock.json` + `lockExtraPaths({ repoRoot })` + every file under `game-client/assets/art/maps/` + `atelier/asset-storybook/maps-index.json`; filtered to files that exist. Also `snapshotDirs` = the directory roots whose *whole* contents are owned (`content/spine/nodes`, the three families, `game-client/assets/art/maps`) so restore can delete files a publish added.
- Produces: `createSnapshots({ repoRoot, dir, keep = 3 })` → `{ create({ seed }) → { id, dir, files:[{path,sha256}], seed, at }, restore({ id }) → { restored: n, deleted: n }, list() → meta[] newest first, prune() → removedIds[], get(id) }`. `id = <ISO-ts with ':' → '-'>-<seed>`; `snapshot.json` = meta. Restore = for each owned dir: delete files not in the snapshot, then copy every snapshot file back (`mkdirSync recursive` + `copyFileSync`); then verify sha256 of each restored file; throws listing mismatches.

- [ ] **Step 1: Tests** — build a temp "mini repo": copy from the real repo only the snapshot-set files (`snapshotSet({repoRoot: REPO})` → copy each into `tmp/`), plus `atelier/mapforge/generate-world.mjs` (empty file is enough for `assertRepoRoot`). Cases: (a) `snapshotSet` on the real repo contains `content/world/fabric/world.json`, `content/spine/edges.json`, `content/spine/derived.json`, `content/world/render-lock.json`, `atelier/asset-storybook/maps-index.json`, at least one `game-client/assets/art/maps/*.svg`, and every path exists; (b) create → mutate one fabric file + add a foreign file under `content/spine/nodes/` + delete one maps svg → restore → sha256 of every snapshot file matches and the foreign file is gone; (c) `keep:3` — create 4, `prune()` removes the oldest only; (d) `restore` of an unknown id throws.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** — `feat(map-builder): computed snapshot set with sha256 restore and retention`

### Task 13: Review payload

**Files:** Create `atelier/map-builder/lib/review.mjs`; Test `atelier/map-builder/tests/review.test.mjs`.

**Interfaces:**
- Consumes: job record with `outDir`, `metrics`, `dryRun` (Task 6); `repo.ratioBand()`, `repo.promotionGates()`, `repo.currentSeed()`.
- Produces: `continentMetrics({ fabricDir })` → `[{ id, landKm2, regions, settlements }]` read from the per-continent fabric JSON files (the same shape in `<outDir>/content/world/fabric/` and `content/world/fabric/`, because promotion byte-copies that family); `buildReview({ repo, job, sheets })` →
```jsonc
{ "draft": { "seed", "metrics", "continents": [...] }, "current": { "seed", "ratio", "continents": [...] },
  "deltas": [ { "id", "landKm2": { "draft", "current", "delta" }, "regions": {...}, "settlements": {...} } ],  // sorted by |Δ landKm2| desc
  "band": { "min", "max", "target" }, "dryRun": job.dryRun, "gatesAtPublish": [ "G-ALIAS", ... ],
  "knownTodos": [ "…" ],   // <outDir>/manifest.json `problems` (the draft's carried debt); G-NET/G-CANON-LEG counts need a gate run and are out of scope here
  "sheets": [ { "id", "title", "draftSvg": "/<outDir>/sheets/<file>", "currentSvg": "/game-client/assets/art/maps/<id>.svg" } ] }
```
- [ ] **Step 1: Verify shapes before writing tests** (record findings as comments at the top of `review.mjs`): `ls content/world/fabric/ | head; node -e 'const j=require("./content/world/fabric/"+process.argv[1]);console.log(Object.keys(j))' <one continent file>`; the draft sheet file names are settled (audit 2026-09-13): the generator writes only `sheets/fabric.svg` and `sheets/overlay.svg` (`generate-world.mjs:1515` draft list, `:1117` write) — the other 15 `SHEETS` ids get `draftSvg: null` (the UI shows "not drawn in drafts"); no probe run needed.
- [ ] **Step 2: Tests** — use the probe out dir produced in a `before()` hook (real generator, ~6 s, one run for the file) and the real repo as "current": `continentMetrics` returns ≥ 1 continent with numeric fields for both; `buildReview` deltas sorted by |Δ|; `band` equals manifest; `gatesAtPublish` equals `Object.keys(budgets.promotion.gateRulesThatMustBeGreen)`; `sheets.length === 17`; exactly `fabric` and `overlay` carry a non-null `draftSvg` (both files exist under the probe out dir), the other 15 have `draftSvg: null`; all 17 `currentSvg` paths exist on disk. (Deviation from spec §11.5, which reads as if every sheet has a draft — recorded here, spec text unchanged.)
- [ ] **Step 3: Implement. Step 4: Run** → PASS. **Step 5: Commit** — `feat(map-builder): review payload — draft vs current metrics, deltas, dry-run and publish-time gates`

### Task 14: Publish + undo as composite jobs

**Files:** Create `atelier/map-builder/lib/publish.mjs`; Modify `atelier/map-builder/lib/runner.mjs` (accept in-process steps `{ label, fn }`), `atelier/map-builder/lib/queue.mjs` (kind-aware `commandsFor`, publish serialisation, `publishedBy`, `world.changed`), `atelier/map-builder/lib/commands.mjs`; Tests: extend `runner.test.mjs`, `queue.test.mjs`; create `tests/publish.test.mjs`.

**Interfaces:**
- Runner: a command may be `{ label, fn: async ({ log }) => void }`; it runs in-process, its thrown error message becomes `error`, and it participates in `onCommandStart/End` like a spawn. `cancel()` during an `fn` step is ignored (publish cannot be cancelled after step 2 starts — the queue enforces the "after step 2" part by refusing cancel when the job's current step index ≥ 2).
- `publishCommands({ repo, job, snapshots, draftJob })` → six labelled steps:
  1. `snapshot` — `fn`: `snapshots.create({ seed: repo.currentSeed() })`, record `job.snapshotId`;
  2. `promote` — spawn `node atelier/mapforge/promote-world.mjs --from <draftJob.outDir>`;
  3. `render:<id>` × 17 — spawn `node atelier/mapforge/render-sheet.mjs --sheet <id> --png` (a `rasterize` skip line → step `warning: "PNG not regenerated — install librsvg"`, not a failure);
  4. `parity` — spawn `node --test atelier/asset-storybook/tests/maps-index.test.mjs`;
  5. `lock` — spawn `node scripts/check_render_lock.mjs --write`;
  6. `verify` — spawn `node scripts/check_render_lock.mjs --check`, spawn `node scripts/check_spine_emit.mjs --check --content-root content`, `fn`: assert `repo.currentSeed() === draftJob.seed`.
  Steps are grouped in the job as `steps:[{ name:"snapshot"|"promote"|"render"|"parity"|"lock"|"verify", label, ms, status }]` (the 17 render spawns roll up into one `render` step with `runs`).
- `undoCommands({ repo, job, snapshots })` → `restore` (`fn`), `check` (spawn `check_render_lock.mjs --check`).
- Queue: `enqueue({ kind:"publish", draftJobId })` → 409 if `store.list({status:"queued"})`/running contains publish/undo, 409 if `repo.branch()` is `main` or detached (message `"publish is refused on main / detached HEAD — check out a feature or release branch"`), 409 if `!repo.contentGateDeps()` (message `"scripts deps missing — run: npm ci --prefix scripts"`; checked BEFORE the snapshot is taken), 404 if the draft is not `succeeded`. On failure at step ≥ 2: run `snapshots.restore({ id: job.snapshotId })` automatically, append `[restore] …` to the log, set `error` to the failing step's error and `restored: true`. On success: `store.update(draftJobId, { publishedBy: job.id })`, `snapshots.prune()`, `events.emit("world.changed", { world: world.read() })`. Undo success also emits `world.changed`.

- [ ] **Step 1: Tests** — `publish.test.mjs` with a **fake repo fixture** (temp dir with the snapshot-set files copied, as Task 12) and fake spawns: `commandsFor` for publish is built by `publishCommands` but the test injects `tools` overrides (`{ promote: argv, render: (id) => argv, parity: argv, lock: argv, check: argv, spineCheck: argv }`) so each spawn is a `node -e` that either mutates a fabric file (promote), prints a skip line (render), or exits 1 (to test auto-restore). Cases: happy path → `steps` has six names, `publishedBy` set on the draft, `world.changed` emitted, snapshot count pruned to `keep`; failure at `lock` → status `failed`, `restored: true`, fabric file bytes equal the pre-publish bytes; branch `main` → 409 at enqueue and no snapshot created; second publish while one queued → 409; undo of that snapshot restores and emits `world.changed`; render skip line → `warning` recorded, job still `succeeded`. `runner.test.mjs` gains: `fn` step success/throw. `queue.test.mjs` gains: cancel refused with 409 once publish passed step 2.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement. Step 4: Run** `node --test atelier/map-builder/tests/*.test.mjs` → PASS. **Step 5: Commit** — `feat(map-builder): publish and undo as composite jobs with snapshot auto-restore and branch refusal`
- [ ] **Step 6: Phase gate (Tasks 12–14)** — this is the risky surface (world replace, file deletion; R1 — publish rewrites tracked world files in the live checkout, including the 17 LFS PNG thumbs per `.gitattributes:29`, and the snapshot is the only undo): reviewers must check that the snapshot set covers every file publish rewrites (thumbs included), the delete-then-copy restore path and the `rmSync` guards; `/simplify`; re-verify.

### Task 15: Phase 2 API routes

**Files:** Modify `atelier/map-builder/lib/app.mjs`, `atelier/map-builder/lib/world.mjs`; extend `tests/api.test.mjs`.

- Routes: `GET /api/drafts/:jobId/review` (404 unless draft `succeeded`), `POST /api/drafts/:jobId/decision` `{ decision:"rejected"|"accepted", reasons:[] }` (400 on other values; records `review`), `POST /api/publish` `{ draftJobId, confirm:true }` (400 without `confirm:true`; 409s from the queue), `GET /api/snapshots`, `POST /api/undo` `{ snapshotId }` (404 unknown; same 409s). `GET /api/world` adds `lastPublish` (newest `publish` job) and `undoAvailable` (a snapshot newer than the last successful publish's start exists).
- [ ] **Step 1: Tests** for each route's success + error codes using the Task 14 fake tools. **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** — `feat(map-builder): review, decision, publish, snapshots and undo routes`

### Task 16: Storybook — pan-zoom factory, Review + Publish screens

**Files:**
- Create: `atelier/asset-storybook/js/panzoom.mjs`
- Modify: `atelier/asset-storybook/js/maps.mjs:86-284` (replace the singleton internals with one `createPanZoom` instance; keep `openMapViewer`/`closeMapViewer` signatures and behaviour), `js/map-builder.mjs` (Review + Publish screens), `js/map-builder-model.mjs` (+ `reviewRows`, `publishStepsText`, `decisionReasons`), `index.html` (CSS), `tests/map-builder-model.test.mjs`.

**Interfaces:**
- `createPanZoom({ stage, img })` → `{ setSrc(url), reset(), getTransform() → {scale,tx,ty}, setTransform(t), on("change", fn), destroy() }` — wheel zoom about the cursor, drag pan, exactly the maths currently in `maps.mjs` (move it, don't rewrite it). `linkPanZoom(a, b)` mirrors `change` events both ways with a re-entrancy guard (shared transform for the side-by-side view).
- Model additions: `reviewRows(review, { showAll })` → top-5 by |Δ landKm2| unless `showAll`; `publishStepsText()` → the six labels in order (from a constant shared with… no — the client cannot import server code; keep a duplicated 6-entry constant and a test in `map-builder-model.test.mjs` that reads `atelier/map-builder/lib/publish.mjs`'s exported `PUBLISH_STEPS` and asserts equality, so drift fails a test); `decisionReasons` = `["too much sea", "too little sea", "coastline too regular", "settlements misplaced", "other"]`.
- Screens: **Review** — waiting banner; viewer mode toggle (side-by-side / draft-only / current-only) using two linked `createPanZoom` instances; sheet `<select>`; continents table (top 5, "Show all"); metrics with band; "Checks — run when you accept" list from `gatesAtPublish` with the fixed copy; "Known to-dos"; "If you accept" WRITE/DELETE counts + "See every file" `<details>`; buttons Back / Reject draft (reason `<select>` + Confirm) / Try another seed (→ Start with the form focused) / Accept draft…. **Publish** — Confirm (six steps listed, replace warning, dirty-files warning, PNG-tool warning if `world.pngTool === false`, **Accept & publish**), Publishing (live steps from `job.step`, "You can leave this page"), Published (seed, sheets redrawn, **Undo this publish** enabled while `world.undoAvailable`, **Open Map Sheets** → `setActiveClass("maps")` via the existing sidebar button click, the "commit through your release workflow" hint). A failed publish shows the failing step, `error`, and "Restored the previous world automatically" when `restored`.
- [ ] **Step 1:** Model tests for `reviewRows`, `publishStepsText` (drift test), `decisionReasons`. **Step 2:** FAIL → implement model → PASS. **Step 3:** Extract `panzoom.mjs`; run the storybook suite (`node --test atelier/asset-storybook/tests/*.test.mjs`) — must stay green; manual check in Chrome (subagent, text verdict): the Map Sheets viewer still opens, zooms about the cursor, drags, closes on Escape — identical to before. **Step 4:** Build Review + Publish screens. **Step 5: Manual verification** (Chrome subagent) on a feature branch with a succeeded draft: Review renders both panes and they pan/zoom together; Reject records the reason and the table row reads `Rejected · <reason>`; Accept → Confirm lists six steps → Publishing shows steps completing → Published shows the new seed; `GET /api/world` seed equals the draft's; Undo restores the previous seed. **Step 6: Commit** — `feat(storybook): Map Builder review and publish screens; pan-zoom viewer extracted to a linked factory`
- [ ] **Step 7: Phase gate (Tasks 15–16)** — suites; reviewers (`typescript-reviewer` on `panzoom.mjs` regression risk: compare against the pre-move maths line by line); `/simplify`; re-verify incl. the Map Sheets manual check.

### Task 17: Gate 2 end-to-end + diagram

**Files:** Modify `scripts/integration.sh` (new section after line 173), `docs/diagrams/map-asset-pipeline.drawio`; Create `atelier/map-builder/tests/e2e/publish-undo.sh`.

- [ ] **Step 1: Write `tests/e2e/publish-undo.sh`** (bash, `set -uo pipefail`, called by integration.sh with `REPO_ROOT`):
  1. `tmp=$(mktemp -d)`; `git -C "$REPO_ROOT" worktree add --detach "$tmp/wt" HEAD` — **then** `git -C "$tmp/wt" checkout -b "tmp/map-builder-e2e-$$"` (publish refuses detached HEAD, so the branch is required; assert `branch != main`). **Deps are required, not optional** (audit 2026-09-13: `promote-world.mjs:438` runs `scripts/check_content.mjs --only=spine`, which imports `js-yaml`/`ajv`/`sharp` from `scripts/package.json`; without `scripts/node_modules` every publish fails at step 2 with `ERR_MODULE_NOT_FOUND` and auto-restores — the "symlink if present" hedge would reproduce that silently). At script start: `git -C "$REPO_ROOT" worktree prune` and delete any stale `tmp/map-builder-e2e-*` branches (a SIGKILL skips the `trap`); then `test -d "$REPO_ROOT/scripts/node_modules/js-yaml" || { echo "e2e: FAIL — run: npm ci --prefix scripts"; exit 1; }`; then `ln -s "$REPO_ROOT/scripts/node_modules" "$tmp/wt/scripts/node_modules"` (a fresh worktree has none; `integration.sh:72` runs `npm ci` only in its own deps section, never for `scripts/`).
  2. Start `node atelier/map-builder/server.mjs --port 0 --repo-root "$tmp/wt" --data-dir "$tmp/data"` in background (`cwd` = `$tmp/wt`), capture the port from stdout, `trap` kills the server, removes the worktree (`git worktree remove --force`) and deletes the branch.
  3. `POST /api/jobs {"kind":"draft","seed":"3f81c0aa9d2e5b17"}`; poll `GET /api/jobs/:id` until terminal (≤ 60 s); assert `succeeded`, `steps.length == 18`, `metrics.settlements > 0`.
  4. `GET /api/drafts/:id/review` → assert `dryRun.written > 0` and `deltas.length > 0` (`node -e` JSON asserts).
  5. Record `before=$(cd $tmp/wt && git status --porcelain | wc -l)` and the snapshot set (`node -e 'import("./atelier/map-builder/lib/snapshots.mjs").then(m => console.log(m.snapshotSet({repoRoot: process.cwd()}).join("\n")))' > $tmp/set.txt`).
  6. `POST /api/publish {"draftJobId":…,"confirm":true}` → poll → `succeeded`; assert `content/world/fabric/world.json` seed == `3f81c0aa9d2e5b17`; `node scripts/check_render_lock.mjs --check` exit 0; `node scripts/check_spine_emit.mjs --check --content-root content` exit 0; **changed files ⊆ snapshot set**: `git -C $tmp/wt status --porcelain | awk '{print $2}' | sort > $tmp/changed.txt; comm -23 $tmp/changed.txt <(sort $tmp/set.txt)` must be empty (print offenders otherwise).
  7. `GET /api/snapshots` → take newest id; `POST /api/undo` → poll → `succeeded`; assert seed is back to the pre-publish seed, `git -C $tmp/wt status --porcelain` is empty (byte-for-byte restore ⇒ clean tree), both `--check` commands exit 0.
  Print `e2e: OK` and exit 0; any assertion failure prints the failing step and exits 1.
- [ ] **Step 2: Run it directly** — `REPO_ROOT=$PWD bash atelier/map-builder/tests/e2e/publish-undo.sh; echo exit=$?` → `e2e: OK`, exit 0. If it stops at the deps check, run `npm ci --prefix scripts` once (this worktree has no `scripts/node_modules` today) and re-run. Fix whatever else it finds (rsvg presence, worktree paths).
- [ ] **Step 3: Wire Gate 2** — in `scripts/integration.sh` add `map_builder_e2e() { REPO_ROOT="$REPO_ROOT" bash "$REPO_ROOT/atelier/map-builder/tests/e2e/publish-undo.sh"; }` and `run_section "map-builder: draft → publish → undo end-to-end" map_builder_e2e` after line 173. Run `bash scripts/integration.sh 2>&1 | grep -E "map-builder|PASS|FAIL" | head -n 30` → PASS.
- [ ] **Step 4: Diagram** — open `docs/diagrams/map-asset-pipeline.drawio`, add a box "0 Map Builder (atelier/map-builder/ — storybook tab + /api; runs steps 2→7 as tracked jobs, snapshot/undo)" with edges to box 2 (Generate) and box 8 (View), and change the "Open question" note if it asks who runs the freeze (read it first). Keep it hand-edited XML; validate with `xmllint --noout docs/diagrams/map-asset-pipeline.drawio`.
- [ ] **Step 5: Commit** — `git add scripts/integration.sh atelier/map-builder/tests/e2e docs/diagrams && git commit -m "test(map-builder): Gate 2 draft→publish→undo end-to-end; diagram shows the builder"`
- [ ] **Step 6: Phase gate (Task 17) + Phase 2 acceptance** — spec §11 items 5, 6, 7, 10 each with the proving command; reviewers on the shell script (quoting, trap cleanup on every exit path); ship via `ps-release-workflow-ship`.

---
# Phase 3 — Monitoring polish + re-run

Shippable on its own: History screen across all job kinds, a following log viewer, re-run with
the determinism badge, interrupted-job recovery in the UI, draft cleanup, docs.

### Task 18: Re-run determinism badge (server)

**Files:** Modify `atelier/map-builder/lib/queue.mjs`; extend `tests/queue.test.mjs`.

**Interfaces:**
- On a draft `job.done` (succeeded), read `<repoRoot>/<outDir>/manifest.json` `hashes` and store `job.manifestHashes` (object). If `job.rerunOf` is set and the original job has `manifestHashes`, set `rerunMatch = deepEqual ? "identical" : "differs"`, and `rerunDiff = [keys whose hash differs]` (for the "differs" tooltip). Otherwise `rerunMatch` stays `null`.
- `POST /jobs/:id/rerun` (Task 8) already clones `kind, seed, reason` with `rerunOf`; it must also work for `interrupted` and `failed` jobs and refuse (409) while the same out dir is active.

- [ ] **Step 1: Tests** — with the fake generator writing a `manifest.json` `{ hashes: { a: "1" } }` into the out dir: original → `manifestHashes` recorded; rerun with identical hashes → `identical`; rerun where the fake writes `{ a: "2" }` → `differs` with `rerunDiff: ["a"]`; rerun of an `interrupted` record is accepted.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** — `feat(map-builder): record manifest hashes and compute the re-run determinism badge`

### Task 19: History screen + log viewer (storybook)

**Files:** Modify `atelier/asset-storybook/js/map-builder.mjs`, `js/map-builder-model.mjs`, `index.html` (CSS), `tests/map-builder-model.test.mjs`.

**Interfaces:**
- Model: `historyRows(jobs, { stageCount, targets })` → rows `{ id, kind, seed, statusText, durationText: "5.4 s / 6 s target", over: bool, rerunOf, rerunBadge: "Re-run identical"|"Re-run differs"|null, startedText }`; `rerunChains(jobs)` → `Map<rootId, id[]>` for indenting re-runs under their original; `logTailUrl(id, n)`.
- Screen **History**: filter chips (kind, status), table with the columns above, row actions Re-run / Delete / Log; **Log viewer** panel: `<pre>` fed by `GET /api/jobs/:id/log?tail=200`, re-fetched every 1 s while the job is `running` (stop when terminal), "Follow" checkbox pins scroll to bottom, "Open full log" link to `/api/jobs/:id/log`. Interrupted rows show `Interrupted` and the Re-run action (acceptance §11.8).
- Sidebar badge and the Start table stay as in Phase 1; History is a sub-tab within the Map Builder section (buttons Start / History with `aria-pressed`).
- [ ] **Step 1:** Model tests for `historyRows` (duration text, over-target flag, badge text), `rerunChains`. **Step 2–3:** FAIL → implement → PASS (`node --test atelier/asset-storybook/tests/*.test.mjs`). **Step 4: Manual verification** (Chrome subagent): kill the service mid-draft (`kill <pid>`), restart, History shows `Interrupted` with Re-run; Re-run of a succeeded draft ends with the "Re-run identical" badge; the log panel follows a running draft and stops when done. **Step 5: Commit** — `feat(storybook): Map Builder history screen with re-run chains, determinism badge and following log viewer`

### Task 20: Cleanup, docs, phase gate

**Files:** Create `atelier/map-builder/README.md`, `atelier/asset-storybook/README.md`; Modify `atelier/map-builder/lib/app.mjs` (bulk delete), `tests/api.test.mjs`.

- `DELETE /api/jobs?status=failed|cancelled|interrupted&olderThanDays=N` → deletes matching records + logs + draft dirs (never snapshots, never active jobs) → `{ deleted: n }`; exposed in History as "Delete finished drafts older than 7 days". Snapshot pruning already runs after a successful publish (Task 14) — add `GET /api/snapshots` listing to the Published crumb's Undo control text ("3 snapshots kept").
- `atelier/map-builder/README.md`: what it is, start command + URL, the job model table (kinds → commands), where data lives (`build/map-builder/`), the snapshot/undo contract (no git commit; publish refused on main), monitoring (records, logs, interrupted recovery, determinism badge), troubleshooting (port busy, PNG tool missing, "took too long" vs "hung"), how to run the tests and the e2e. Link the spec path.
- `atelier/asset-storybook/README.md` (new): one paragraph per tab incl. Map Builder + the two ways to serve (nginx/k8s or `python3 -m http.server` = read-only; `node atelier/map-builder/server.mjs` = live).
- [ ] **Step 1:** API test for bulk delete (matches by status + age, refuses active, leaves snapshots). **Step 2–3:** FAIL → implement → PASS. **Step 4:** Write both READMEs; `node --test atelier/map-builder/tests/*.test.mjs atelier/asset-storybook/tests/*.test.mjs 2>&1 | tail -n 6` green. **Step 5: Commit** — `docs(map-builder): README, storybook README; bulk cleanup of finished drafts`
- [ ] **Step 6: Phase gate (Tasks 18–20)** — suites + Gate 1 (`bash scripts/precheck.sh`) + Gate 2 e2e; reviewers; `/simplify`; re-verify.
- [ ] **Step 7: Phase 3 acceptance** — spec §11 item 8 (kill mid-draft → `interrupted`; re-run → `identical`) with the proving commands; ship via `ps-release-workflow-ship`. Update this plan's checkboxes and `handoff.md` state.

---

## Self-review (writing-plans checklist, run 2026-09-13)

**Spec coverage** — §1 architecture: Tasks 7–9. §2 components: `server.mjs` T9, `jobs` T4, `queue` T6, `runner` T5, `stage-parser` T2, `world` T8, `review` T13, `snapshots` T12, `config.json` T1, tests throughout; added `repo.mjs`, `commands.mjs`, `static.mjs`, `sse.mjs`, `app.mjs`, `publish.mjs` as finer units (spec §2 is a minimum, not a cap). §3 job model + kinds: T4/T5/T6/T14; timeouts T1; cancel T5/T6/T14; re-run T8/T18. §4 API: T8 (Phase 1 routes), T15 (Phase 2 routes), bulk delete T20. §5 snapshot/undo: T12/T14/T17. §6 UX: Start/Build T10, Review/Publish T16, History T19, accessibility rules in T10. §7 monitoring: T4 (records/logs), T9 (boot recovery), T18 (badge), T8 (`GET /world` warnings). §8 safety: T7 (traversal), T9 (repo-root refusal, busy port), T14 (serialised publish, branch refusal, auto-restore). §9 tests: one per unit + api + static + storybook model + Gate 1 (T11) + Gate 2 (T17). §10 phases: three, each ending in ship. §11 acceptance: mapped at the end of each phase. §13 assumptions: 13.1 confirmed (promote renders `--no-png`; publish step 3 adds PNG) T14; 13.2 confirmed (`--check` exists) T14; 13.3 resolved (index is hand-maintained and unchanged by publish → step 4 runs the parity test) T14.

**Deviations from the spec (deliberate, recorded):**
- `steps.json` "Step k of N": N = 18 distinct stages (spec already says so; the canvas's "20" is dropped).
- Publish step 4 verifies `maps-index.json` parity instead of "rebuilding" it — there is no generator and the ids do not change on publish.
- "Known to-dos" shows the draft manifest's `problems`, not G-NET/G-CANON-LEG counts (those need a `check_content` run; filed as a follow-up idea, not built).
- The pan-zoom viewer is extracted into a factory (`panzoom.mjs`) because the existing one is a singleton; Map Sheets behaviour must stay identical (T16 manual check).
- Missing `rsvg-convert` degrades PNG regeneration to a warning (render-sheet already skips gracefully) instead of refusing publish; `GET /world.pngTool` warns beforehand.

**Placeholder scan** — no TBD/TODO; every code step has code or an exact recipe; T13 step 1 and T17 step 1 contain "verify first" probes for shapes the fact sheets could not settle (fabric file keys, draft sheet file names, `check_content` deps in a fresh worktree) — the probe commands are given.

**Type consistency** — `createJobStore` API used identically in T6/T8/T14/T18; `createRunner.run` result shape `{ ok, exitCode, error, timedOut, cancelled, captured }` in T5/T6/T14; `commandsFor({ kind, job, repo })` T6/T14; job fields `steps/metrics/dryRun/rerunOf/rerunMatch/manifestHashes/publishedBy/snapshotId/restored` introduced once each and reused; `events.emit(type, { job, … })` in T6/T7/T14; storybook `MAP_BUILDER_CLASS = "map-builder"` T10/T16/T19.

## Audit trail

- 2026-09-13 plan written from spec 580d0e7 + three fact sheets (mapforge scripts, storybook, gates); 20 tasks in 3 phases; self-review above.
- 2026-09-13 self-grill-audit (adversarial subagent, verified on disk at fa4e234): verdict **safe-with-fixes**. Corrected: (H1) T1 `generatorVersion` — no such field in `manifest.json`, fabric nests it at `generator.version`; now imported from `mapforge/lib/version.mjs:14`. (H2) T13 — only `fabric`/`overlay` drafts exist (`generate-world.mjs:1515`), so 15 of 17 `draftSvg` are null; test assertion rewritten. (H3) T11 — Node 18 was enforced by nothing; CI step added to `ci.yml` (rule 11). (H4) T17/T8/T14 — `check_content.mjs` needs `scripts/node_modules` (absent here); e2e fails fast, `/api/world` reports `contentGateDeps`, publish refuses before snapshotting. MEDIUM: nginx `autoindex on` recorded as a deliberate deviation; T3 uses the test file's `CLI` constant; T14 gate notes the LFS-thumb blast radius + stale e2e worktree/branch prune. LOW: P11/P11b are separate call sites not a loop; `render-lock.json` has no timestamp field. Confirmed unchanged: 18 stage names, SHEETS=17, Σ failMs=119000, side-effect-free CLI imports, `RUN_ENTRIES` needs `report.json`, maps-index parity 9/9, port 6016 free. Spec drift noted, spec left as-is: §3 `outDir` example uses the full seed (should be the 8-char prefix per `runIdOf`, `generate-world.mjs:56`); §11.5 implies every sheet has a draft. Open: none.
