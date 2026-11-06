# F-174 Task 10 critique: Game Systems chapter vs design-brief "Done looks like"

Shots: /tmp/ui-shots/f174-systems-390x844.png and /tmp/ui-shots/f174-systems-1280x800.png (edit host :8788). Score: 8/8.

1. PASS: Header matches the other chapters: `div.lore-chapter-header` with eyebrow "How the World Works", h2 "🛡️ Game Systems", desc line (`buildSystemsSection`).
2. PASS: The strip sits directly under the summary (both shots).
3. PASS: Captions share one scrolling box with the image (`.lore-strip` holds img + figcaption, 9 x 160 px grid); desktop shot shows Idle..Attack centred under their cells.
4. PASS: 390x844: shoot.mjs lint reports no "horizontal overflow"; probe: frame clientWidth 292, scrollWidth 1440, document scrollWidth 390 = viewport.
5. PASS: 1280x800: 0.86 rem body text, h4 subtitles in `--text`, readable without zoom. A first pass had 16 px unstyled paragraphs and loose gaps; fixed by giving section paragraphs `lore-card-body` and tightening subtitle margins.
6. PASS (browser probe, strip route forced to 404): the whole figure and caption row are replaced by one `p.lore-chapter-desc` holding the edit-host link; no `.lore-strip` or `.lore-strip-caps` left.
7. PASS: `figure.lore-strip` has tabindex=0, role=region, aria-label; focused outline is `solid 2px`; ArrowRight x2 moved scrollLeft 0 -> 80.
8. PASS: "Known limits" is an `h4.lore-card-subtitle` plus a plain `ul` inside the card; no nested card.

Remaining shoot.mjs findings are app-shell, not this chapter (tap targets on Menu/Back/Forward, header control heights, clipped "Lore and History" title) and predate F-174. Not touched.
Deviations from the plan sample: full header, F-174 as `lore-badge`, no nested highlight card, error swaps the whole figure, player-word captions (test adjusted: new caption-words test; existing mount test chip count 6 -> 7 for the new chip, and its fetch map gained game-systems.json).
