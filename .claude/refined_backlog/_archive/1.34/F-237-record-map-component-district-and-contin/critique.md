# F-237 record map: critique

Looked at: the district page (district-porcelain-cradle) and the continent page (continent-01-hearthbloom-basin), real Chrome, 390x844 and 1280x800, before and after the fixes. Final shots: ~/.local/state/atlas-lane/maps/f237-{district,continent}-{phone,desktop}.png

## What I saw first (before fixes), ranked
1. District, phone: the map was cut at both sides. Only the middle three columns showed, half-boxes poked in at the edges and the "!" badges sat on the clipped edge. The owner would not know there were more places. FIXED.
2. Continent, phone: boxes cut off at the left edge, no hint that the map scrolls. Three-line "new · old" names filled the boxes. FIXED partly (hint plus two-line names); it still needs a sideways swipe.
3. Continent: a "!" mark placed at the edge midpoint could land behind another box; long unbroken words spilled out of a box. FIXED (marks drawn on top and moved along the edge to a clear spot; long words cut into lines).
4. Small type: 12-13px in the SVG, which shrinks further when scaled. Raised to 14/13px.
5. Desktop district: boxes were scaled up to the full panel width and felt huge. FIXED (width capped).

## After fixes
- District phone: whole map visible, no scrolling, name text about 11px, tags below. Two "!" badges sit in the 12px gaps between neighbouring boxes and slightly overlap box corners. Left as is: they stay readable, and wider gaps would shrink the text.
- District desktop: centred, readable, the start town and the two warnings stand out.
- Continent desktop: all routes and pills legible; some pills sit on top of long lines near a box edge (for example "P2" next to Cardamom-Kiln Caldera). Left: moving pills uses the same search as the marks but is not needed for reading.
- Continent phone: still scrolls, labels now two lines. The hint is below the map, so may be missed on first view; left to avoid a new overlay feature.

## Left on purpose
- Edges still run centre to centre behind boxes; with opaque boxes this reads fine. Routed curves would be a new feature.
- Long district labels end with "…" after three lines ("Lantern Hollow (Teacup…"); the full name is in the tooltip and on tap.
