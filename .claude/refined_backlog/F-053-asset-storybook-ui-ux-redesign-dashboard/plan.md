# F-053 Phase 1: Forge Runs page usable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (owner, verbatim):** "want usable forge pipeline page, and functions"

**This plan's slice:** the asset storybook's Forge tab loads, shows one pipeline row per art-forge brief, shows missing local renders as one notice per batch, keeps work orders across a reload, ships its data in the storybook image, and is guarded by a CSS parse test plus a headless smoke test in Gate 1 (`scripts/precheck.sh`) and CI.

**Architecture:** Plain ES modules, no build step. Pure logic goes into node-testable modules (`js/forge/staleness.mjs`, `js/forge/pipeline.mjs`, `js/forge/gallery.mjs`, new `js/review/workorder-buffer.mjs`) and is covered by `node --test`. `js/forge/forge.mjs` stays a thin DOM layer on top. The smoke test starts a zero-dependency `node:http` server and drives the system Chrome over the DevTools protocol through `--remote-debugging-pipe`. It needs no npm dependency.

**Tech Stack:** Node 18 (the CI pin, `.release.json` `nodeMajor`), `node:test`, vanilla DOM, system Google Chrome, nginx image (`atelier/asset-storybook/Dockerfile`), GitHub Actions (`.github/workflows/ci.yml`).

**Spec:** `.claude/refined_backlog/F-053-asset-storybook-ui-ux-redesign-dashboard/spec.md`. This plan covers the Forge-relevant part of spec §9 Phase 0 (C0.1 unclosed CSS rule, C0.3 silent Forge tab, the CSS and smoke gates) plus the Forge parts of C2.8 (Forge data not in the image) and C2.9 (work orders only in memory), which the spec schedules for P1 and P3. They are pulled forward because the owner's goal is a usable Forge page now.

## Global Constraints

- No framework, bundler, TypeScript, CSS split, or **new npm dependency** (spec §2 non-goals). The smoke test uses only Node built-ins and the system Chrome.
- The page stays read-only: no server, no write endpoint, no browser-triggered generation. Spec AC 25: `git grep -n -E -e "method\s*:" -e sendBeacon -e "<form" -e XMLHttpRequest -- atelier/asset-storybook/js ':!atelier/asset-storybook/js/map-builder*.mjs'` must exit 1. So do **not** probe images with `fetch(..., { method: "HEAD" })`.
- Everything must run on **Node 18**, because CI installs the major from `.release.json` `nodeMajor`. Don't use the global `WebSocket`, `fetch`-only server code, or `node --test` glob expansion. Pass explicit file paths; the shell expands them.
- The existing tests `atelier/asset-storybook/tests/forge-staleness.test.mjs:158-167` (regexes `/malformed JSON line/` and `/expected a JSON object/`), `review-store-workorders.test.mjs`, `forge-export-effective.test.mjs` and `forge-gallery.test.mjs` stay **unedited and green**.
- `localStorage` access is always wrapped in try/catch, and the page renders correctly without it (spec §6.5).
- UI copy, verbatim (from the owner's "Forge" component list): `no ledger yet`, `png missing (local only)`, `saved in this browser`, `reason required`, `not packaged in this image`, `source failed`, `all fresh`, `ledger <brief>.json unreadable (line N)`.
- Commits: conventional subjects, one per task, **never `--amend`**, `git add` explicit paths only.
- **Do not run `atelier/art-forge/tests/blockin.test.mjs` or `atelier/art-forge/tests/env-graph.test.mjs` before Task 2 Step 5 is committed.** Both append to the tracked ledger `atelier/art-forge/runs/A1-ART-02.json` today. If the art-forge suite has to run earlier, pass explicit file paths that leave those two out.
- **Red on behaviour, not on import.** A test file that imports a name which doesn't exist yet fails as a whole at load time, which proves nothing about the assertions. Before every "Run and confirm failure" step that expects `does not provide an export named …` or `Cannot find module …`, first add **stub exports** with the final names (constants as `undefined` / `[]`, functions that `throw new Error("not implemented")`; for a new module, create the file with only those stubs). Then run the red step: the file must load and the **assertions** must fail. Commit the stubs together with the real implementation, not separately.
- All commands run from the worktree root: `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-053-asset-storybook-ui-ux-redesign-dashboard`. **Suite** means `node --test atelier/asset-storybook/tests/*.test.mjs` (107 tests pass at `a5644cbd`).

---

## Premise check (verified at `a5644cbd`, 2026-09-14)

| # | Premise given | Verified | Result |
|---|---|---|---|
| 1a | `index.html:~1025` `.maps-overlay-img {` never closes | `index.html:1025` opens it, `:1032` is its last declaration, and `:1033` is the F-050 comment followed by `.forge-rows {`. One `<style>` block ends at brace depth 1 | **Correct** |
| 1b | `runs/A1-ART-02.json:~186` is blank | Line 186 is empty. The file has 204 lines and no trailing newline | **Correct** |
| 1c | The reader crashes on blank lines | `js/forge/staleness.mjs:76-80` `parseLedgerText` throws on the blank line, and `js/forge/forge.mjs:366-369` swallows it with `console.warn` + `continue`, so the brief silently disappears | **Correct** |
| 2a | `run-ledger.mjs` appends `"\n"+entry` with no newline check | `atelier/art-forge/lib/run-ledger.mjs:28-31` does exactly that. `readLedger` (`:34-42`) `JSON.parse`s every line, blanks included | **Correct** |
| 2b | `blockin.test.mjs:~219` writes tmp entries into the committed ledger, 9 of them | `blockin.test.mjs:218-231` calls `renderDepthPng` with a tmp `outPath`, and `generate/blockin.mjs:154` appends to the module constant `RUNS_DIR`. Nine entries with `var/folders/...` `out` paths sit at lines 187, 189, …, 203 | **Correct, but incomplete** |
| 2b′ | (not given) | Each tmp entry is followed 0.19–0.47 s later by a `blockin` entry with the same `briefHash 9c10d497…` and `out: out/control/depth/A1-ART-02-depth.png` (lines 188, 190, …, 204). They come from `env-graph.test.mjs:263` (`generateEnv` `--dry-run` renders the depth control and appends at `generate/env.mjs:885` → `blockin.mjs:154`). **At least 18 test-written entries, not 9.** 18 is a lower bound: the ledger holds 117 `blockin` entries with that default depth `out`, and older `env-graph` dry-run entries written before `blockin.test.mjs` existed have no tmp partner, so they can't be told apart from real block-ins. Task 2 removes the 18 identifiable ones and isolates both test files | **Premise corrected** |
| 3 | `buildPipelineRow` has 0 callers | `git grep buildPipelineRow` finds only its definition, `js/forge/pipeline.mjs:19`. It also emits **one cell per attempt**, which would be 202 cells for A1-ART-02, so it is rebuilt around per-stage counts instead of just being wired in | **Correct, and the function needs reshaping** |
| 3′ | Briefs A1-ART-03/06/07 have no ledger | `atelier/art-forge/briefs/` holds 02, 03, 06 and 07. `runs/_index.json` lists only A1-ART-02. A static page cannot list a directory, so Task 3 adds a hand-maintained `forge-briefs-index.json` with a parity test (spec §7.1). Spec §7.1 puts it at `sb/forge-briefs-index.json`; `spec.md:12` defines `sb/` as shorthand for `atelier/asset-storybook/`, not a new directory. So the file lives at `atelier/asset-storybook/forge-briefs-index.json`, next to `env-index.json` / `maps-index.json`, exactly where the spec wants it, and no later move is needed. `runs/_index.json` is rebuilt only by hand (`atelier/art-forge/ledger-index.mjs`; `appendAttempt` never updates it, and no test checks it against `runs/*.json`), so Task 3 does **not** use it to decide "no ledger yet" (see Task 3 Step 5) | **Correct (location as spec)** |
| 4 | 58 of 59 PNGs are gitignored or local-only | The ledger has 59 `render` entries. **0 of 59** `out` PNGs are git-tracked (`atelier/art-forge/.gitignore`: `out/`, `*.png`), and the main checkout has 10 files in `out/env`. The page does **not** show broken-image icons today: `forge.mjs:127-134` swaps each failed `<img>` for a per-card "png missing — …" text, which repeats 59 times. Task 4 collapses that into one notice per batch **and keeps the cards clickable**, since run detail and ↻ work orders hang off the cards | **Count corrected, symptom restated** |
| 5 | Work orders are lost on reload | `forge.mjs:40` `const sessionOrders = []` lives only in module memory | **Correct** |
| 6 | Dockerfile + .dockerignore don't ship `atelier/art-forge` | `atelier/asset-storybook/Dockerfile:23-57` has no `atelier/art-forge` COPY. `atelier/asset-storybook/Dockerfile.dockerignore` is `*` plus a whitelist without art-forge. The storybook's `Dockerfile.dockerignore` (BuildKit's per-Dockerfile ignore) is the file that matters, not the root `.dockerignore` | **Correct (path: `atelier/asset-storybook/Dockerfile`)** |
| 7a | CI workflow filename | `.github/workflows/ci.yml`: storybook step at `:255-256`, art-forge step at `:284-285`. `scripts/precheck.sh` `storybook_tests()` is at `:167-171` and `art_forge_tests()` at `:163-165` | **Verified** |
| 7b | Existing headless tooling | No tracked `package.json` declares puppeteer or playwright. `puppeteer@14.4.1` exists only as a transitive dependency of `@asyncapi/html-template` (`pnpm-lock.yaml:3842` and `:9542`), is from 2022, and downloads its own Chromium, so it is not usable. System Chrome is present locally (`Google Chrome 152.0.7977.83`) and on `ubuntu-latest` (`google-chrome`). **Choice: a zero-dependency DevTools-protocol client over `--remote-debugging-pipe`.** The spec's `--dump-dom` + iframe harness (§9 "Smoke harness") cannot see console errors thrown by the storybook's own module scripts, and "no console errors" is an acceptance criterion here. The spec's other smoke contracts are kept: path `tests/smoke/run.mjs`, `$CHROME_BIN` exclusive, `SKIPPED: no Chrome` exit 0, `STORYBOOK_SMOKE_REQUIRED=1` exit 2, `SMOKE_BASE`, and server `fail`/`override` variants | **Deviation from spec, for the reason above** |
| — | The owner's "Forge" component list (design reference) | Not in the repo (`git grep` finds none of the copy strings). The copy is taken verbatim from the coordinator's brief | **Noted** |

**Filed, not fixed (out of scope):**
- `generateEnv --dry-run` is not side-effect free. It writes `out/control/depth/*.png` and appends a real `blockin` ledger entry (`generate/env.mjs:885-889`). Filed as a one-line note in "Follow-ups (filed, not fixed)" at the end of this plan.
- The two `env-index` cases are red on checkouts holding only part of `out/env` (spec §9 baseline, already known).

## File map

| File | Responsibility | Task |
|---|---|---|
| `atelier/asset-storybook/index.html` | close `.maps-overlay-img`; Forge CSS for rows, notice, saved label, errors | 1, 3, 4, 5 |
| `atelier/asset-storybook/tests/css-parse.test.mjs` (new) | brace walk over the `<style>` block | 1 |
| `atelier/asset-storybook/js/forge/staleness.mjs` | `parseLedgerText` skips blanks and reports physical line numbers | 1 |
| `atelier/asset-storybook/js/forge/pipeline.mjs` | pure row model + text helpers; DOM `buildPipelineRow(model)` | 1, 3 |
| `atelier/asset-storybook/tests/forge-ledger-blank-lines.test.mjs` (new) | parser + committed-ledger hygiene + error text | 1 |
| `atelier/art-forge/runs/A1-ART-02.json` | delete the blank line (T1) and 18 test-written entries (T2) | 1, 2 |
| `atelier/art-forge/lib/run-ledger.mjs` | newline-safe append, blank-safe read, `resolveRunsDir` | 2 |
| `atelier/art-forge/generate/blockin.mjs`, `generate/env.mjs`, `artifact-gate.mjs`, `intake-art.mjs` | ledger writers honour `ART_FORGE_RUNS_DIR` | 2 |
| `atelier/art-forge/tests/run-ledger.test.mjs`, `blockin.test.mjs`, `env-graph.test.mjs` | new ledger tests; test isolation | 2 |
| `atelier/asset-storybook/forge-briefs-index.json` (new) | the brief list the static page cannot discover | 3 |
| `atelier/asset-storybook/js/state.mjs` | `FORGE_BRIEFS_INDEX_URL` | 3 |
| `atelier/asset-storybook/tests/forge-briefs-index.test.mjs`, `forge-pipeline.test.mjs` (new) | parity + row model | 3 |
| `atelier/asset-storybook/js/forge/forge.mjs` | error row (T1), pipeline rows (T3), batch notice (T4), buffered orders (T5) | 1, 3, 4, 5 |
| `atelier/asset-storybook/js/forge/gallery.mjs` | `PNG_MISSING_LEAD`, `missingNoticeText` | 4 |
| `atelier/asset-storybook/tests/forge-missing-notice.test.mjs` (new) | notice copy | 4 |
| `atelier/asset-storybook/js/review/workorder-buffer.mjs` (new) + `tests/forge-workorder-buffer.test.mjs` (new) | localStorage buffer, pure | 5 |
| `atelier/asset-storybook/Dockerfile`, `Dockerfile.dockerignore`, `tests/dockerfile-forge.test.mjs` (new) | ship `atelier/art-forge/{runs,briefs}` | 6 |
| `atelier/asset-storybook/tests/smoke/{run.mjs,scenarios.mjs,fixtures/ledger-malformed.json}` (new) | headless smoke | 7 |
| `scripts/precheck.sh`, `.github/workflows/ci.yml` | wire the smoke + the ledger-untouched guard | 7 |

## Quality gate units (rule 7)

- **Gate A** after Tasks 1–2 (ledger + CSS integrity).
- **Gate B** after Tasks 3–5 (Forge page features).
- **Gate C** after Task 6 (deploy surface, on its own).
- **Gate D** after Task 7 (CI surface, on its own).

Each gate runs in order: verify (commands with visible exit codes), then an independent review of the unit's diff (`code-reviewer` + `typescript-reviewer`, `model: sonnet` for diffs under 200 lines), then `/simplify`, then re-verify. A finding is fixed before the next task starts, in a new commit.

---

### Task 1: Close the CSS rule, add the CSS parse test, and make ledger parse errors visible

**Files:**
- Modify: `atelier/asset-storybook/index.html:1032-1033` (insert `}`), plus `.source-error` CSS
- Create: `atelier/asset-storybook/tests/css-parse.test.mjs`
- Modify: `atelier/asset-storybook/js/forge/staleness.mjs:56-82` (`parseLedgerText`)
- Modify: `atelier/asset-storybook/js/forge/pipeline.mjs` (add `ledgerErrorText`)
- Modify: `atelier/asset-storybook/js/forge/forge.mjs:366-369`
- Modify: `atelier/art-forge/runs/A1-ART-02.json` (delete line 186 only)
- Create: `atelier/asset-storybook/tests/forge-ledger-blank-lines.test.mjs`

**Interfaces:**
- Produces: `parseLedgerText(text) → {header, attempts} | null`. It throws `Error` with an integer `.line` (1-based physical line) and messages containing `malformed JSON line` or `expected a JSON object`.
- Produces: `ledgerErrorText({ briefId, error }) → string`, exported from `js/forge/pipeline.mjs`.

- [ ] **Step 1: Write the failing CSS test** at `atelier/asset-storybook/tests/css-parse.test.mjs`

```js
// F-053 Phase 1 — stylesheet integrity gate (spec §9 Phase 0 "Gates", AC 1).
// C0.1: `.maps-overlay-img {` at index.html:1025 never closed, so Chrome's CSS
// nesting silently scoped the next 91 rules (the detail overlay and every
// Forge style) under it. Releases 1.8 and 1.9 shipped that way because
// nothing parsed the stylesheet. This test walks braces over the single
// <style> block: depth never negative, ends at 0, and no rule opens inside a
// rule (only @media/@supports/@keyframes/@layer/@container may contain rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NESTING_AT_RULE = /^@(media|supports|keyframes|layer|container)\b/;

// Replace every non-newline char of a match with a space, so line numbers survive.
const blank = (m) => m.replace(/[^\n]/g, " ");

function braceProblems(css, lineOffset = 0) {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, blank);
  const problems = [];
  const stack = [];
  let line = 1 + lineOffset;
  let preludeStart = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === "\n") line++;
    if (c === ";") preludeStart = i + 1;
    if (c === "{") {
      const prelude = clean.slice(preludeStart, i).trim().replace(/\s+/g, " ");
      const top = stack[stack.length - 1];
      if (top && top.kind === "rule") {
        problems.push(`line ${line}: "${prelude}" opens inside "${top.prelude}" (opened line ${top.line})`);
      }
      stack.push({ prelude, line, kind: NESTING_AT_RULE.test(prelude) ? "at" : "rule" });
      preludeStart = i + 1;
    }
    if (c === "}") {
      if (stack.length === 0) problems.push(`line ${line}: unmatched "}"`);
      else stack.pop();
      preludeStart = i + 1;
    }
  }
  for (const open of stack) problems.push(`line ${open.line}: "${open.prelude}" never closes`);
  return problems;
}

test("braceProblems flags an unclosed rule and the rule nested under it", () => {
  const problems = braceProblems(".a {\n  color: red;\n.b {\n  color: blue;\n}\n");
  assert.equal(problems.length, 2);
  assert.match(problems[0], /"\.b" opens inside "\.a"/);
  assert.match(problems[1], /"\.a" never closes/);
});

test("braceProblems accepts rules inside @media and @keyframes, and ignores braces in comments and strings", () => {
  const css =
    '/* { */ .a { content: "}"; }\n@media (max-width: 720px) { .a { color: red; } }\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n';
  assert.deepEqual(braceProblems(css), []);
});

test("index.html's stylesheet balances and nests no rule outside an at-rule", () => {
  const html = readFileSync(join(HERE, "..", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  assert.ok(blocks.length >= 1, "no <style> block found in index.html");
  for (const m of blocks) {
    const offset = html.slice(0, m.index + "<style>".length).split("\n").length - 1;
    assert.deepEqual(braceProblems(m[1], offset), []);
  }
});
```

- [ ] **Step 2: Run it and confirm it fails for the real reason**

Run: `node --test atelier/asset-storybook/tests/css-parse.test.mjs`
Expected: 2 pass, 1 FAIL. The diff lists `line 1035: ".forge-rows" opens inside ".maps-overlay-img" (opened line 1025)` … and `line 1025: ".maps-overlay-img" never closes`.

- [ ] **Step 3: Close the rule.** In `atelier/asset-storybook/index.html`, after line 1032 (`pointer-events: none; /* the stage, not the img, owns wheel/pointer handling */`), insert a line containing `      }` followed by a blank line, so `/* ---------- F-050: forge pipeline dashboard ---------- */` follows a closed rule. In the same file, right after the `.forge-cell.is-notrun { … }` rule, add:

```css
      .source-error {
        margin: 0.25rem 0;
        font-family: var(--mono);
        font-size: 0.72rem;
        color: var(--err);
      }
```

- [ ] **Step 4: Run the CSS test and confirm it passes**

Run: `node --test atelier/asset-storybook/tests/css-parse.test.mjs`
Expected: `ℹ pass 3`, `ℹ fail 0`.

- [ ] **Step 5: Write the failing ledger tests** at `atelier/asset-storybook/tests/forge-ledger-blank-lines.test.mjs`

```js
// F-053 Phase 1 — C0.3: a blank line in a run ledger made parseLedgerText
// throw, and forge.mjs swallowed the error, so the brief vanished from the
// Forge tab with no visible trace. Blank lines are now skipped, and a genuinely
// malformed line is named by its PHYSICAL line number in a visible row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLedgerText } from "../js/forge/staleness.mjs";
import { ledgerErrorText } from "../js/forge/pipeline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const HEADER = '{"v":1,"briefId":"A1"}';
const ENTRY = '{"ts":"2026-01-01T00:00:00Z","type":"blockin","briefHash":"x"}';

test("parseLedgerText skips blank and whitespace-only lines anywhere in the file", () => {
  const parsed = parseLedgerText(`\n${HEADER}\n\n${ENTRY}\n   \n${ENTRY}\n\n`);
  assert.equal(parsed.header.briefId, "A1");
  assert.equal(parsed.attempts.length, 2);
});

test("parseLedgerText reports the physical line number of a malformed line, counting blank lines", () => {
  assert.throws(
    () => parseLedgerText(`${HEADER}\n\n${ENTRY}\n{not json\n`),
    (err) => err.line === 4 && /line 4/.test(err.message) && /malformed JSON line/.test(err.message),
  );
});

test("the committed A1-ART-02 ledger has no blank lines and parses", () => {
  const text = readFileSync(join(REPO_ROOT, "atelier/art-forge/runs/A1-ART-02.json"), "utf8");
  const blankLines = text
    .replace(/\n$/, "")
    .split("\n")
    .map((l, i) => (l.trim() === "" ? i + 1 : null))
    .filter((n) => n !== null);
  assert.deepEqual(blankLines, [], "blank lines in atelier/art-forge/runs/A1-ART-02.json");
  assert.ok(parseLedgerText(text).attempts.length > 0);
});

test("ledgerErrorText names the ledger file, the line when known, and the message", () => {
  const withLine = Object.assign(new Error("ledger attempt on line 3: malformed JSON line: {x"), { line: 3 });
  assert.equal(
    ledgerErrorText({ briefId: "A1-ART-02", error: withLine }),
    "ledger A1-ART-02.json unreadable (line 3): ledger attempt on line 3: malformed JSON line: {x",
  );
  assert.equal(
    ledgerErrorText({ briefId: "A1-ART-02", error: new Error("ledger A1-ART-02: HTTP 404") }),
    "ledger A1-ART-02.json unreadable: ledger A1-ART-02: HTTP 404",
  );
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `node --test atelier/asset-storybook/tests/forge-ledger-blank-lines.test.mjs`
Expected: FAIL. Without stubs the import error `does not provide an export named 'ledgerErrorText'` fails the whole file, so first add a stub `export function ledgerErrorText() { throw new Error("not implemented"); }` to `js/forge/pipeline.mjs` (Global Constraints, "Red on behaviour"). With the stub in place the file loads and the blank-line parser and error-text assertions fail.

- [ ] **Step 7: Implement.** Replace the body of `parseLedgerText` in `atelier/asset-storybook/js/forge/staleness.mjs` (lines 56-82) with:

```js
export function parseLedgerText(text) {
  if (typeof text !== "string" || text.trim() === "") return null;

  function fail(lineNo, what, detail) {
    const err = new Error(`ledger ${what} on line ${lineNo}: ${detail}`);
    err.line = lineNo;
    return err;
  }

  function parseLine(line, lineNo, what) {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw fail(lineNo, what, `malformed JSON line: ${line.slice(0, 120)}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw fail(lineNo, what, `expected a JSON object on line "${line.slice(0, 120)}"`);
    }
    return value;
  }

  // Blank lines are skipped (a hand edit or an append after a trailing
  // newline leaves one); line numbers stay PHYSICAL so the error row points
  // at the line a human opens in an editor.
  let header = null;
  const attempts = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    if (header === null) header = parseLine(line, i + 1, "header");
    else attempts.push(parseLine(line, i + 1, "attempt"));
  });
  return { header, attempts };
}
```

Also update the JSDoc `@throws` above it to: `@throws {Error} with .line (1-based physical line) on a malformed line; blank lines are skipped.`

Append to `atelier/asset-storybook/js/forge/pipeline.mjs`:

```js
/**
 * Visible text for a ledger that could not be read (fetch failure or a
 * malformed line). Never silent: forge.mjs renders this as a row.
 * @param {{ briefId: string, error: Error & { line?: number } }} opts
 */
export function ledgerErrorText({ briefId, error }) {
  const where = Number.isInteger(error && error.line) ? ` (line ${error.line})` : "";
  const message = error && error.message ? error.message : String(error);
  return `ledger ${briefId}.json unreadable${where}: ${message}`;
}
```

In `atelier/asset-storybook/js/forge/forge.mjs`, add `import { ledgerErrorText } from "./pipeline.mjs";` next to the gallery import (line 24), and replace the catch block at lines 366-369 with:

```js
    } catch (err) {
      console.warn("[asset-storybook] ledger unavailable for " + briefId, err);
      const errLine = document.createElement("p");
      errLine.className = "source-error";
      errLine.dataset.error = "ledger";
      errLine.textContent = ledgerErrorText({ briefId, error: err });
      rowsHost.appendChild(errLine);
      continue;
    }
```

Delete the blank line 186 of the committed ledger. Removing only that line leaves every other byte untouched:

```bash
node -e '
const fs = require("fs");
const p = "atelier/art-forge/runs/A1-ART-02.json";
const lines = fs.readFileSync(p, "utf8").split("\n");
if (lines[185] !== "") throw new Error("line 186 is not blank: " + JSON.stringify(lines[185]));
lines.splice(185, 1);
fs.writeFileSync(p, lines.join("\n"));
console.log("lines now", lines.length);
'
```
Expected output: `lines now 203`.

- [ ] **Step 8: Run the new tests and the full suite**

Run: `node --test atelier/asset-storybook/tests/forge-ledger-blank-lines.test.mjs`
Expected: `ℹ pass 4`, `ℹ fail 0`.
Run: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`. The count is 107 + 3 + 4. If the local `out/env` holds only some renders, the 2 known env-index cases may be red; name them if so.

- [ ] **Step 9: Manual check**

Run: `python3 -m http.server 6007` from the worktree root (6006 is the image port; use 6007 silently if taken). Open `http://localhost:6007/atelier/asset-storybook/index.html` in Chrome, click the **Forge** sidebar item, then click any Forge card. Expected: the Forge rows are styled, and the detail overlay opens as a fixed full-screen panel, not an unstyled fragment at the page bottom. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add atelier/asset-storybook/index.html atelier/asset-storybook/tests/css-parse.test.mjs \
  atelier/asset-storybook/js/forge/staleness.mjs atelier/asset-storybook/js/forge/pipeline.mjs \
  atelier/asset-storybook/js/forge/forge.mjs atelier/asset-storybook/tests/forge-ledger-blank-lines.test.mjs \
  atelier/art-forge/runs/A1-ART-02.json
git commit -m "fix(F-053): close unclosed CSS rule, skip blank ledger lines, show unreadable ledgers"
```

---

### Task 2: Newline-safe ledger writer, test isolation, and removing test-written entries

**Files:**
- Modify: `atelier/art-forge/lib/run-ledger.mjs` (whole file, 42 lines)
- Modify: `atelier/art-forge/generate/blockin.mjs:7,154`; `atelier/art-forge/generate/env.mjs:112,993,1046,1092,1143,1179`; `atelier/art-forge/artifact-gate.mjs:41,713`; `atelier/art-forge/intake-art.mjs:61,332,465`
- Modify: `atelier/art-forge/tests/run-ledger.test.mjs`, `atelier/art-forge/tests/blockin.test.mjs`, `atelier/art-forge/tests/env-graph.test.mjs`
- Modify: `atelier/art-forge/runs/A1-ART-02.json` (remove 18 entries)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RUNS_DIR_ENV = "ART_FORGE_RUNS_DIR"`; `resolveRunsDir({ defaultDir }) → string`; `appendAttempt(runsDir, briefId, entry)` (signature unchanged; every write now ends in `\n`); `readLedger(runsDir, briefId) → {header, attempts} | null`, which throws `Error` with `.line` and a message starting `<path>:<line>:`.

- [ ] **Step 1: Write the failing tests.** In `atelier/art-forge/tests/run-ledger.test.mjs`, change the imports to:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAttempt,
  readLedger,
  ledgerPath,
  resolveRunsDir,
  RUNS_DIR_ENV,
} from "../lib/run-ledger.mjs";
```

and append:

```js
test("appendAttempt adds no blank line when the file already ends with a newline", () => {
  const dir = tmpRuns();
  try {
    writeFileSync(ledgerPath(dir, "C"), '{"v":1,"briefId":"C"}\n');
    appendAttempt(dir, "C", { type: "blockin" });
    appendAttempt(dir, "C", { type: "blockin" });
    const text = readFileSync(ledgerPath(dir, "C"), "utf8");
    assert.doesNotMatch(text, /\n\s*\n/);
    assert.ok(text.endsWith("\n"));
    assert.equal(readLedger(dir, "C").attempts.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendAttempt separates entries when the existing file has no trailing newline", () => {
  const dir = tmpRuns();
  try {
    writeFileSync(ledgerPath(dir, "D"), '{"v":1,"briefId":"D"}');
    appendAttempt(dir, "D", { type: "blockin" });
    const lines = readFileSync(ledgerPath(dir, "D"), "utf8").split("\n").filter((l) => l !== "");
    assert.equal(lines.length, 2);
    lines.forEach((l) => JSON.parse(l));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLedger skips blank lines and names the physical line of a malformed one", () => {
  const dir = tmpRuns();
  try {
    writeFileSync(ledgerPath(dir, "E"), '{"v":1,"briefId":"E"}\n\n{"type":"blockin"}\n');
    assert.equal(readLedger(dir, "E").attempts.length, 1);
    writeFileSync(ledgerPath(dir, "E"), '{"v":1,"briefId":"E"}\n\n{"type":"blockin"}\n{oops\n');
    assert.throws(
      () => readLedger(dir, "E"),
      (err) => err.line === 4 && /E\.json:4: malformed JSON line/.test(err.message),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`${RUNS_DIR_ENV} overrides the default runs dir, and only when set`, () => {
  const prev = process.env[RUNS_DIR_ENV];
  try {
    process.env[RUNS_DIR_ENV] = "/sandbox/runs";
    assert.equal(resolveRunsDir({ defaultDir: "/repo/runs" }), "/sandbox/runs");
    delete process.env[RUNS_DIR_ENV];
    assert.equal(resolveRunsDir({ defaultDir: "/repo/runs" }), "/repo/runs");
  } finally {
    if (prev === undefined) delete process.env[RUNS_DIR_ENV];
    else process.env[RUNS_DIR_ENV] = prev;
  }
});

test("committed ledgers hold no test-sandbox entries (no absolute or ../ out paths)", () => {
  const runsDir = new URL("../runs/", import.meta.url);
  for (const name of readdirSync(runsDir).filter((n) => n.endsWith(".json") && n !== "_index.json")) {
    const bad = readFileSync(new URL(name, runsDir), "utf8")
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.trim() !== "")
      .filter(({ line }) => {
        const out = JSON.parse(line).out;
        return typeof out === "string" && (out.startsWith("/") || out.startsWith(".."));
      })
      .map(({ n }) => `${name}:${n}`);
    assert.deepEqual(bad, [], "test-written ledger entries (a test called a ledger writer without ART_FORGE_RUNS_DIR)");
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test atelier/art-forge/tests/run-ledger.test.mjs`
First add stubs to `atelier/art-forge/lib/run-ledger.mjs`: `export const RUNS_DIR_ENV = undefined;` and `export function resolveRunsDir() { throw new Error("not implemented"); }` (Global Constraints, "Red on behaviour"). Without them the file fails at import with `does not provide an export named 'resolveRunsDir'` and no assertion runs.
Expected with the stubs: the file loads, and these fail **on behaviour** against the current writer/reader:
- "adds no blank line when the file already ends with a newline": today's `appendAttempt` prepends `"\n"`, so the text holds a blank line.
- "readLedger skips blank lines …": today's `readLedger` `JSON.parse`s the blank line and throws `SyntaxError`.
- "`ART_FORGE_RUNS_DIR` overrides …": the stub throws.
- "committed ledgers hold no test-sandbox entries": the 9 `../../…/var/folders/…` `out` paths are still in `A1-ART-02.json` until Step 6.

"appendAttempt separates entries when the existing file has no trailing newline" **passes** on current code (the old `"\n" + entry` already separates). It is a regression guard for the new newline check, not a red test. Don't count it as proof of failure.

- [ ] **Step 3: Implement the ledger library.** Replace `atelier/art-forge/lib/run-ledger.mjs` with:

```js
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

// Single-writer assumption: ledgers are appended by one human-driven forge
// session at a time — there is no cross-process locking.

const BRIEF_ID_RE = /^[A-Za-z0-9-]+$/;

/** Tests set this so ledger writers never touch the committed runs/ ledgers. */
export const RUNS_DIR_ENV = "ART_FORGE_RUNS_DIR";

function assertValidBriefId(briefId) {
  if (typeof briefId !== "string" || !BRIEF_ID_RE.test(briefId)) {
    throw new Error(
      `invalid briefId ${JSON.stringify(briefId)} — must match /^[A-Za-z0-9-]+$/`,
    );
  }
}

/**
 * The runs dir a ledger writer should use: `$ART_FORGE_RUNS_DIR` when set,
 * else the caller's default. Read at CALL time, so a test can set the env
 * var after its imports have been hoisted.
 * @param {{ defaultDir: string }} opts
 */
export function resolveRunsDir({ defaultDir }) {
  const override = process.env[RUNS_DIR_ENV];
  return override ? override : defaultDir;
}

export function ledgerPath(runsDir, briefId) {
  assertValidBriefId(briefId);
  return join(runsDir, `${briefId}.json`);
}

function endsWithNewline(p, size) {
  const fd = openSync(p, "r");
  try {
    const byte = Buffer.alloc(1);
    readSync(fd, byte, 0, 1, size - 1);
    return byte[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

export function appendAttempt(runsDir, briefId, entry) {
  mkdirSync(runsDir, { recursive: true });
  const p = ledgerPath(runsDir, briefId);
  const size = existsSync(p) ? statSync(p).size : 0;
  if (size === 0) {
    appendFileSync(p, JSON.stringify({ v: 1, briefId }) + "\n");
  } else if (!endsWithNewline(p, size)) {
    // Legacy files (and hand edits) end without a newline; separate first,
    // and never prepend one to a file that already ends in "\n" (that is
    // how a blank line got into A1-ART-02.json).
    appendFileSync(p, "\n");
  }
  appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

export function readLedger(runsDir, briefId) {
  const p = ledgerPath(runsDir, briefId);
  if (!existsSync(p)) return null;
  let header = null;
  const attempts = [];
  readFileSync(p, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() === "") return;
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        const err = new Error(`${p}:${i + 1}: malformed JSON line: ${line.slice(0, 120)}`);
        err.line = i + 1;
        throw err;
      }
      if (header === null) header = value;
      else attempts.push(value);
    });
  return { header, attempts };
}
```

- [ ] **Step 4: Route every writer through `resolveRunsDir`.** Import it in each writer, change nothing else, and keep each `RUNS_DIR` constant as the default:
- `atelier/art-forge/generate/blockin.mjs:7` becomes `import { appendAttempt, resolveRunsDir } from "../lib/run-ledger.mjs";`, and `:154` `appendAttempt(RUNS_DIR, brief.id, {` becomes `appendAttempt(resolveRunsDir({ defaultDir: RUNS_DIR }), brief.id, {`.
- `atelier/art-forge/generate/env.mjs:112` gets the same import. Lines `:993, :1046, :1092, :1143, :1179` change `appendAttempt(RUNS_DIR, briefId, {` to `appendAttempt(resolveRunsDir({ defaultDir: RUNS_DIR }), briefId, {`.
- `atelier/art-forge/artifact-gate.mjs:41` becomes `import { appendAttempt, resolveRunsDir } from "./lib/run-ledger.mjs";`, and `:713` changes `appendAttempt(RUNS_DIR, ledgerBriefId, {` to `appendAttempt(resolveRunsDir({ defaultDir: RUNS_DIR }), ledgerBriefId, {`.
- `atelier/art-forge/intake-art.mjs:61` gets the same import as artifact-gate. Lines `:332, :465` change `appendAttempt(RUNS_DIR, briefId, {` to `appendAttempt(resolveRunsDir({ defaultDir: RUNS_DIR }), briefId, {`.

Check: `git grep -n "appendAttempt(RUNS_DIR" -- atelier/art-forge` must exit 1 (no matches). `git grep -n "resolveRunsDir({ defaultDir: RUNS_DIR })" -- atelier/art-forge | wc -l` must print `9`.

- [ ] **Step 5: Isolate the two test files that write ledgers.** In `atelier/art-forge/tests/blockin.test.mjs` (it already imports `mkdtempSync`, `readFileSync`, `rmSync`, `tmpdir` and `path` at lines 4-6), add after the import block (after line 18):

```js
// F-053: renderDepthPng appends to the run ledger. Point every ledger write at
// a sandbox so this suite never touches atelier/art-forge/runs/ (it had left 9
// /var/folders entries in the committed A1-ART-02.json).
const COMMITTED_LEDGER = new URL("../runs/A1-ART-02.json", import.meta.url);
const committedLedgerBefore = readFileSync(COMMITTED_LEDGER, "utf8");
process.env.ART_FORGE_RUNS_DIR = mkdtempSync(path.join(tmpdir(), "art-forge-runs-blockin-"));
```

and append at the very end of the file, so it runs last in declaration order:

```js
test("ISOLATION: this suite left the committed A1-ART-02 ledger byte-identical", () => {
  rmSync(process.env.ART_FORGE_RUNS_DIR, { recursive: true, force: true });
  assert.equal(
    readFileSync(COMMITTED_LEDGER, "utf8"),
    committedLedgerBefore,
    "a blockin test appended to atelier/art-forge/runs/A1-ART-02.json",
  );
});
```

In `atelier/art-forge/tests/env-graph.test.mjs`, add after line 2:

```js
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
```

and after the import block (after line 23):

```js
// F-053: generateEnv --dry-run still renders the depth control and appends a
// blockin entry (filed separately). Sandbox the ledger so this suite never
// touches atelier/art-forge/runs/ (it had left 9 entries in A1-ART-02.json).
const COMMITTED_LEDGER = new URL("../runs/A1-ART-02.json", import.meta.url);
const committedLedgerBefore = readFileSync(COMMITTED_LEDGER, "utf8");
process.env.ART_FORGE_RUNS_DIR = mkdtempSync(path.join(tmpdir(), "art-forge-runs-env-"));
```

and append at the very end:

```js
test("ISOLATION: this suite left the committed A1-ART-02 ledger byte-identical", () => {
  rmSync(process.env.ART_FORGE_RUNS_DIR, { recursive: true, force: true });
  assert.equal(
    readFileSync(COMMITTED_LEDGER, "utf8"),
    committedLedgerBefore,
    "an env-graph test appended to atelier/art-forge/runs/A1-ART-02.json",
  );
});
```

Before editing, run `grep -n "^import" atelier/art-forge/tests/env-graph.test.mjs`. If `node:fs`, `node:os` or `node:path` is already imported, merge into that line instead of duplicating.

- [ ] **Step 6: Remove the 18 identifiable test-written entries.** Each removed pair is a `var/folders` entry plus the default-path `blockin` entry that follows it with the same `briefHash` less than 1 s later (measured gaps 0.19–0.47 s; the `env-graph` dry-run run; see Premise 2b′). 18 is a lower bound: older `env-graph` dry-run `blockin` entries that have no tmp partner look exactly like real block-ins and are left in place.

```bash
node -e '
const fs = require("fs");
const p = "atelier/art-forge/runs/A1-ART-02.json";
const lines = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "");
const keep = [];
let removed = 0;
for (let i = 0; i < lines.length; i++) {
  const e = i === 0 ? null : JSON.parse(lines[i]);
  if (e && typeof e.out === "string" && e.out.includes("var/folders/")) {
    removed++;
    const next = lines[i + 1] && JSON.parse(lines[i + 1]);
    const dt = next ? Date.parse(next.ts) - Date.parse(e.ts) : Infinity;
    if (next && next.type === "blockin" && next.briefHash === e.briefHash &&
        next.out === "out/control/depth/A1-ART-02-depth.png" && dt >= 0 && dt < 1000) {
      removed++; i++;
    } else {
      throw new Error("unpaired sandbox entry at attempt " + i + " — stop and inspect by hand");
    }
    continue;
  }
  keep.push(lines[i]);
}
fs.writeFileSync(p, keep.join("\n") + "\n");
console.log("removed", removed, "kept lines", keep.length);
'
```
Expected output: `removed 18 kept lines 185`. Then run `grep -c "var/folders" atelier/art-forge/runs/A1-ART-02.json`. Expected: `0`.

- [ ] **Step 7: Run the tests.** Now that Steps 3–5 are in place, running the whole art-forge suite is safe.

Run: `node --test atelier/art-forge/tests/run-ledger.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 7`, `ℹ pass 7`, `ℹ fail 0` (2 existing + 5 appended in Step 1).
Run: `shasum atelier/art-forge/runs/*.json > "$TMPDIR/runs-before.sha"; node --test atelier/art-forge/tests/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"; shasum atelier/art-forge/runs/*.json | diff "$TMPDIR/runs-before.sha" - && echo LEDGERS-UNTOUCHED`
Expected: `ℹ fail 0` and `LEDGERS-UNTOUCHED`. This needs `magick` on PATH (`scripts/system-deps.json`). If it is missing, say so; don't claim green.
Run: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 114`, `ℹ fail 0` (the env-index test reads the same ledger and must stay green).

- [ ] **Step 8: Commit**

```bash
git add atelier/art-forge/lib/run-ledger.mjs atelier/art-forge/generate/blockin.mjs atelier/art-forge/generate/env.mjs \
  atelier/art-forge/artifact-gate.mjs atelier/art-forge/intake-art.mjs atelier/art-forge/tests/run-ledger.test.mjs \
  atelier/art-forge/tests/blockin.test.mjs atelier/art-forge/tests/env-graph.test.mjs atelier/art-forge/runs/A1-ART-02.json
git commit -m "fix(F-053): newline-safe run ledger, sandbox ledger writes in tests, drop 18 test entries"
```

- [ ] **Step 9: Gate A** (Tasks 1–2). Verify by re-running the three commands in Step 7 plus `node --test atelier/asset-storybook/tests/css-parse.test.mjs`. Then dispatch `code-reviewer` + `typescript-reviewer` (`model: sonnet`) on `git diff a5644cbd..HEAD -- atelier`. Ask them specifically whether any `appendAttempt` caller still bypasses `resolveRunsDir`, and whether `parseLedgerText` and `readLedger` agree on line numbering. Apply findings in a new commit, run `/simplify`, and re-verify.

---

### Task 3: One pipeline row per brief

**Files:**
- Create: `atelier/asset-storybook/forge-briefs-index.json`
- Create: `atelier/asset-storybook/tests/forge-briefs-index.test.mjs`
- Create: `atelier/asset-storybook/tests/forge-pipeline.test.mjs`
- Modify: `atelier/asset-storybook/js/state.mjs:35` (add a URL constant)
- Modify: `atelier/asset-storybook/js/forge/pipeline.mjs` (replace `buildPipelineRow`, add pure model functions)
- Modify: `atelier/asset-storybook/js/forge/forge.mjs:336-403` (`loadRows`)
- Modify: `atelier/asset-storybook/index.html` (row CSS after `.source-error`)

**Interfaces:**
- Consumes: `parseLedgerText` (Task 1), `ledgerErrorText({ briefId, error })` (Task 1), `markStale`, `digestHex`, `canonicalBriefString` (existing, `staleness.mjs`).
- Produces (all in `js/forge/pipeline.mjs`):
  - `STAGES = ["blockin", "render", "gate", "intake"]`
  - `summarizePipeline({ attempts, staleFlags }) → { stages: {stage, count, status: "done"|"flag"|"stale"|"notrun"}[], staleCount: number }`
  - `pipelineRowModel({ briefId, outcome }) → { briefId, state: "ledger"|"no-ledger"|"error", cells: {stage, text, status}[], note: string, noteTone: "done"|"stale"|"notrun"|"error" }`. `outcome` is one of `{kind:"ledger", attempts, staleFlags}`, `{kind:"no-ledger"}` or `{kind:"error", error}`.
  - `forgeBriefIds({ briefsIndex, runsIndex }) → string[]`
  - `forgeSourceFailureText({ path, error }) → string`
  - `buildPipelineRow(model) → HTMLElement` (`.forge-row.forge-pipeline-row`, `data-brief`, `data-state`, and `data-error="ledger"` when `state === "error"`)

- [ ] **Step 1: Write the failing tests.** Create `atelier/asset-storybook/tests/forge-briefs-index.test.mjs`:

```js
// F-053 Phase 1 — the Forge tab lists every brief, ledgered or not. A static
// page cannot list atelier/art-forge/briefs/, so forge-briefs-index.json is
// hand-maintained (spec §7.1) and this parity test keeps it honest in both
// directions. It lives beside env-index.json, NOT in briefs/, because
// atelier/art-forge/tests/prompt-lint.test.mjs parses every briefs/*.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const index = JSON.parse(readFileSync(join(HERE, "..", "forge-briefs-index.json"), "utf8"));

test("forge-briefs-index.json has the {version:1, note, briefs:[{id}]} shape", () => {
  assert.equal(index.version, 1);
  assert.equal(typeof index.note, "string");
  assert.ok(Array.isArray(index.briefs));
  for (const b of index.briefs) assert.match(b.id, /^[A-Za-z0-9-]+$/);
});

test("forge-briefs-index.json ids match atelier/art-forge/briefs/*.json in both directions", () => {
  const onDisk = readdirSync(join(REPO_ROOT, "atelier/art-forge/briefs"))
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.replace(/\.json$/, ""))
    .sort();
  assert.deepEqual(index.briefs.map((b) => b.id).sort(), onDisk);
});
```

Create `atelier/asset-storybook/tests/forge-pipeline.test.mjs`:

```js
// F-053 Phase 1 — pipeline row model: one row per brief, four stage pills
// with counts, a stale count or "all fresh", "no ledger yet" for briefs the
// forge has never run, and a named error row for an unreadable ledger.
// Pure data only; buildPipelineRow is the thin DOM layer (smoke-tested).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STAGES,
  summarizePipeline,
  pipelineRowModel,
  forgeBriefIds,
  forgeSourceFailureText,
} from "../js/forge/pipeline.mjs";

const blockin = { type: "blockin", briefHash: "h1" };
const render = (over = {}) => ({ type: "render", seed: 1, briefHash: "h1", out: "out/env/a.png", ...over });

test("summarizePipeline counts every stage and folds gate-skipped into gate", () => {
  const attempts = [blockin, blockin, render(), { type: "gate-skipped", png: "out/env/a.png" }];
  const { stages } = summarizePipeline({ attempts, staleFlags: attempts.map(() => false) });
  assert.deepEqual(stages.map((s) => s.stage), STAGES);
  assert.deepEqual(stages.map((s) => s.count), [2, 1, 1, 0]);
  assert.deepEqual(stages.map((s) => s.status), ["done", "done", "done", "notrun"]);
});

test("a stage's status follows its LATEST attempt: stale beats flag, a failed gate is flag", () => {
  const attempts = [render(), { type: "gate", ok: false }, render({ seed: 2 })];
  const flagged = summarizePipeline({ attempts, staleFlags: [false, false, false] });
  assert.equal(flagged.stages[2].status, "flag");
  const stale = summarizePipeline({ attempts, staleFlags: [false, false, true] });
  assert.equal(stale.stages[1].status, "stale");
});

test("staleCount counts stale attempts; the row note reads 'N stale' or 'all fresh'", () => {
  const attempts = [render(), render({ seed: 2 }), render({ seed: 3 })];
  const staleModel = pipelineRowModel({ briefId: "A1", outcome: { kind: "ledger", attempts, staleFlags: [true, true, false] } });
  assert.equal(staleModel.state, "ledger");
  assert.equal(staleModel.note, "2 stale");
  assert.equal(staleModel.noteTone, "stale");
  assert.deepEqual(staleModel.cells.map((c) => c.text), ["blockin", "render 3", "gate", "intake"]);
  const fresh = pipelineRowModel({ briefId: "A1", outcome: { kind: "ledger", attempts, staleFlags: [false, false, false] } });
  assert.equal(fresh.note, "all fresh");
  assert.equal(fresh.noteTone, "done");
});

test("a brief with no ledger, or a header-only ledger, reads 'no ledger yet' with four not-run stages", () => {
  for (const outcome of [{ kind: "no-ledger" }, { kind: "ledger", attempts: [], staleFlags: [] }]) {
    const m = pipelineRowModel({ briefId: "A1-ART-03", outcome });
    assert.equal(m.note, "no ledger yet");
    assert.equal(m.noteTone, "notrun");
    assert.deepEqual(m.cells.map((c) => c.status), ["notrun", "notrun", "notrun", "notrun"]);
  }
});

test("an unreadable ledger becomes an error row carrying the line number", () => {
  const error = Object.assign(new Error("ledger attempt on line 3: malformed JSON line: {x"), { line: 3 });
  const m = pipelineRowModel({ briefId: "A1-ART-02", outcome: { kind: "error", error } });
  assert.equal(m.state, "error");
  assert.equal(m.noteTone, "error");
  assert.deepEqual(m.cells, []);
  assert.match(m.note, /^ledger A1-ART-02\.json unreadable \(line 3\): /);
});

test("forgeBriefIds lists the brief index first, then ledgered briefs the index lacks, no duplicates", () => {
  const ids = forgeBriefIds({
    briefsIndex: { briefs: [{ id: "A1-ART-02" }, { id: "A1-ART-03" }] },
    runsIndex: { briefs: ["A1-ART-02", "Z9-ORPHAN"] },
  });
  assert.deepEqual(ids, ["A1-ART-02", "A1-ART-03", "Z9-ORPHAN"]);
  assert.deepEqual(forgeBriefIds({ briefsIndex: null, runsIndex: { briefs: ["A1-ART-02"] } }), ["A1-ART-02"]);
});

test("forgeSourceFailureText says 'not packaged in this image' for a 404 and 'source failed' otherwise", () => {
  assert.equal(
    forgeSourceFailureText({ path: "atelier/art-forge/runs/_index.json", error: new Error("runs-index: HTTP 404") }),
    "not packaged in this image: atelier/art-forge/runs/_index.json",
  );
  assert.equal(
    forgeSourceFailureText({ path: "atelier/art-forge/runs/_index.json", error: new SyntaxError("Unexpected token") }),
    "source failed: atelier/art-forge/runs/_index.json — Unexpected token",
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test atelier/asset-storybook/tests/forge-briefs-index.test.mjs atelier/asset-storybook/tests/forge-pipeline.test.mjs`
Expected: FAIL. `ENOENT … forge-briefs-index.json` (a real behavioural red: the file is missing) and, without stubs, `does not provide an export named 'STAGES'`. So first add stubs for `STAGES`, `summarizePipeline`, `pipelineRowModel`, `forgeBriefIds` and `forgeSourceFailureText` to `js/forge/pipeline.mjs` (Global Constraints, "Red on behaviour"). Then `forge-pipeline.test.mjs` loads and its assertions fail.

- [ ] **Step 3: Implement the data file and URL.** Create `atelier/asset-storybook/forge-briefs-index.json`:

```json
{
  "version": 1,
  "note": "Every art-forge brief (atelier/art-forge/briefs/*.json), so the Forge tab shows a pipeline row even for briefs with no run ledger yet. Hand-maintained; tests/forge-briefs-index.test.mjs enforces parity both ways.",
  "briefs": [{ "id": "A1-ART-02" }, { "id": "A1-ART-03" }, { "id": "A1-ART-06" }, { "id": "A1-ART-07" }]
}
```

In `atelier/asset-storybook/js/state.mjs`, after line 34 (`BRIEFS_BASE_URL`), add:

```js
// F-053: every brief id, including briefs with no ledger yet (a static page
// cannot list briefs/). Parity with briefs/*.json: tests/forge-briefs-index.test.mjs.
export const FORGE_BRIEFS_INDEX_URL = "./forge-briefs-index.json";
```

- [ ] **Step 4: Implement the pipeline module.** Replace everything in `atelier/asset-storybook/js/forge/pipeline.mjs` above `ledgerErrorText` (lines 1-72, the header comment, `CELL_STATUS` and the old per-attempt `buildPipelineRow`) with the code below, and keep `ledgerErrorText` from Task 1 at the bottom:

```js
// F-050 Task 7, reshaped in F-053 Phase 1 — the Forge tab's pipeline strip.
//
// One row per brief: brief id, four stage pills (blockin → render → gate →
// intake) with attempt counts, then a note: "N stale", "all fresh", "no ledger
// yet", or a named ledger error. The old builder emitted one pill per ATTEMPT
// (202 for A1-ART-02) and had no caller. Pure model functions are node-tested
// (tests/forge-pipeline.test.mjs); buildPipelineRow is the thin DOM layer.

export const CELL_STATUS = {
  done: "done",
  flag: "flag",
  stale: "stale",
  notrun: "notrun",
};

export const STAGES = ["blockin", "render", "gate", "intake"];

const stageOf = (attempt) => (attempt.type === "gate-skipped" ? "gate" : attempt.type);

/**
 * @param {{ attempts: object[], staleFlags: boolean[] }} opts
 * @returns {{ stages: {stage: string, count: number, status: string}[], staleCount: number }}
 */
export function summarizePipeline({ attempts, staleFlags }) {
  const stages = STAGES.map((stage) => {
    let count = 0;
    let latest = -1;
    attempts.forEach((a, i) => {
      if (stageOf(a) === stage) {
        count++;
        latest = i;
      }
    });
    let status = CELL_STATUS.notrun;
    if (latest >= 0) {
      const a = attempts[latest];
      if (staleFlags[latest]) status = CELL_STATUS.stale;
      else if (a.type === "gate" && !a.ok) status = CELL_STATUS.flag;
      else status = CELL_STATUS.done;
    }
    return { stage, count, status };
  });
  return { stages, staleCount: staleFlags.filter(Boolean).length };
}

const notRunCells = () =>
  STAGES.map((stage) => ({ stage, text: stage, status: CELL_STATUS.notrun }));

/**
 * @param {{ briefId: string, outcome:
 *   {kind:"ledger", attempts: object[], staleFlags: boolean[]} |
 *   {kind:"no-ledger"} | {kind:"error", error: Error} }} opts
 */
export function pipelineRowModel({ briefId, outcome }) {
  if (outcome.kind === "error") {
    return {
      briefId,
      state: "error",
      cells: [],
      note: ledgerErrorText({ briefId, error: outcome.error }),
      noteTone: "error",
    };
  }
  if (outcome.kind === "no-ledger" || outcome.attempts.length === 0) {
    return { briefId, state: "no-ledger", cells: notRunCells(), note: "no ledger yet", noteTone: "notrun" };
  }
  const { stages, staleCount } = summarizePipeline(outcome);
  return {
    briefId,
    state: "ledger",
    cells: stages.map((s) => ({
      stage: s.stage,
      text: s.count > 0 ? `${s.stage} ${s.count}` : s.stage,
      status: s.status,
    })),
    note: staleCount > 0 ? `${staleCount} stale` : "all fresh",
    noteTone: staleCount > 0 ? "stale" : "done",
  };
}

/**
 * Brief ids for the Forge tab: the brief index order first, then any
 * ledgered brief the index does not list (never hide a ledger).
 * @param {{ briefsIndex: {briefs:{id:string}[]} | null, runsIndex: {briefs:string[]} }} opts
 */
export function forgeBriefIds({ briefsIndex, runsIndex }) {
  const ids = [];
  const add = (id) => {
    if (typeof id === "string" && !ids.includes(id)) ids.push(id);
  };
  if (briefsIndex && Array.isArray(briefsIndex.briefs)) briefsIndex.briefs.forEach((b) => add(b && b.id));
  if (runsIndex && Array.isArray(runsIndex.briefs)) runsIndex.briefs.forEach(add);
  return ids;
}

/**
 * Empty-state text for a Forge data source that did not load.
 * @param {{ path: string, error: Error }} opts
 */
export function forgeSourceFailureText({ path, error }) {
  const message = error && error.message ? error.message : String(error);
  return /HTTP 404\b/.test(message)
    ? `not packaged in this image: ${path}`
    : `source failed: ${path} — ${message}`;
}

/** DOM for one pipeline row. @param {ReturnType<typeof pipelineRowModel>} model */
export function buildPipelineRow(model) {
  const row = document.createElement("div");
  row.className = "forge-row forge-pipeline-row";
  row.dataset.brief = model.briefId;
  row.dataset.state = model.state;
  if (model.state === "error") row.dataset.error = "ledger";

  const label = document.createElement("span");
  label.className = "forge-brief-id";
  label.textContent = model.briefId;
  row.append(label);

  for (const c of model.cells) {
    const cell = document.createElement("span");
    cell.className = `forge-cell is-${c.status}`;
    cell.dataset.stage = c.stage;
    cell.textContent = c.text;
    row.append(cell);
  }

  const note = document.createElement("span");
  note.className = `forge-row-note is-${model.noteTone}`;
  note.textContent = model.note;
  row.append(note);
  return row;
}
```

- [ ] **Step 5: Wire it into `loadRows`.** In `atelier/asset-storybook/js/forge/forge.mjs`:
- Add `FORGE_BRIEFS_INDEX_URL,` to the `../state.mjs` import (lines 9-17).
- Change the Task 1 import to `import { buildPipelineRow, forgeBriefIds, forgeSourceFailureText, pipelineRowModel } from "./pipeline.mjs";`. `ledgerErrorText` is no longer used directly in this file.
- Change `fetchLedger` (lines 330-334) so a missing ledger file is "no ledger yet", not an error:

```js
/** null when runs/<brief>.json does not exist (HTTP 404): that brief has no ledger yet. */
async function fetchLedger(briefId) {
  const res = await fetch(RUNS_BASE_URL + briefId + ".json");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("ledger " + briefId + ": HTTP " + res.status);
  return parseLedgerText(await res.text());
}
```

Why the ledger file and not a parity test on `runs/_index.json`: a parity test only catches drift at test time, and the page would still trust a second, hand-rebuilt source of truth between runs and in any checkout where the index was not rebuilt. Asking for the ledger itself has no second source that can drift. It costs one extra request per unledgered brief (3 today), and the smoke's console listener already ignores `Log.entryAdded` entries with `source: "network"` (Task 7), so the expected 404s are not counted as page errors.
- Replace `loadRows` (lines 336-403) with:

```js
function textLine(className, text) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

async function loadRows(rowsHost) {
  let runsIndex;
  try {
    runsIndex = await fetchJson(RUNS_INDEX_URL, "runs-index");
  } catch (err) {
    console.warn("[asset-storybook] runs/_index.json unavailable:", err);
    rowsHost.appendChild(
      textLine("empty-state", forgeSourceFailureText({ path: "atelier/art-forge/runs/_index.json", error: err })),
    );
    return;
  }

  let briefsIndex = null;
  try {
    briefsIndex = await fetchJson(FORGE_BRIEFS_INDEX_URL, "forge-briefs-index");
  } catch (err) {
    // Degrade to ledgered briefs only, but say so: never silent.
    const line = textLine(
      "source-error",
      forgeSourceFailureText({ path: "atelier/asset-storybook/forge-briefs-index.json", error: err }),
    );
    line.dataset.error = "briefs-index";
    rowsHost.appendChild(line);
  }

  const briefIds = forgeBriefIds({ briefsIndex, runsIndex });
  if (briefIds.length === 0) {
    rowsHost.appendChild(textLine("empty-state", EMPTY_RUNS_TEXT));
    return;
  }
  // "No ledger yet" comes from the ledger file itself (HTTP 404), NOT from
  // runs/_index.json: that index is rebuilt only by hand (ledger-index.mjs),
  // appendAttempt never updates it, and nothing checks it against runs/*.json,
  // so a brief whose ledger exists but isn't indexed would be hidden. The
  // index is still fetched above as the "is runs/ packaged at all?" probe.
  for (const briefId of briefIds) {
    // Brief is optional (absence just disables staleness for that row).
    let ledger = null;
    let brief = null;
    try {
      [ledger, brief] = await Promise.all([
        fetchLedger(briefId),
        fetchJson(BRIEFS_BASE_URL + briefId + ".json", "brief " + briefId).catch(() => null),
      ]);
    } catch (error) {
      console.warn("[asset-storybook] ledger unreadable for " + briefId, error);
      rowsHost.appendChild(buildPipelineRow(pipelineRowModel({ briefId, outcome: { kind: "error", error } })));
      continue;
    }

    // 404 (fetchLedger → null) or an empty file (parses to null): nothing recorded yet.
    if (ledger === null) {
      rowsHost.appendChild(buildPipelineRow(pipelineRowModel({ briefId, outcome: { kind: "no-ledger" } })));
      continue;
    }
    const attempts = Array.isArray(ledger.attempts) ? ledger.attempts : [];
    attemptsByBrief.set(briefId, attempts);

    try {
      const staleFlags = brief
        ? markStale(attempts, await digestHex(canonicalBriefString(brief)))
        : attempts.map(() => false);
      rowsHost.appendChild(
        buildPipelineRow(pipelineRowModel({ briefId, outcome: { kind: "ledger", attempts, staleFlags } })),
      );
      appendGallery(rowsHost, briefId, buildForgeGallery(attempts, staleFlags));
    } catch (error) {
      // One bad brief must not abort the remaining rows.
      console.warn("[asset-storybook] could not render pipeline row for " + briefId, error);
      rowsHost.appendChild(buildPipelineRow(pipelineRowModel({ briefId, outcome: { kind: "error", error } })));
    }
  }
}
```

The old catch used `console.error`. It is now `console.warn` because the error is shown on the page as a row, and the smoke test (Task 7) treats `console.error` as a failure.

- [ ] **Step 6: Add row CSS.** In `atelier/asset-storybook/index.html`, after the `.source-error { … }` rule from Task 1:

```css
      .forge-pipeline-row .forge-cell {
        cursor: default;
      }

      .forge-row[data-error] {
        border-color: #8a3535;
      }

      .forge-row-note {
        margin-left: auto;
        font-family: var(--mono);
        font-size: 0.7rem;
        color: var(--text-dim);
      }

      .forge-row-note.is-done {
        color: #8fe3b0;
      }

      .forge-row-note.is-stale {
        color: #ff9d9d;
      }

      .forge-row-note.is-error {
        color: var(--err);
      }
```

- [ ] **Step 7: Run the tests**

Run: `node --test atelier/asset-storybook/tests/forge-briefs-index.test.mjs atelier/asset-storybook/tests/forge-pipeline.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`.
Run: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 123`, `ℹ fail 0` (114 + 9).
Run: `git grep -n buildPipelineRow -- atelier/asset-storybook/js | wc -l`
Expected: `3` or more (the definition plus the calls in `forge.mjs`).

- [ ] **Step 8: Manual check.** Serve with `python3 -m http.server 6007` at the worktree root and open the Forge tab. Expected: four rows. `A1-ART-02` shows `blockin 125 · render 59 · gate · intake` and a stale count or `all fresh`. 125 is the count left after Task 2 removes the 18 identifiable test entries (143 − 18); older untraceable dry-run entries stay in it (Premise 2b′). The stale count covers **all** attempts, `blockin` included, not only renders, so it can exceed 59. `A1-ART-03`, `A1-ART-06` and `A1-ART-07` each read `no ledger yet`. DevTools Console shows no red JavaScript errors. The three `GET …/runs/A1-ART-0{3,6,7}.json 404` network lines are expected: that 404 is how the page learns there is no ledger yet.

- [ ] **Step 9: Commit**

```bash
git add atelier/asset-storybook/forge-briefs-index.json atelier/asset-storybook/tests/forge-briefs-index.test.mjs \
  atelier/asset-storybook/tests/forge-pipeline.test.mjs atelier/asset-storybook/js/state.mjs \
  atelier/asset-storybook/js/forge/pipeline.mjs atelier/asset-storybook/js/forge/forge.mjs atelier/asset-storybook/index.html
git commit -m "feat(F-053): one Forge pipeline row per brief with stage counts and stale state"
```

---

### Task 4: One "png missing (local only)" notice per batch

**Files:**
- Modify: `atelier/asset-storybook/js/forge/gallery.mjs` (append the copy helper)
- Create: `atelier/asset-storybook/tests/forge-missing-notice.test.mjs`
- Modify: `atelier/asset-storybook/js/forge/forge.mjs:115-207` (`buildForgeCard`, `appendGallery`)
- Modify: `atelier/asset-storybook/index.html` (notice + image-less card CSS)

**Interfaces:**
- Consumes: `buildForgeGallery` batches `{briefHash, cards:[{entry, stale, isDev, gate}]}` (existing).
- Produces: `PNG_MISSING_LEAD = "png missing (local only)"`; `missingNoticeText({ count }) → string`, where `count` is the number of **missing** PNGs in the batch (every card is probed); `buildForgeCard({ briefId, card, media: "image" | "none" })`.

- [ ] **Step 1: Write the failing test** `atelier/asset-storybook/tests/forge-missing-notice.test.mjs`

```js
// F-053 Phase 1 — out/ PNGs are gitignored (0 of the 59 ledgered renders are
// tracked), so in CI, in the image and in most checkouts every card said
// "png missing" on its own. The Forge tab now shows ONE notice per batch.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PNG_MISSING_LEAD, missingNoticeText } from "../js/forge/gallery.mjs";

test("the notice leads with the exact copy 'png missing (local only)'", () => {
  assert.equal(PNG_MISSING_LEAD, "png missing (local only)");
  assert.ok(missingNoticeText({ count: 3 }).startsWith("png missing (local only) — "));
});

test("the notice counts renders with correct plurals and names the gitignored directory", () => {
  assert.match(missingNoticeText({ count: 1 }), /— 1 render in this batch;/);
  assert.match(missingNoticeText({ count: 12 }), /— 12 renders in this batch;/);
  assert.match(missingNoticeText({ count: 12 }), /atelier\/art-forge\/out\/ is gitignored/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test atelier/asset-storybook/tests/forge-missing-notice.test.mjs`
First add stubs `export const PNG_MISSING_LEAD = undefined;` and `export function missingNoticeText() { throw new Error("not implemented"); }` to `js/forge/gallery.mjs` (Global Constraints, "Red on behaviour"). Without them the file fails at import with `does not provide an export named 'PNG_MISSING_LEAD'`.
Expected with the stubs: FAIL on both assertions (`undefined !== "png missing (local only)"`, and `not implemented`).

- [ ] **Step 3: Implement the copy helper.** Append to `atelier/asset-storybook/js/forge/gallery.mjs`:

```js
/** F-053: exact lead copy for renders whose PNG is not in this checkout/image. */
export const PNG_MISSING_LEAD = "png missing (local only)";

/**
 * One notice per batch instead of one per card.
 * @param {{ count: number }} opts count = renders in this batch whose PNG is missing (not the batch size)
 */
export function missingNoticeText({ count }) {
  const noun = count === 1 ? "render" : "renders";
  return (
    `${PNG_MISSING_LEAD} — ${count} ${noun} in this batch; ` +
    "atelier/art-forge/out/ is gitignored, so the files exist only in the checkout that rendered them"
  );
}
```

- [ ] **Step 4: Change the DOM.** In `atelier/asset-storybook/js/forge/forge.mjs`:
- Change the gallery import to `import { buildForgeGallery, missingNoticeText, PNG_MISSING_LEAD } from "./gallery.mjs";`.
- Change `function buildForgeCard(briefId, card) {` to `function buildForgeCard({ briefId, card, media }) {`, and replace its image block (lines 122-135) with:

```js
  if (media === "image") {
    const img = document.createElement("img");
    img.src = ART_FORGE_ROOT_URL + entry.out;
    img.alt = cellLabel(entry);
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      // The per-card probe loaded this PNG, but the real load failed anyway
      // (rare: the file was removed in between). Say so on this card.
      const missing = document.createElement("div");
      missing.className = "forge-card-missing";
      missing.textContent = PNG_MISSING_LEAD;
      img.replaceWith(missing);
    });
    cardEl.appendChild(img);
  } else {
    // No image slot at all: the batch notice already explains why. The card
    // stays clickable (run detail) and keeps its ↻ work-order affordance.
    cardEl.classList.add("is-imageless");
  }
```

- Replace `appendGallery` (lines 178-207) with:

```js
/** Resolves true when the PNG loads. An <img> probe, never fetch (read-only page). */
function probeImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function appendGallery(rowsHost, briefId, batches) {
  // Probe EVERY card, not just the newest: out/ can be partly cleaned, and a
  // PNG that is on disk must render even when a newer one in its batch is
  // gone. Missing cards go image-less and the batch gets ONE notice counting
  // only the missing ones. A loaded probe is in the browser cache, so the
  // card's own <img> reuses it.
  const present = await Promise.all(
    batches.map((batch) =>
      Promise.all(batch.cards.map((card) => probeImage(ART_FORGE_ROOT_URL + card.entry.out))),
    ),
  );
  batches.forEach((batch, i) => {
    const batchEl = document.createElement("div");
    batchEl.className = "forge-batch";

    const head = document.createElement("div");
    head.className = "forge-batch-head";
    const hashEl = document.createElement("span");
    hashEl.className = "forge-batch-hash";
    hashEl.textContent = batch.briefHash.slice(0, 8);
    hashEl.title = batch.briefHash;
    const meta = document.createElement("span");
    const newest = batch.cards[0].entry.ts;
    meta.textContent =
      "· " +
      batch.cards.length +
      (batch.cards.length === 1 ? " render" : " renders") +
      (newest ? " · " + String(newest).slice(0, 10) : "");
    head.append(hashEl, meta);
    batchEl.appendChild(head);

    const missingCount = present[i].filter((ok) => !ok).length;
    if (missingCount > 0) {
      const notice = document.createElement("p");
      notice.className = "forge-batch-missing";
      notice.dataset.pngMissing = "batch";
      notice.textContent = missingNoticeText({ count: missingCount });
      batchEl.appendChild(notice);
    }

    const grid = document.createElement("div");
    grid.className = "forge-card-grid";
    batch.cards.forEach((card, j) => {
      grid.appendChild(buildForgeCard({ briefId, card, media: present[i][j] ? "image" : "none" }));
    });
    batchEl.appendChild(grid);
    rowsHost.appendChild(batchEl);
  });
}
```

- In `loadRows` (Task 3), change `appendGallery(rowsHost, briefId, buildForgeGallery(attempts, staleFlags));` to `await appendGallery(rowsHost, briefId, buildForgeGallery(attempts, staleFlags));`, so each brief's gallery stays directly under its row.

- [ ] **Step 5: CSS.** In `atelier/asset-storybook/index.html`, after the `.forge-card-missing { … }` rule:

```css
      .forge-batch-missing {
        margin: 0.2rem 0 0.5rem;
        padding: 0.35rem 0.55rem;
        border: 1px dashed var(--border);
        border-radius: 6px;
        font-family: var(--mono);
        font-size: 0.68rem;
        color: var(--text-faint);
      }

      .forge-card.is-imageless {
        min-height: 0;
      }
```

- [ ] **Step 6: Run the tests**

Run: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 125`, `ℹ fail 0` (123 + 2).
Run: `git grep -n -E -e "method\s*:" -e sendBeacon -e "<form" -e XMLHttpRequest -- atelier/asset-storybook/js ':!atelier/asset-storybook/js/map-builder*.mjs'; echo "exit=$?"`
Expected: `exit=1`.

- [ ] **Step 7: Manual check.** In this worktree `atelier/art-forge/out/` does not exist. Serve on 6007 and open Forge. Expected: each batch shows exactly one `png missing (local only) — N renders in this batch; …` line and no per-card "png missing" boxes. Clicking an image-less card opens the run-detail overlay, and ↻ is present on each card. Then check the partial case: copy one **older** (not the newest) PNG of one batch from the main checkout's `atelier/art-forge/out/` into this worktree's `out/` at its ledger `out` path, and reload. Expected: that card shows its image, the other cards stay image-less, and the notice count drops by exactly 1. Delete the copied file afterwards (`out/` is gitignored, so nothing gets committed).

- [ ] **Step 8: Commit**

```bash
git add atelier/asset-storybook/js/forge/gallery.mjs atelier/asset-storybook/tests/forge-missing-notice.test.mjs \
  atelier/asset-storybook/js/forge/forge.mjs atelier/asset-storybook/index.html
git commit -m "feat(F-053): collapse missing local renders into one notice per Forge batch"
```

---

### Task 5: Work orders survive a reload (localStorage buffer)

**Files:**
- Create: `atelier/asset-storybook/js/review/workorder-buffer.mjs`
- Create: `atelier/asset-storybook/tests/forge-workorder-buffer.test.mjs`
- Modify: `atelier/asset-storybook/js/forge/forge.mjs:36-47` (state), `:283-304` (submit), `:429-431`, `:492-531` (`loadOrders`)
- Modify: `atelier/asset-storybook/index.html` (saved label CSS)

**Interfaces:**
- Consumes: `addWorkOrder(queue, order)`, `parseQueue` (existing `js/review/store.mjs`). Order shape `{id, briefId, cell, reason, createdAt, seed?}`.
- Produces:
  - `WORK_ORDER_LS_KEY = "atlas-storybook-forge-workorders-v1"`
  - `readOrderBuffer({ storage }) → { orders: object[], ok: boolean }`
  - `writeOrderBuffer({ storage, orders }) → boolean`
  - `pendingBufferedOrders({ committed, buffered }) → object[]`

- [ ] **Step 1: Write the failing test** `atelier/asset-storybook/tests/forge-workorder-buffer.test.mjs`

```js
// F-053 Phase 1 — C2.9: work orders issued on the Forge tab lived only in
// module memory and vanished on reload. They now buffer in localStorage (like
// review verdicts, js/review/ui.mjs) until exported and committed; once the
// committed review-queue.json carries an order's id, the buffer drops it.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WORK_ORDER_LS_KEY,
  readOrderBuffer,
  writeOrderBuffer,
  pendingBufferedOrders,
} from "../js/review/workorder-buffer.mjs";

const order = (id, over = {}) => ({
  id,
  briefId: "A1-ART-02",
  cell: "render",
  reason: "too dark",
  createdAt: "2026-09-14T00:00:00.000Z",
  ...over,
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test("write then read round-trips orders under the versioned key", () => {
  const storage = memoryStorage();
  assert.equal(writeOrderBuffer({ storage, orders: [order("wo-1", { seed: 7 })] }), true);
  assert.ok(storage.map.has(WORK_ORDER_LS_KEY));
  assert.deepEqual(readOrderBuffer({ storage }), { orders: [order("wo-1", { seed: 7 })], ok: true });
});

test("an empty buffer reads as no orders, ok", () => {
  assert.deepEqual(readOrderBuffer({ storage: memoryStorage() }), { orders: [], ok: true });
});

test("unavailable or throwing storage never throws: ok is false", () => {
  const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.deepEqual(readOrderBuffer({ storage: throwing }), { orders: [], ok: false });
  assert.equal(writeOrderBuffer({ storage: throwing, orders: [order("wo-1")] }), false);
  assert.deepEqual(readOrderBuffer({ storage: null }), { orders: [], ok: false });
  assert.equal(writeOrderBuffer({ storage: null, orders: [] }), false);
});

test("corrupt JSON or malformed entries are dropped, not trusted", () => {
  const storage = memoryStorage();
  storage.setItem(WORK_ORDER_LS_KEY, "{not json");
  assert.deepEqual(readOrderBuffer({ storage }), { orders: [], ok: false });
  storage.setItem(WORK_ORDER_LS_KEY, JSON.stringify([order("wo-1"), { id: "wo-2" }, "junk"]));
  assert.deepEqual(readOrderBuffer({ storage }).orders, [order("wo-1")]);
});

test("orders already in the committed queue are no longer pending in the buffer", () => {
  const committed = { workOrders: [order("wo-1")] };
  assert.deepEqual(
    pendingBufferedOrders({ committed, buffered: [order("wo-1"), order("wo-2")] }).map((o) => o.id),
    ["wo-2"],
  );
  assert.deepEqual(pendingBufferedOrders({ committed: {}, buffered: [order("wo-3")] }).map((o) => o.id), ["wo-3"]);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test atelier/asset-storybook/tests/forge-workorder-buffer.test.mjs`
First create `js/review/workorder-buffer.mjs` holding only stubs for the names the test imports (Global Constraints, "Red on behaviour"). Without it the file fails with `Cannot find module … workorder-buffer.mjs` and no assertion runs.
Expected with the stubs: the file loads and all 5 tests FAIL on their assertions.

- [ ] **Step 3: Implement** `atelier/asset-storybook/js/review/workorder-buffer.mjs`

```js
// F-053 Phase 1 — browser buffer for Forge work orders (fixes C2.9).
//
// Same model as the review verdict buffer (js/review/ui.mjs): the committed
// content/review-queue.json is the source of truth; localStorage only holds
// orders issued in this browser that have not been exported + committed yet.
// Pure: the caller passes the storage object, so node tests use a fake.

export const WORK_ORDER_LS_KEY = "atlas-storybook-forge-workorders-v1";

const isOrder = (o) =>
  !!o &&
  typeof o === "object" &&
  ["id", "briefId", "cell", "reason", "createdAt"].every((k) => typeof o[k] === "string");

/** @param {{ storage: Storage | null }} opts */
export function readOrderBuffer({ storage }) {
  if (!storage) return { orders: [], ok: false };
  try {
    const raw = storage.getItem(WORK_ORDER_LS_KEY);
    if (!raw) return { orders: [], ok: true };
    const parsed = JSON.parse(raw);
    return { orders: Array.isArray(parsed) ? parsed.filter(isOrder) : [], ok: true };
  } catch {
    return { orders: [], ok: false };
  }
}

/** @param {{ storage: Storage | null, orders: object[] }} opts @returns {boolean} saved */
export function writeOrderBuffer({ storage, orders }) {
  if (!storage) return false;
  try {
    storage.setItem(WORK_ORDER_LS_KEY, JSON.stringify(orders));
    return true;
  } catch {
    return false;
  }
}

/** @param {{ committed: {workOrders?: object[]}, buffered: object[] }} opts */
export function pendingBufferedOrders({ committed, buffered }) {
  const committedIds = new Set((committed.workOrders || []).map((o) => o.id));
  return buffered.filter((o) => !committedIds.has(o.id));
}
```

- [ ] **Step 4: Wire it into the Forge tab.** In `atelier/asset-storybook/js/forge/forge.mjs`:
- Add the import `import { pendingBufferedOrders, readOrderBuffer, writeOrderBuffer } from "../review/workorder-buffer.mjs";`.
- Replace lines 36-40 (the session-state comment and `const sessionOrders = [];`) with:

```js
// Orders issued in this browser and not yet in the committed queue. Buffered
// in localStorage (js/review/workorder-buffer.mjs) so a reload keeps them;
// the committed file stays the source of truth.
let committedQueue = parseQueue(JSON.stringify({ version: 1, verdicts: {} }));
let sessionOrders = [];
// Whether the last buffer write (or read) succeeded — drives the saved label.
let bufferSaved = true;

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
```

- In the submit handler (lines 283-296), before the existing `const payload = …`, add:

```js
    if (reason.value.trim() === "") {
      err.textContent = "reason required";
      err.hidden = false;
      reason.focus();
      return;
    }
```

  After `sessionOrders.push(appended);`, add `bufferSaved = writeOrderBuffer({ storage: browserStorage(), orders: sessionOrders });`.
- In `loadOrders` (line 492), after the `try/catch` that parses `committedQueue`, add:

```js
  const buffer = readOrderBuffer({ storage: browserStorage() });
  sessionOrders = pendingBufferedOrders({ committed: committedQueue, buffered: buffer.orders });
  bufferSaved = buffer.ok;
  // Orders that reached the committed file are dropped from the buffer.
  if (buffer.ok && sessionOrders.length !== buffer.orders.length) {
    bufferSaved = writeOrderBuffer({ storage: browserStorage(), orders: sessionOrders });
  }
```

- In `loadOrders`, after `h3.appendChild(countLabel);` (line 510), add:

```js
  const savedLabel = document.createElement("span");
  savedLabel.className = "forge-orders-saved";
  h3.appendChild(savedLabel);
```

  Then change the two refresh bindings at lines 530-531 and 541 to pass it: `refreshOrders(listHost, countLabel, savedLabel)`, `refreshOrdersFn = () => refreshOrders(listHost, countLabel, savedLabel);`, `attemptsLoadedHandler = () => refreshOrders(listHost, countLabel, savedLabel);`.
- Change `function refreshOrders(listHost, countLabel) {` (line 433) to `function refreshOrders(listHost, countLabel, savedLabel) {`, and after the `countLabel.textContent = …;` statement add:

```js
  savedLabel.textContent =
    sessionOrders.length === 0 ? "" : bufferSaved ? "saved in this browser" : "not saved — browser storage unavailable";
  savedLabel.classList.toggle("is-unsaved", sessionOrders.length > 0 && !bufferSaved);
```

- [ ] **Step 5: CSS.** In `atelier/asset-storybook/index.html`, after the `.forge-orders { … }` rule:

```css
      .forge-orders-saved {
        margin-left: 0.6rem;
        font-family: var(--mono);
        font-size: 0.68rem;
        font-weight: 400;
        color: var(--ok);
      }

      .forge-orders-saved.is-unsaved {
        color: var(--err);
      }
```

- [ ] **Step 6: Run the tests**

Run: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 130`, `ℹ fail 0` (125 + 5). `review-store-workorders.test.mjs` and `forge-export-effective.test.mjs` are unedited and green.
Run: `git diff --stat a5644cbd -- atelier/asset-storybook/tests/review-store-workorders.test.mjs atelier/asset-storybook/tests/forge-export-effective.test.mjs atelier/asset-storybook/tests/forge-staleness.test.mjs atelier/asset-storybook/tests/forge-gallery.test.mjs`
Expected: no output.

- [ ] **Step 7: Manual check.** Serve on 6007 and open Forge. Click ↻ on a card, then **issue work order** with an empty reason: expected `reason required`. Type a reason and submit: the order appears under Pending work orders with `saved in this browser`. Reload the page: the order is still listed. Export still downloads a `review-queue.json` that contains it.

- [ ] **Step 8: Commit**

```bash
git add atelier/asset-storybook/js/review/workorder-buffer.mjs atelier/asset-storybook/tests/forge-workorder-buffer.test.mjs \
  atelier/asset-storybook/js/forge/forge.mjs atelier/asset-storybook/index.html
git commit -m "feat(F-053): keep Forge work orders across reloads in a localStorage buffer"
```

- [ ] **Step 9: Gate B** (Tasks 3–5). Verify with the Suite plus the AC 25 grep (Task 4 Step 6), then the manual checks from Task 3 Step 8, Task 4 Step 7 and Task 5 Step 7 in one browser session. Review with `code-reviewer` + `typescript-reviewer` on `git diff <Gate A end sha>..HEAD -- atelier/asset-storybook`. Focus areas: `loadRows` ordering and error paths, and no double-counting between `committedQueue.workOrders` and `sessionOrders` in `allOrders()` and export. Then run `/simplify` and re-verify.

---

### Task 6: Ship Forge data in the storybook image

**Files:**
- Modify: `atelier/asset-storybook/Dockerfile:50-51` (after the story-explorer / undertow COPY lines)
- Modify: `atelier/asset-storybook/Dockerfile.dockerignore` (whitelist)
- Create: `atelier/asset-storybook/tests/dockerfile-forge.test.mjs`

**Interfaces:**
- Consumes: `RUNS_BASE_URL`, `BRIEFS_BASE_URL` (`js/state.mjs:33-34`) as the paths the page fetches.
- Produces: an image in which `/atelier/art-forge/runs/*` and `/atelier/art-forge/briefs/*` are served.

- [ ] **Step 1: Write the failing test** `atelier/asset-storybook/tests/dockerfile-forge.test.mjs`

```js
// F-053 Phase 1 — C2.8: the Forge tab fetches atelier/art-forge/runs/ and
// briefs/, but the storybook image never copied them, so the deployed page
// could only ever say "not packaged in this image". Every directory the Forge
// tab fetches needs BOTH a COPY line and a "!" whitelist line (BuildKit uses
// Dockerfile.dockerignore, a "*"-first whitelist).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNS_BASE_URL, BRIEFS_BASE_URL } from "../js/state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(join(HERE, "..", "Dockerfile"), "utf8");
const dockerignore = readFileSync(join(HERE, "..", "Dockerfile.dockerignore"), "utf8");

// "../../atelier/art-forge/runs/" (relative to atelier/asset-storybook/) -> "atelier/art-forge/runs"
const repoPath = (url) => url.replace(/^(\.\.\/)+/, "").replace(/\/$/, "");

test("every Forge fetch directory is COPYed into the image and whitelisted in Dockerfile.dockerignore", () => {
  for (const dir of [repoPath(RUNS_BASE_URL), repoPath(BRIEFS_BASE_URL)]) {
    assert.match(dockerfile, new RegExp(`^COPY ${dir} ${dir}$`, "m"), `Dockerfile lacks: COPY ${dir} ${dir}`);
    assert.match(dockerignore, new RegExp(`^!${dir}/\\*\\*$`, "m"), `Dockerfile.dockerignore lacks: !${dir}/**`);
  }
});
```

This imports `js/state.mjs` in node. First check it doesn't touch `document`/`window` at module level: `grep -n "document\.\|window\." atelier/asset-storybook/js/state.mjs`. If it does, replace the import with the two literal URLs copied from `state.mjs:33-34` and a comment saying so.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test atelier/asset-storybook/tests/dockerfile-forge.test.mjs`
Expected: FAIL, `Dockerfile lacks: COPY atelier/art-forge/runs atelier/art-forge/runs`.

- [ ] **Step 3: Implement.** In `atelier/asset-storybook/Dockerfile`, after line 51 (`COPY docs/story/undertow docs/story/undertow`), insert:

```dockerfile
# F-053: the Forge tab fetches the run ledgers + briefs from atelier/art-forge/.
# Without these the deployed storybook can only say "not packaged in this
# image" for every brief. runs/ + briefs/ ONLY (~54 KB of committed JSON):
# out/ is gitignored local renders and the generators are build inputs.
# Keep in sync with the "!" lines in ./Dockerfile.dockerignore.
COPY atelier/art-forge/runs atelier/art-forge/runs
COPY atelier/art-forge/briefs atelier/art-forge/briefs
```

In `atelier/asset-storybook/Dockerfile.dockerignore`, after `!atelier/story-explorer/**`, add:

```
!atelier/art-forge/runs/**
!atelier/art-forge/briefs/**
```

- [ ] **Step 4: Run the test and suite**

Run: `node --test atelier/asset-storybook/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 131`, `ℹ fail 0`.

- [ ] **Step 5: Build and probe the image locally.** This is R1 (a local image build only; no deploy, no push).

```bash
DOCKER_BUILDKIT=1 docker build -f atelier/asset-storybook/Dockerfile -t atlas-storybook:f053-phase1 . 2>&1 | tail -3
docker run --rm --entrypoint ls atlas-storybook:f053-phase1 /usr/share/nginx/html/atelier/art-forge/runs /usr/share/nginx/html/atelier/art-forge/briefs
docker run -d --rm -p 6098:80 --name sb-f053-phase1 atlas-storybook:f053-phase1
curl -s -o /dev/null -w "runs-index %{http_code}\n" http://localhost:6098/atelier/art-forge/runs/_index.json
curl -s -o /dev/null -w "ledger %{http_code}\n" http://localhost:6098/atelier/art-forge/runs/A1-ART-02.json
curl -s -o /dev/null -w "brief %{http_code}\n" http://localhost:6098/atelier/art-forge/briefs/A1-ART-03.json
curl -s -o /dev/null -w "out-not-shipped %{http_code}\n" http://localhost:6098/atelier/art-forge/out/
docker stop sb-f053-phase1
```
Expected: the build ends with `naming to docker.io/library/atlas-storybook:f053-phase1` (exit 0). `ls` lists `A1-ART-02.json _index.json` and `A1-ART-02.json A1-ART-03.json A1-ART-06.json A1-ART-07.json`. The curls print `runs-index 200`, `ledger 200`, `brief 200`, `out-not-shipped 404`. If the Docker daemon isn't running, report that and mark this step unverified; don't claim it.

- [ ] **Step 6: Commit**

```bash
git add atelier/asset-storybook/Dockerfile atelier/asset-storybook/Dockerfile.dockerignore atelier/asset-storybook/tests/dockerfile-forge.test.mjs
git commit -m "build(F-053): ship art-forge run ledgers and briefs in the storybook image"
```

- [ ] **Step 7: Gate C** (deploy surface). Verify by re-running Step 4 and Step 5. Review with `code-reviewer` on the Dockerfile + dockerignore diff. Ask whether the layer order still keeps the ~261 MB asset layer cached, and whether anything under `atelier/art-forge/` other than `runs/` and `briefs/` leaks into the context (`docker build` context-size line). Then `/simplify` and re-verify.

---

### Task 7: Headless smoke test in Gate 1 and CI, plus the ledger-untouched guard

**Files:**
- Create: `atelier/asset-storybook/tests/smoke/run.mjs`
- Create: `atelier/asset-storybook/tests/smoke/scenarios.mjs`
- Create: `atelier/asset-storybook/tests/smoke/fixtures/ledger-malformed.json`
- Modify: `scripts/precheck.sh:163-171`
- Modify: `.github/workflows/ci.yml:255-256` (storybook step) and `:284-285` (art-forge step)

**Interfaces:**
- Consumes the DOM contract from Tasks 1–5: `.forge-rows`; `.forge-pipeline-row[data-brief][data-state]`; `[data-error]`; `.forge-card`; `#detail-overlay`; `.forge-rerun`, `.forge-order-reason`, `.forge-order-submit`, `.forge-order-error`, `.forge-orders-saved`, `.forge-order`; `.empty-state`. Also the file `atelier/asset-storybook/forge-briefs-index.json`.
- Produces: `node atelier/asset-storybook/tests/smoke/run.mjs`. Exit 0 means all ok, or `SKIPPED: no Chrome` when not required. Exit 1 means a scenario failed. Exit 2 means no Chrome while `STORYBOOK_SMOKE_REQUIRED=1`. Env vars: `CHROME_BIN` (exclusive), `SMOKE_BASE` (skip the local server), `SMOKE_OVERRIDE` (JSON `{repoPath: filePath}` for mutation proofs), `SMOKE_TIMEOUT_MS` (default 45000), `SMOKE_DEBUG=1` (Chrome stderr).

The spec's `tests/smoke/harness.html` iframe driver is deliberately not built; see Premise 7b. The smoke directory sits outside the `tests/*.test.mjs` glob, so the Suite never runs it.

- [ ] **Step 1: Write the fixture** `atelier/asset-storybook/tests/smoke/fixtures/ledger-malformed.json` (exactly three lines; line 3 is malformed on purpose):

```
{"v":1,"briefId":"A1-ART-02"}
{"ts":"2026-09-01T00:00:00.000Z","type":"blockin","briefHash":"0000000000000000","out":"out/control/depth/A1-ART-02-depth.png"}
{not json
```

- [ ] **Step 2: Write the scenarios** `atelier/asset-storybook/tests/smoke/scenarios.mjs`

```js
// F-053 Phase 1 — smoke scenarios for the Forge tab. Each scenario gets a
// fresh browser context (own localStorage) and a cold load of the storybook.
// `server` configures the local server: fail = repo paths answered 404,
// override = repo path -> file served instead. Expressions run in the page.

export const SCENARIOS = [
  {
    name: "forge-rows",
    async steps({ waitFor, evaluate, expectedBriefs }) {
      await waitFor(
        `document.querySelectorAll('.forge-pipeline-row').length === ${expectedBriefs}`,
        `${expectedBriefs} pipeline rows (one per forge-briefs-index.json brief)`,
      );
      const s = await evaluate(`(() => ({
        errors: document.querySelectorAll('.forge-rows [data-error]').length,
        display: getComputedStyle(document.querySelector('.forge-rows')).display,
        noLedger: document.querySelectorAll('.forge-pipeline-row[data-state="no-ledger"]').length,
        noLedgerText: [...document.querySelectorAll('.forge-pipeline-row[data-state="no-ledger"]')].every((r) => r.textContent.includes('no ledger yet')),
        ledgered: document.querySelectorAll('.forge-pipeline-row[data-state="ledger"]').length,
      }))()`);
      if (s.errors !== 0) throw new Error(`${s.errors} [data-error] rows on committed data`);
      if (s.display !== "flex") throw new Error(`.forge-rows display is "${s.display}", not "flex": Forge CSS is dead (C0.1)`);
      if (s.ledgered < 1) throw new Error("no ledgered pipeline row");
      if (!s.noLedgerText) throw new Error('a no-ledger row lacks "no ledger yet"');
    },
  },
  {
    name: "forge-detail",
    async steps({ waitFor, evaluate }) {
      await waitFor(`!!document.querySelector('.forge-card')`, "a forge card");
      await evaluate(`document.querySelector('.forge-card').click()`);
      await waitFor(
        `(() => { const o = document.getElementById('detail-overlay'); return !!o && !o.hidden && getComputedStyle(o).position === 'fixed'; })()`,
        "run detail overlay open and position:fixed",
      );
    },
  },
  {
    name: "forge-workorder-persists",
    async steps({ waitFor, evaluate, reload }) {
      await waitFor(`!!document.querySelector('.forge-rerun')`, "a re-run button");
      await evaluate(`document.querySelector('.forge-rerun').click()`);
      await evaluate(`document.querySelector('.forge-order-submit').click()`);
      await waitFor(
        `(() => { const e = document.querySelector('.forge-order-error'); return !!e && !e.hidden && e.textContent === 'reason required'; })()`,
        '"reason required" on an empty reason',
      );
      await evaluate(`(() => {
        document.querySelector('.forge-order-reason').value = 'smoke: re-run';
        document.querySelector('.forge-order-submit').click();
      })()`);
      await waitFor(
        `document.querySelector('.forge-orders-saved')?.textContent === 'saved in this browser'`,
        '"saved in this browser"',
      );
      await reload();
      await waitFor(
        `[...document.querySelectorAll('.forge-order')].some((o) => o.textContent.includes('smoke: re-run'))`,
        "the work order is still listed after a reload",
      );
    },
  },
  {
    name: "ledger-malformed",
    server: { override: { "atelier/art-forge/runs/A1-ART-02.json": "fixtures/ledger-malformed.json" } },
    async steps({ waitFor, expectedBriefs }) {
      await waitFor(
        `[...document.querySelectorAll('.forge-pipeline-row[data-error]')].some((r) => /ledger A1-ART-02\\.json unreadable \\(line 3\\)/.test(r.textContent))`,
        '"ledger A1-ART-02.json unreadable (line 3)" row',
      );
      await waitFor(
        `document.querySelectorAll('.forge-pipeline-row').length === ${expectedBriefs}`,
        "the other briefs still render",
      );
    },
  },
  {
    name: "runs-not-packaged",
    server: { fail: ["atelier/art-forge/runs/_index.json"] },
    async steps({ waitFor }) {
      await waitFor(
        `(document.querySelector('.forge-rows')?.textContent || '').includes('not packaged in this image: atelier/art-forge/runs/_index.json')`,
        '"not packaged in this image" empty state',
      );
    },
  },
];
```

- [ ] **Step 3: Write the runner** `atelier/asset-storybook/tests/smoke/run.mjs`

```js
#!/usr/bin/env node
// F-053 Phase 1 — headless smoke for the asset storybook's Forge tab.
//
// Zero npm dependencies: a node:http server at the repo root + the SYSTEM
// Chrome driven over the DevTools protocol on --remote-debugging-pipe (fd 3
// in, fd 4 out, NUL-delimited JSON). Chosen over the spec's --dump-dom iframe
// harness because this gate must see console errors thrown by the page's own
// module scripts. Works on Node 18 (the CI pin).
//
// Exit: 0 all ok (or "SKIPPED: no Chrome"), 1 a scenario failed,
//       2 no Chrome while STORYBOOK_SMOKE_REQUIRED=1.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./scenarios.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 45000);
const MIME = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".md": "text/markdown",
};

function findChrome() {
  const candidates = process.env.CHROME_BIN
    ? [process.env.CHROME_BIN] // exclusive: a bad value means "no Chrome", never a fallback
    : ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const c of candidates) {
    if (isAbsolute(c)) {
      if (existsSync(c)) return c;
      continue;
    }
    const hit = (process.env.PATH || "").split(delimiter).map((d) => join(d, c)).find((p) => existsSync(p));
    if (hit) return hit;
  }
  return null;
}

function startServer({ fail = [], override = {} }) {
  const log = [];
  const server = createServer((req, res) => {
    const repoPath = decodeURIComponent(new URL(req.url, "http://smoke").pathname).replace(/^\/+/, "");
    log.push({ method: req.method, path: repoPath });
    if (fail.includes(repoPath)) {
      res.writeHead(404);
      res.end("smoke: forced 404");
      return;
    }
    const file = override[repoPath] ? resolve(HERE, override[repoPath]) : resolve(REPO_ROOT, repoPath);
    if (!override[repoPath] && !file.startsWith(REPO_ROOT + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!statSync(file).isFile()) throw new Error("not a file");
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ server, log, base: `http://127.0.0.1:${server.address().port}` })),
  );
}

function launchChrome(chromePath) {
  const userDataDir = mkdtempSync(join(tmpdir(), "sb-smoke-chrome-"));
  const args = [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-pipe", `--user-data-dir=${userDataDir}`, "--window-size=1440,1000", "about:blank",
  ];
  if (process.env.CI) args.push("--no-sandbox"); // GitHub's ubuntu runners restrict the Chrome sandbox
  const proc = spawn(chromePath, args, {
    stdio: ["ignore", "ignore", process.env.SMOKE_DEBUG ? "inherit" : "ignore", "pipe", "pipe"],
  });
  const toChrome = proc.stdio[3];
  const fromChrome = proc.stdio[4];
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1;
  let buffered = Buffer.alloc(0);
  fromChrome.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    let end;
    while ((end = buffered.indexOf(0)) !== -1) {
      const msg = JSON.parse(buffered.subarray(0, end).toString("utf8"));
      buffered = buffered.subarray(end + 1);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else ok(msg.result);
      } else {
        for (const fn of listeners) fn(msg);
      }
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: ok, reject });
      toChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
    });
  return {
    send,
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    async close() {
      await Promise.race([send("Browser.close").catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      proc.kill();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function runScenario({ browser, base, scenario, expectedBriefs }) {
  const { browserContextId } = await browser.send("Target.createBrowserContext");
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const consoleErrors = [];
  const onMessage = (msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
    } else if (msg.method === "Runtime.consoleAPICalled" && p.type === "error") {
      consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(" "));
    } else if (msg.method === "Log.entryAdded" && p.entry.level === "error" && p.entry.source !== "network") {
      // source "network" = a 404 for local-only data (gitignored PNGs, thumbs): expected, not a page bug.
      consoleErrors.push(p.entry.text);
    }
  };
  browser.on(onMessage);
  const send = (method, params) => browser.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page expression threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const waitFor = async (expression, label) => {
    const deadline = Date.now() + TIMEOUT_MS;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return;
      } catch (err) {
        lastError = err; // navigation in progress destroys the context; retry
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`timed out after ${TIMEOUT_MS} ms waiting for: ${label}${lastError ? ` (last: ${lastError.message})` : ""}`);
  };
  try {
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `${base}/atelier/asset-storybook/index.html` });
    await scenario.steps({ evaluate, waitFor, expectedBriefs, reload: () => send("Page.reload") });
    if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
    return { name: scenario.name, ok: true };
  } catch (err) {
    return { name: scenario.name, ok: false, reason: err.message };
  } finally {
    browser.off(onMessage);
    await browser.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    if (process.env.STORYBOOK_SMOKE_REQUIRED === "1") {
      console.error("smoke: FAIL — no Chrome found and STORYBOOK_SMOKE_REQUIRED=1");
      process.exit(2);
    }
    console.log("SKIPPED: no Chrome — storybook smoke did not run");
    process.exit(0);
  }
  const expectedBriefs = JSON.parse(
    readFileSync(join(REPO_ROOT, "atelier/asset-storybook/forge-briefs-index.json"), "utf8"),
  ).briefs.length;
  const globalOverride = process.env.SMOKE_OVERRIDE ? JSON.parse(process.env.SMOKE_OVERRIDE) : {};
  const browser = launchChrome(chrome);
  const results = [];
  try {
    for (const scenario of SCENARIOS) {
      if (process.env.SMOKE_BASE && scenario.server) {
        console.log(`SKIPPED (needs local server): ${scenario.name}`);
        continue;
      }
      let local = null;
      if (!process.env.SMOKE_BASE) {
        local = await startServer({
          fail: scenario.server?.fail,
          override: { ...globalOverride, ...(scenario.server?.override || {}) },
        });
      }
      const result = await runScenario({ browser, base: process.env.SMOKE_BASE || local.base, scenario, expectedBriefs });
      if (local) {
        const nonGet = local.log.filter((r) => r.method !== "GET" && r.method !== "HEAD");
        if (result.ok && nonGet.length) Object.assign(result, { ok: false, reason: `non-GET requests: ${JSON.stringify(nonGet)}` });
        local.server.close();
      }
      console.log(result.ok ? `ok    ${result.name}` : `FAIL  ${result.name} — ${result.reason}`);
      results.push(result);
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`smoke: ${results.length - failed}/${results.length} scenarios ok (${chrome})`);
  process.exit(failed ? 1 : 0);
}

const watchdog = setTimeout(() => {
  console.error("smoke: FAIL — global timeout (Chrome hung?)");
  process.exit(1);
}, 6 * TIMEOUT_MS + 30000);
watchdog.unref();
main().catch((err) => {
  console.error("smoke: FAIL —", err);
  process.exit(1);
});
```

The fixture override path `fixtures/ledger-malformed.json` resolves against `HERE`, while `SMOKE_OVERRIDE` values should be absolute paths (`resolve` keeps absolute paths as they are).

- [ ] **Step 4: Run the smoke on the fixed tree**

Run: `node atelier/asset-storybook/tests/smoke/run.mjs; echo "exit=$?"`
Expected:
```
ok    forge-rows
ok    forge-detail
ok    forge-workorder-persists
ok    ledger-malformed
ok    runs-not-packaged
smoke: 5/5 scenarios ok (/Applications/Google Chrome.app/Contents/MacOS/Google Chrome)
exit=0
```

If `forge-rows` fails only on `console errors:` whose source is outside the Forge tab (e.g. another tab's module), do **not** add an allow-list. File the error as one backlog line naming the file and message, and fix it here only if it is a one-liner inside `js/forge/`. Otherwise stop and report it as a blocker to the coordinator. The owner's criterion is "no console errors".

- [ ] **Step 5: Prove the smoke isn't vacuous (mutation checks)**

```bash
S="$TMPDIR/f053-smoke"; mkdir -p "$S"
git show a5644cbd:atelier/asset-storybook/index.html > "$S/index-unfixed.html"
SMOKE_OVERRIDE="{\"atelier/asset-storybook/index.html\":\"$S/index-unfixed.html\"}" node atelier/asset-storybook/tests/smoke/run.mjs; echo "exit=$?"
STORYBOOK_SMOKE_REQUIRED=1 CHROME_BIN=/nonexistent node atelier/asset-storybook/tests/smoke/run.mjs; echo "exit=$?"
CHROME_BIN=/nonexistent node atelier/asset-storybook/tests/smoke/run.mjs; echo "exit=$?"
```
Expected, in order:
1. `FAIL  forge-rows — .forge-rows display is "block", not "flex": Forge CSS is dead (C0.1)`, and `exit=1`.
2. `smoke: FAIL — no Chrome found and STORYBOOK_SMOKE_REQUIRED=1`, `exit=2`.
3. `SKIPPED: no Chrome — storybook smoke did not run`, `exit=0`.

If item 1 reports a different reason, for example the detail overlay (also dead CSS), that still counts as a valid red. Record the actual line.

- [ ] **Step 6: Wire the smoke into Gate 1.** In `scripts/precheck.sh`, replace `art_forge_tests()` and `storybook_tests()` (lines 163-171) with:

```bash
art_forge_tests() {
  # F-053: the suite must leave the committed run ledgers byte-identical —
  # tests once appended 18 entries to runs/A1-ART-02.json.
  local before after
  before=$(cat "$REPO_ROOT"/atelier/art-forge/runs/*.json | shasum)
  ( cd "$REPO_ROOT/atelier/art-forge" && node --test tests/*.test.mjs ) || return 1
  after=$(cat "$REPO_ROOT"/atelier/art-forge/runs/*.json | shasum)
  [ "$before" = "$after" ] || { echo "art-forge tests modified atelier/art-forge/runs/*.json"; return 1; }
}

storybook_tests() {
  # F-038: taxonomy resolution, thumb-index join, verdict store. Pure modules,
  # so they run here with no browser and no Blender.
  # F-053: plus the headless Forge smoke (skips loudly, exit 0, with no Chrome).
  ( cd "$REPO_ROOT" && node --test atelier/asset-storybook/tests/*.test.mjs \
      && node atelier/asset-storybook/tests/smoke/run.mjs )
}
```

Check how `run_section` treats a function's non-zero status first (`grep -n "run_section()" -A15 scripts/precheck.sh`), and keep `return 1` if it relies on exit status.

- [ ] **Step 7: Wire the smoke into CI.** In `.github/workflows/ci.yml`, after line 256 (`run: node --test atelier/asset-storybook/tests/*.test.mjs`), insert:

```yaml

      # F-053: headless Forge smoke (system Chrome over the DevTools pipe, no
      # npm deps). STORYBOOK_SMOKE_REQUIRED turns "no Chrome" into exit 2, so
      # this step can never pass by skipping.
      - name: Asset storybook headless smoke
        env:
          STORYBOOK_SMOKE_REQUIRED: "1"
        run: node atelier/asset-storybook/tests/smoke/run.mjs
```

After the art-forge step (`run: node --test atelier/art-forge/tests/*.test.mjs`, currently line 285, which moves down by 8 after the insert above), insert:

```yaml

      # F-053: art-forge tests once appended 18 entries to the committed ledger.
      # A clean checkout must stay clean after the suite.
      - name: Art forge tests left the committed run ledgers untouched
        # git status, not git diff: diff ignores untracked files, so a test that
        # created a new runs/<brief>.json would slip past it.
        run: test -z "$(git status --porcelain -- atelier/art-forge/runs)"
```

- [ ] **Step 8: Verify the wiring locally**

Run: `grep -n "STORYBOOK_SMOKE_REQUIRED" .github/workflows/ci.yml | wc -l` → expected `1`.
Run: `node -e 'const y=require("fs").readFileSync(".github/workflows/ci.yml","utf8"); if(/\t/.test(y)) throw new Error("tab in YAML"); console.log("ci.yml ok")'` → expected `ci.yml ok`.
Run: `bash scripts/precheck.sh 2>&1 | tail -25` → expected `PASS` rows for `art-forge: node --test suite` and `asset-storybook: node --test suite`, and `RESULT: GATE 1 PASS`. If an unrelated section fails (server/nakama deps missing in a fresh worktree), run `pnpm install --frozen-lockfile` first. If it still fails, report the section name and the output tail; don't claim a pass.

- [ ] **Step 9: Smoke against the built image** (from Task 6; local only)

```bash
docker run -d --rm -p 6098:80 --name sb-f053-phase1 atlas-storybook:f053-phase1
SMOKE_BASE=http://localhost:6098 node atelier/asset-storybook/tests/smoke/run.mjs; echo "exit=$?"
docker stop sb-f053-phase1
```
Expected: `ok` for forge-rows, forge-detail and forge-workorder-persists; `SKIPPED (needs local server)` for ledger-malformed and runs-not-packaged; `exit=0`. Rebuild the image first if `index.html` or `js/` changed after Task 6.

- [ ] **Step 10: Commit**

```bash
git add atelier/asset-storybook/tests/smoke/run.mjs atelier/asset-storybook/tests/smoke/scenarios.mjs \
  atelier/asset-storybook/tests/smoke/fixtures/ledger-malformed.json scripts/precheck.sh .github/workflows/ci.yml
git commit -m "test(F-053): headless Forge smoke and ledger-untouched guard in Gate 1 and CI"
```

- [ ] **Step 11: Gate D** (CI surface). Verify with Steps 4, 5, 8 and 9. Review with `code-reviewer` + `typescript-reviewer` on the Task 7 diff. Focus areas: CDP pipe framing, orphaned Chrome processes on failure (`ps aux | grep -c "sb-smoke-chrome"` after a failing run should be 0), and whether the ubuntu `google-chrome` + `--no-sandbox` assumption holds. Then `/simplify` and re-verify. After push, the first CI run is the real proof: open the run with `gh run view --log` for the job, confirm both new steps ran (not skipped), and quote their result lines.

---

## Acceptance for this plan (all must be shown with command output)

1. `node --test atelier/asset-storybook/tests/*.test.mjs` shows `ℹ tests 131`, `ℹ fail 0` (known env-index partial-checkout cases named if present).
2. `node --test atelier/art-forge/tests/*.test.mjs` is green and the runs ledgers are unchanged (shasum diff empty).
3. `node atelier/asset-storybook/tests/smoke/run.mjs` shows `5/5 scenarios ok`, and the three mutation checks give exit 1 / 2 / 0.
4. `bash scripts/precheck.sh` ends in `RESULT: GATE 1 PASS`.
5. The image serves `atelier/art-forge/runs/_index.json` with 200, and `SMOKE_BASE` smoke against it is ok.
6. The owner sees it: the Forge tab at `http://localhost:6007/atelier/asset-storybook/index.html` shows 4 rows (1 ledgered, 3 `no ledger yet`), one notice per batch, a working run detail, and work orders that survive a reload.

## Later phases (not planned here)

- **Spec P0 remainder:** C0.4 grid geometry (`VirtualGrid` hidden-section collapse, card clipping), `data-boot`, and the `boot`/`detail-legacy`/`grid-geometry`/`nomanifest` smoke scenarios.
- **Spec P1:** node-safe imports, the `sections.json` registry (`sb/` in the spec is shorthand for `atelier/asset-storybook/`, so `forge-briefs-index.json` is already where P1 expects it and does not move), shell/router/sidebar, the dashboard with its PIPELINES/TASKS/STATUS panels, and packaging of the catalogs + `.release.json`.
- **Spec P2:** generic `ListView`/`RecordCard`/`DetailView`, the accept verdict, keyboard review loop, env renders reviewable with provenance, and DOM budgets.
- **Spec P3:** Map Sheets/Forge/Story/Combat onto the shell (`forge-ledger` adapter, `js/review/workorder-form.mjs`, Forge export button removed), `#/s/pipelines` and `#/s/tasks`, and env-render thumbnails.
- **Spec P4:** the status/progress index (`gen_status_index.mjs --check`).

## Follow-ups (filed, not fixed)

- [ ] **Step: file the out-of-scope idea.** Once Gate D passes, keep this line here as the backlog note (no `ps-release-workflow` idea command for it): `generateEnv --dry-run` is not side-effect free: it writes `out/control/depth/*.png` and appends a real `blockin` ledger entry (`atelier/art-forge/generate/env.mjs:885-889`); make dry-run write nothing, and then decide whether the older untraceable dry-run `blockin` entries in `runs/A1-ART-02.json` can be identified and removed.

## Audit trail

- 2026-09-14: plan written against `a5644cbd` (feat/F-053 fast-forwarded to release/1.10). Premise corrections: 2b′ (18 test entries, not 9), 3 (builder reshaped, brief index location), 4 (0/59 tracked; the symptom was per-card text, not broken images), 7b (CDP pipe instead of the dump-dom harness). The CSS parse test moved from Task 7 into Task 1 as that task's failing test; it runs in the existing Suite, which CI and precheck already call.

## Appendix — audit trail

- 2026-09-14 self-grill-audit: verdict safe-with-fixes. Corrected:
  - HIGH-1: Task 4 now probes every card instead of only the newest PNG per batch. PNGs that are present render; the notice counts only missing ones; a manual partial-`out/` check was added.
  - HIGH-2: Task 3 decides "no ledger yet" from a 404 on `runs/<brief>.json` instead of `runs/_index.json`, which is rebuilt by hand and never parity-checked. Chosen over a parity test because it leaves no second source that can drift. The index stays only as the packaging probe.
  - Task 2 Step 7 expects `tests 7` (2 existing + 5 new), not 8.
  - The CI ledger guard uses `test -z "$(git status --porcelain -- atelier/art-forge/runs)"`, so untracked files are caught too.
  - `sb/` is the spec's shorthand for `atelier/asset-storybook/` (`spec.md:12`). Premise 3′ and "Later phases" no longer imply a new directory or a move.
  - "18 test-written entries" is now stated as a lower bound, and `blockin 125` as the post-cleanup count of identified entries, with the caveat.
  - Every import-masked TDD red step now creates stub exports first. The run-ledger "no trailing newline" test is marked as a regression guard that passes on current code; the named reds fail on behaviour.
  - Small facts: puppeteer at `pnpm-lock.yaml:3842`/`:9542`; `BRIEFS_BASE_URL` at `state.mjs:34`; pair gaps 0.19–0.47 s; runs + briefs ~54 KB; the stale count includes `blockin` attempts.
  - The `generateEnv --dry-run` side-effect idea is filed as a one-line note under "Follow-ups (filed, not fixed)".
- Open: none.
