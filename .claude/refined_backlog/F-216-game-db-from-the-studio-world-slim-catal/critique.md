# F-216 S1 critique (controller, from real screenshots, 2026-11-15)

Shots: `ui-visual-verify/shoot.mjs` and a typed-query Playwright script, 390x844 and 1280x800, served
from this worktree on `:8791`. States shot: Home, popover with 20 results, record page, missing record,
concept-art gallery. Top bar measured at 390, 768, 1024, 1280, 1440 and 1728 px against the old build on `:8788`.

## Findings in the worker's first build (all fixed in this branch)

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | The search input was 16 px wide on a phone and at 1280; typed text was not visible | `#globalSearch` box 16x28 and 16x32; the "Include archive" label and the `⌘K` hint took the room | "Include archive" moved to the first row of the popover; hint hidden below 1440 px |
| P1 | At 1280 the box overflowed under the Drop Rate select; "Include archive" was hidden | wrapper right edge 859 px, `.topbar__end` left edge 781 px | Back / Forward go icon-only below 1440 px; box `flex: 1 1 240px` |
| P1 | Top bar 2 px taller at 768 and 1024 (133 / 95 vs 131 / 93) | box 34 px high beside 32 px buttons | input 30 px + border |
| P2 | Title squeezed to one clipped letter ("M", "H") at 1280 and 1440 | title width 11 px and 68 px | title hides while its group is under 700 px |
| P2 | Popover anchored to the input, not the box | left edge 12 px right of the box | anchored to `.sidebar-search__inner` |

The browser probe passed 24/24 on the first build: it checked that the box was on screen, not that it was wide enough to use.

## After the fixes (measured)

| Width | Top bar height (old / new) | Search box | Title |
|---|---|---|---|
| 390 | 44 / 44 | 190 px (input 164) | scrolls with the bar |
| 768 | 131 / 131 | 164 px | hidden (was 59 px) |
| 1024 | 93 / 93 | 172 px | 241 px (was 315) |
| 1280 | 49 / 49 | 179 px | hidden (was 74 px) |
| 1440 | 49 / 49 | 236 px | hidden (was 234 px) |
| 1728 | 49 / 49 | 215 px | 301 px (was 337) |

Probe `atlas_records_probe.mjs`: 24/24. No horizontal overflow at 390 or 1280. Light and dark use the same tokens.

## Accepted, not fixed

- Phone: the search input is 26 px high (lint wants 44). The phone top bar is capped at 44 px with 4 px padding, and the Menu button beside it is 28 px. Raising the box alone would break the row.
- Phone: Menu, Back and Forward tap targets under 44 px, and uneven header control heights (28 / 44). Both predate this feature.
- Record page: related records show title only, no summary line. Cleaner at 129 rows; revisit if the owner wants the line.
- At 1440 the title is hidden where the old build showed 234 px of it. The breadcrumb and the highlighted sidebar entry still say where you are.
