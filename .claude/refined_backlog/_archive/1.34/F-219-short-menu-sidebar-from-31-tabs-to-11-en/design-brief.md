# Design brief: short menu, pills row, Home, top bar (F-219)

Written by the controller with `impeccable shape`, register **product** (`docs/PRODUCT.md`: "a working
atlas: dense, calm, exact. Names and numbers first, decoration last"). No discovery interview: the
approved spec fixes the entries, labels, states and flow. All CSS goes in
`scripts/atlas_world_web/frontend/01_shell_and_styles.html`. Only `var(--joy-*)` tokens; no new colour
literal; nothing here adds motion.

## 1. What it is

The sidebar becomes a table of contents with 11 lines. The old tabs are pills above the content. Home
is an index page: one line per kind of record with its count. Colour strategy: restrained, as today
(accent only on the open entry and the selected pill).

## 2. Sidebar (11 rows)

- One `.nav-item` per entry, text only: no emoji, no count chip, no section headings. The existing
  `.nav-item`, `.nav-item:hover`, `.nav-item.active` rules stay as they are.
- Rows are focusable (`role="button" tabindex="0"`), so they need a focus ring, and a phone needs a
  44 px row. Add after the `.nav-item.active` rule:

```css
    .nav-item:focus-visible {
      outline: 2px solid var(--joy-border-focus);
      outline-offset: -2px;
    }
    @media (max-width: 767px) {
      .nav-item { min-height: 44px; }
    }
```

- Delete the `.nav-section { ... }` rule (no element uses it after this change). `.nav-section-count`
  stays: the record page uses it.

## 3. Pills row (`#subViewBar`)

- Entry pills first (`data-tab-pill`), then, when the open tab has its own views (story, review), a
  hairline separator and the view pills (`data-subview`). Same `joy-button joy-button--sm` pills as
  today: selected is `--solid`, the rest `--outline`.
- Desktop: the row may wrap (Tools has 10 pills). Phone: one line that scrolls sideways, so it never
  pushes the content down by three rows. Replace the two `.subview-bar` lines (`:524-525`) with:

```css
    .subview-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 16px 0; }
    .subview-bar__sep { flex: 0 0 auto; align-self: stretch; width: 1px; margin: 0 4px; background: var(--joy-border-default); }
    @media (max-width: 720px) {
      #panelHost { padding: 4px; }
      .subview-bar { flex-wrap: nowrap; overflow-x: auto; padding: 4px; }
      .subview-bar > .joy-button { flex: 0 0 auto; min-height: 44px; }
    }
```

## 4. Home (`#homePage`)

An index, not a dashboard: no cards, no big numbers. One row per kind, hairline between rows, the
same rhythm as the related-record rows on the record page. The count is mono and right-aligned in
its own column so the numbers line up; the entry name sits at the right edge in secondary text.

- Loading: the list area shows `...` (`role="status"`). Loaded with no rows (route failed): the
  heading and the search button only; the stale-DB banner already explains a broken DB.
- A row whose kind has no tab (map plates) is a plain `div`: same look, no pointer, not focusable.

Add next to the `.record-page` rules (`:273`), and add `.home-page h1` to the selector of the
existing `.record-page h1` rule (`:279`) so both headings share one declaration block:

```css
    .home-page {
      max-width: 640px;
      padding: 24px;
    }
    .home-counts {
      margin-top: 16px;
      border-top: 1px solid var(--joy-border-default);
    }
    .home-count {
      display: grid;
      grid-template-columns: 6ch 1fr auto;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 44px;
      padding: 0 8px;
      border: 0;
      border-bottom: 1px solid var(--joy-border-default);
      background: none;
      color: var(--joy-text-primary);
      font: inherit;
      text-align: left;
    }
    button.home-count { cursor: pointer; }
    button.home-count:hover { background: var(--joy-surface-sunken); }
    button.home-count:focus-visible { outline: 2px solid var(--joy-border-focus); outline-offset: -2px; }
    .home-count__n {
      font-family: var(--joy-font-family-mono);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      text-align: right;
    }
    .home-count__entry {
      color: var(--joy-text-secondary);
      font-size: var(--joy-font-size-sm);
    }
```

  and inside the existing `@media (max-width: 767px)` block that holds `.record-page { padding: 16px; }`
  add `.home-page { padding: 16px; }`.

## 5. Top bar: nothing may sit on top of the search box (spec A10)

Measured 2026-11-15 with the status pill reading `Editable · atlas-edit.joymify.local.com` (240 px):
at 1280 px the left group needs 540 px (history 124, pill 240, search 160, gaps 16) but gets 487, and
the search box slides 49 px under the Drop Rate select. Cause: `.topbar__start` is an inline-size
container (`:164-175`), so its content does not count toward its minimum width.

The status pill must not shrink or truncate (F-158, asserted by `atlas_zoom_drift_check.mjs`) and its
text is pinned by `atlas-web-frontend-read-only.test.mjs:67`. So the two selects on the right give
way instead; they are built to shrink (`flex: 0 1 auto; min-width: 0`).

**This part is done by the controller in Task 3 (it needs measuring in a browser after each change),
not by the Task 2 worker.** Starting point:

```css
    /* replaces the "@media (min-width: 768px) { .topbar__start { container: ... } @container ... }" block */
    @media (min-width: 768px) and (max-width: 1599px) {
      .topbar__title { display: none; }
    }
    @media (min-width: 768px) {
      .topbar .topbar__start { min-width: min-content; }
    }
    @media (min-width: 1100px) {
      body .topbar__end { flex-wrap: nowrap; }
    }
```

  plus, in `.topbar .sidebar-search` (`:144`), `min-width: 160px` becomes `min-width: 200px`, and the
  label-hiding breakpoint `@media (max-width: 1439px)` (`:157`) becomes `(max-width: 1599px)`.

Pass when, at 1024, 1280 and 1440 px with the long pill text: no child of `.topbar__start` overlaps a
child of `.topbar__end`, the search box is at least 200 px wide at 1280 px, the pill is not truncated,
and the bar is one row (49 px) at 1280 and 1440 px.

## 6. Copy

`Home`, `Atlas World DB` (Home heading), `Search every record` (button; focuses the top-bar box),
`...` (counts loading). Entry and pill labels: the table in `plan.md` Task 2 Step 3.

## 7. Not doing

No icons in the sidebar, no counts in the sidebar, no "recent records", no second search input on
Home, no animation.
