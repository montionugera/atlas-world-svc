# F-239 critique (from the real screenshots, 2026-11-19)

Looked at: `~/.local/state/atlas-lane/maps/f239-{district,continent}-{phone,desktop}.png`, district = Cinnamon-Bellows Bluff, continent = Hearthbloom Basin.

**Works.**
- The Spice-Kiln Cellar box answers the owner's question at a glance: "Story dungeon / Ch 2 / Lv 14-15 -> 28-32 proposed". On the phone it fits inside the box, no clipping, no sideways page scroll (scrollWidth 390/390).
- The continent map shows "Find a party" on Kilnfire Terraces, "Learn party play" on Teacup Meadows, "Coordinated combat" on Amber-Root Hollows, with the level line kept under it. Nothing overlaps the route pills.
- The gameplay block reads as four label/value pairs; on a phone the label sits above its value, so a line never wraps into a narrow column.

**Still weak (not fixed, deliberately).**
- Small text on phone. The district drawing is scaled to fit (about 0.78), so the 13 px sub-labels land near 10 px. A dungeon box has four such lines. Readable on the screenshot, but the smallest text on the page. Fixing it means a wider drawing or a scroll-sideways map, which is a bigger change than this feature.
- Long district-map names still break mid-word ("Cinnamon-B / ark Viaduct", "Cinnamon-M / ill Haven"). This predates F-239 (the 10-character wrap from F-237); the wider 100 px box could take 11 characters, left alone to keep the diff to this feature.
- Meaning is in text only: story vs optional vs open share one purple. Fine for nine dungeons; revisit if the owner wants to scan by colour.
- The legend note is a sentence, not three swatches; it sits under the swatch row and wraps to two lines on a phone.

**Verdict.** Ship. The two weak points are inherited from the map's size, not from the new content.
