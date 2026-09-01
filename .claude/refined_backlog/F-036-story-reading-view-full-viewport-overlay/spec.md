---
title: "Story reading view: full-viewport overlay instead of a cropped inline frame"
id: F-036
from_idea: I-085
status: refined
---

# Story reading view: full-viewport overlay instead of a cropped inline frame

## Problem

F-034 embedded the story reader, narrative graph, and Undertow novel in the asset
storybook as one tabbed section backed by an 80vh iframe. It works, it is packaged
correctly, and it is **not readable**. Measured on the shipped page at a 1607x860
viewport:

| Measurement | Value |
|---|---|
| Storybook page height | 75,284 px |
| Offset where the Story section starts | 71,211 px — **94.6% down the page** |
| Iframe height (`height:80vh`) | 688 px |
| Reader document height *inside* that frame | 29,298 px |
| Fraction of the document visible at once | **2.3% — about 43 screenfuls** |
| Prose column width inside the reader (`#content`) | 760 px (~95 chars) — see correction below |

Three distinct failures stack:

1. **Letterboxing.** A 29,298 px document is read through a 688 px slot while the
   75,284 px page scrolls behind it. Whenever the section is only partly scrolled
   into view — the normal case — the visible slice drops to roughly 400 px. That is
   the "cropped" symptom.
2. **Depth.** The section sits at 94.6% page depth behind 24 sections and ~653 asset
   cards. The sidebar button jumps there, but any stray scroll loses it.
3. **Line length.** The prose column runs ~95 characters, past the comfortable measure
   (~65–75). This one lives in `tools/story-explorer/reader.html`, so it affects the
   standalone reader too.

   **Correction (found during implementation).** The 969 px figure originally recorded
   here measured `main` — the flex *centring container* — not the prose. The real column
   was 760 px, set by an existing `#content { max-width: 760px }` rule, which is ~95
   characters. The direction of the fix was right; the stated magnitude was wrong.

The root cause is a design choice, not a bug: an iframe fixed at `80vh` inside a
scrolling page is a letterbox by construction. Enlarging it does not fix it —
`calc(100vh - 120px)` would show 740 px of 29,298, a 7% improvement on a 43-screenful
document, with the outer page still scrolling behind.

## Why now

The feature just shipped to release/1.7 and the defect is in the part users touch
first. The fix is presentation-only — no registry, packaging, or gate changes — so it
is cheap now and gets more expensive once more views are registered against the
current shape.

## Goals

1. Reading any story view uses the full viewport, with exactly one scroll.
2. Nothing is cropped: no partially-visible reading frame in the page flow.
3. Getting out is obvious and always available.
4. The registry stays the single source of the view list — adding a fourth view stays
   a data edit.

## Non-goals

- No change to `story-views.json`, `tools/asset-storybook/Dockerfile`,
  `Dockerfile.dockerignore`, or `scripts/tests/story_views_packaging.test.mjs`. This is
  presentation only.
- No change to the narrative graph (`tools/story-explorer/index.html`) or the novel
  HTML.
- The combat lab keeps its current inline 80vh frame. It has the identical defect, but
  the agreed scope is the Story section; fixing it is a follow-up.
- No unified cross-story search, no in-storybook re-rendering of narrative content.

## Design

### 1. The inline section becomes a launcher

The Story section stops holding a live iframe. It renders a compact card: the existing
heading and note, then one button per registry view (Reader / Graph / Undertow), each
opening the reading view on that view, plus a small `↗` per view that opens the
standalone page in a new tab.

Removing the inline frame is what actually resolves the cropping — there is no longer a
partially-visible viewport in the page flow to crop. It also means **nothing loads until
a view is opened**, which strengthens rather than weakens F-034's "only the active view
loads" property.

### 2. The reading view is a full-viewport overlay

A `position: fixed; inset: 0` overlay above the page, at a z-index above all page
content, containing:

- a slim header row: one tab button per registry view, the `↗` link for the active
  view, and an **Exit ✕** button;
- the iframe filling all remaining height.

While the overlay is open, `document.body.style.overflow = "hidden"`, with `window.scrollY`
saved on entry and restored on exit so leaving returns the reader to the exact place they
left the gallery.

Switching tabs inside the overlay swaps `iframe.src`, exactly as the current tab bar does.
There is **one** iframe element and it is never reparented between containers: moving an
iframe in the DOM forces a reload in every major browser, which would re-fetch the novel
on every state change.

### 3. Exits

Three, because a mode that traps the user is worse than the cropped frame it replaced:

- the **Exit ✕** button in the overlay header;
- the **Escape** key;
- clicking any other sidebar entry (the storybook's existing `setActiveClass` path).

On exit, focus returns to the launcher button that opened the overlay.

### 4. Placement and line length

The Story section is prepended to `main` instead of rendering at 94.6% page depth. A
`scroll-margin-top` on the section makes the sidebar jump land cleanly rather than
flush against the viewport edge.

**Correction (found during implementation).** This originally said "immediately after
the combat lab — matching where it already sits in the sidebar." That does not work:
`main.mjs:249` appends every asset section, and only then does `:252` append the combat
lab, so the combat *section* is itself ~13th — only the sidebar *entry* is near the top.
Anchoring to it measured 95.3% depth. `main.prepend()` is used instead. Accepted
consequence: body order is Story first, Combat ~14th, which no longer matches the sidebar
order. Moving the combat lab is outside this feature's Story-only scope.

Separately, `tools/story-explorer/reader.html`'s existing `#content { max-width: 760px }`
is tightened to `58ch` (~73 characters at this font stack's measured ch-to-average-character
ratio of ~1.257). Note `58ch`, not the `70ch` first proposed: `ch` is the advance width of
the "0" glyph, not the average character, so `70ch` measured ~88 characters. This is the one
change that reaches outside the storybook; it improves the standalone reader identically.

## Failure handling

| Failure | Result |
|---|---|
| `story-views.json` missing or unreadable | Unchanged: warning logged, `STORY_VIEWS_FALLBACK` used, launcher renders three buttons |
| A view's page broken or 404 | That iframe fails alone inside the overlay; the storybook page behind it is untouched |
| Any asset manifest 404 | Story still mounts — the both-paths rule from F-034 still applies |
| Overlay opened twice / double-click | Idempotent: opening an already-open overlay just switches the view |
| Escape pressed with no overlay open | No-op; the key listener is only bound while the overlay is open |

## Testing

No new automated test. The existing `scripts/tests/story_views_packaging.test.mjs` must
keep passing untouched, proving this change did not disturb the registry or packaging.

Verification is browser-based, as it was for F-034:

1. The Story section renders no iframe until a view is opened — confirmed by a
   cold-cache server access log showing zero fetches for all three views on page load.
2. Opening a view fetches only that view.
3. The reading frame occupies the full viewport height minus the header, verified by
   measuring `getBoundingClientRect()` against `window.innerHeight`.
4. The page behind the overlay does not scroll while it is open, and the prior scroll
   position is restored on exit.
5. All three exits work.
6. The prose column measures under about 75 characters.

## Acceptance criteria

1. No cropped reading frame exists anywhere in the page flow.
2. The reading view's iframe height is at least 90% of `window.innerHeight`.
3. On page load, before any view is opened, zero requests are made for any registry
   `src`.
4. With the overlay open, scrolling the page does not move the content behind it;
   closing restores the pre-open scroll position.
5. Exit ✕ and Escape both close the overlay. A third path exists — sidebar navigation
   dispatches `storybook:class-change`, which the overlay listens for — but it is not
   reachable by ordinary mouse or keyboard while the overlay is open: the overlay covers
   the sidebar (`position:fixed; z-index:9000` over a `position:sticky` sidebar with no
   z-index), and the focus trap keeps Tab inside the overlay. It was originally verified
   with a programmatic `.click()`, which bypasses hit-testing — that verification did not
   prove what it appeared to. The path is real defence-in-depth for assistive tech that
   navigates outside the trap; hardening it properly (marking outside content `inert`) is
   a follow-up, not part of this feature.
6. The Story section appears within the first two sections of `main`, not at the bottom.
7. `npm test --prefix scripts` still passes with the packaging test unmodified.
8. The reader's prose column measures under about 75 characters per line.

## Rollback

Presentation-only and additive to one module plus one CSS block. Reverting the commits
restores the shipped F-034 behaviour exactly; no registry, packaging, content, or gate
is touched.
