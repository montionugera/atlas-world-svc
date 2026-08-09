---
title: "Story reading view: full-viewport overlay instead of a cropped inline frame"
id: I-085
status: spec-approved
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
| Prose column width inside the reader | 969 px |

Three distinct failures stack:

1. **Letterboxing.** A 29,298 px document is read through a 688 px slot while the
   75,284 px page scrolls behind it. Whenever the section is only partly scrolled
   into view — the normal case — the visible slice drops to roughly 400 px. That is
   the "cropped" symptom.
2. **Depth.** The section sits at 94.6% page depth behind 24 sections and ~653 asset
   cards. The sidebar button jumps there, but any stray scroll loses it.
3. **Line length.** 969 px lines are far past the comfortable measure for prose
   (~65–75 characters). This one lives in `tools/story-explorer/reader.html`, so it
   affects the standalone reader too.

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

The Story section renders near the top of `main`, immediately after the combat lab —
matching where it already sits in the sidebar — instead of at 94.6% page depth. A
`scroll-margin-top` on the section makes the sidebar jump land cleanly rather than
flush against the viewport edge.

Separately, `tools/story-explorer/reader.html`'s `main` gains a `max-width` of about
`70ch`. This is the one change that reaches outside the storybook; it improves the
standalone reader identically.

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
5. Exit ✕, Escape, and clicking another sidebar entry all close the overlay.
6. The Story section appears within the first two sections of `main`, not at the bottom.
7. `npm test --prefix scripts` still passes with the packaging test unmodified.
8. The reader's prose column measures under about 75 characters per line.

## Rollback

Presentation-only and additive to one module plus one CSS block. Reverting the commits
restores the shipped F-034 behaviour exactly; no registry, packaging, content, or gate
is touched.
