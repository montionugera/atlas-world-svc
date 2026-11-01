# Atlas web app in local k8s Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `atlas-world.joymify.local.com` always shows exactly what the last release shipped, from a cluster workload, so an image or game-data change lands through the normal release flow and never depends on which checkout holds a port.

**Architecture:** One image of the existing Python server, built from a `git archive` export of HEAD, with `ATLAS_READ_ONLY=1`. A guard refuses every POST and DELETE, the UI hides write controls, and `verify-atlas-web.sh` proves the served commit and data. The Mac host process stays for editing at `atlas-edit.joymify.local.com`.

**Tech Stack:** Python 3.13 stdlib server, vanilla JS frontend slices plus ES-module panels, Docker BuildKit, Kubernetes on OrbStack, ingress-nginx, `node --test`, Playwright (from `client/react-client/node_modules`).

**Spec:** `.claude/idea_backlog/I-246-atlas-web-app-in-local-k8s-deployed-via/spec.md` (after refine: the same file under `.claude/refined_backlog/`). Executors read both. The Design section is the brief for anything this plan does not restate.

## Global Constraints

- Local cluster only. Every `kubectl` uses `--context orbstack`, or goes through `deploy-local.sh`, which has its own context guard. Invoke the `k8s-safety` skill before the first `kubectl` write.
- No new website, database server, auth, production deployment, or `psrw` change.
- Flag unset means existing behaviour is unchanged (R4).
- Image tags: `atlas-world-web:local` plus `atlas-world-web:<full sha>`; `imagePullPolicy: Never`; one replica; readiness probe on `/healthz`.
- Refusal body, exactly: `403 {"ok": false, "error": {"code": "read_only", "message": "..."}}`.
- Copy, exactly: "Read-only · 1.19 · <7-char commit>"; "Not saved: this is a read-only release page. Reload to see the current release."; "Not in this release image. Open the edit site."; "Loading release…"; "Version unknown"; "Can't load this release. A deploy may be in progress."
- Image size target 500 MB. If over, record the excess and ask the owner; do not trim (spec Assumptions).
- Do not stop the process on `:8788`; it belongs to another session.
- Code line numbers move when F-167 lands. Locate code by function name, not line.

## Spec corrections found while planning

Measured on `_release` at a607cdb36. Each is folded into the tasks below.

| # | Spec says | Found | Decision |
|---|---|---|---|
| C1 | Server never rebuilds while read-only | `run_readonly_sql` calls `ensure_catalog_db()` on every `/api/sql`, not only `main()` | Guard goes inside `ensure_catalog_db`, Task 1 |
| C2 | 14 POST routes | 11 in `do_POST` + 2 exact in `ROUTES` + 1 prefix | Test derives the list from source, so the number can't drift, Task 1 |
| C3 | A mount missing from the image fails unless on the one-tab exclusion list | `atelier/art-forge/out` has 0 tracked files, so no commit can contain it; Forge already shows a "missing render" notice | Separate `ABSENT_MOUNTS` list with a reason, one entry, Task 3 |
| C4 | Build from `git archive` | `git archive` does run LFS smudge (glb 2,584,012 bytes in the export, same as the working tree). A missing LFS object would still leave a pointer file | Image check scans for pointer files, Task 3 |
| C5 | Compare a concept-art md5 with `git show HEAD:<path>` | `git show` returns the LFS pointer for LFS paths. `content/concept-art/images/*.webp` is not LFS (md5 matched) | Verify picks a `.webp` under `content/concept-art/images`, Task 5 |
| C6 | Tests at `scripts/tests/atlas-web-read-only.test.*` | Neither pytest nor `scripts/tests` runs in Gate 1: `precheck.sh` has no such section; only Gate 2 and CI run `npm test --prefix scripts` | Node tests, plus a new Gate 1 section over `scripts/tests/atlas-web-*.test.mjs`, Task 1 |
| C7 | `deploy-local.sh` applies the ingress before roll | Switching hostnames before the pod is ready gives a 503 | Ingress apply moves after the roll, Task 5 |
| C8 | "Stale tabs" write callers | `saveIncrementalComposableFeaturesToDisk` swallows failure with `.catch(() => {})` then shows a saved badge; `rebuildDb` ignores the result | Both are fixed in Task 2 |
| C9 | New hostname needs DNS | `atlas-edit.joymify.local.com` already resolves to the Tailscale IP. The 200 seen earlier was ingress-nginx `/healthz`; `/` on that host answers 404, and there is no catch-all | No DNS work. Checks must read a JSON body, never trust a status alone |
| C10 | Theme file | Pod falls through `THEME_CSS_CANDIDATES` to `tools/mac-observatory/joy-theme.css`, which holds `joy-spatial-shell` (35 hits) and is 121 bytes off the joy-design build | Accept; acceptance check covers it |
| C11 | A missing thumb "shows the placeholder" | No placeholder exists. Strict mode 404s the 36 hardcoded thumbs in `08_catalog_and_3d_modal_views.js` and 4 of 66 bundle thumbs, and no `<img>` has `onerror` | While read-only the server answers a missing thumb with a plain SVG and `X-Thumb-Missing: 1`, Task 1. An explicit `strict=1` still 404s for audits |
| C12 | VerdictSync stops retrying | Two syncs run on the assets tab: `assets.mjs` `mount` and `ui.mjs` `startHostedSync`, so each change already POSTs twice on the host | Remove the `assets.mjs` copy; its note follows `storybook:verdict-save-status`. No sync starts on a read-only page, so the buffer flush at load can't POST, Task 2 |
| C13 | Audit | `selectProposalTake` only sets local state and re-renders; it is not a write, and the spec never listed it | Dropped from the hidden list and from Step 4, Task 2 |

**Ruling:** no wiki page. The owner's wiki rule covers game systems, and this is internal tooling.

---

### Task 1: Read-only mode in the server (slice 1)

**Files:**
- Create: `scripts/atlas_world_web/runtime.py`
- Modify: `scripts/catalog_explorer_web.py` (imports, `ensure_catalog_db`, `do_GET`, `do_POST`, `do_DELETE`), `scripts/atlas_world_web/routes.py` (GET table), `scripts/precheck.sh` (new Gate 1 section, C6)
- Test: `scripts/tests/atlas-web-read-only.test.mjs`

**Interfaces:**
- Produces: `GET /api/runtime` returning `{"readOnly": bool, "release": str|null, "commit": str|null}`; `body[data-read-only="1"]` in the served HTML; env `ATLAS_READ_ONLY`, `ATLAS_RELEASE`, `ATLAS_COMMIT`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/atlas-web-read-only.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'scripts/catalog_explorer_web.py'), 'utf8');
const ROUTES_SRC = readFileSync(path.join(ROOT, 'scripts/atlas_world_web/routes.py'), 'utf8');

function writeRoutes() {
  const body = SRC.slice(SRC.indexOf('def do_POST'), SRC.indexOf('def main()'));
  const fromChain = [...body.matchAll(/parsed\.path == "([^"]+)"/g)].map((m) => m[1]);
  const postTable = ROUTES_SRC.slice(ROUTES_SRC.indexOf('"POST": ['), ROUTES_SRC.indexOf('"DELETE"'));
  const fromTable = [...postTable.matchAll(/\("(\/api\/[^"]+)"/g)].map((m) => m[1]);
  return [...fromChain, ...fromTable.map((p) => (p.endsWith('/') ? `${p}x` : p))];
}

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function startServer(env) {
  const port = await freePort();
  const child = spawn('python3', ['scripts/catalog_explorer_web.py', '--port', String(port)], {
    cwd: ROOT, env: { ...process.env, ATLAS_READ_ONLY: '', ...env }, stdio: 'ignore',
  });
  // 60s: with the flag unset, a fresh worktree builds the catalog before it listens.
  for (let i = 0; i < 600; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) {
        return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('server did not start');
}

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const s = statSync(p); h.update(`${p}:${s.size}:${s.mtimeMs}\n`); }
    }
  };
  walk(dir);
  return h.digest('hex');
}

const dbState = () => { try { return statSync(path.join(ROOT, 'build/catalog.sqlite')).mtimeMs; } catch { return null; } };

test('write route list is derived and non-trivial', () => {
  const routes = writeRoutes();
  assert.ok(routes.includes('/api/rebuild'));
  assert.ok(routes.includes('/api/review-queue/asset-verdicts'));
  assert.ok(routes.includes('/api/map-builder/x'));
  assert.ok(routes.length >= 14, String(routes.length));
});

test('read-only refuses every write, leaves the tree alone', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1', ATLAS_RELEASE: '9.9', ATLAS_COMMIT: 'a'.repeat(40) });
  t.after(() => srv.stop());
  const before = treeHash(path.join(ROOT, 'content'));
  for (const route of [...writeRoutes(), '/api/not-a-route']) {
    const res = await fetch(srv.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 403, route);
    const body = await res.json();
    assert.equal(body.ok, false, route);
    assert.equal(body.error.code, 'read_only', route);
  }
  const del = await fetch(`${srv.url}/api/map-builder/x`, { method: 'DELETE' });
  assert.equal(del.status, 403);
  assert.equal(treeHash(path.join(ROOT, 'content')), before);
});

test('read-only reports the baked version, marks the body, never rebuilds', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1', ATLAS_RELEASE: '9.9', ATLAS_COMMIT: 'a'.repeat(40) });
  t.after(() => srv.stop());
  assert.deepEqual(await (await fetch(`${srv.url}/api/runtime`)).json(),
    { readOnly: true, release: '9.9', commit: 'a'.repeat(40) });
  assert.match(await (await fetch(srv.url)).text(), /<body data-read-only="1">/);
  const before = dbState();
  await fetch(`${srv.url}/api/sql?q=${encodeURIComponent('SELECT 1')}`);
  assert.equal(dbState(), before);
});

test('read-only caches vendor and thumbs by ETag only', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1' });
  t.after(() => srv.stop());
  const res = await fetch(`${srv.url}/vendor/ol.css`);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(`${srv.url}/vendor/ol.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('read-only answers a missing thumb with the placeholder, never a substitute', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1' });
  t.after(() => srv.stop());
  const res = await fetch(`${srv.url}/thumbs/0000000000000000.webp`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-thumb-missing'), '1');
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  const strict = await fetch(`${srv.url}/thumbs/0000000000000000.webp?strict=1`);
  assert.equal(strict.status, 404);
});

test('flag unset keeps behaviour', async (t) => {
  const srv = await startServer({});
  t.after(() => srv.stop());
  assert.deepEqual(await (await fetch(`${srv.url}/api/runtime`)).json(),
    { readOnly: false, release: null, commit: null });
  const res = await fetch(`${srv.url}/api/not-a-route`, { method: 'POST' });
  assert.equal(res.status, 404);
  const vendor = await fetch(`${srv.url}/vendor/ol.css`);
  assert.equal(vendor.headers.get('cache-control'), 'public, max-age=86400');
  const thumb = await fetch(`${srv.url}/thumbs/0000000000000000.webp`);
  assert.equal(thumb.headers.get('x-thumb-missing'), null);
  assert.doesNotMatch(await (await fetch(srv.url)).text(), /data-read-only="1">/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts && node --test tests/atlas-web-read-only.test.mjs`
Expected: FAIL, the POST answers are 404 or 415, not 403, and `/api/runtime` answers 404.

- [ ] **Step 3: Write the module**

```python
# scripts/atlas_world_web/runtime.py
"""Read-only release mode: the flag, the version it reports, and the write refusal.

The env is read on every call so tests and a restarted pod never see a cached answer.
"""

from __future__ import annotations

import hashlib
import json
import os

READ_ONLY_MESSAGE = "This is a read-only release page. Edit on atlas-edit.joymify.local.com."
MISSING_THUMB_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    b'<rect width="64" height="64" fill="#2a2d34"/>'
    b'<path d="M20 20l24 24M44 20L20 44" stroke="#6b7280" stroke-width="3"/></svg>'
)


def read_only() -> bool:
    return os.environ.get("ATLAS_READ_ONLY") == "1"


def payload() -> dict:
    if not read_only():
        return {"readOnly": False, "release": None, "commit": None}
    return {
        "readOnly": True,
        "release": os.environ.get("ATLAS_RELEASE") or None,
        "commit": os.environ.get("ATLAS_COMMIT") or None,
    }


def refuse_write(handler) -> bool:
    """Answer 403 and return True while read-only. Call first in do_POST and do_DELETE."""
    if not read_only():
        return False
    raw = json.dumps(
        {"ok": False, "error": {"code": "read_only", "message": READ_ONLY_MESSAGE}}
    ).encode("utf-8")
    # The request body stays unread, so this connection can't carry another request.
    handler.close_connection = True
    handler.send_response(403)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Connection", "close")
    handler.end_headers()
    handler.wfile.write(raw)
    return True


def send_missing_thumb(handler) -> bool:
    """While read-only, a thumb with no file gets a plain placeholder, not another asset's art."""
    if not read_only():
        return False
    handler.send_response(200)
    handler.send_header("Content-Type", "image/svg+xml")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("X-Thumb-Missing", "1")
    handler.send_header("Content-Length", str(len(MISSING_THUMB_SVG)))
    handler.end_headers()
    handler.wfile.write(MISSING_THUMB_SVG)
    return True


def mark_body(html: str) -> str:
    """Server-set so no write control flashes before the first script runs."""
    if not read_only():
        return html
    return html.replace("<body>", '<body data-read-only="1">', 1)


def send_cacheable(handler, raw: bytes, content_type: str, host_cache_control: str) -> None:
    """Keep the host's long cache; while read-only, revalidate so old art can't outlive a release."""
    if not read_only():
        handler.send_response(200)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Cache-Control", host_cache_control)
        handler.send_header("Content-Length", str(len(raw)))
        handler.end_headers()
        handler.wfile.write(raw)
        return
    etag = '"' + hashlib.md5(raw, usedforsecurity=False).hexdigest() + '"'
    if handler.headers.get("If-None-Match") == etag:
        handler.send_response(304)
        handler.send_header("ETag", etag)
        handler.end_headers()
        return
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("ETag", etag)
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)
```

- [ ] **Step 4: Wire it in**

In `routes.py`, add `runtime` to the `from . import ...` line, add this handler, and add `("/api/runtime", _runtime),` to the `"GET"` table:

```python
def _runtime(handler, path: str, *, head: bool = False) -> None:
    _send_json(handler, runtime.payload(), head=head)
```

In `catalog_explorer_web.py`:

```python
# both import branches
from scripts.atlas_world_web import review_queue, routes as web_routes, runtime as web_runtime
from atlas_world_web import review_queue, routes as web_routes, runtime as web_runtime  # type: ignore

# first statement of ensure_catalog_db (C1)
    if web_runtime.read_only():
        return

# do_GET "/" branch
raw = web_runtime.mark_body(load_modular_index_html()).encode("utf-8")

# do_GET vendor branch, replacing the send block
web_runtime.send_cacheable(self, target.read_bytes(), content_type, "public, max-age=86400")
return

# do_GET thumbs branch
strict = "strict=1" in (parsed.query or "") or self.headers.get("X-Strict-Thumb") == "1"
target = resolve_thumb_file(parsed.path, allow_fallback=not (strict or web_runtime.read_only()))
if target and target.exists():
    web_runtime.send_cacheable(self, target.read_bytes(), "image/webp", "public, max-age=86400")
    return
if not strict and web_runtime.send_missing_thumb(self):
    return

# first statement of do_DELETE and of do_POST, before web_routes.dispatch
if web_runtime.refuse_write(self):
    return
```

- [ ] **Step 5: Put the tests in Gate 1 (C6)**

Every test file in this plan is named `scripts/tests/atlas-web-*.test.mjs`, so one glob covers them. In `scripts/precheck.sh`, add this beside `storybook_tests`, and a `run_section "atlas web: node --test suite" atlas_web_tests` line after the `map-builder` one:

```bash
atlas_web_tests() {
  # I-246: read-only guard, hidden controls, image contents, routing, the verify script.
  ( cd "$REPO_ROOT/scripts" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" tests/atlas-web-*.test.mjs )
}
```

- [ ] **Step 6: Run the tests**

Run: `cd scripts && node --test tests/atlas-web-read-only.test.mjs && cd .. && python3 -m pytest tests/test_atlas_world_web.py -q`, then `./scripts/precheck.sh --no-install 2>&1 | grep "atlas web"`.
Expected: PASS for both, and the Gate 1 line reads pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/atlas_world_web/runtime.py scripts/atlas_world_web/routes.py scripts/catalog_explorer_web.py scripts/precheck.sh scripts/tests/atlas-web-read-only.test.mjs
git commit -m "feat: add read-only release mode to the atlas web server"
```

- [ ] **Step 8: Phase gate** (rule 7), shared with Task 2 as one wave: verify, `code-reviewer` + `python-reviewer` on `model: opus`, `/simplify`, re-verify.

### Task 2: Read-only behaviour in the page (slice 1)

**Files:**
- Modify: `scripts/atlas_world_web/frontend/01_shell_and_styles.html`, `02_state_and_composable_layers.js`, `02b_cartography_pipeline.js`, `07_studio_perspectives_views.js`
- Modify: `atelier/atlas-world-panels/js/view/VerdictSync.mjs`, `js/forge/work-orders.mjs`, `js/forge/forge.mjs`, `js/map-builder.mjs`, `js/panels/map-builder.mjs`, plus the files that build asset verdict marks (`js/panels/assets.mjs`, `js/review/ui.mjs`)
- Test: `scripts/tests/atlas-web-frontend-read-only.test.mjs`, plus a new case in `atelier/atlas-world-panels/tests/` for VerdictSync

**Interfaces:**
- Consumes: `/api/runtime`, `body[data-read-only]`, the 403 shape (Task 1).
- Produces: `window.atlasWrite(url, init)`: same as `fetch`, but on a `read_only` refusal sets the not-saved line and rejects with an `Error` whose `.readOnly === true`.

- [ ] **Step 1: Write the failing static test**

```js
// scripts/tests/atlas-web-frontend-read-only.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONT = path.join(ROOT, 'scripts/atlas_world_web/frontend');
const slices = readdirSync(FRONT).map((f) => [f, readFileSync(path.join(FRONT, f), 'utf8')]);
const shell = slices.find(([f]) => f.startsWith('01_'))[1];
const all = slices.map(([, s]) => s).join('\n');
const panel = (p) => readFileSync(path.join(ROOT, 'atelier/atlas-world-panels/js', p), 'utf8');

// spec "Hidden controls", in spec order. Every handler that reaches a write route.
const HIDDEN_HANDLERS = [
  'rebuildDb', 'triggerBalanceSim', 'submitReviewVerdict', 'togglePaletteAsset',
  'undoStudioSnapshot', 'runAiStudioAgent', 'applyInteractiveMapStructure', 'launch3dClient',
  'saveStudioRationaleForm', 'toggleStudioQualityPillar', 'triggerStudioChildGeneration',
  'saveIncrementalComposableFeaturesToDisk',
];

test('every listed write control is hidden by the read-only rule', () => {
  const rule = shell.slice(shell.indexOf('/* read-only controls */'), shell.indexOf('/* end read-only controls */'));
  assert.ok(rule.includes('body[data-read-only]'));
  for (const h of HIDDEN_HANDLERS) {
    assert.ok(all.includes(`${h}(`), `${h} no longer exists`);
    assert.ok(rule.includes(`"${h}`), `${h} not hidden`);
  }
});

test('panel write controls carry the marker', () => {
  for (const p of ['forge/forge.mjs', 'panels/assets.mjs', 'review/ui.mjs']) {
    assert.ok(panel(p).includes('data-write-control') || panel(p).includes('writeControl'), p);
  }
});

test('no frontend slice writes outside atlasWrite', () => {
  for (const [f, s] of slices) {
    const direct = s.split('\n').filter((l) => /\bfetch\(/.test(l) && /'POST'|"POST"|'DELETE'/.test(l));
    assert.deepEqual(direct, [], f);
    const multi = [...s.matchAll(/\bfetch\([^)]*?\{\s*method:/g)].filter((m) => !m[0].includes('GET'));
    assert.equal(multi.length, 0, f);
  }
});

test('the verdict sync starts in one place, and never on a read-only page', () => {
  assert.doesNotMatch(panel('panels/assets.mjs'), /startVerdictSync/);
  assert.match(panel('review/ui.mjs'), /hosted\(\) && !document\.body\.hasAttribute\("data-read-only"\)/);
});

test('the excluded Map Builder tab renders its message and offers no recheck', () => {
  const src = panel('map-builder.mjs');
  const guard = src.slice(src.indexOf('hasAttribute("data-read-only")'), src.indexOf('checkHealth(apiBase)'));
  assert.ok(guard.includes('main.appendChild(section)'));
  assert.ok(guard.includes('excluded: true'));
  assert.match(panel('panels/map-builder.mjs'), /!result\.ready && !result\.excluded/);
});

test('status line is announced to screen readers', () => {
  assert.match(shell, /id="topbarStatus"[^>]*role="status"/);
});

test('map layer save no longer swallows failure', () => {
  assert.doesNotMatch(all, /map-layers[\s\S]{0,200}\.catch\(\(\) => \{\}\)/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts && node --test tests/atlas-web-frontend-read-only.test.mjs`
Expected: FAIL on the missing rule, marker, and role.

- [ ] **Step 3: Add the rule and the helper**

In `01_shell_and_styles.html`, in the `<style>` block, build the selector from the handler list, matching both `onclick` and `onchange`. Palette cards are the exception: the `<label class="tag-asset-card">` itself carries `onclick`, so a plain match would hide the whole gallery. Hide only the checkbox and stop the label's click:

```css
/* read-only controls */
body[data-read-only] [data-write-control],
body[data-read-only] [onclick*="rebuildDb"],
body[data-read-only] [onclick*="triggerBalanceSim"],
body[data-read-only] [onclick*="submitReviewVerdict"],
body[data-read-only] input[onclick*="togglePaletteAsset"],
body[data-read-only] [onclick*="undoStudioSnapshot"],
body[data-read-only] [onclick*="runAiStudioAgent"],
body[data-read-only] [onclick*="applyInteractiveMapStructure"],
body[data-read-only] [onclick*="launch3dClient"],
body[data-read-only] [onclick*="saveStudioRationaleForm"],
body[data-read-only] [onclick*="toggleStudioQualityPillar"],
body[data-read-only] [onchange*="toggleStudioQualityPillar"],
body[data-read-only] [onclick*="triggerStudioChildGeneration"],
body[data-read-only] [onclick*="saveIncrementalComposableFeaturesToDisk"] { display: none !important; }
body[data-read-only] label[onclick*="togglePaletteAsset"] { pointer-events: none; }
/* end read-only controls */
```

Set `role="status"` on `#topbarStatus`. Give the first `.sidebar-footer` span `id="sidebarVersion"`. Check `#topbarStatus` stays visible at 390px and with the sidebar collapsed; the screenshot in Task 6 proves it.

At the top of `02_state_and_composable_layers.js`:

```js
const ATLAS_EDIT_URL = 'http://atlas-edit.joymify.local.com/';
const ATLAS_NOT_SAVED = 'Not saved: this is a read-only release page. Reload to see the current release.';

function atlasIsReadOnly() { return document.body.hasAttribute('data-read-only'); }

window.atlasWrite = async function atlasWrite(url, init) {
  const res = await fetch(url, init);
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body && body.error && body.error.code === 'read_only') {
      const status = document.getElementById('topbarStatus');
      status.textContent = ATLAS_NOT_SAVED;
      status.style.whiteSpace = 'normal'; // 82 characters do not fit a nowrap pill at 390px
      const err = new Error(ATLAS_NOT_SAVED);
      err.readOnly = true;
      throw err;
    }
  }
  return res;
};
// A refused write already told the user; it is not an uncaught failure.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.readOnly) e.preventDefault();
});

function renderVersionLine(text) {
  const status = document.getElementById('topbarStatus');
  const link = document.createElement('a');
  link.href = ATLAS_EDIT_URL;
  link.textContent = text;
  status.replaceChildren(link);
  const footer = document.getElementById('sidebarVersion');
  if (footer) footer.textContent = text;
}

async function loadRuntime() {
  if (atlasIsReadOnly()) document.getElementById('topbarStatus').textContent = 'Loading release…';
  try {
    const res = await fetch('/api/runtime');
    // A pre-merge edit host has no such route; a read-only image always has it.
    if (res.status === 404) return;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rt = await res.json();
    if (rt.readOnly) renderVersionLine(`Read-only · ${rt.release} · ${String(rt.commit).slice(0, 7)}`);
  } catch {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!local) document.body.setAttribute('data-read-only', '1');
    if (atlasIsReadOnly()) renderVersionLine('Version unknown');
  }
}

function showBundleError() {
  const box = document.createElement('div');
  box.className = 'empty-state';
  const msg = document.createElement('p');
  msg.textContent = "Can't load this release. A deploy may be in progress.";
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'joy-button joy-button--solid joy-button--sm';
  btn.textContent = 'Retry';
  btn.onclick = () => location.reload();
  box.append(msg, btn);
  document.querySelector('.main').appendChild(box);
  btn.focus();
}
```

In `init()`, replace the two bundle lines:

```js
  await loadRuntime();
  let res;
  try {
    res = await fetch('/api/bundle');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
  } catch (err) {
    if (!atlasIsReadOnly()) throw err;
    showBundleError();
    return;
  }
```

- [ ] **Step 4: Route every write through the helper**

In these functions, replace each `fetch(` that carries `method: 'POST'` with `atlasWrite(`: `rebuildDb`, `triggerBalanceSim`, `submitStudioRationaleUpdate`, `triggerStudioChildGeneration`, `undoStudioSnapshotAction`, `submitReviewVerdict`, `togglePaletteAsset`, `undoStudioSnapshot`, `launch3dClient`, `runAiStudioAgent`, `applyInteractiveMapStructure`, `saveIncrementalComposableFeaturesToDisk`. A read-only refusal rejects, so success text after the call never runs.

`rebuildDb` must also check the answer:

```js
  const rebuilt = await atlasWrite('/api/rebuild', { method: 'POST' });
  if (!rebuilt.ok) { status.textContent = 'SQLite rebuild failed'; return; }
```

`saveIncrementalComposableFeaturesToDisk` (C8) must show the badge only after a good answer. Replace the `try { fetch(...).catch(() => {}) } catch` block, and move the existing badge update into a local `showSaved()` called from `.then`:

```js
  if (typeof fetch === 'function') {
    atlasWrite('/api/studio/map-layers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persisted_custom_features: snapshot })
    }).then((res) => { if (res.ok) showSaved(); })
      .catch((err) => { if (!err.readOnly) console.error('[atlas] map layer save failed:', err); });
  }
```

Host behaviour changes to accept under R4, all three disclosed in the report: the badge shows only after the server confirms the save; `rebuildDb` stops at a failed rebuild; a verdict change POSTs once, not twice (C12). There are no others.

In `work-orders.mjs`, `map-builder.mjs` `postJson` and `deleteJson`, use the helper when the page provides it:

```js
const writeFetch = (...args) => (globalThis.atlasWrite ?? fetch)(...args);
```

In `postWorkOrders`, change the default to `fetchImpl = writeFetch`. In `forge.mjs` `saveDrafts`, start the catch with `if (err && err.readOnly) { saveError = err.message; return; }` (`finally` still runs).

- [ ] **Step 5: Make VerdictSync final on a refusal**

Add a test beside the existing VerdictSync tests: a `fetchImpl` that rejects with `Object.assign(new Error('x'), { readOnly: true })`, one change, a second change, then assert `fetchImpl` ran once and `onStatus` got no retry text.

Change `startVerdictSync`:

```js
  fetchImpl = (...args) => (globalThis.atlasWrite ?? fetch)(...args),
  ...
  let refused = false;
  ...
    chain = chain.then(async () => {
      if (refused) return;
  ...
      } catch (err) {
        if (err && err.readOnly) { refused = true; return; }
```

Then remove the duplicate (C12). In `assets.mjs` `mount`, delete the `startVerdictSync({...})` call and its import; `initReview` already starts the sync. Add `getSaveError` to the `review/ui.mjs` import and keep the panel note:

```js
  document.addEventListener("storybook:verdict-save-status", () =>
    setNote("verdict-sync", getSaveError()),
  );
```

In `ui.mjs` `initReview`, so a read-only page has no sync and the load-time `sync.flush()` can't POST a browser's old buffer:

```js
  if (hosted() && !document.body.hasAttribute("data-read-only")) startHostedSync(committed);
```

- [ ] **Step 6: Mark the panel write controls**

Run `graft grep "verdict"` scoped to `atelier/atlas-world-panels/js` to find where asset verdict marks and the Forge save button are built. Add `dataset.writeControl = ""` or `data-write-control` at each build site in `forge/forge.mjs`, `panels/assets.mjs`, `review/ui.mjs`.

- [ ] **Step 7: Exclude Map Builder**

Directly before `checkHealth` in `mountMapBuilder`, so no request goes out (R6). `section` and its heading already exist at that point:

```js
  if (document.body.hasAttribute("data-read-only")) {
    const link = el("a", { href: "http://atlas-edit.joymify.local.com/", text: "Open the edit site." });
    section.appendChild(el("p", { className: "empty-state" }, [
      document.createTextNode("Not in this release image. "), link,
    ]));
    main.appendChild(section);
    return { ready: false, excluded: true, setActive() {} };
  }
```

In `panels/map-builder.mjs`, the "Check again" button would only re-offer a host that isn't there. Change its condition to `if (!result.ready && !result.excluded)`, keeping `badge = null` for both.

- [ ] **Step 8: Run the tests**

Run: `cd scripts && node --test tests/atlas-web-frontend-read-only.test.mjs tests/atlas-web-read-only.test.mjs && cd .. && node --test atelier/atlas-world-panels/tests/*.test.mjs && python3 scripts/lint_file_size.py`
Expected: PASS. Gate 1 runs that file-size lint, and these slices grow.

- [ ] **Step 9: Commit**

```bash
git add scripts/atlas_world_web/frontend atelier/atlas-world-panels scripts/tests/atlas-web-frontend-read-only.test.mjs
git commit -m "feat: hide write controls and show the release on read-only pages"
```

- [ ] **Step 10: Phase gate:** verify, `code-reviewer` + `typescript-reviewer` on `model: opus` (this wave includes Task 1), `/simplify`, re-verify.

### Task 3: Image built from the commit (slice 1)

**Files:**
- Create: `Dockerfile.atlas-web`, `Dockerfile.atlas-web.dockerignore`, `scripts/build-atlas-web-image.sh`, `scripts/check_atlas_web_image.py`
- Test: `scripts/tests/atlas-web-image.test.mjs`

**Interfaces:**
- Consumes: Task 1 env names.
- Produces: `scripts/build-atlas-web-image.sh [commit]` builds `atlas-world-web:local` and `atlas-world-web:<sha>` from that commit, default HEAD, non-zero on failure. It keeps one earlier `:<sha>` tag. `ATLAS_WEB_PRUNE=<path>` removes a path from the export, for the failure test only.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/atlas-web-image.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const mounts = read('scripts/atlas_world_web/static_mounts.py');
const block = (name) => [...mounts.slice(mounts.indexOf(`${name}:`)).split(')\n')[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

// Gitignored, so no commit can hold it. Forge shows its missing-render notice instead.
const ABSENT_MOUNTS = new Set(['atelier/art-forge/out']);

test('every mount is in the image or explained', () => {
  const ignore = read('Dockerfile.atlas-web.dockerignore').split('\n').filter((l) => l.startsWith('!'));
  const allowed = ignore.map((l) => l.slice(1).replace(/\/\*\*$/, ''));
  for (const m of [...block('MOUNT_DIRS'), ...block('MOUNT_FILES')]) {
    if (ABSENT_MOUNTS.has(m)) continue;
    assert.ok(allowed.some((a) => m === a || m.startsWith(`${a}/`)), `${m} missing from the image`);
  }
});

test('image is read-only and uses its own ignore file', () => {
  const docker = read('Dockerfile.atlas-web');
  assert.match(docker, /ATLAS_READ_ONLY=1/);
  assert.match(docker, /check_atlas_web_image\.py/);
  assert.match(read('Dockerfile.atlas-web.dockerignore'), /^\*$/m);
});

test('the build uses a commit export and stops on failure', () => {
  const sh = read('scripts/build-atlas-web-image.sh');
  assert.match(sh, /set -euo pipefail/);
  assert.match(sh, /git .*archive[^\n]*"\$COMMIT"/);
  assert.doesNotMatch(sh, /archive[^\n]*HEAD/);
  assert.doesNotMatch(sh, /docker build[^\n]*\$REPO_ROOT"?\s*$/m);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts && node --test tests/atlas-web-image.test.mjs`
Expected: FAIL, the files don't exist.

- [ ] **Step 3: Write the image files**

```dockerfile
# Dockerfile.atlas-web — the read-only atlas web surface. Built by
# scripts/build-atlas-web-image.sh from a git archive export, never from a working tree.
FROM python:3.13-slim-bookworm

ARG ATLAS_RELEASE
ARG ATLAS_COMMIT
ENV ATLAS_READ_ONLY=1 ATLAS_RELEASE=$ATLAS_RELEASE ATLAS_COMMIT=$ATLAS_COMMIT PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY . .
RUN python3 scripts/build_catalog_db.py && python3 scripts/check_atlas_web_image.py

USER 65534
EXPOSE 8788
CMD ["python3", "scripts/catalog_explorer_web.py", "--port", "8788"]
```

```text
# Dockerfile.atlas-web.dockerignore — BuildKit takes this over the root .dockerignore.
*
!scripts/**
!contracts/content/**
!content/**
!tools/mac-observatory/**
!docs/superpowers/specs/**
!docs/story/undertow/**
!game-client/assets/**
!atelier/atlas-world-panels/**
!atelier/mapforge/lib/**
!atelier/art-forge/runs/**
!atelier/art-forge/briefs/**
!atelier/story-explorer/**
!atelier/combat-lab/**
```

```python
#!/usr/bin/env python3
"""Fail the image build when the catalog would be empty or the art is LFS pointers.

build_catalog_db.py skips missing inputs and exits 0, so nothing else stops a hollow image.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = (
    "contracts/content/jobs.json",
    "contracts/content/items.json",
    "contracts/content/mobs.json",
    "content/world/fabric/world.json",
    "content/world/premises",
    "content/dungeons/_compiled_catalog.json",
    "content/bestiary/bestiary.json",
    "content/maps",
    "content/studio",
    "content/concept-art/images",
    "game-client/assets/manifest.json",
    "game-client/assets/.thumbs",
)
CORE_TABLES = ("world_continents", "v_mob_economy")
LFS_MAGIC = b"version https://git-lfs"


def main() -> int:
    problems = [f"missing input: {p}" for p in REQUIRED if not (ROOT / p).exists()]
    conn = sqlite3.connect(f"file:{ROOT / 'build/catalog.sqlite'}?mode=ro", uri=True)
    for table in CORE_TABLES:
        count = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        if count == 0:
            problems.append(f"empty: {table}")
    conn.close()
    for path in (ROOT / "game-client/assets").rglob("*"):
        if path.is_file() and path.stat().st_size < 200:
            with open(path, "rb") as fh:
                if fh.read(len(LFS_MAGIC)) == LFS_MAGIC:
                    problems.append(f"LFS pointer: {path.relative_to(ROOT)}")
    for line in problems[:40]:
        print(f"[atlas-web-image] {line}", file=sys.stderr)
    print(f"[atlas-web-image] {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

```bash
#!/bin/bash
# Build atlas-world-web from one commit (default HEAD). A git export keeps uncommitted and ignored files out.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
# Resolved once: the release branch can move between two reads, and the tag, export and baked commit must agree.
COMMIT="$(git -C "$REPO_ROOT" rev-parse "${1:-HEAD}^{commit}")"
EXPORT="$(mktemp -d)"
trap 'rm -rf "$EXPORT" "$EXPORT.tar"' EXIT

git -C "$REPO_ROOT" archive --format=tar -o "$EXPORT.tar" "$COMMIT"
tar -xf "$EXPORT.tar" -C "$EXPORT"
RELEASE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$EXPORT/.release.json")"

if [ -n "${ATLAS_WEB_PRUNE:-}" ]; then
  echo "⚠ test only: removing $ATLAS_WEB_PRUNE from the export"
  rm -rf "${EXPORT:?}/$ATLAS_WEB_PRUNE"
fi

DOCKER_BUILDKIT=1 docker build \
  -t atlas-world-web:local -t "atlas-world-web:$COMMIT" \
  --build-arg "ATLAS_RELEASE=$RELEASE" --build-arg "ATLAS_COMMIT=$COMMIT" \
  -f "$EXPORT/Dockerfile.atlas-web" "$EXPORT"

# Keep the newest earlier tag for rollback. Each commit image is a few hundred MB.
docker images atlas-world-web --format '{{.Tag}}' | { grep -Ev "^(local|$COMMIT)$" || true; } | tail -n +2 | while read -r tag; do
  docker rmi "atlas-world-web:$tag" >/dev/null || true
done
```

`chmod +x scripts/build-atlas-web-image.sh`.

- [ ] **Step 4: Commit, then prove the build behaviour** (the build reads HEAD, so commit first)

```bash
git add Dockerfile.atlas-web Dockerfile.atlas-web.dockerignore scripts/build-atlas-web-image.sh scripts/check_atlas_web_image.py scripts/tests/atlas-web-image.test.mjs
git commit -m "feat: build the atlas web image from a commit export"
cd scripts && node --test tests/atlas-web-image.test.mjs; cd ..
./scripts/build-atlas-web-image.sh; echo "build=$?"
ATLAS_WEB_PRUNE=content/world ./scripts/build-atlas-web-image.sh; echo "pruned=$?"
./scripts/build-atlas-web-image.sh
docker image inspect atlas-world-web:local --format '{{.Size}}'
```

Expected: `build=0`, `pruned` non-zero, size printed. Record the size in the ledger. Over 500 MB means recording it and asking the owner.

- [ ] **Step 5: Run it and prove the contents**

```bash
docker run -d --rm --name atlas-web-check -p 18788:8788 atlas-world-web:local
curl -s http://127.0.0.1:18788/api/runtime
curl -s http://127.0.0.1:18788/theme.css | grep -c joy-spatial-shell
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18788/vendor/ol.js
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18788/vendor/model-viewer.min.js
curl -s -G --data-urlencode 'q=SELECT count(*) FROM world_continents' http://127.0.0.1:18788/api/sql
docker stats --no-stream atlas-web-check
docker stop atlas-web-check
```

Expected: `readOnly: true` with HEAD's commit, theme count above 0, 200 twice, a non-zero count. Use the `docker stats` memory figure for the Task 4 limit.

- [ ] **Step 6: Phase gate:** verify, `code-reviewer` + `python-reviewer` on `model: opus`, `/simplify`, re-verify.

### Task 4: Cluster workload and routing (slice 2)

**Files:**
- Create: `k8s/local/atlas-world-web.yaml`
- Modify: `k8s/local/ingress.yaml`
- Test: `scripts/tests/atlas-web-routing.test.mjs`

**Interfaces:**
- Consumes: image `atlas-world-web:local`.
- Produces: Service `atlas-world-web` on port 8788, namespace `atlas-world`; hostname `atlas-edit.joymify.local.com` to `atlas-world-studio-host`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/atlas-web-routing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ingress = readFileSync(path.join(ROOT, 'k8s/local/ingress.yaml'), 'utf8');
const web = readFileSync(path.join(ROOT, 'k8s/local/atlas-world-web.yaml'), 'utf8');

const backendOf = (host) => {
  const at = ingress.indexOf(`host: ${host}\n`); // the newline stops .local matching .local.com
  assert.ok(at > 0, host);
  return ingress.slice(at).match(/service:\s*\n\s*name: (\S+)/)[1];
};

test('release hostnames reach the cluster app', () => {
  for (const h of ['atlas-world.joymify.local.com', 'atlas.joymify.local.com', 'atlas-world.joymify.local']) {
    assert.equal(backendOf(h), 'atlas-world-web', h);
  }
});

test('edit hostname and the redirect stay on the host process', () => {
  assert.equal(backendOf('atlas-edit.joymify.local.com'), 'atlas-world-studio-host');
  assert.equal(backendOf('atlas-storybook.joymify.local.com'), 'atlas-world-studio-host');
});

test('deployment is one local replica behind a readiness probe', () => {
  assert.match(web, /replicas: 1/);
  assert.match(web, /image: atlas-world-web:local/);
  assert.match(web, /imagePullPolicy: Never/);
  assert.match(web, /readinessProbe:[\s\S]*path: \/healthz/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts && node --test tests/atlas-web-routing.test.mjs`
Expected: FAIL, the manifest doesn't exist.

- [ ] **Step 3: Write the manifest**

Set the memory limit to at least twice the Task 3 `docker stats` figure; 512Mi is the starting value.

```yaml
# k8s/local/atlas-world-web.yaml — read-only atlas web surface, built from the release commit.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: atlas-world-web
  namespace: atlas-world
  labels:
    app: atlas-world-web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: atlas-world-web
  template:
    metadata:
      labels:
        app: atlas-world-web
    spec:
      containers:
        - name: atlas-world-web
          image: atlas-world-web:local
          imagePullPolicy: Never
          ports:
            - containerPort: 8788
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8788
            periodSeconds: 3
          resources:
            requests:
              memory: 128Mi
            limits:
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: atlas-world-web
  namespace: atlas-world
  labels:
    app: atlas-world-web
spec:
  selector:
    app: atlas-world-web
  ports:
    - name: http
      port: 8788
      targetPort: 8788
```

- [ ] **Step 4: Change the ingress**

In `k8s/local/ingress.yaml`, set `atlas-world-local`'s three rules to `name: atlas-world-web`. Add one rule for `atlas-edit.joymify.local.com` with backend `atlas-world-studio-host`, port 8788. Leave the redirect Ingress alone. Update the file's top comment.

- [ ] **Step 5: Apply and prove it** (R1: this moves the three hostnames off the host process; undo with `git revert` plus re-applying the ingress)

Invoke `k8s-safety` first.

```bash
cd scripts && node --test tests/atlas-web-routing.test.mjs; cd ..
kubectl --context orbstack apply -f k8s/local/atlas-world-web.yaml
kubectl --context orbstack -n atlas-world rollout status deployment/atlas-world-web --timeout=120s
kubectl --context orbstack apply -f k8s/local/ingress.yaml
curl -sL -o /dev/null -w '%{url_effective} %{http_code}\n' http://atlas-world.joymify.local.com/
curl -s http://atlas-world.joymify.local.com/api/runtime
curl -s http://atlas-edit.joymify.local.com/api/runtime
```

Expected: the first URL has no port and 200; `readOnly: true` on the release host; `readOnly: false` on the edit host when the Mac process runs the new code. C9: an old host process answers no JSON runtime body, and that does not fail this task. R9 is proved in Task 6 once the host runs the merged code.

Then delete the pod by hand, wait for ready, and re-check `/api/runtime` and a concept-art md5 (R8).

- [ ] **Step 6: Commit**

```bash
git add k8s/local/atlas-world-web.yaml k8s/local/ingress.yaml scripts/tests/atlas-web-routing.test.mjs
git commit -m "feat: run the atlas web app in the local cluster"
```

- [ ] **Step 7: Phase gate:** shared with Task 5.

### Task 5: Deploy wiring and the check (slice 3)

**Files:**
- Create: `scripts/verify-atlas-web.sh`
- Modify: `scripts/deploy-local.sh`
- Test: `scripts/tests/atlas-web-verify.test.mjs`

**Interfaces:**
- Consumes: `/api/runtime`, `/api/sql`, `build-atlas-web-image.sh`.
- Produces: `verify-atlas-web.sh` reads `ATLAS_WEB_URL` (default `http://atlas-world.joymify.local.com`), `ATLAS_WEB_RETRY_SECONDS` (default 60), `ATLAS_WEB_COMMIT` (default HEAD); exit 0 or non-zero naming the fault. Run by hand from `_release`, it is also the staleness check for a `--no-deploy` ship.

- [ ] **Step 1: Write the failing test**

The test runs the script against a stub server, so no cluster is needed.

```js
// scripts/tests/atlas-web-verify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/verify-atlas-web.sh');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const version = JSON.parse(execFileSync('git', ['show', 'HEAD:.release.json'], { cwd: ROOT, encoding: 'utf8' })).version;

function stub({ commit = head, release = version, sqlCount = null, artBody = null } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/runtime') {
      res.end(JSON.stringify({ readOnly: true, release, commit }));
    } else if (url.pathname === '/api/sql') {
      res.end(JSON.stringify({ ok: true, rows: [[sqlCount ?? -1]] }));
    } else {
      res.end(artBody ?? readFileSync(path.join(ROOT, url.pathname)));
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

// Async on purpose: the stub lives in this process, and spawnSync would stop it answering.
function run(port) {
  return new Promise((resolve) => {
    const child = spawn(SCRIPT, {
      env: { ...process.env, ATLAS_WEB_URL: `http://127.0.0.1:${port}`, ATLAS_WEB_RETRY_SECONDS: '2' },
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stdout += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr: '' }));
  });
}

test('a wrong commit fails and names both commits', async (t) => {
  const s = await stub({ commit: 'b'.repeat(40) });
  t.after(() => s.close());
  const r = await run(s.address().port);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, new RegExp('b'.repeat(40)));
  assert.match(r.stdout + r.stderr, new RegExp(head));
});

test('an unreachable host fails with the word unreachable', () => {
  const r = spawnSync(SCRIPT, {
    encoding: 'utf8',
    env: { ...process.env, ATLAS_WEB_URL: 'http://127.0.0.1:9', ATLAS_WEB_RETRY_SECONDS: '1' },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /unreachable/);
});

test('changed art fails', async (t) => {
  const s = await stub({ artBody: 'not the art', sqlCount: 1 });
  t.after(() => s.close());
  const r = await run(s.address().port);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /md5/);
});

test('a wrong count fails naming the expected count, and the right count passes', async (t) => {
  const bad = await stub({ sqlCount: -1 });
  t.after(() => bad.close());
  const first = await run(bad.address().port);
  assert.notEqual(first.status, 0);
  const want = first.stdout.match(/from HEAD has (\d+)/);
  assert.ok(want, first.stdout);
  const good = await stub({ sqlCount: Number(want[1]) });
  t.after(() => good.close());
  const second = await run(good.address().port);
  assert.equal(second.status, 0, second.stdout);
  assert.match(second.stdout, /✅ atlas web serves/);
});

test('every read uses the one resolved commit', () => {
  assert.doesNotMatch(readFileSync(SCRIPT, 'utf8'), /(show "?HEAD:|archive[^\n]* HEAD )/);
});

test('the art sample is not an LFS path', () => {
  assert.match(readFileSync(SCRIPT, 'utf8'), /content\/concept-art\/images\/\*\.webp/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts && node --test tests/atlas-web-verify.test.mjs`
Expected: FAIL, the script doesn't exist.

- [ ] **Step 3: Write the check**

```bash
#!/bin/bash
# Prove the atlas web host serves HEAD: commit, one image, one catalog count. Non-zero otherwise.
set -uo pipefail

URL="${ATLAS_WEB_URL:-http://atlas-world.joymify.local.com}"
RETRY="${ATLAS_WEB_RETRY_SECONDS:-60}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
# deploy-local.sh passes the commit it built, so a branch that moves mid-deploy can't fail this falsely.
WANT_COMMIT="$(git -C "$REPO_ROOT" rev-parse "${ATLAS_WEB_COMMIT:-HEAD}^{commit}")"
WANT_RELEASE="$(git -C "$REPO_ROOT" show "$WANT_COMMIT:.release.json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
EXPORT="$(mktemp -d)"
trap 'rm -rf "$EXPORT"' EXIT

field() { python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1]))' "$1"; }
md5_of() { python3 -c 'import hashlib,sys; print(hashlib.md5(sys.stdin.buffer.read(), usedforsecurity=False).hexdigest())'; }

# The rollout gap is normal, so a wrong commit retries too. Read the JSON, not a status (C9).
deadline=$(( $(date +%s) + RETRY ))
got_commit=""
while :; do
  body="$(curl -fsS --max-time 5 "$URL/api/runtime" 2>"$EXPORT/curl.err")"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    got_commit="$(printf '%s' "$body" | field commit 2>/dev/null)"
    got_release="$(printf '%s' "$body" | field release 2>/dev/null)"
    [ "$got_commit" = "$WANT_COMMIT" ] && [ "$got_release" = "$WANT_RELEASE" ] && break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    if [ "$rc" -ne 0 ]; then
      echo "❌ atlas web unreachable at $URL: $(cat "$EXPORT/curl.err")"
    else
      echo "❌ atlas web serves commit $got_commit release $got_release; expected commit $WANT_COMMIT release $WANT_RELEASE"
    fi
    exit 1
  fi
  sleep 2
done

# Not LFS: git show returns a pointer for LFS paths (C5).
ART="$(git -C "$REPO_ROOT" ls-files 'content/concept-art/images/*.webp' | head -1)"
if [ -z "$ART" ]; then
  echo "❌ no concept-art .webp is tracked, so nothing can be compared"
  exit 1
fi
want_md5="$(git -C "$REPO_ROOT" show "$WANT_COMMIT:$ART" | md5_of)"
got_md5="$(curl -fsS --max-time 20 "$URL/$ART" | md5_of)"
if [ "$want_md5" != "$got_md5" ]; then
  echo "❌ $ART md5 is $got_md5; $WANT_COMMIT has $want_md5"
  exit 1
fi

git -C "$REPO_ROOT" archive --format=tar "$WANT_COMMIT" scripts contracts/content content | tar -x -C "$EXPORT"
python3 "$EXPORT/scripts/build_catalog_db.py" >/dev/null || { echo "❌ local catalog build failed"; exit 1; }
want_count="$(python3 -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("SELECT count(*) FROM world_continents").fetchone()[0])' "$EXPORT/build/catalog.sqlite")"
got_count="$(curl -fsS --max-time 20 -G --data-urlencode 'q=SELECT count(*) FROM world_continents' "$URL/api/sql" | python3 -c 'import json,sys; print(json.load(sys.stdin)["rows"][0][0])')"
if [ "$want_count" != "$got_count" ]; then
  echo "❌ world_continents is $got_count on the host; a catalog built from HEAD has $want_count"
  exit 1
fi

echo "✅ atlas web serves $WANT_RELEASE $WANT_COMMIT, $ART md5 $got_md5, world_continents $got_count"
```

`chmod +x scripts/verify-atlas-web.sh`.

- [ ] **Step 4: Wire `deploy-local.sh`**

After `GIT_SHA=...`:

```bash
# The web image only tracks the release branch; a feature deploy leaves it on the last release.
RELEASE_BRANCH="release/$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$REPO_ROOT/.release.json")"
DO_WEB=0
if [ "$(git rev-parse --abbrev-ref HEAD)" = "$RELEASE_BRANCH" ]; then
  DO_WEB=1
  WEB_COMMIT="$(git rev-parse HEAD)"  # one read: build and check use the same commit
else
  echo "⚠ Not on $RELEASE_BRANCH: skipping the atlas-world-web image."
fi
```

At the end of the Build section, after the `nakama` build, so builds run one at a time:

```bash
if [ "$DO_WEB" -eq 1 ]; then
  echo ""
  echo "▶ Building atlas-world-web image from $WEB_COMMIT..."
  "$REPO_ROOT/scripts/build-atlas-web-image.sh" "$WEB_COMMIT"
  echo "  ✓ built"
fi
```

In the Apply section, before the ingress block, use an `if` like the Build block, because a `[ ] && cmd` line as written can end the script under `set -e`:

```bash
if [ "$DO_WEB" -eq 1 ]; then
  kubectl apply -f "$REPO_ROOT/k8s/local/atlas-world-web.yaml"
fi
```

Move the whole `if [ -f .../ingress.yaml ]` block, with its comment and a `verify_local_ctx`, to after the roll lines (C7). In the roll block add:

```bash
if [ "$DO_WEB" -eq 1 ]; then
  roll deployment atlas-world-web 120s
fi
```

Replace the "Atlas World host process" block, so a missing host process stays a notice:

```bash
if ! curl -fsS --max-time 3 http://127.0.0.1:8788/healthz >/dev/null 2>&1; then
  echo ""
  echo "⚠ the edit site (atlas-edit.joymify.local.com) has no host process. Start it with:"
  echo "    python3 $REPO_ROOT/scripts/catalog_explorer_web.py --port 8788"
fi

if [ "$DO_WEB" -eq 1 ]; then
  echo ""
  echo "▶ Checking the atlas web host..."
  ATLAS_WEB_COMMIT="$WEB_COMMIT" "$REPO_ROOT/scripts/verify-atlas-web.sh"
fi
```

Update the header comment and summary lines to say atlas-world is a cluster workload and `atlas-edit` is the host process.

- [ ] **Step 5: Run the tests and the real deploy**

```bash
cd scripts && node --test tests/atlas-web-verify.test.mjs; cd ..
./scripts/deploy-local.sh --skip-meta --skip-server; echo "deploy=$?"
```

Run the deploy from `_release` on `release/<v>`, after this feature merges; on the feature branch it only proves the skip warning. Expected before the merge: the warning, then `deploy=0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-atlas-web.sh scripts/deploy-local.sh scripts/tests/atlas-web-verify.test.mjs
git commit -m "feat: deploy and verify the atlas web app from the release"
```

- [ ] **Step 7: Phase gate:** verify, `code-reviewer` on `model: opus` over Tasks 4 and 5 with `k8s` and shell in scope, `/simplify`, re-verify.

### Task 6: Real-click pass, docs, end-to-end

**Files:**
- Create: `scripts/tests/e2e/atlas-web-tabs.e2e.mjs`
- Modify: `README.md`, `CLAUDE.md`, `.claude/refined_backlog/<F-NNN>/` verification notes

**Interfaces:**
- Consumes: everything above.
- Produces: the acceptance evidence.

- [ ] **Step 1: Write the real-click check**

Copy the Playwright loader, `check()`, and server start from `scripts/tests/e2e/atlas-upright-toggle.e2e.mjs` (from F-167). Real mouse only; no app function is called from the page. The script takes `ATLAS_WEB_URL`, default the release host. Expected behaviour:

```js
const failedRequests = []; const writes = []; const errors = []; const placeholders = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => failedRequests.push(r.url()));
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  if (r.headers()['x-thumb-missing']) placeholders.push(r.url());
});
page.on('request', (r) => { if (['POST', 'DELETE'].includes(r.method())) writes.push(r.url()); });

await page.goto(BASE);
await page.waitForSelector('#sidebarNav button');
const count = await page.locator('#sidebarNav button').count();
for (let i = 0; i < count; i += 1) {
  const item = page.locator('#sidebarNav button').nth(i);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await page.waitForLoadState('networkidle');
}
// C3: Forge renders live in the checkout that made them; only this path may 404.
const unexpected = failedRequests.filter((u) => !u.includes('/atelier/art-forge/out/'));
check('every tab opened', count > 10, String(count));
check('no uncaught exception', errors.length === 0, errors.join(' | '));
check('no failed request', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
check('no write request', writes.length === 0, writes.join(' | '));
check('top bar shows the release', /^Read-only · \d+\.\d+ · [0-9a-f]{7}$/.test(await page.locator('#topbarStatus').innerText()));
console.log(`placeholder thumbs: ${placeholders.length}`); // reported, not failed: C11

await page.locator('#sidebarNav button', { hasText: 'Map Builder' }).click();
const excluded = page.locator('.empty-state', { hasText: 'Not in this release image.' });
check('Map Builder shows the excluded message', await excluded.isVisible());
check('Map Builder links to the edit site', (await excluded.locator('a').getAttribute('href')).includes('atlas-edit'));
check('Map Builder offers no recheck', (await page.getByRole('button', { name: 'Check again' }).count()) === 0);
```

Stale tab: start the server on a free port with the flag unset, open a tab that has a verdict control, restart the same port with `ATLAS_READ_ONLY=1`, click the real verdict control, then check the not-saved line, exactly one POST, and no second POST after another 2 seconds. Take a 390x844 screenshot of that line for Step 5.

Any other failed request is a real bug: fix it at source in this task, in a new commit, before going on.

- [ ] **Step 2: Run it against the local image**

Run: `ATLAS_WEB_URL=http://atlas-world.joymify.local.com node scripts/tests/e2e/atlas-web-tabs.e2e.mjs`
Expected: all PASS.

- [ ] **Step 3: Update docs**

`README.md`: the app's two hostnames, what each is for, the start command for the edit host (`python3 scripts/catalog_explorer_web.py --port 8788`), `ATLAS_READ_ONLY`, `ATLAS_RELEASE`, `ATLAS_COMMIT`, `verify-atlas-web.sh`, `build-atlas-web-image.sh`, the bad-gateway meaning on `atlas-edit`, and that `psrw ship` only warns on a failed deploy. Also the two limits: the page follows the last release deploy, not the last merge, so after `ship --no-deploy` or `promote --direct` it stays on its commit until `deploy-local.sh` runs from the release branch, and `verify-atlas-web.sh` run from `_release` reports that; and a deploy from an older branch reapplies that branch's ingress.

`CLAUDE.md`: in "Service endpoints", say `atlas-world.joymify.local.com` is the read-only release app and `:8788` is the edit host. In the artifact rule, a review surface now means the edit host before shipping and the release app after.

There are no diagrams of this surface: `docs/diagrams/map-asset-pipeline.drawio` covers another pipeline, so no diagram task applies.

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/e2e/atlas-web-tabs.e2e.mjs README.md CLAUDE.md
git commit -m "docs: describe the release and edit atlas hostnames"
```

- [ ] **Step 5: Phase gate:** verify, one consolidated `code-reviewer` over the whole branch on `model: opus`, `/simplify`, re-verify. Run `ui-visual-verify` with phone (390x844) and desktop (1280x800) screenshots of `/?tab=concept-arts`, read them, and show the final shots.

- [ ] **Step 6: Ship and prove the live surface (Tier 4)**

From the feature worktree, `psrw ship --deploy`. Then read the deploy output: ship only warns on a failed deploy, so the verify line must be `✅ atlas web serves ...`. Then:

```bash
curl -s http://atlas-world.joymify.local.com/api/runtime
kubectl --context orbstack -n atlas-world rollout status deployment/atlas-world-web
```

Prove the uncommitted-edit case: in `_release`, change one concept-art byte, run `./scripts/deploy-local.sh --skip-meta --skip-server`, check the served md5 equals HEAD's, then `git checkout` that file. Run no `psrw` verb until it is restored, because those verbs commit everything in `_release`.

Prove R9: the host process runs from another session and must not be stopped by this work. If it serves the merged code, save one verdict through `atlas-edit`. If not, say so in the report and ask the owner to restart it.

Report "Rulings I made" from the ledger.

## Spec coverage

| Requirement | Task |
|---|---|
| R1 serves the deployed commit | 5, 6 |
| R2 verify exits non-zero | 5 |
| R3 403 on every write | 1 |
| R4 unset flag unchanged | 1, with one disclosed exception in Task 2 |
| R5 hidden controls, no success text | 2, 6 |
| R6 excluded tab | 2 |
| R7 build fails on hollow input | 3 |
| R8 same data after a restart | 4 |
| R9 edit host writes | 4, 6 |
| UI states table | 2 |
| Thumbs and caches | 1 |
| Acceptance: uncommitted edit | 6 |
| Acceptance: forced commit mismatch | 5 |

## Audit trail

`self-grill-audit`, 2026-11-01: safe with fixes, 0 CRITICAL, 6 HIGH. Each finding was checked on disk before editing. Reproduced with no change: C1, C2, C3, C4, C5, C7, C8, C10, the mount tests, and the hidden-handler list.

| Finding | Tier | Resolution |
|---|---|---|
| C6 false, `scripts/tests` not in Gate 1 | HIGH | New Gate 1 section, Task 1 |
| Excluded Map Builder tab renders nothing | HIGH | Append the section, skip recheck, assert the text, Tasks 2, 6 |
| Strict thumbs 404, no placeholder | HIGH | Server placeholder at 200 (C11), rather than `onerror` at every image site |
| Two verdict syncs | HIGH | Removed the duplicate (C12). A shared flag would not stop the first double POST |
| `selectProposalTake` is not a write | HIGH | Dropped (C13) |
| Commit read more than once | HIGH | Resolved once in `deploy-local.sh`, passed to build and verify |
| Pre-merge edit host loses write controls | MEDIUM | 404 from `/api/runtime` means not read-only, Task 2 |
| Verify has no success or count case; `.local` prefix match | MEDIUM | New test; newline in `backendOf` |
| Panels `index.html`, load-time flush | MEDIUM | With C12, no sync runs on either page |
| Palette label hides the whole gallery | MEDIUM | Hide the checkbox only, Task 2 |
| `:<sha>` tags never pruned; build order; byte edit swept | MEDIUM | One earlier tag kept; web build last; no `psrw` verb until restored |
| `md5 -q` absent on Ubuntu, empty hashes match | MEDIUM | Python hash, empty sample fails |
| Long line in a nowrap pill | MEDIUM | Wraps on the refusal; screenshot in Task 6 |
| C9 wrong; "the only one" wrong; unread body; shared `/tmp` path | LOW | Corrected; 3 disclosed host changes; `Connection: close`; per-run temp dir |
| Older branch reapplies its ingress; Task 4 puts a pre-merge image on the live hostnames | MEDIUM | Accepted: self-heals at the next release deploy, documented in `README.md` |
| "Always" not delivered: `--no-deploy` and `promote --direct` add no deploy | Goal | Accepted as a limit, below |
| "Small" narrowed to the whole studio | Goal | Already owner-approved in the spec, with the 500 MB check |

**Limit accepted, 2026-11-01:** there is no on-page warning when the page is behind the release. A pod has no git and no route to the checkout, so a warning needs either a `psrw` change, which the spec excludes, or a new moving part. The original failure, a checkout holding the port, is gone by construction, and the page always states its commit. Reported to the owner; on-page warning filed in `docs/superpowers/ideas.md`.

**Found while applying the audit:** the Task 5 test ran its stub server in the process that `spawnSync` blocks, so every stub-backed case would have seen "unreachable". It now spawns asynchronously. The Task 1 start wait was 10s with no failure, too short for a fresh worktree's catalog build; it is now 60s and throws.
