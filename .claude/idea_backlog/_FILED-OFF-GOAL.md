
## Filed 2026-08-09 during F-040 (town plan) — off-goal, do not chase
- Three cluster-1 roads name a non-place in `from`/`to` (one road id, two zone ids) — `content/maps/cluster1-geography.json`.
- `flat-crossing` (-4.6%) and `terrace-track` (-1.3%) are LONGER than their declared `roadKm`, contradicting the file's own "0-15% short" claim.
- Mob radii are 3-9, not 3-5 (doubleAttacker 8, thorncrownDrake 9). The T3 cart-road floor of 12 clears radius <=5 only; the two largest mobs cannot enter any town authored to it. Decide: widen the floor to ~20, or rule the big mobs out of towns (design S10 q3).
- design 2026-08-09-town-plan-view-design.md S3 says "roughly nine player-diameters" where 12/2.6 = 4.6 diameters; it is nine player RADII. The 12 floor is unaffected.
- Renderer PNGs are byte-nondeterministic (ImageMagick embeds a creation timestamp); decoded pixels ARE identical. Consequence: a town-plan PNG can never be used as a byte-diff drift gate. Compare decoded RGB if a drift gate is ever wanted.
