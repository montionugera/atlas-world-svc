# F-216 S1 UI Visual & Accessibility Critique

**Surfaces Evaluated:**
1. Top-Bar Global Search Box (Desktop 1280x800 and Mobile Phone 390x844)
2. Live Search Results Popover (`#searchPopover`) across states (idle, searching, results, empty, error/retry)
3. Dedicated Game Record Page (`#recordPage`) for canon and legacy entities, relations, tags, and source citations
4. Stale-DB Alert Banner (`.catalog-stale-banner`)

---

## 1. Visual Hierarchy & Design Direction

- **Restrained Palette (Joy tokens only):**
  - No invented CSS classes or off-spec color literals.
  - Surface backgrounds: `var(--joy-surface-card)` for popover, `var(--joy-surface-sunken)` for search input and skeleton loaders, and `var(--joy-accent-subtle)` for active keyboard navigation selections (`aria-selected="true"`).
  - Status and kind badges use `joy-badge joy-badge--neutral joy-badge--sm` consistently.
  - Legacy entities display the required neutral secondary badge: `Old concept`.

- **Desktop Header & Navigation Bar (1280x800):**
  - Search box is anchored in `.topbar__start` after `#topbarStatus` with `margin-left: auto; max-width: 340px; min-width: 160px;`.
  - Top bar height remains strictly unchanged (52px), preventing any layout shift or collision with canvas/panels.
  - Hotkey badge `<kbd class="sidebar-search__kbd">⌘K</kbd>` cleanly right-aligned inside the input pill.
  - "Include archive" checkbox integrated into `.sidebar-search__inner` with subtle border separation.

- **Mobile Viewport (Phone 390x844):**
  - Enforced CSS ordering: `#mobileNavMenuBtn` (`order: -2`) followed immediately by `.topbar .sidebar-search` (`order: -1`).
  - Search box is fully visible and interactive on initial load without requiring horizontal scrolling or drawer expansion (`A14` verified).
  - Touch target for `.sidebar-search__inner` expands to full 100% height with 44px minimum touch target for archive toggle.
  - Cmd/Ctrl+K keyboard badge hidden automatically on viewports `< 768px`.

---

## 2. Interaction & Flow Hardening

- **Search Debounce & Sequencing:**
  - 150 ms debounce timer on keystroke queries.
  - Monotonic sequence token (`SEARCH_POPOVER_SEQ`) eliminates out-of-order race conditions from delayed asynchronous fetch responses.
- **Keyboard Navigation & ARIA Conformance:**
  - `ArrowDown` / `ArrowUp` cyclically updates `aria-selected="true"` on rows and invokes `scrollIntoView({ block: 'nearest' })`.
  - `Enter` executes `openRecordFromEl` on the currently highlighted row.
  - `Escape` dismisses the popover immediately and returns focus without destroying the entered query string.
  - Outside pointer clicks dismiss the popover cleanly.
- **History & URL Resilience:**
  - Keystrokes use `writeUrlState(false)` (`history.replaceState`), preventing cluttered history states.
  - Picking a record executes `openRecord()`, which triggers `writeUrlState(true)` (`history.pushState`).
  - Browser Back button returns directly to the prior tab and preserves the search query inside the input box (`A9` verified).

---

## 3. Findings & Resolution Ledger

| ID | Severity | Finding | Resolution Status |
|---|---|---|---|
| P0-1 | Blocker | Search box was previously hidden inside mobile navigation drawer below 768px | Fixed: Re-anchored in `.topbar__start` with `order: -1` and flex-basis 150px. Verified via `atlas_records_probe.mjs`. |
| P0-2 | Blocker | Record page rendered into main workspace failed to dismiss open overlay panels | Fixed: `render()` invokes `ATLAS_PANELS.hideAll()` and hides `#subViewBar` and `#panelHost` when `CURRENT_RECORD` is set. |
| P1-1 | High | Long entity titles in result popover caused horizontal overflow on narrow mobile viewports | Fixed: Applied `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` to `.search-popover__title` and `.search-popover__summary`. |
| P1-2 | High | Popover exceeded screen bounds on 390px phone viewports | Fixed: `placeSearchPopover()` clamps `width = Math.min(480, window.innerWidth - 16)` and sets left margin safely. |
| P2-1 | Medium | Popover animation could cause stutter on devices with reduced motion preferences | Fixed: Added `@media (prefers-reduced-motion: reduce) { .search-popover { transition: none; } }`. |

---

## 4. Verification Summary

- `atlas_records_probe.mjs`: **24/24 assertions passed** across desktop (1280x800) and phone (390x844).
- `fastcheck.sh`: **PASS** (server-rs cargo clippy & test, 11 node unit tests, py_compile).
- Gate 1 `precheck.sh`: integrated and verified green.
