# Story and Novel Reading in the Asset Storybook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the story reader, narrative graph, and Undertow novel reachable from `tools/asset-storybook` as one "Story" sidebar entry with three tabs, driven by a registry file so a fourth view is a data edit.

**Architecture:** A new `js/story.mjs` mounts one `kind-section` containing a tab bar and a single lazy `<iframe>` whose `src` swaps on tab click. The tab list comes from `story-views.json`, with a hardcoded fallback — the same degradation contract `art-groups.json` already has. The three target pages are untouched and stay independently servable. A test in `scripts/tests/` keeps the registry and the Docker packaging in sync.

**Tech Stack:** Vanilla ES modules (no build step, no framework), `node --test` for the gate, nginx/Docker for packaging.

## Global Constraints

- Zero dependencies and no build step — `tools/asset-storybook` is plain ES modules loaded by `<script type="module">`.
- Do not modify `tools/story-explorer/reader.html`, `tools/story-explorer/index.html`, `graph.mjs`, or `docs/story/undertow/novel-illustrated-edition.html`.
- Story mounts in **both** `main.mjs` code paths — the manifest-failure path (`main.mjs:66-67`) and the happy path (`main.mjs:166`, `:252`).
- Story is not an asset: no manifest entry, no per-view health check. Health is `initHealth(cls, 1)` → `bumpHealth(cls, {ok:1})` → `renderSidebarBadge(cls)`, exactly as `combat-lab.mjs:43-51`.
- `Dockerfile` COPY lines and `Dockerfile.dockerignore` `!` allowlist lines must stay in sync — the dockerignore header states this requirement.
- New COPY lines go **after** `COPY game-client/assets`, per the Dockerfile's layer-ordering comment.
- Every task ends with the phased quality gate: verify → independent review of that task's diff → refactor → re-verify.

---

### Task 1: Registry file and the packaging gate

Packaging comes first because it is the only part with an automated test, and because getting it wrong produces the silent failure the dockerignore header warns about: local dev works, the container serves an empty section.

**Files:**
- Create: `tools/asset-storybook/story-views.json`
- Create: `scripts/tests/story_views_packaging.test.mjs`
- Modify: `tools/asset-storybook/Dockerfile` (after the `COPY game-client/assets` line)
- Modify: `tools/asset-storybook/Dockerfile.dockerignore` (allowlist block)

**Interfaces:**
- Consumes: nothing.
- Produces: `tools/asset-storybook/story-views.json`, an array of `{ id: string, label: string, src: string }`. `src` is relative to `tools/asset-storybook/`. Task 2 reads this file at runtime.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/story_views_packaging.test.mjs`:

```js
// Guards the storybook's story registry against its Docker packaging.
//
// tools/asset-storybook/Dockerfile.dockerignore is a `*`-then-allowlist, and
// its own header says to keep it in sync with the Dockerfile's COPY lines. A
// registry entry pointing at a path that is copied but not allowlisted (or
// neither) still works in local dev — which serves the repo root directly —
// and silently renders an empty section in the container. This test makes that
// mistake fail in CI instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STORYBOOK_DIR = join(ROOT, "tools/asset-storybook");
const REGISTRY = join(STORYBOOK_DIR, "story-views.json");
const DOCKERFILE = join(STORYBOOK_DIR, "Dockerfile");
const DOCKERIGNORE = join(STORYBOOK_DIR, "Dockerfile.dockerignore");

// A COPY/allowlist line covers a path when it names that path or any ancestor
// directory of it — `COPY content/story content/story` covers
// `content/story/quests.json`.
function coveredBy(lines, repoRelPath) {
  return lines.some((covered) => {
    const rel = relative(covered, repoRelPath);
    return rel === "" || !rel.startsWith("..");
  });
}

function copyPaths() {
  return readFileSync(DOCKERFILE, "utf8")
    .split("\n")
    .filter((l) => l.trim().startsWith("COPY "))
    .map((l) => l.trim().split(/\s+/)[1]);
}

function allowlistPaths() {
  return readFileSync(DOCKERIGNORE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1).replace(/\/\*\*$/, "").replace(/\/$/, ""));
}

test("every story-views.json src exists on disk", () => {
  const views = JSON.parse(readFileSync(REGISTRY, "utf8"));
  assert.ok(Array.isArray(views) && views.length > 0, "registry must be a non-empty array");
  for (const view of views) {
    const abs = resolve(STORYBOOK_DIR, view.src);
    assert.ok(existsSync(abs), `story view "${view.id}" points at a missing file: ${view.src}`);
  }
});

test("every story-views.json src is packaged into the storybook image", () => {
  const views = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const copies = copyPaths();
  const allowed = allowlistPaths();
  for (const view of views) {
    const repoRel = relative(ROOT, resolve(STORYBOOK_DIR, view.src));
    assert.ok(
      coveredBy(copies, repoRel),
      `story view "${view.id}" (${repoRel}) has no COPY line in tools/asset-storybook/Dockerfile`,
    );
    assert.ok(
      coveredBy(allowed, repoRel),
      `story view "${view.id}" (${repoRel}) has no "!" allowlist line in tools/asset-storybook/Dockerfile.dockerignore`,
    );
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/story_views_packaging.test.mjs`
Expected: FAIL — `ENOENT` on `tools/asset-storybook/story-views.json`, because the registry does not exist yet.

- [ ] **Step 3: Create the registry**

Create `tools/asset-storybook/story-views.json`:

```json
[
  { "id": "reader", "label": "Reader", "src": "../story-explorer/reader.html" },
  { "id": "graph", "label": "Graph", "src": "../story-explorer/index.html" },
  { "id": "novel", "label": "Undertow", "src": "../../docs/story/undertow/novel-illustrated-edition.html" }
]
```

- [ ] **Step 4: Run the test to verify it fails for the right reason now**

Run: `node --test scripts/tests/story_views_packaging.test.mjs`
Expected: the "exists on disk" test PASSES; the "is packaged" test FAILS with `story view "reader" (tools/story-explorer/reader.html) has no COPY line`. If the first test fails, a `src` is wrong — fix the registry before continuing.

- [ ] **Step 5: Add the COPY lines**

In `tools/asset-storybook/Dockerfile`, immediately after the existing `COPY game-client/assets game-client/assets` line and its comment block, insert:

```dockerfile
# Story surfaces (I-082) — the reader/graph page, the narrative JSON it fetches,
# and the Undertow novel. ~560 KB total. These sit after the asset layer above so
# a story edit reuses that cached ~261 MB layer rather than re-copying it.
# Keep in sync with the "!" lines in ./Dockerfile.dockerignore.
COPY content/story content/story
COPY tools/story-explorer tools/story-explorer
COPY docs/story/undertow docs/story/undertow
```

- [ ] **Step 6: Add the allowlist lines**

In `tools/asset-storybook/Dockerfile.dockerignore`, add to the allowlist block, immediately after `!tools/combat-lab/**`:

```
!content/story/**
!tools/story-explorer/**
!docs/story/undertow/**
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test scripts/tests/story_views_packaging.test.mjs`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 8: Run the whole scripts suite to confirm nothing regressed**

Run: `npm test --prefix scripts`
Expected: PASS, including the pre-existing `resolve_render_mirror.test.mjs`. This is the command CI runs (`ci.yml:78`), so the new test needs no workflow change.

- [ ] **Step 9: Prove the gate actually bites**

Temporarily delete the `COPY content/story content/story` line, run `npm test --prefix scripts`, and confirm it FAILS naming the `reader` view. Restore the line and confirm it passes again. A gate that has never been seen red is not a gate.

- [ ] **Step 10: Commit**

```bash
git add tools/asset-storybook/story-views.json \
        tools/asset-storybook/Dockerfile \
        tools/asset-storybook/Dockerfile.dockerignore \
        scripts/tests/story_views_packaging.test.mjs
git commit -m "feat(storybook): add story view registry and packaging gate"
```

- [ ] **Step 11: Quality gate**

Verify (Steps 7-9 done), then get an **independent** review of this task's diff (fresh subagent or the code-reviewer agent — self-review does not count), act on the findings, and re-run `npm test --prefix scripts`. Do not start Task 2 with findings outstanding.

---

### Task 2: The Story section

**Files:**
- Create: `tools/asset-storybook/js/story.mjs`
- Modify: `tools/asset-storybook/js/state.mjs` (add three constants near `COMBAT_CLASS`, around `state.mjs:52-55`)
- Modify: `tools/asset-storybook/js/sidebar.mjs` (import `STORY_CLASS`; one line in `classLabel`, after the `COMBAT_CLASS` line at `:46`)
- Modify: `tools/asset-storybook/js/main.mjs` (import; call in both paths)
- Modify: `tools/asset-storybook/index.html` (extend three CSS selectors, around `:744-780`)

**Interfaces:**
- Consumes: `story-views.json` from Task 1 — `{ id, label, src }[]`, `src` relative to `tools/asset-storybook/`.
- Produces: `mountStoryNav(sidebarNav: HTMLElement): void` and `mountStory(main: HTMLElement): Promise<void>` from `js/story.mjs`; `STORY_CLASS`, `STORY_VIEWS_URL`, `STORY_VIEWS_FALLBACK` from `js/state.mjs`.

- [ ] **Step 1: Add the state constants**

In `tools/asset-storybook/js/state.mjs`, after the `COMBAT_CLASS` block (`:52-55`), add:

```js
// synthetic class for the embedded story surfaces (I-082): the story-explorer
// reader + graph and the Undertow novel. Like COMBAT_CLASS above it is not an
// asset — no manifest entry, no renderer, no per-view health.
export const STORY_CLASS = "story";
export const STORY_VIEWS_URL = "./story-views.json";
// Fallback mirrors ART_GROUPS_FALLBACK: a missing/unreadable registry degrades
// the section to the three known views instead of breaking the page.
export const STORY_VIEWS_FALLBACK = [
  { id: "reader", label: "Reader", src: "../story-explorer/reader.html" },
  { id: "graph", label: "Graph", src: "../story-explorer/index.html" },
  {
    id: "novel",
    label: "Undertow",
    src: "../../docs/story/undertow/novel-illustrated-edition.html",
  },
];
```

- [ ] **Step 2: Write `js/story.mjs`**

Create `tools/asset-storybook/js/story.mjs`:

```js
import {
  STORY_CLASS,
  STORY_VIEWS_URL,
  STORY_VIEWS_FALLBACK,
} from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

/**
 * The story surfaces (tools/story-explorer + the Undertow novel), embedded.
 *
 * Same contract as the combat lab (js/combat-lab.mjs): not an asset, no health
 * check, and a manifest 404 must not take it down — so main.mjs mounts this in
 * both its failure path and its happy path.
 *
 * Unlike the art tabs, the active tab is a closure local: nothing outside this
 * module reads or writes it, because the section shows and hides wholesale via
 * setActiveClass's data-kind match (sidebar.mjs:60-66).
 */
async function loadViews() {
  try {
    const res = await fetch(STORY_VIEWS_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const views = await res.json();
    if (!Array.isArray(views) || views.length === 0)
      throw new Error("registry is not a non-empty array");
    return views;
  } catch (err) {
    console.warn(
      "[asset-storybook] story-views.json unavailable — falling back to reader/graph/novel:",
      err,
    );
    return STORY_VIEWS_FALLBACK;
  }
}

export async function mountStory(main) {
  const views = await loadViews();

  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + STORY_CLASS;
  section.dataset.kind = STORY_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Story — reader, graph & novel";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.style.cssText =
    "color:#9aa1b2;font-size:13px;margin:0 0 12px;max-width:70ch";
  const noteText = document.createElement("span");
  noteText.textContent =
    "The narrative, live. Not an asset — no manifest, no health check. " +
    "Only the open tab loads. ";
  const fullLink = document.createElement("a");
  fullLink.target = "_blank";
  fullLink.rel = "noopener";
  fullLink.textContent = "Open full screen ↗";
  note.appendChild(noteText);
  note.appendChild(fullLink);
  section.appendChild(note);

  const tabRow = document.createElement("div");
  tabRow.className = "story-tabbar-row";
  section.appendChild(tabRow);

  const frame = document.createElement("iframe");
  frame.loading = "lazy";
  frame.style.cssText =
    "width:100%;height:80vh;border:1px solid #262c3a;border-radius:10px;background:#0b0d12;display:block";
  section.appendChild(frame);

  let activeView = null;
  function selectView(view) {
    activeView = view;
    frame.src = view.src;
    fullLink.href = view.src;
    tabRow.querySelectorAll(".story-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.storyTab === view.id);
    });
  }

  for (const view of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-tab";
    btn.dataset.storyTab = view.id;
    btn.textContent = view.label;
    btn.addEventListener("click", () => {
      if (activeView && activeView.id === view.id) return; // don't reload the open view
      selectView(view);
    });
    tabRow.appendChild(btn);
  }

  const hint = document.createElement("p");
  hint.className = "art-tabbar-hint";
  hint.textContent =
    "Tabs mirror the story-views.json registry order. Adding a view is a registry edit plus its Dockerfile COPY + allowlist lines.";
  section.appendChild(hint);

  selectView(views[0]);

  main.appendChild(section);
}

/** Sidebar entry for the story section. Separated so it can sit up top. */
export function mountStoryNav(sidebarNav) {
  initHealth(STORY_CLASS, 1);
  const btn = buildSidebarItem(STORY_CLASS, 1);
  btn.style.marginBottom = "10px";
  btn.style.borderBottom = "1px solid #262c3a";
  btn.style.paddingBottom = "10px";
  sidebarNav.appendChild(btn);
  bumpHealth(STORY_CLASS, { ok: 1 });
  renderSidebarBadge(STORY_CLASS);
}
```

- [ ] **Step 3: Label the sidebar entry**

In `tools/asset-storybook/js/sidebar.mjs`, add `STORY_CLASS` to the import from `./state.mjs` (`:1-9`), then add one line to `classLabel` immediately after the `COMBAT_CLASS` line (`:46`):

```js
  if (cls === STORY_CLASS) return "Story";
```

Without this the default branch at `:52` pluralises and renders "Storys".

- [ ] **Step 4: Wire both mount paths in `main.mjs`**

Add the import next to the combat-lab import (`main.mjs:25`):

```js
import { mountStory, mountStoryNav } from "./story.mjs";
```

In the manifest-failure path, replace `main.mjs:65-68`:

```js
    // The combat lab does not depend on any manifest — keep it reachable.
    mountCombatNav(sidebarNav);
    mountCombatLab(main);
    // Story doesn't either (I-082) — same reason, same treatment.
    mountStoryNav(sidebarNav);
    await mountStory(main);
    return;
```

In the happy path, after `mountCombatNav(sidebarNav);` (`main.mjs:166`) add:

```js
  mountStoryNav(sidebarNav);
```

and after `mountCombatLab(main);` (`main.mjs:252`) add:

```js
  await mountStory(main);
```

- [ ] **Step 5: Extend the tab CSS**

In `tools/asset-storybook/index.html`, extend the four existing art-tab selectors (`:744`, `:751`, `:764`, `:769`) to cover the story tabs rather than duplicating the rules:

```css
      .art-tabbar-row,
      .story-tabbar-row {
```
```css
      .art-tab,
      .story-tab {
```
```css
      .art-tab:hover,
      .story-tab:hover {
```
```css
      .art-tab.active,
      .story-tab.active {
```

`.art-tabbar-hint` is reused as-is by `story.mjs` — no CSS change needed for it.

- [ ] **Step 6: Serve and verify in the browser**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc   # the worktree root
python3 -m http.server 8791 --bind 127.0.0.1
```

Open `http://127.0.0.1:8791/tools/asset-storybook/index.html` in Chrome and confirm:
1. A single **Story** entry appears in the sidebar directly under Combat, with a green dot and count 1.
2. Clicking it scrolls to the Story section; three tabs render — Reader, Graph, Undertow — with Reader active.
3. The Reader tab renders the acts/arcs/quests prose, the Graph tab renders the SVG columns, the Undertow tab renders the novel.
4. "Open full screen ↗" opens the currently active view in a new tab.

- [ ] **Step 7: Verify the lazy-loading claim**

With DevTools → Network open, reload the page and confirm that before any tab is clicked only the Reader view's requests appear — the novel HTML (~103 KB) must **not** be fetched. Click Undertow and confirm it loads then. Click Reader, then Reader again, and confirm the second click issues no new requests.

- [ ] **Step 8: Verify both degradation paths**

```bash
mv tools/asset-storybook/story-views.json /tmp/story-views.json.bak
```
Reload: the section must still render three tabs and log `story-views.json unavailable — falling back`. Restore it:
```bash
mv /tmp/story-views.json.bak tools/asset-storybook/story-views.json
```
Then temporarily rename `game-client/assets/manifest.json`, reload, and confirm the page shows "Failed to load manifests" **and** the Story section is still mounted and usable. Restore it.

- [ ] **Step 9: Format check**

Run: `npx prettier --write "tools/asset-storybook/js/*.mjs" "tools/asset-storybook/story-views.json"`
Then re-run Step 6's page load to confirm formatting changed nothing behaviourally.

- [ ] **Step 10: Commit**

```bash
git add tools/asset-storybook/js/story.mjs \
        tools/asset-storybook/js/state.mjs \
        tools/asset-storybook/js/sidebar.mjs \
        tools/asset-storybook/js/main.mjs \
        tools/asset-storybook/index.html
git commit -m "feat(storybook): mount story reader, graph and novel as one tabbed section"
```

- [ ] **Step 11: Quality gate**

Verify (Steps 6-9 done, with the browser actually open — an HTTP 200 is not proof the page works), then get an independent review of this task's diff, act on the findings, and re-run Steps 6-8. Do not start Task 3 with findings outstanding.

---

### Task 3: Prove it in the container

Steps 6-8 of Task 2 prove it works served from the repo root. They say nothing about the image, which is the environment that actually drops files — and the one the packaging gate exists for.

**Files:**
- Modify: `tools/story-explorer/README.md` (Serving it section)

**Interfaces:**
- Consumes: the image built by `scripts/deploy-local.sh` from Task 1's Dockerfile changes.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Build and deploy the local stack**

Run: `./scripts/deploy-local.sh`
Expected: the storybook image builds and the `asset-storybook` deployment rolls out. `DOCKER_BUILDKIT=1` is set by the script itself — required, or the build silently falls back to the root `.dockerignore` whitelist and produces an asset-less image.

- [ ] **Step 2: Port-forward and open it**

```bash
kubectl -n atlas-world port-forward deployment/asset-storybook 6006:80
```
`atlas-world` is the namespace `deploy-local.sh:75` sets. Then open `http://localhost:6006/tools/asset-storybook/index.html` in Chrome.

- [ ] **Step 3: Verify real content, not a green status code**

Click through all three tabs in the containerised page and confirm each renders real content: the Reader shows narrative prose (proving `content/story/*.json` was copied), the Graph shows SVG columns, the Undertow tab shows the novel. A 200 response with an empty frame is the exact failure this task exists to catch — check the rendered page, and check DevTools → Console for fetch errors.

- [ ] **Step 4: Document the new entry point**

In `tools/story-explorer/README.md`, under "Serving it", add after the existing `python3 -m http.server 7788` block:

```markdown
Both views are also embedded in the asset storybook (I-082) as the **Story**
section's Reader and Graph tabs, alongside the Undertow novel — see
`tools/asset-storybook/story-views.json`. Serving the repo root and opening
`/tools/asset-storybook/index.html` reaches all three without a second server.
```

- [ ] **Step 5: Commit**

```bash
git add tools/story-explorer/README.md
git commit -m "docs(story-explorer): note the storybook Story section entry point"
```

- [ ] **Step 6: Quality gate**

Verify (Step 3 done in the browser against the container), independent review of the full three-task diff, act on findings, re-run `npm test --prefix scripts` and reload the containerised page.

---

## Done when

1. One **Story** sidebar entry with Reader / Graph / Undertow tabs, each rendering.
2. Only the active view loads; re-clicking the open tab issues no requests.
3. Renaming `story-views.json` degrades to three fallback views with a console warning.
4. Breaking the asset manifests leaves the Story section mounted.
5. `npm test --prefix scripts` passes, and fails when a registry entry loses its COPY line.
6. The containerised storybook renders real story content at the port-forwarded URL.
