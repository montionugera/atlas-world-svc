# Design critique: short menu, pills row, Home, top bar (F-219)

Reviewed with `impeccable critique` (register **product**, `docs/PRODUCT.md`: "a working atlas: dense, calm, exact. Names and numbers first, decoration last") against live 390×844 phone and 1280×800 desktop screenshots from `shoot.mjs` across `?tab=home`, `?tab=studio`, `?tab=sql` (Tools, 10 pills), `?tab=story` (Archive), and the open phone navigation drawer (`data-mobile-nav-open="true"`), plus 1024 / 1280 / 1440 px top-bar measurements with `Editable · atlas-edit.joymify.local.com` (`239 px`) and deterministic `detect.mjs` output.

## 1. Design Health Score (Nielsen's 10 Heuristics)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Selected sidebar entry and active `#subViewBar` pill (`--solid`) clearly indicate current location; Home shows `...` (`role="status"`) while counts load. |
| 2 | Match System / Real World | 4 | Plain words in the 11-entry table of contents (`Home`, `World`, `Monsters`, `Items and cards`, `Jobs and skills`, `Quests and dungeons`, `Lore and canon`, `Art`, `Assets and audio`, `Tools`, `Archive (old concept)`). |
| 3 | User Control and Freedom | 4 | Every legacy `?tab=<id>` deep link continues to work; Back/Forward and Escape work everywhere. |
| 4 | Consistency and Standards | 4 | Uses `--joy-*` tokens, `joy-button joy-button--sm` pills, and shares heading/row rhythm between `.record-page` and `.home-page`. |
| 5 | Error Prevention | 4 | `map_plate` row on Home has no tab and renders as a non-interactive `<div>` (no dead click target); top bar no longer overlaps the search box at 1024/1280/1440 px. |
| 6 | Recognition Rather Than Recall | 4 | Reducing 31 sidebar tabs to 11 plain entries removes visual wall-of-tabs scanning while keeping sub-views visible in `#subViewBar`. |
| 7 | Flexibility and Efficiency | 4 | `Search every record` button on Home focuses `#globalSearch`; keyboard navigation (`role="button" tabindex="0"` + Enter/Space) works on all 11 sidebar entries. |
| 8 | Aesthetic and Minimalist Design | 4 | No emoji, count chips, or section headers in the sidebar; Home is a calm tabular index (`6ch 1fr auto`) rather than a SaaS card grid. |
| 9 | Error Recovery | 4 | When `/api/record-counts` fails, Home degrades gracefully to the heading and search button while the stale-DB banner explains any broken database state. |
| 10 | Help and Documentation | 3 | Self-explanatory index and pill labels; minor legacy density inside individual tool views (e.g. `story` act cards on 390 px). |
| **Total** | | **39/40** | **Strong product-register fit** |

## 2. Anti-Patterns Verdict

- **LLM assessment:** Passes the product register test (`docs/PRODUCT.md`). The sidebar reads as a calm 11-line table of contents with zero decorative clutter. Home avoids hero-metric cards, gradients, and sparklines in favor of a right-aligned monospace count column (`tabular-nums`), plain kind name, and muted right-aligned section label.
- **Deterministic scan (`detect.mjs`):** 0 findings on F-219 rules (`01_shell_and_styles.html` has 1 pre-existing warning at line 1197 on a legacy map highlight glow, outside F-219 scope).
- **Top-bar geometry (`spec A10`):** With the status pill set to `Editable · atlas-edit.joymify.local.com` (`239 px`), measured at `1024 px` (`searchW: 340`, `overlaps: []`), `1280 px` (`topbarH: 49`, `searchW: 228 >= 200`, `pillTrunc: false`, `overlaps: []`), and `1440 px` (`topbarH: 49`, `searchW: 258`, `pillTrunc: false`, `overlaps: []`).

## 3. What's Working

1. **11-entry sidebar + `#subViewBar` pill strip:** Shrinking the left navigation from 31 tabs + 9 uppercase headers + count badges down to 11 plain rows makes the entire sidebar fit without scrolling on both desktop (`1280×800`) and the phone drawer (`390×844`), with 44 px touch targets on mobile.
2. **Phone horizontal pill scroll (`#subViewBar`):** Even on `Tools` (10 pills: `SQL`, `Combat lab`, `Docs`, `Elements`, `Siege`, `Enchant`, `Brushes`, `Map builder`, `Art forge`, `Review inbox`), the pill bar stays a single 44 px-tall horizontal scroll row on 390 px phones instead of pushing the page down by three wrapped rows.
3. **Tabular Home index (`#homePage`):** Right-aligned `tabular-nums` counts (`129 node`, `97 studio map`, `45 map`, `36 canon`...) align cleanly on a `6ch` column, with non-routable `map plate` rendered as a static `<div>` so users never click a no-op row.

## 4. Priority Issues (P0 / P1 / P2 / P3)

- **P0 / P1:** None in F-219 surfaces (`Home`, sidebar, `#subViewBar`, top bar).
- **[P3] Legacy phone top-bar compact button heights (pre-existing, outside F-219 scope):** `shoot.mjs` notes that `.topbar-mobile-nav-btn` (`28 px`) and `#globalSearch` (`26 px`) inside the 36–44 px compact mobile header are shorter than 44 px, and `story` act cards wrap tightly in a 5-column row on 390 px. Both are pre-existing outside F-219's sidebar/subViewBar/Home scope; F-219's own mobile targets (`.nav-item`, `.subview-bar > .joy-button`, `.home-count`) all meet `min-height: 44px`.
