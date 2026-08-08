# Story Reading View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Story section's cropped 80vh inline iframe with a launcher card plus a full-viewport reading overlay, so a 29,298 px story document is read in one scroll instead of through a 688 px slot.

**Architecture:** `js/story.mjs` keeps its registry loading and mount contract but stops putting an iframe in the page flow. The section becomes a launcher; a module-level overlay singleton (`position: fixed; inset: 0`) owns the single iframe, which is created once and never reparented. Closing is wired three ways, one of which uses a custom DOM event so `sidebar.mjs` never has to import `story.mjs` (that would be a circular import).

**Tech Stack:** Vanilla ES modules, no build step, no dependencies.

## Global Constraints

- Zero dependencies, no build step. Plain ES modules loaded by `<script type="module">`.
- Do NOT modify `tools/asset-storybook/story-views.json`, `tools/asset-storybook/Dockerfile`, `tools/asset-storybook/Dockerfile.dockerignore`, or `scripts/tests/story_views_packaging.test.mjs`. This change is presentation only, and those files passing untouched is the evidence it stayed in its lane.
- Do NOT modify `tools/story-explorer/index.html` (the graph) or `docs/story/undertow/novel-illustrated-edition.html`.
- The combat lab keeps its inline 80vh frame. Same defect, deliberately out of scope.
- Exactly ONE iframe element, created once and never moved between parents — reparenting an iframe forces a reload in every major browser.
- Story must still mount in BOTH `main.mjs` paths (`:70-71` failure path, `:168`/`:253` happy path).
- Every task ends with the quality gate: verify → independent review of that task's diff → refactor → re-verify.

---

### Task 1: Launcher card and the reading overlay

**Files:**
- Modify: `tools/asset-storybook/js/story.mjs` (rewrite the body of `mountStory`; add the overlay singleton)
- Modify: `tools/asset-storybook/js/sidebar.mjs` (one dispatch line in `setActiveClass`, which begins at `:57`)
- Modify: `tools/asset-storybook/index.html` (add a CSS block after the `.story-tab.active` rule that ends at `:775`)

**Interfaces:**
- Consumes: `story-views.json` via the unchanged `loadViews()` — `{ id, label, src }[]`, `src` relative to `tools/asset-storybook/`.
- Produces: `mountStory(main): Promise<void>` and `mountStoryNav(sidebarNav): void` keep their existing signatures, so `main.mjs` needs no change in this task. New internal-only functions `openStoryView(view, views, trigger)` and `closeStoryView()`.

- [ ] **Step 1: Add the CSS**

In `tools/asset-storybook/index.html`, immediately after the `.art-tab.active, .story-tab.active { … }` rule (ends at `:775`), add:

```css
      /* I-085 — the story reading overlay. The inline 80vh frame it replaces
         showed 2.3% of a 29,298px document while the page scrolled behind it. */
      .story-overlay {
        position: fixed;
        inset: 0;
        z-index: 9000;
        background: var(--bg);
        display: flex;
        flex-direction: column;
      }

      .story-overlay[hidden] {
        display: none;
      }

      .story-overlay-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding: 0.55rem 0.9rem;
        border-bottom: 1px solid var(--border);
        background: var(--bg-card);
        flex-shrink: 0;
      }

      .story-overlay-spacer {
        flex: 1;
      }

      .story-overlay-frame {
        flex: 1;
        width: 100%;
        border: 0;
        background: #0b0d12;
        display: block;
      }

      .story-launcher-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.9rem;
      }

      /* The sidebar jump lands flush against the viewport edge without this. */
      #section-story {
        scroll-margin-top: 1.25rem;
      }
```

- [ ] **Step 2: Rewrite `js/story.mjs`**

Replace the whole file with:

```js
import {
  STORY_CLASS,
  STORY_VIEWS_URL,
  STORY_VIEWS_FALLBACK,
} from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

/**
 * The story surfaces (tools/story-explorer + the Undertow novel).
 *
 * Same mount contract as the combat lab (js/combat-lab.mjs): not an asset, no
 * health check, and a manifest 404 must not take it down — so main.mjs mounts
 * this in both its failure path and its happy path.
 *
 * I-085: the section itself holds NO iframe. F-034 put one at height:80vh in the
 * page flow, which meant reading a 29,298px document through a 688px slot while
 * a 75,284px page scrolled behind it — and showing a ~400px sliver of that slot
 * whenever the section was only partly scrolled into view. The section is now a
 * launcher; reading happens in a full-viewport overlay that owns the screen.
 *
 * There is exactly ONE iframe and it is never reparented: moving an iframe
 * between parents forces a reload in every major browser, which would re-fetch
 * the novel on every open/close.
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

// ---------- the reading overlay (module-level singleton) ----------

let overlay = null;
let overlayFrame = null;
let overlayTabRow = null;
let overlayLink = null;
let activeView = null;
let savedScrollY = 0;
let lastTrigger = null;
let escHandler = null;

function buildOverlay(views) {
  overlay = document.createElement("div");
  overlay.className = "story-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Story reading view");

  const header = document.createElement("div");
  header.className = "story-overlay-header";

  overlayTabRow = document.createElement("div");
  overlayTabRow.className = "story-tabbar-row";
  overlayTabRow.style.margin = "0";
  for (const view of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-tab";
    btn.dataset.storyTab = view.id;
    btn.textContent = view.label;
    btn.addEventListener("click", () => selectView(view));
    overlayTabRow.appendChild(btn);
  }
  header.appendChild(overlayTabRow);

  const spacer = document.createElement("div");
  spacer.className = "story-overlay-spacer";
  header.appendChild(spacer);

  overlayLink = document.createElement("a");
  overlayLink.className = "story-tab";
  overlayLink.target = "_blank";
  overlayLink.rel = "noopener";
  overlayLink.textContent = "Open full screen ↗";
  header.appendChild(overlayLink);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "story-tab";
  closeBtn.textContent = "Exit ✕";
  closeBtn.setAttribute("aria-label", "Close the story reading view");
  closeBtn.addEventListener("click", () => closeStoryView());
  header.appendChild(closeBtn);

  overlay.appendChild(header);

  overlayFrame = document.createElement("iframe");
  overlayFrame.className = "story-overlay-frame";
  overlay.appendChild(overlayFrame);

  document.body.appendChild(overlay);
}

function selectView(view) {
  if (activeView && activeView.id === view.id) return; // don't reload the open view
  activeView = view;
  overlayFrame.src = view.src;
  overlayLink.href = view.src;
  overlayTabRow.querySelectorAll(".story-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.storyTab === view.id);
  });
}

function openStoryView(view, views, trigger) {
  if (!overlay) buildOverlay(views);
  if (trigger) lastTrigger = trigger;
  if (overlay.hidden) {
    savedScrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    overlay.hidden = false;
    escHandler = (ev) => {
      if (ev.key === "Escape") closeStoryView();
    };
    document.addEventListener("keydown", escHandler);
  }
  selectView(view);
}

function closeStoryView() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
  window.scrollTo(0, savedScrollY);
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  if (lastTrigger) lastTrigger.focus();
}

// Closing on sidebar navigation goes through a DOM event rather than an import.
// sidebar.mjs cannot import this module: story.mjs already imports
// buildSidebarItem from sidebar.mjs, and the reverse import would make a cycle.
document.addEventListener("storybook:class-change", () => closeStoryView());

// ---------- the inline launcher ----------

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
  note.textContent =
    "The narrative, live. Not an asset — no manifest, no health check. " +
    "Pick a view to open it full screen; nothing loads until you do. " +
    "Exit with the ✕ or the Escape key.";
  section.appendChild(note);

  const row = document.createElement("div");
  row.className = "story-launcher-row";
  for (const view of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-tab";
    btn.dataset.storyLaunch = view.id;
    btn.textContent = view.label;
    btn.addEventListener("click", () => openStoryView(view, views, btn));
    row.appendChild(btn);

    const out = document.createElement("a");
    out.className = "story-tab";
    out.href = view.src;
    out.target = "_blank";
    out.rel = "noopener";
    out.textContent = "↗";
    out.title = "Open " + view.label + " in a new tab";
    out.setAttribute("aria-label", "Open " + view.label + " in a new tab");
    row.appendChild(out);
  }
  section.appendChild(row);

  const hint = document.createElement("p");
  hint.className = "art-tabbar-hint";
  hint.textContent =
    "Views mirror the story-views.json registry order. Adding a view is a registry edit plus its Dockerfile COPY + allowlist lines.";
  section.appendChild(hint);

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

- [ ] **Step 3: Dispatch the class-change event**

In `tools/asset-storybook/js/sidebar.mjs`, inside `setActiveClass(cls)` (begins at `:57`), add as the FIRST statement of the function body:

```js
  // I-085: lets the story overlay close itself on sidebar navigation without
  // sidebar.mjs importing story.mjs (story.mjs already imports from here — the
  // reverse import would be a cycle).
  document.dispatchEvent(
    new CustomEvent("storybook:class-change", { detail: { cls } }),
  );
```

- [ ] **Step 4: Format and syntax-check**

Run: `npx prettier --write tools/asset-storybook/js/story.mjs tools/asset-storybook/js/sidebar.mjs`
Then: `node --check tools/asset-storybook/js/story.mjs && node --check tools/asset-storybook/js/sidebar.mjs`
Expected: no output, exit 0.

- [ ] **Step 5: Confirm the packaging gate is untouched and still green**

Run: `git diff --name-only` and confirm NONE of `story-views.json`, `Dockerfile`, `Dockerfile.dockerignore`, `scripts/tests/story_views_packaging.test.mjs` appear.
Run: `npm test --prefix scripts`
Expected: PASS, same count as before the change.

- [ ] **Step 6: Verify in the browser**

Serve the worktree root (`python3 -m http.server 8791 --bind 127.0.0.1`) and open `http://127.0.0.1:8791/tools/asset-storybook/index.html`. Confirm:
1. The Story section shows three launcher buttons each followed by an `↗`, and **no iframe**.
2. Clicking "Reader" opens a full-screen overlay with the reader in it.
3. The overlay's tab buttons switch between Reader / Graph / Undertow.
4. `↗` in the overlay header opens the active view in a new tab.

- [ ] **Step 7: Measure the reading height (acceptance criterion 2)**

With the overlay open, run in the DevTools console:

```js
const f = document.querySelector('.story-overlay-frame');
({ frameH: Math.round(f.getBoundingClientRect().height), viewportH: innerHeight,
   ratio: (f.getBoundingClientRect().height / innerHeight).toFixed(3) })
```
Expected: `ratio` ≥ 0.90. Record the numbers.

- [ ] **Step 8: Verify the scroll lock and all three exits**

1. Scroll the gallery to a recognisable spot, note `window.scrollY`, open a view.
2. With the overlay open, scroll — the page behind must not move.
3. Press **Escape** — the overlay closes and `window.scrollY` returns to the noted value.
4. Re-open, click **Exit ✕** — closes.
5. Re-open, then click another sidebar entry (e.g. "Music") — closes.
Record the before/after `scrollY` for step 3.

- [ ] **Step 9: Verify nothing loads before a view is opened (acceptance criterion 3)**

Restart the static server on a FRESH port so the browser cache is cold (the HTTP cache is keyed by origin including port, and a warm cache silently hides load behaviour). Load the page, scroll to the Story section, and confirm the access log shows **zero** requests for `story-explorer/reader.html`, `story-explorer/index.html`, and `novel-illustrated-edition.html`. Then open one view and confirm only that one appears.

- [ ] **Step 10: Commit**

```bash
git add tools/asset-storybook/js/story.mjs tools/asset-storybook/js/sidebar.mjs tools/asset-storybook/index.html
git commit -m "feat(storybook): read story views in a full-viewport overlay"
```

- [ ] **Step 11: Quality gate**

Verify (Steps 4-9 done, browser actually open — an HTTP 200 is not proof the page works), independent review of this task's diff, act on findings, re-run Steps 6-9.

---

### Task 2: Placement and prose line length

**Files:**
- Modify: `tools/asset-storybook/js/story.mjs` (the `main.appendChild(section)` line at the end of `mountStory`)
- Modify: `tools/story-explorer/reader.html` (the `main{…}` rule at `:19`)

**Interfaces:**
- Consumes: the section element built by Task 1's `mountStory`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Place the section directly after the combat lab**

In `tools/asset-storybook/js/story.mjs`, replace the final `main.appendChild(section);` of `mountStory` with:

```js
  // I-085: appended last, this landed at 94.6% of a 75,284px page — behind 24
  // sections and ~653 cards. Sit directly under the combat lab instead, matching
  // the sidebar order. The fallback keeps the old behaviour if combat is absent
  // (it mounts on both main.mjs paths, but never assume a sibling exists).
  const combat = document.getElementById("section-combat");
  if (combat && combat.parentNode === main) combat.after(section);
  else main.prepend(section);
```

- [ ] **Step 2: Cap the reader's prose column**

In `tools/story-explorer/reader.html`, the rule at `:19` is currently:

```css
  main{flex:1;padding:48px 24px 140px;display:flex;justify-content:center;overflow-x:hidden}
```

The `main` is a flex container that centres one child, so the cap belongs on that child rather than on `main` itself — capping `main` would shrink the centring box instead of the text. Add a new rule immediately after `:19`:

```css
  main>*{max-width:70ch}
```

- [ ] **Step 3: Verify the measure**

Reload the reader (standalone at `/tools/story-explorer/reader.html`, and inside the overlay) and run:

```js
const el = document.querySelector('main > *');
const cs = getComputedStyle(el);
({ widthPx: Math.round(el.getBoundingClientRect().width),
   fontSize: cs.fontSize,
   approxChars: Math.round(el.getBoundingClientRect().width / (parseFloat(cs.fontSize) * 0.5)) })
```
Expected: `approxChars` under about 75, down from the measured 969 px column. If the selector matches nothing, inspect the reader's actual `main` child and cap that element instead — report what you found rather than guessing.

- [ ] **Step 4: Confirm the section moved**

Reload the storybook and run:

```js
const s = document.getElementById('section-story');
({ indexInMain: [...s.parentNode.children].indexOf(s),
   offsetTop: Math.round(s.getBoundingClientRect().top + scrollY),
   pageH: document.documentElement.scrollHeight })
```
Expected: `indexInMain` ≤ 2 and `offsetTop` a small fraction of `pageH` — not the 71,211 / 75,284 measured before.

- [ ] **Step 5: Re-run the suite and commit**

```bash
npm test --prefix scripts
git add tools/asset-storybook/js/story.mjs tools/story-explorer/reader.html
git commit -m "feat(storybook): lift the story section to the top and cap the reader measure"
```

- [ ] **Step 6: Quality gate**

Verify (Steps 3-4 measured in the browser), independent review of the full two-task diff, act on findings, re-verify.

---

## Done when

1. No iframe exists in the page flow — the Story section is a launcher only.
2. The overlay frame is ≥ 90% of `window.innerHeight`.
3. Zero requests for any registry `src` before a view is opened, proven on a cold cache.
4. The page behind the overlay does not scroll; the prior scroll position is restored on exit.
5. Exit ✕, Escape, and another sidebar entry all close it.
6. `section-story` is within the first two children of `main`.
7. `npm test --prefix scripts` passes with the packaging gate unmodified.
8. The reader's prose column measures under about 75 characters.
