# F-187 design brief: click-to-enlarge lore art

Scope: the concept-art thumbnails in the Lore panel (race, god, continent, epoch cards), `atelier/atlas-world-panels/js/panels/lore.mjs` + 3 rules in `css/panels.css`. Not a redesign.

Problem: thumbnails are 240px wide, so the race reference sheets (turnarounds, palettes, expressions) cannot be read. Owner asked to click and see the full-scale image.

Decision: reuse the existing `.concept-lightbox-overlay` (dark scrim, blur, z-index scale from the concept-arts panel) with a bare image, no new modal chrome. Image `object-fit: contain`, never cropped (reference sheets are information, not decoration).

Interaction:
- Click or Enter/Space on the thumbnail opens it; click anywhere or Escape closes it.
- Thumbnail gets `cursor: zoom-in`, `role=button`, `tabindex=0`, a "Click to view full size" title; the overlay gets `cursor: zoom-out`.
- No arrows or captions: the Concept Arts tab already has the full lightbox with navigation and prompt.

Out of scope: pan/zoom inside the overlay, a close button, navigation between images.
