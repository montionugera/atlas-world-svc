# F-237 record map: design brief

Register: product (a tool that serves the owner's review), not brand.

## Who reads it, and why
The game's owner, reviewing world structure. Often on a phone or iPad, in short sessions. They found the text page (a list of linked records) hard to follow: it never showed which place touches which. The map is read, tapped to jump to a place, and read again later. It is not edited here.

## What must be obvious at a glance
1. Where the start town is (heavy gold outline).
2. What each place is: town / hunting / dungeon / outside / not built yet (colour + border style + word; never colour alone).
3. Which places connect, and whether the connection is open or closed (solid vs dashed line).
4. Where an open door leads to a much higher level (red line plus a "!" badge). This is the one warning on the page.
5. On a continent: how routes rank (P0, P1, P2, "built" pills).

## Decisions and why
- Inline SVG drawn from the server's JSON block, no library: the owner asked for "a component that reads the config and turns it into a picture"; no new dependency.
- Dark surface-sunken panel, tokens from the shell (joy-*): matches the rest of the app in the user's dark theme.
- District: narrow 92px boxes on a 104px grid so all four columns fit a 390px phone at about 0.8 scale (name text about 11px). Kind and level sit on two short lines because one line does not fit the narrow box. Capped at 1.3x natural size on desktop so boxes do not balloon.
- Continent: 11 places with 176px boxes cannot be legible at phone width, so it scrolls sideways, opens centred, and says "Swipe sideways to see the whole map" under the picture on narrow screens.
- Continent labels show the current name only (the "new · old" pair stays in the tooltip); two lines instead of three.
- Warning marks are drawn above the boxes and moved along the edge to the nearest spot not covered by a box.
- Boxes are focusable links (Enter/Space) with a focus ring; the legend lists only the kinds present.
