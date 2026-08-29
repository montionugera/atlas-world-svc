# F-050 Art-forge Pipeline Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every art-forge pipeline event (blockin, render attempt, gate verdict, intake) lands in a committed per-brief run ledger, surfaced as a "Forge" tab in the asset-storybook with per-cell status/staleness and re-run via work orders appended to `content/review-queue.json`.

**Architecture:** A tiny append-only ledger layer (`lib/run-ledger.mjs`) written by the existing generator scripts at run-completion boundaries; the asset-storybook (static ES modules, no server) renders pipeline rows by fetching the committed ledger files plus briefs, recomputing brief hashes client-side for staleness. Re-runs never execute anything — the UI exports updated `review-queue.json` (same byte-stable download pattern as the existing review export); the next human-run forge session consumes the orders.

**Tech Stack:** Node ESM scripts (`node:test` + `node:assert/strict`), plain ES-module frontend, `crypto.subtle` (browser) / `node:crypto` (scripts) sha256.

**Spec:** `spec.md` in this folder (approved 2026-08-25, prior-art survey folded in).
**Worktree:** implement in the F-050 feature worktree created by `psrw claim F-050`.

---

## Verified prior-art facts (from exploration, 2026-08-25)

- Generators: `tools/art-forge/generate/{blockin,env,charsheet,i2i,batch-matrix,townplan}.mjs`. **No script writes any state today** — only PNGs under `tools/art-forge/out/`.
- Blockin PNG: `tools/art-forge/out/depth/<briefId>.png` (`generate/env.mjs` ~line 530). Render download happens in `charsheet.mjs:589` (`runGraph()` → `path.join(forge.outDir, "<name>.png")`); env names look like `env/A1-ART-02-seed12345-s030.png`, `-hires` suffix for hires variant. Seed flows via `--seed N` → `parseSeed`.
- Gate: `tools/art-forge/artifact-gate.mjs`; CLI `node artifact-gate.mjs <img> [--json] [--corner-sheet out.png]`, exit 0 PASS / 1 FLAG; `--json` prints `{ ok, src, reasons[], metrics{laplacianSigma, corners, tiling}, cornerSheet? }`. `intake-art.mjs` imports `inspectImage` directly.
- Intake: `tools/art-forge/intake-art.mjs` — transactional validate→snapshot→copy→manifest-entry→drift-gate→rollback. Manifest: `game-client/assets/art/art-manifest.json`; entries `{ group, title, file, note, gen?, artifactGate? }`; `--skip-artifact-gate "<reason>"` records `artifactGate: { skipped: true, reason }` (`intake-art.mjs:309-340`).
- Review queue: `content/review-queue.json` exists as `{ "version": 1, "verdicts": {} }`; verdict schema enforced in `tools/asset-storybook/js/review/store.mjs` (sorted-key byte-stable export at lines 106–111); fetched non-critically by `js/main.mjs:143-155`. **No art-forge script consumes it yet.**
- Storybook: static page, doc-root = repo root, nginx image. Tabs mounted via nav-mount pattern (`mountCombatNav/mountCombatLab` in `js/combat-lab.mjs`, `mountStoryNav/mountStory` in `js/story.mjs`). URLs centralized in `js/state.mjs`. Infra: `js/view/VirtualGrid.mjs`, `js/sidebar.mjs`, `js/view/Card.mjs`, `js/view/DetailOverlay.mjs`. Tests: `tools/asset-storybook/tests/*.test.mjs`, run in CI (`.github/workflows/ci.yml:117`).
- Briefs: `tools/art-forge/briefs/<briefId>.json` — `{ id, subject, prompt, width, height, horizon, focal, _note, masses[] }`.
- Hashing precedent: `scripts/lib/thumbkey.mjs` — sha256-hex truncated to 16 chars. Reuse that convention.

---

## File Structure

```
tools/art-forge/
  lib/
    brief-hash.mjs          # NEW — normalizeBrief() + briefHash() (sha256, 16 hex)
    run-ledger.mjs          # NEW — readLedger()/appendAttempt(), header + one-line entries
  runs/
    <briefId>.json          # NEW (generated at run time, committed) — ledger per brief
    _index.json             # NEW (generated) — list of briefIds having ledgers
  ledger-index.mjs          # NEW — rebuilds runs/_index.json
  tests/
    brief-hash.test.mjs     # NEW
    run-ledger.test.mjs     # NEW
    ledger-index.test.mjs   # NEW — parity: every brief with attempts is indexed
  artifact-gate.mjs         # MODIFY — --ledger <briefId> tees verdict into ledger
  intake-art.mjs            # MODIFY — append intake entry (+ skip reason)
  generate/blockin.mjs      # MODIFY — append blockin entry after PNG written
  generate/env.mjs          # MODIFY — append render entry per downloaded PNG
tools/asset-storybook/
  js/state.mjs              # MODIFY — RUNS_INDEX_URL, RUNS_BASE_URL, BRIEFS_BASE_URL
  js/forge/nav.mjs          # NEW — mountForgeNav() sidebar item + container (nav-mount pattern)
  js/forge/pipeline.mjs     # NEW — buildPipelineRow(): cells from ledger entries
  js/forge/staleness.mjs    # NEW — pure: computeStale(attempts, currentBriefHash)
  js/forge/forge.mjs        # NEW — mountForge(): fetch ledgers + briefs, render rows, detail overlay
  js/review/store.mjs       # MODIFY — workOrders array support in load/validate/export
  js/main.mjs               # MODIFY — wire Forge tab into init()
  tests/forge-staleness.test.mjs   # NEW
  tests/review-store-workorders.test.mjs # NEW
content/review-queue.json  # MODIFIED over time — gains "workOrders": []
docs/agents/… README        # MODIFY — tools/art-forge/README.md documents ledger + work orders
```

**Ledger file format** (D2 + OQ1): line 1 is a header object; every later line is ONE compact JSON entry (git-friendly diffs):

```
{"v":1,"briefId":"A1-ART-02"}
{"type":"blockin","ts":"2026-08-25T10:00:00Z","briefHash":"3f9c…","out":"out/depth/A1-ART-02.png"}
{"type":"render","ts":"…","seed":42,"hires":false,"out":"out/env/A1-ART-02-seed0042-s030.png","briefHash":"3f9c…"}
{"type":"gate","ts":"…","png":"out/env/A1-ART-02-seed0042-s030.png","ok":true,"reasons":[],"cornerSheet":null}
{"type":"gate-skipped","ts":"…","png":"out/env/….png","reason":"<mandatory reason>"}
{"type":"intake","ts":"…","assetKey":"environment/a1-art-02","manifest":"game-client/assets/art/art-manifest.json"}
```

Append = `fs.appendFileSync(path, "\n" + JSON.stringify(entry))`. Never rewrite earlier lines.

**Work order shape** (new `workOrders` array in `content/review-queue.json`):

```json
{ "id": "wo-A1-ART-03-render-1748200000000",
  "briefId": "A1-ART-03", "cell": "render",
  "seed": 44, "reason": "flagged: low SW corner score", "createdAt": "2026-08-25T12:00:00.000Z" }
```

---

### Task 1: Brief hashing (`lib/brief-hash.mjs`)

**Files:**
- Create: `tools/art-forge/lib/brief-hash.mjs`
- Test: `tools/art-forge/tests/brief-hash.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tools/art-forge/tests/brief-hash.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBrief, briefHash } from "../lib/brief-hash.mjs";

const brief = {
  id: "A1-ART-02", subject: "grove", prompt: "a grove", width: 1024, height: 640,
  _note: "scratch thought that must NOT affect identity",
  masses: [{ plane: "bg", kind: "rect", x: 0, y: 0, w: 10, h: 5, color: "#223344" }],
};

test("normalization drops _note and sorts keys", () => {
  const n = JSON.parse(normalizeBrief(brief));
  assert.equal("_note" in n, false);
  assert.deepEqual(Object.keys(n), [
    "height", "id", "masses", "prompt", "subject", "width",
  ]);
});

test("briefHash is stable, 16-hex, ignores key order and _note", () => {
  const reordered = { masses: brief.masses, _note: "x", height: 640, id: "A1-ART-02", prompt: "a grove", subject: "grove", width: 1024 };
  const h1 = briefHash(brief);
  assert.match(h1, /^[0-9a-f]{16}$/);
  assert.equal(h1, briefHash(reordered));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tools/art-forge/tests/brief-hash.test.mjs` (from repo root)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// tools/art-forge/lib/brief-hash.mjs
import { createHash } from "node:crypto";

const DROP_KEYS = new Set(["_note"]);

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).filter(([k]) => !DROP_KEYS.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, sortValue(val)]),
    );
  }
  return v;
}

export function normalizeBrief(brief) {
  return JSON.stringify(sortValue(brief));
}

export function briefHash(brief) {
  return createHash("sha256").update(normalizeBrief(brief)).digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit** `feat(art-forge): brief normalization + identity hash`

---

### Task 2: Run ledger (`lib/run-ledger.mjs`)

**Files:**
- Create: `tools/art-forge/lib/run-ledger.mjs`
- Test: `tools/art-forge/tests/run-ledger.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tools/art-forge/tests/run-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAttempt, readLedger, ledgerPath } from "../lib/run-ledger.mjs";

function tmpRuns() {
  return mkdtempSync(join(tmpdir(), "ledger-"));
}

test("appendAttempt creates header then appends one-line entries", () => {
  const dir = tmpRuns();
  try {
    appendAttempt(dir, "A1-ART-02", { type: "render", seed: 42, hires: false });
    appendAttempt(dir, "A1-ART-02", { type: "gate", ok: false, reasons: ["blur"] });
    const lines = readFileSync(ledgerPath(dir, "A1-ART-02"), "utf8").trim().split("\n");
    assert.equal(lines.length, 3);
    assert.deepEqual(JSON.parse(lines[0]), { v: 1, briefId: "A1-ART-02" });
    assert.equal(JSON.parse(lines[1]).seed, 42);
    // each entry is exactly one line, ts injected once
    const entry = JSON.parse(lines[1]);
    assert.ok(entry.ts && entry.type === "render");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readLedger returns {header, attempts}", () => {
  const dir = tmpRuns();
  try {
    appendAttempt(dir, "B", { type: "blockin" });
    const { header, attempts } = readLedger(dir, "B");
    assert.equal(header.briefId, "B");
    assert.equal(attempts.length, 1);
    assert.equal(readLedger(dir, "missing"), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run — expected FAIL (module not found)**

- [ ] **Step 3: Implement**

```js
// tools/art-forge/lib/run-ledger.mjs
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function ledgerPath(runsDir, briefId) {
  return join(runsDir, `${briefId}.json`);
}

export function appendAttempt(runsDir, briefId, entry) {
  const p = ledgerPath(runsDir, briefId);
  if (!existsSync(p)) {
    appendFileSync(p, JSON.stringify({ v: 1, briefId }));
  }
  appendFileSync(p, "\n" + JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

export function readLedger(runsDir, briefId) {
  const p = ledgerPath(runsDir, briefId);
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, "utf8").trim().split("\n");
  return { header: JSON.parse(lines[0]), attempts: lines.slice(1).map((l) => JSON.parse(l)) };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit** `feat(art-forge): append-only per-brief run ledger`

---

### Task 3: Wire generators + gate + intake to the ledger

**Files:**
- Modify: `tools/art-forge/generate/blockin.mjs` (after depth PNG write, `out/depth/<briefId>.png`)
- Modify: `tools/art-forge/generate/env.mjs` (after each successful `runGraph()` download; once per base PNG, once per `-hires` PNG; include resolved seed + `hires: boolean`)
- Modify: `tools/art-forge/artifact-gate.mjs` (add `--ledger <briefId>` flag)
- Modify: `tools/art-forge/intake-art.mjs` (after successful manifest entry AND in the skip path)

Each modification follows the same micro-loop:

- [ ] **Step 1 (each site): import + append.** Common pattern:

```js
import { appendAttempt } from "../lib/run-ledger.mjs";
// runsDir is fixed relative to this script:
const RUNS_DIR = new URL("../runs/", import.meta.url).pathname;
```

Site-specific entries:

```js
// blockin.mjs — right after the depth PNG is confirmed on disk:
appendAttempt(RUNS_DIR, brief.id, { type: "blockin", briefHash: briefHash(brief),
  out: `out/depth/${brief.id}.png` });

// env.mjs — right after each downloaded PNG (base AND hires pass):
appendAttempt(RUNS_DIR, brief.id, { type: "render", seed: resolvedSeed,
  hires: isHiresPass, briefHash: briefHash(brief), out: `out/${relName}` });

// artifact-gate.mjs — when --ledger <briefId> is passed, before exit (both PASS and FLAG):
appendAttempt(RUNS_DIR, briefId, { type: "gate", png: srcRel, ok: result.ok,
  reasons: result.reasons, cornerSheet: cornerSheetPath ?? null });

// intake-art.mjs — after the manifest entry commits:
appendAttempt(RUNS_DIR, brief.id, { type: "intake", assetKey: entry.file,
  manifest: "game-client/assets/art/art-manifest.json" });

// intake-art.mjs — inside the existing --skip-artifact-gate branch (intake-art.mjs:309-340):
appendAttempt(RUNS_DIR, brief.id, { type: "gate-skipped", png: sourceRel, reason: skipReason });
```

- [ ] **Step 2: Verify by hand (no live GPU needed).** Fake a minimal run:

```bash
cd tools/art-forge
node -e "import('./lib/run-ledger.mjs').then(m => m.appendAttempt('./runs/','A1-ART-02',{type:'render',seed:1,hires:false,out:'x.png'}))"
cat runs/A1-ART-02.json
```

Expected: header line + one render line.

- [ ] **Step 3: Commit** `feat(art-forge): generators, gate, and intake append run-ledger entries`

Note: ledger files land in git via normal commits of `tools/art-forge/runs/` — ensure `.gitignore` does NOT exclude `out/`-style patterns for `runs/`.

---

### Task 4: Ledger index + parity test

**Files:**
- Create: `tools/art-forge/ledger-index.mjs`
- Create: `tools/art-forge/runs/_index.json` (generated)
- Test: `tools/art-forge/tests/ledger-index.test.mjs`

- [ ] **Step 1: Failing test**

```js
// tools/art-forge/tests/ledger-index.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildIndex } from "../ledger-index.mjs";

test("index lists every brief with a ledger and nothing else", () => {
  const dir = mkdtempSync(join(tmpdir(), "idx-"));
  try {
    writeFileSync(join(dir, "A1-ART-02.json"), '{"v":1,"briefId":"A1-ART-02"}\n{"type":"render"}\n');
    writeFileSync(join(dir, "_stray.txt"), "ignore me");
    const idx = rebuildIndex(dir);
    assert.deepEqual(idx, { v: 1, briefs: ["A1-ART-02"] });
    const onDisk = JSON.parse(readFileSync(join(dir, "_index.json"), "utf8"));
    assert.deepEqual(onDisk.briefs, ["A1-ART-02"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run — FAIL (not found)**

- [ ] **Step 3: Implement**

```js
// tools/art-forge/ledger-index.mjs
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function rebuildIndex(runsDir) {
  const briefs = readdirSync(runsDir)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  const index = { v: 1, briefs };
  writeFileSync(join(runsDir, "_index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rebuildIndex(new URL("./runs/", import.meta.url).pathname);
  console.log("runs/_index.json rebuilt");
}
```

- [ ] **Step 4: Run — PASS. Also run the whole suite:** `node --test tools/art-forge/tests/` — all green.
- [ ] **Step 5: Commit** `feat(art-forge): ledger index for storybook consumption`

---

### Task 5: Work-order schema in review queue (`js/review/store.mjs`)

**Files:**
- Modify: `tools/asset-storybook/js/review/store.mjs` (validate/load/export alongside `verdicts`)
- Modify: `content/review-queue.json` (add `"workOrders": []` so the key always exists)
- Test: `tools/asset-storybook/tests/review-store-workorders.test.mjs`

Follow the existing verdict patterns in `store.mjs` (validation rules, sorted-key byte-stable export at lines 106–111).

- [ ] **Step 1: Failing test**

```js
// tools/asset-storybook/tests/review-store-workorders.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQueue, serializeQueue, addWorkOrder } from "../js/review/store.mjs";

const base = { version: 1, verdicts: {}, workOrders: [] };

test("addWorkOrder appends with id + createdAt, validates cell", () => {
  const q = addWorkOrder(base, { briefId: "A1-ART-03", cell: "render", seed: 44, reason: "flagged" });
  assert.equal(q.workOrders.length, 1);
  const wo = q.workOrders[0];
  assert.match(wo.id, /^wo-A1-ART-03-render-\d+$/);
  assert.ok(wo.createdAt);
  assert.throws(() => addWorkOrder(base, { briefId: "X", cell: "explode", reason: "r" }));
  assert.throws(() => addWorkOrder(base, { briefId: "X", cell: "gate" })); // reason required
});

test("serializeQueue is byte-stable across calls (sorted keys)", () => {
  const q = addWorkOrder(base, { briefId: "A1-ART-03", cell: "render", seed: 44, reason: "flagged" });
  assert.equal(serializeQueue(q), serializeQueue(q));
});

test("parseQueue accepts legacy file without workOrders key", () => {
  const q = parseQueue(JSON.stringify({ version: 1, verdicts: {} }));
  assert.deepEqual(q.workOrders, []);
});
```

- [ ] **Step 2: Run — FAIL. Step 3: implement** `parseQueue` (defaults missing `workOrders` to `[]`), `addWorkOrder` (validates `cell ∈ {blockin, render, gate, intake}`, non-empty `reason`, optional integer `seed ≥ 0`, injects monotonic `id` + ISO `createdAt`), and extend the existing byte-stable serializer to cover `workOrders` (array order preserved — append-only semantics). **Step 4: run** `node --test tools/asset-storybook/tests/` **— all green (existing review-store tests must still pass).**
- [ ] **Step 5: Commit** `feat(storybook): work-order schema for forge re-runs in review queue`

---

### Task 6: Staleness logic (`js/forge/staleness.mjs`)

**Files:**
- Create: `tools/asset-storybook/js/forge/staleness.mjs`
- Test: `tools/asset-storybook/tests/forge-staleness.test.mjs`

Pure functions, no DOM — browser sha256 via `crypto.subtle` (async).

- [ ] **Step 1: Failing test**

```js
// tools/asset-storybook/tests/forge-staleness.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalBriefString, digestHex, markStale } from "../js/forge/staleness.mjs";

test("canonicalBriefString sorts keys and drops _note", () => {
  const s = canonicalBriefString({ b: 2, a: 1, _note: "x" });
  assert.equal(s, '{"a":1,"b":2}');
});

test("markStale flags only attempts whose briefHash differs from current", async () => {
  const cur = await digestHex('{"a":1}');
  const attempts = [
    { type: "render", briefHash: cur },
    { type: "render", briefHash: "dead0000dead0000" },
    { type: "gate" }, // no hash — inherits staleness of referenced png's render
  ];
  const flags = markStale(attempts, cur);
  assert.deepEqual(flags, [false, true, false]);
});
```

- [ ] **Step 2: Run — FAIL. Step 3: implement**

```js
// tools/asset-storybook/js/forge/staleness.mjs
const DROP = new Set(["_note"]);

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k))
      .sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, sortValue(val)]));
  }
  return v;
}

export function canonicalBriefString(brief) {
  return JSON.stringify(sortValue(brief));
}

export async function digestHex(canonical) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function markStale(attempts, currentHash) {
  const staleByPng = new Map();
  for (const a of attempts) {
    if (a.type === "render") staleByPng.set(a.out, a.briefHash !== currentHash);
  }
  return attempts.map((a) =>
    a.type === "render" ? a.briefHash !== currentHash
    : a.type === "gate" || a.type === "gate-skipped" ? (staleByPng.get(a.png) ?? false)
    : false);
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** `feat(storybook): brief-hash staleness detection for forge cells`

---

### Task 7: Pipeline row builder (`js/forge/pipeline.mjs`)

**Files:**
- Create: `tools/asset-storybook/js/forge/pipeline.mjs`

No separate unit file needed beyond Task 6's tests — this is DOM assembly; verify visually in Task 8.

- [ ] **Step 1: Implement.** Exports `buildPipelineRow({ briefId, ledger, currentHash })` returning a row element: brief-id label + ordered cells derived from `ledger.attempts`:

```js
// tools/asset-storybook/js/forge/pipeline.mjs
export const CELL_STATUS = { done: "done", flag: "flag", failed: "failed", stale: "stale", notrun: "notrun" };

export function buildPipelineRow({ briefId, attempts, staleFlags }) {
  const row = document.createElement("div");
  row.className = "forge-row";
  const label = document.createElement("span");
  label.className = "forge-brief-id";
  label.textContent = briefId;
  row.append(label);

  let anyStale = false;
  attempts.forEach((a, i) => {
    const cell = document.createElement("button");
    cell.className = "forge-cell";
    cell.dataset.entryIndex = String(i);
    const labelTxt =
      a.type === "blockin" ? "blockin"
      : a.type === "render" ? `render s${a.seed}${a.hires ? " hi" : ""}`
      : a.type === "gate" ? "gate"
      : a.type === "gate-skipped" ? "gate ⤼skip"
      : a.type === "intake" ? "intake" : a.type;
    cell.textContent = labelTxt;
    let status = CELL_STATUS.done;
    if (a.type === "gate" && !a.ok) status = CELL_STATUS.flag;
    if (staleFlags[i]) { status = CELL_STATUS.stale; anyStale = true; }
    cell.classList.add(`is-${status}`);
    row.append(cell);
  });

  // trailing not-run placeholders so pipelines read left→right consistently:
  const seen = new Set(attempts.map((a) => a.type));
  for (const stage of ["blockin", "render", "gate", "intake"]) {
    if (!seen.has(stage)) {
      const ph = document.createElement("span");
      ph.className = "forge-cell is-notrun";
      ph.textContent = stage;
      row.append(ph);
    }
  }
  row.dataset.anyStale = String(anyStale);
  return row;
}
```

- [ ] **Step 2: Commit** `feat(storybook): forge pipeline row builder`

---

### Task 8: Forge tab wiring (`nav.mjs`, `forge.mjs`, `state.mjs`, `main.mjs`, CSS)

**Files:**
- Create: `tools/asset-storybook/js/forge/nav.mjs`, `tools/asset-storybook/js/forge/forge.mjs`
- Modify: `tools/asset-storybook/js/state.mjs` (add `RUNS_INDEX_URL = "../../tools/art-forge/runs/_index.json"`, `RUNS_BASE_URL = "../../tools/art-forge/runs/"`, `BRIEFS_BASE_URL = "../../tools/art-forge/briefs/"` — match the existing relative-path style used by `REVIEW_QUEUE_URL`)
- Modify: `tools/asset-storybook/js/main.mjs` `init()` — register the Forge nav item using the same pattern as `mountCombatNav/mountCombatLab` (`js/combat-lab.mjs`)
- Modify: storybook stylesheet (wherever combat-lab/story styles live)

- [ ] **Step 1: nav.mjs** — mirror the combat-lab nav-mount signature exactly (read `js/combat-lab.mjs` first and copy its nav-item construction; do not invent a second sidebar mechanism):

```js
// tools/asset-storybook/js/forge/nav.mjs
import { mountForge } from "./forge.mjs";

export function mountForgeNav(sidebarEl, contentEl) {
  // buildSidebarItem()-shaped item labeled "Forge"; onclick → mountForge(contentEl)
  // (copy the exact item-construction calls from js/combat-lab.mjs's mountCombatNav)
}
```

- [ ] **Step 2: forge.mjs** — `mountForge(container)`:
  1. `fetchJson(RUNS_INDEX_URL)` (reuse `js/state.mjs` helper; treat 404 as empty state: "No forge runs recorded yet").
  2. For each briefId: fetch `RUNS_BASE_URL + briefId + ".json"` and `BRIEFS_BASE_URL + briefId + ".json"` (brief fetch is optional — absence just disables staleness for that row).
  3. Compute current hash per brief via `staleness.digestHex(canonicalBriefString(brief))`; `markStale(...)`; `buildPipelineRow(...)`.
  4. Cell click → reuse `js/view/DetailOverlay.mjs` showing: entry JSON pretty-printed, link to the PNG (`../../tools/art-forge/` + `out` path) and corner sheet when present, gate reasons list, skip reason when `gate-skipped`.
  5. Below rows: "Pending work orders" section fetching `REVIEW_QUEUE_URL` and listing `workOrders[]` (cell, seed, reason, createdAt) with done/not-done state (an order is *done* when a matching newer attempt exists in the ledger — match on `briefId + cell [+ seed]` with attempt `ts > createdAt`).
  6. "Export work orders" button → uses the same byte-stable export/download flow as the review export in `js/review/store.mjs` (browser download; human commits the file). **Never fetch/POST to any generation endpoint.**

- [ ] **Step 3: Verify visually.** Serve repo root (`python3 -m http.server 8080` from repo root), open `http://localhost:8080/tools/asset-storybook/index.html`, click Forge tab. Seed two fake ledgers by hand-copying the fixture lines from Task 2's test into temporary `runs/` files if no real runs exist yet (remove after screenshotting). Expected: two rows, statuses rendered, detail overlay opens, stale cell styled distinctly.

- [ ] **Step 4: Commit** `feat(storybook): Forge tab — pipeline view, detail overlay, work orders`

---

### Task 9: Re-run button → work order export

**Files:**
- Modify: `tools/asset-storybook/js/forge/forge.mjs`

- [ ] **Step 1:** Add a "↻ re-run" affordance per cell (except `intake`): clicking opens a small inline form (reason textarea, seed input shown only for `render`); submit calls `addWorkOrder(queue, { briefId, cell, seed, reason })` and refreshes the pending-orders list. Export button (Task 8) serializes via `serializeQueue`.
- [ ] **Step 2:** Extend `tests/review-store-workorders.test.mjs` with the round-trip used by the UI: parse exported string → `parseQueue` → same work orders back (byte-stable round-trip guarantee).
- [ ] **Step 3:** Manual check: create a work order for `A1-ART-02 render s44`, export, confirm the downloaded JSON diff is exactly one added array element against `content/review-queue.json`.
- [ ] **Step 4: Commit** `feat(storybook): per-cell re-run issues work orders (download-only)`

---

### Task 10: Docs + final gates

- [ ] **Step 1:** Update `tools/art-forge/README.md`: ledger concept + file format, `--ledger` flag, work-order consumption during forge sessions (read `content/review-queue.json` → execute → append attempts → delete fulfilled orders in the same commit).
- [ ] **Step 2:** Full verification:

```bash
node --test tools/art-forge/tests/
node --test tools/asset-storybook/tests/
```

Expected: all suites pass (this is what CI runs, `.github/workflows/ci.yml:117` covers the storybook side).

- [ ] **Step 3:** Quality gate: dispatch independent adversarial review of the full diff (code-reviewer agent), act on findings, re-run both suites. Then `psrw ship F-050` per release workflow.

---

## Non-goal reminders (from spec)

- No browser-triggered generation, no server component, no ComfyUI calls from UI — ever.
- No live tailing; ledger updates at run-completion boundaries; refresh is fine.
- No dashboards for townplan/other generators.
- Re-runs: append-only, non-cascading (downstream marked stale, display-only); promotion of a test render into the chain is an explicit human follow-up.
