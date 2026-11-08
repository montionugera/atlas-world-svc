# Unit contract (F-185): 1 game unit = 1 metre

Every length, position, radius, range and speed in server-rs, content and the clients is in
metres. 3D assets already are (`docs/asset-delivery-spec.md`). `coord_scale` is 1.0.

Before F-185 the server worked in 0.1 m units (a 400 m map was 4000 wide). The change divides
every server length by 10; it is never done by only setting `coord_scale` to 1, which would
make every map, mob and hit area 10x bigger on screen.

## Per-number rule

| Kind | Rule |
| --- | --- |
| length, position, radius, range, margin, cell size, AOI band | old / 10 |
| speed, acceleration, impulse expressed as a speed | old / 10, through `core/speed.rs` `scaled_speed(<old value>)` (`SPEED_SCALE` 0.015 = F-184 pace 0.15 x unit 0.1) |
| projectile lifetime sized for a speed | `scaled_lifetime` divides by the pace factor only (range and speed both shrink with the unit) |
| time, cooldown, damage, HP, counts, ratios, angles, tick rate, decay rates (1/s) | unchanged |

Player run speed is `scaled_speed(10 * (20 + 0.2 * AGI + race bonus))` = 3.0 m/s at level 1,
0 AGI (the `10 *` is the old metres-to-units factor the player stat always carried).

## Phase-1 parity baseline (server-rs, recorded before and after)

| Outcome | Before (old units) | After (metres) |
| --- | --- | --- |
| player run speed | 30.3 u/s (3.03 m/s) | 3.03 u/s |
| mob "high" speed | 16.5 u/s | 1.65 u/s |
| bow projectile speed | 37.5 u/s | 3.75 u/s |
| dash speed, run:dash ratio | 450 : 202 | 6.75 u/s, same ratio |
| mob melee knockback (player, 12 dmg) | 18-36 u | 1.8-3.6 m |
| Maro Bell road walk | 45-65 s | 45-65 s (same, fixture rescaled in-test) |
| mob body / player body radius | 14 / 12 u | 1.4 / 1.2 m |
| AOI enter / exit | 600 / 640 u | 60 / 64 m |

## Content (Phase 2)

`scripts/rescale_units_to_metres.mjs` moved the server-unit fields of `content/maps/*.json`,
`_manifest.runtime.json` and the studio nodes to metres (marker `"unitContract": "metres-v1"`,
idempotent). Already-metre fields (routes, groundZones, heightTerraces, structures, props,
`chunkSizeWorld`, `safeZoneRadiusMeters`) were never in server units and are untouched.
`content/towns/town-millcross.json` stays in its own 0.1 m design frame (atelier tools read it);
server-rs and `compile_world_maps.py` multiply its footprints by 0.1.
