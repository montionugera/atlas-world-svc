# F-216 S1 design brief: top-bar search, result popover, record page, stale-DB banner

Inputs: `spec.md` ("UI state matrix", R6-R9, A7-A9, A14), `plan.md` Task 0 and Task 3, `docs/PRODUCT.md`,
and the shell as it is today (`scripts/atlas_world_web/frontend/01_shell_and_styles.html`).
No discovery interview was run: the owner approved the spec, which fixes the states, the strings and the flow.

## 1. Feature summary

One search box in the top bar finds any game record from any tab; a popover lists up to 20 results;
picking one opens a record page that shows what the record is and what it links to. A banner on the
page says when the game DB could not be rebuilt.

## 2. Primary user action

Type a name, pick a result. Two actions, on a Mac or a phone.

## 3. Design direction

- **Colour strategy: Restrained.** The existing Joy tokens only. Kind is shown with the existing
  `joy-badge joy-badge--neutral joy-badge--sm`; the accent (`--joy-accent-*`) marks only the active
  popover row and links. No new colour literals, in light or dark.
- **Scene:** the owner at a desk mid-task, or on a phone following a link, wants one fact and its
  neighbours, then goes back to what they were doing. The surface must be quiet and fast, and must
  not restyle the tab underneath.
- **Anchors:** the macOS Spotlight result list (one line of title, one line of context), the GitHub
  command palette (kind label left of the title), a Wikipedia infobox page (title, short summary,
  grouped links).

## 4. Scope

Production-ready, shipped quality. Three surfaces plus the banner. No animation beyond a 120 ms
opacity fade on the popover (`prefers-reduced-motion: reduce` removes it; the popover is visible
without the transition).

## 5. Layout

### Search box (`.sidebar-search` block moved into `<header class="topbar">`)

- It lives inside `.topbar__start`, after `#topbarStatus`. Keep the class names `sidebar-search`,
  `sidebar-search__inner`, `sidebar-search__input`, `sidebar-search__kbd` and the id `globalSearch`.
- **The top bar's height must not change at any width.** The wrapper `.sidebar-search` gets
  `padding: 0` inside the top bar (`.topbar .sidebar-search { padding: 0; }`); the input is
  `height: 32px` on desktop and `28px` below 768 px.
- Desktop (768 px and up): `.topbar .sidebar-search { flex: 1 1 0; min-width: 160px; max-width: 340px; margin-left: auto; }`.
  A zero flex-basis is deliberate: `.topbar` is `flex-wrap: wrap`, and a fixed basis could push
  `.topbar__end` onto a second row. The title already ellipsizes (`.topbar__title`), so the box
  takes its room from the title, never from the status badge.
- Phone (below 768 px): the top bar is one 36-44 px row that scrolls sideways. The box must be on
  screen at 390 px without scrolling: `.topbar .sidebar-search { order: -1; flex: 1 0 150px; max-width: none; margin-left: 0; }`
  and `#mobileNavMenuBtn { order: -2; }`, so the row reads Menu, search, then history, title, status.
  Nothing is hidden; title and status stay in the DOM and scroll with the bar. Hide the `⌘K` hint
  (`.sidebar-search__kbd`) below 768 px.
- "Include archive": `<label class="topbar-search__archive">` directly after the `<kbd>`, inside
  `.sidebar-search__inner`, so box and checkbox read as one control. `font-size: var(--joy-font-size-xs, 11px)`,
  `color: var(--joy-text-secondary)`, `white-space: nowrap`, `padding: 0 8px`, a 1 px
  `var(--joy-border-subtle)` left border, `display: inline-flex; align-items: center; gap: 4px`.
  The label keeps its full text "Include archive" at every width.
- Touch: the visible input is 28 px high on a phone, so the hit area is the whole wrapper:
  `.sidebar-search__inner` and the `<label>` are `align-self: stretch` with `min-height: 100%` of the
  bar row, and the checkbox label has `min-width: 44px`. Tapping anywhere in the wrapper focuses the input.

### Result popover (`#searchPopover`, sibling directly after `</header>`)

- `position: fixed` (the phone top bar has `overflow-x: auto` and would clip an absolute child).
  JS sets `top` to the input wrapper's `getBoundingClientRect().bottom + 4` and re-places it on
  `resize` and on the top bar's `scroll`.
- Desktop: `left` = the wrapper's left edge, `width: max(<wrapper width>, 420px)`, clamped so the
  right edge stays 8 px inside the viewport. Phone: `left: 8px; right: 8px; width: auto`.
- `max-height: min(60vh, 480px); overflow-y: auto; overscroll-behavior: contain`.
- Surface: `background: var(--joy-surface-card)`, `border: 1px solid var(--joy-border-default)`,
  `border-radius: var(--joy-radius-card)`,
  `box-shadow: 0 8px 24px color-mix(in srgb, var(--joy-text-primary) 18%, transparent)`.
- Layer: `z-index: 900`, the layer the file already uses for floating UI (`:2010`), below the phone
  nav drawer (`940` / `950` at `:2322-2330`). Opening the drawer closes the popover.
- Row (`.search-popover__row`, `role="option"`, `data-record="<kind>:<id>"`): a two-column grid,
  `grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; padding: 8px 12px`.
  Left: the kind badge (`joy-badge joy-badge--neutral joy-badge--sm`), aligned to the title line.
  Right, line 1: title, `var(--joy-font-size-sm)`, weight 600, `var(--joy-text-primary)`.
  Right, line 2: summary, `var(--joy-font-size-xs, 12px)`, `var(--joy-text-secondary)`.
  Both lines `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. A row with no summary
  shows the title line only. `min-height: 44px` at every width.
- A legacy result (only with "Include archive") adds a second badge after the kind badge:
  `joy-badge joy-badge--neutral joy-badge--sm` with the text `Old concept`.
- Active row (`[aria-selected="true"]`, also `:hover`): `background: var(--joy-accent-subtle)`.
  No side stripe. Rows are separated by `1px solid var(--joy-border-subtle)`; the last has none.
- Message row (`.search-popover__message`): `padding: 14px 12px`, `var(--joy-font-size-sm)`,
  `var(--joy-text-secondary)`; the error variant puts `#searchRetry`
  (`joy-button joy-button--outline joy-button--sm`) on the same line, right-aligned.

### Record page (`#recordPage.record-page`, rendered into the main stage)

- One column, `max-width: 72ch`, `padding: 24px 20px` (phone `16px`), left-aligned, no card around it.
- Order: kind badge (plus `Old concept` badge when legacy) on one line; `<h1>`
  (`var(--joy-font-size-xl, 22px)`, weight 600, `text-wrap: balance`); summary paragraph
  (`var(--joy-text-secondary)`, `text-wrap: pretty`); tags as `joy-badge joy-badge--neutral joy-badge--sm`
  in a wrapping row with a 6 px gap; the `Open in <entry>` link (`#recordOpenLink`,
  `joy-button joy-button--outline joy-button--sm`); then one `<section data-relation="<label>">` per relation.
- Relation section: `<h2>` in `var(--joy-font-size-sm)`, weight 600, `var(--joy-text-secondary)`,
  followed by the count in the same style ("Contains · 34"). Sentence case, no uppercase tracking.
  `margin-top: 24px` before each section, `8px` between heading and list.
- Related records: a plain list, not cards. Each item is the same two-line row as the popover
  (kind badge, title, summary) as an `<a data-record>` with `min-height: 44px`,
  `border-bottom: 1px solid var(--joy-border-subtle)`, hover and focus `background: var(--joy-surface-sunken)`.
  Above 900 px a section with more than 8 items uses
  `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); column-gap: 24px`.

### Stale-DB banner (`.catalog-stale-banner`, first child of the main column, above the top bar's content area)

- A full-width strip under the top bar on every tab: `background: var(--joy-status-danger-bg)`,
  `color: var(--joy-status-danger-fg)`, `border-bottom: 1px solid var(--joy-border-default)`,
  `padding: 8px 20px` (phone `8px 12px`), `font-size: var(--joy-font-size-sm)`, `role="alert"`.
- Line 1, weight 600: `Game DB is out of date: rebuild failed`. Line 2: the builder's last error
  line in the monospace stack, `overflow-wrap: anywhere`, at most 3 lines (`-webkit-line-clamp: 3`).
- It is outside the top bar, so the bar's height does not change. It is absent from the DOM when the DB is fresh.

## 6. States (from the spec's UI state matrix; strings are exact)

| Surface | State | What shows |
|---|---|---|
| Search box | idle | placeholder `Search every record...`, `⌘K` hint on desktop |
| Search box | fewer than 2 characters | no popover; the box still filters the open tab as today |
| Popover | loading (after 150 ms) | one message row: `Searching...` |
| Popover | results | 1 to 20 rows; fewer than 20 shows no "more" control |
| Popover | empty | `No record matches '<query>'`; the tab underneath is unchanged |
| Popover | error | `Search is unavailable` + `Retry` |
| Record page | loading | a skeleton title line: an `<h1>` of `var(--joy-surface-sunken)`, 60% wide, `aria-busy="true"` |
| Record page | ideal | title, tags, relation groups, `Open in <entry>` |
| Record page | no summary | title and tags only, no empty paragraph |
| Record page | no links | `Nothing is linked to this yet` in `var(--joy-text-secondary)` where the sections would be |
| Record page | legacy record | `Old concept` badge beside the kind badge |
| Record page | not found | `No such record: <kind>:<id>` (`role="alert"`), search box focused |
| Any tab | rebuild failed | the banner with `Game DB is out of date: rebuild failed` and the error line |

## 7. Interaction

- Entry: click or tap the box, `Cmd/Ctrl+K` or `/` (both exist today), or a `/?r=<kind>:<id>` link.
- Typing replaces the URL (no history entry per keystroke) and queries after a 150 ms debounce.
- Focus order: search box, "Include archive", results, page content. In the box, Arrow Down and
  Arrow Up move the active row (`aria-activedescendant`), Enter opens it, Escape closes the popover
  and keeps the text. Toggling "Include archive" re-runs the query.
- A click outside, or a tab switch, closes the popover. Picking a result pushes one history entry;
  the browser Back button returns to the previous tab with the previous query in the box.
- Focus ring: the existing `:focus-within` ring on `.sidebar-search__inner`; rows and links use
  `outline: 2px solid var(--joy-border-focus); outline-offset: -2px`.

## 8. Content

Exact strings, do not reword: `Game DB is out of date: rebuild failed`, `No record matches '<query>'`,
`Search is unavailable`, `Retry`, `Searching...`, `No such record: <kind>:<id>`,
`Nothing is linked to this yet`, `Old concept`, `Include archive`, `Open in <entry>`.
Placeholder: `Search every record...`. Kind badges show the kind in plain words ("Studio map", not `studio_map`).
Realistic ranges: titles 4 to 60 characters, summaries 0 to 200, relation groups 0 to 6, items per group 0 to 129.

## 9. References for the build

impeccable `reference/product.md`, `reference/adapt.md` (phone), `reference/harden.md` (states, long text).

## 10. Checks the build must pass

- Top bar height equal before and after at 390, 768, 1024 and 1280 px (Gate 1 probes
  `atlas_phone_touch_audit.mjs` L3 and `atlas_zoom_drift_check.mjs` measure what sits below it).
- At 390x844 the search box is fully inside the viewport with the nav drawer closed and the top bar unscrolled.
- No horizontal page scroll at 390 px with the popover open or on a record page.
- Body text contrast at least 4.5:1 in light and dark (token pairs only).
