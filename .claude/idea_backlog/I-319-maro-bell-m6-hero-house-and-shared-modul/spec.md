---
title: "Maro Bell M6: hero house and shared modular facade kit"
id: I-319
status: idea
---

# I-319: Maro Bell M6, hero house and shared modular facade kit

**สรุปสั้น (Thai summary):** สร้างบ้านต้นแบบ 1 หลัง (hero house) ให้เจ้าของอนุมัติก่อน แล้วแตกเป็นชุดชิ้นส่วนผนัง/หลังคา/หน้าต่างที่ต่อกันได้ (modular kit) ได้บ้าน 7 แบบ 35 รูปแบบ วางบนถนนตัวอย่าง 1 สาย ใช้ Blender Python แบบเดียวกับ M1-M5 เจ้าของดูภาพทุกเฟส และสายตาเจ้าของคือด่านตัดสิน (กรรมการ AI เป็นแค่ความเห็นประกอบ)

## Problem

Maro Bell's houses are still the M1 blockout: `build_pitched_house_massing()` in
`atlas-3d-plan/tools/blender_maro_m1_masterplan.py` makes each house a plaster box with a pitched roof
and a 3.5 m stone basement. About 135 of them exist (`M1_Z2_Blvd_W/E_00..05` on the Zone 2 market
boulevard, `M1_DistrictHouse_NNN` on five terrace rings). They have no real doors, windows, shutters,
timber or balconies, which the M6 standard calls a hard FAIL ("blank walls pretending to be houses").
Next to the detailed M5 sanctuary they look out of place (the owner saw this in the M2 uphill view).

## Why now

M5 (landmarks) has owner sign-off (Rev 9, 2026-11-17). The gate order is M1 -> ... -> M6 -> M7, and
M7 (full-town assembly) needs a house kit to fill the town. Every M7 hero shot is mostly houses.

## Goal and definition of done

**Goal:** one owner-approved hero house, a reusable modular house kit built from it, and one dense
representative street showing at least five house variations, all in the Maro Bell scene.

Done means all of these:

1. **Owner sign-off** on the P4 plates. The owner's eye is the gate. The automatic grader is advisory:
   its score is reported (target from the master checklist: >= 8.0/10), but it never blocks a build the
   owner accepts, and the owner is shown plates before chasing grader findings (M5 lesson).
2. **Standard pass criteria (M6, engineering standard 2026-11-16):** doors and windows have real
   openings; shutters have depth; timber framing is structurally coherent; blue tiled roof silhouettes
   are distinctive; balconies, eaves, flowers and details read correctly; all modules share documented
   snap conventions.
3. **No standard hard FAIL:** no blank walls pretending to be houses; no random generated meshes with
   mismatched scale; no roof, facade piece or floor that fails to meet its neighbour.
4. All gates in "Verification" green, each shown able to fail.
5. Godot's extracted GLB textures (PNG + `.import` next to the GLB) committed with the feature, so the
   worktree is clean.

## Scope

**In:**
- Hero house (design D1 below), finished to final art quality.
- Modular kit: about 40 modules, 7 designs, 35 variations, a variation table, a kit README with snap rules.
- One representative street: the Zone 4 residential radial (`Radial_Zone4_Residential_NW` in M1,
  7.5 m wide), the segment from (-32, 12) to (-128, 56), about 105 m long, both sides. The M1 houses
  within 20 m of that centreline are replaced by kit houses (expected 12-16 houses; exact count measured
  in P4).
- Render anti-aliasing turned on and checked for all M6 plates (M5 repeat defect "jagged edges").
- Irregular masonry coursing in the kit's stone (M5 repeat defect "grid-regular joints"), kit only.

**Out (waits for M7):**
- Replacing the other ~120 M1 houses, the boulevard frontage, the guild hall and the inn.
- Walkable interiors. Windows show a shallow dark interior box only.
- Carried M5 repeat defects: blue stair runner breaking at landings, uniformly bright gold, stair
  striping, grid joints on M5 masonry.
- M2/M3 Blender-rendered views 1-3 still showing pre-M5 geometry, and the sanctuary-vs-blockout mismatch
  in the M2 uphill view. M6 fixes the mismatch only on its one street; town-wide is M7.
- The older F-183 proof-of-concept house props (`env:maro-house-*` in `content/maps/maro-bell.json`).

## The hero house (D1)

Scale follows the Maro Bell concept board (`10-maro-bell-town-concept-showcase.png`): player 1.30 m,
door about 3.0-3.5 m, 1-storey house 6-7 m, 2-storey house 11-14 m. The references
(`05-maro-bell-riverside-market.png`, board 10) show stone ground floors, plastered half-timbered upper
floors that overhang the street, steep blue tile roofs with dormers, flower balconies and shutters.

| Part | Size (metres) | vs 1.30 m mannequin |
|---|---|---|
| Footprint | 12.5 wide x 10.0 deep (5 x 4 bays of 2.5 m) | |
| Ground floor (stone) | 4.0 tall, walls 0.5 thick | |
| Upper floor (timber + plaster) | 3.5 tall, walls 0.3 thick, overhangs the front by 0.45 (jetty) | |
| Floor band between storeys | 0.25 | |
| Eaves height | 7.75 | |
| Roof | 50 degree pitch, ridge parallel to the street, ridge at 13.7, eaves overhang 0.6, gable overhang 0.4 | inside the 11-14 m band |
| Front door | arched, 1.8 wide x 3.2 tall (semicircular head, springs at 2.3), recessed 0.35 in a stone reveal | 2.46x mannequin height |
| Ground windows | 1.2 x 1.8, sill at 1.0, glass set 0.25 back | sill below mannequin shoulder |
| Upper windows | 1.1 x 1.6, sill 0.8 above upper floor, glass 0.12 back | |
| Shutters | pair per window, each 0.55 wide x 0.06 thick, hinged 0.04 off the wall, plank grooves | |
| Balcony | centre 2 bays: 5.0 wide x 1.0 deep at upper floor, rail 1.0 tall, on 3 timber brackets | rail at 0.77x mannequin |
| Front cross-gable | over the balcony bays, 5.0 wide, same 50 degree pitch | |
| Dormers | 2 on the front slope, window 1.0 x 1.2, own small blue roofs | |
| Chimney | stone, 0.9 x 0.9, 1.2 above the ridge | |
| Flower boxes | 0.9 x 0.25 x 0.25 under each upper window and on the balcony rail | |

**Timber frame logic (must be structurally coherent):** a sill beam (0.25 x 0.25) sits on the stone
wall; posts (0.22 square) stand on it at every bay line, corner posts 0.28; a top plate (0.25) carries the
roof; diagonal braces (45-60 degrees) only in the end bays; the jetty overhang rests on visible joist ends
or corbels every 1.25 m. Timber stands 0.06 proud of the plaster. No timber floats or ends mid-wall.

**Real-3D features required (no painted fakes):** recessed arched door with a separate door leaf; every
window a true hole with frame, mullion and inset glass, dark interior box 0.6 m behind; shutters as
separate pieces with depth; protruding timber; balcony with real rail and brackets; dormers that cut the
roof; tile roof built as stepped tile courses (real thickness visible at eaves and verges) with ridge caps;
chimney; flower boxes with flower clusters.

**Owner art rule from the first build (confirmed 2026-11-17):** smooth shading on curved parts (door
arch at least 16 segments); bevelled edges that catch light on stone, timber and tiles; per-block,
per-plank and per-tile colour variation; grime in recesses and wear on sills and steps; lines not
ruler-straight (small sag on the ridge, timber and tile courses slightly off-true); irregular masonry
coursing. Art direction: Ragnarok Online characters, Lineage 2 structure, Genshin tone and detail. All
assets original, no KayKit or other kit reuse.

## The modular kit

**Snap conventions (written into a kit README and a module manifest JSON that the gates read):**
- Horizontal grid 2.5 m (one bay); vertical levels 0 (ground), 4.0, 4.25 (upper floor), 7.75 (eaves).
- Authored Z-up in Blender, exported to glTF Y-up. Module origin = bottom-left corner on the outer wall
  plane; the outside faces the module's local front. Corners are their own modules, so walls never overlap.
- Wall thickness fixed per storey (stone 0.5, upper 0.3); jetty offset fixed at 0.45.
- One roof pitch (50 degrees) for every roof, so ridges and valleys always meet; spans 7.5 and 10.0 m.
- Seams must close within 1 mm (same tolerance M2 used).

**Module list (about 40):** stone wall bays (plain, door, shop window, window), upper timber bays (plain,
window, balcony door, two brace patterns), corner pieces for both storeys, jetty band, gable ends, roof
pieces per span (eaves, mid, ridge, verge, valley for cross-gables), dormer, chimney, balcony, door leaves
(3), window frames (2), shutters (3 styles), flower box, awning, foundation plinth that runs below
terrain (keeps M1's no-floating rule).

**Seven designs:** D1 hero house; D2 narrow gable-front 2-storey (7.5 x 10); D3 1-storey cottage
(10 x 7.5, 6.5 m tall); D4 shop house (10 x 10, shop window + awning); D5 L-shaped corner house
(12.5 x 10 with a wing); D6 stone-only 2-storey (7.5 x 7.5, no timber); D7 terrace pair (15 x 10, shared
party wall).

**35 variations:** about 5 per design from a seeded variation table: roof colour (blue tile 60%,
terracotta 30%, slate 10%), plaster tint (4), timber stain (2), shutter colour (4), dormers 0-2, balcony
on/off, flower boxes, mirrored plan. The same seed always gives the same house.

**Town count:** M1 has about 135 houses, so 35 variations means each repeats about 4 times town-wide.
Repeats on one street must not stand side by side (gate).

## Approach options

| Option | Fit | Problem |
|---|---|---|
| A. Procedural Blender Python, like M1-M5 | Exact sizes, exact snap, real openings by construction, seeded variation, same verify chain | Organic detail (flowers, wear) costs code |
| B. Generated meshes (Tripo / Meshy) | Fast organic detail | Standard hard FAIL risk (mismatched scale), openings not real, no snap; Godot 4.7 cannot load meshopt / quantized / Draco GLB; reduction only via the generator's low-poly or Blender Decimate with silhouette protection |
| C. Hybrid: A for all architecture, B for small dressing | Organic props | Two pipelines, licence and style matching for little gain at M6 |

**Recommendation: A.** Houses are architecture whose pass criteria are exact openings, snap and seams,
which procedural code guarantees and generated meshes break. Flowers, wear and grime are done in code too
(vertex colour + small procedural clusters). Generated props are reconsidered in M7 only if the owner
asks.

The new builder script would follow the existing pattern (`tools/blender_maro_m6_houses.py`, proposed
name) and write into `maro_bell_m1_masterplan.glb` like M5; verify extends `MaroBellVerify.cs`.

## Phased plan (owner looks at every phase)

Each phase ends with: gates green -> plates -> one consolidated review -> owner look -> fix what the owner
points at. Grader findings are listed, not chased, until the owner has seen the plates.

| Phase | Build | Owner sees |
|---|---|---|
| P0 Fast loop | Single-asset Blender render of one house (front, side, three-quarter, mannequin) in under ~1 min; Godot single-view render flag (none exists today: `MaroBellVerify.cs` reads only `ATLAS_VERIFY_MARO_BELL`, `ATLAS_RENDER_MARO_BELL`, `ATLAS_RENDER_MARO_GIRL_FRAMES`, `ATLAS_MAP_ID`) | nothing (tooling) |
| P1 Hero blockout | D1 massing with real openings, timber layout, roof, balcony, dormers; no materials polish | front/side/back + mannequin plate. Owner approves proportions |
| P2 Hero finished | Materials, bevels, colour variation, grime, off-true lines, flowers, AA | all hero plates + grader (2 runs, previous build scored too) |
| P3 Kit | Modules cut from D1, manifest + README, D2-D7, 35 variations | exploded module sheet + a lineup of the 7 designs |
| P4 Street | Zone 4 street built, full verify, all standard plates | full QA plate set. Owner sign-off closes M6 |

## Verification

**Gates (each gets a mutation test that turns it red: e.g. fill one window, shift one module 5 cm,
scale one house 1.2x, drop a roof 10 cm):**
- Openings are real: a ray through each door and window centre passes the wall plane and travels at
  least the stated recess depth before hitting glass or leaf.
- Pieces meet: every module seam and roof-to-top-plate joint closes within 1 mm; foundations reach below
  terrain at every corner.
- Scale: door height 3.2 m +/- 0.05; eaves and ridge inside the 1-storey (6-7 m) and 2-storey (11-14 m)
  bands; mannequin 1.30 m in every scale plate.
- Snap: every module origin on the 2.5 m grid and the listed levels, read from the manifest.
- Variety: no two identical variations adjacent on the street.
- Budgets (below) measured from the exported GLB.
- Render cameras and any sightline gate use one shared camera definition, so gates check what is rendered.
- M1-M5 navigation and regression gates still green, plus the M6-relevant pre-gates (`EnvRenderPreGate`,
  `jev-env-qa`).

**QA plates (standard M6 list):** hero house orthographic front / side / back; three-quarter render;
1.30 m mannequin comparison; modular exploded sheet; the street with five or more variations. Each
submission carries the common contract: milestone ID, build revision, Blender scene version, Godot
version, fixed camera positions and FOV, dimensions in metres, intentional deviations; plus a QA register
(issue -> screenshot -> severity -> asset -> fix -> result).

**Grader method (M5 lesson):** identical prompt every run, no mention of revisions or intent; full views
plus native-resolution crops; two runs per build; the previous build re-scored under the same conditions.
Only same-method scores are compared.

**Speed:** tuning uses the P0 single-asset loop (target under ~1 min). The full Godot verify plus all
plates (an M5 round took 5-17 min) runs only when a phase converges.

## Budgets

M5 landmark set for reference: 142,846 triangles, 26.9 MB GLB.

| Item | Triangles | Textures |
|---|---|---|
| Hero house D1 | <= 20,000 | shared kit set only, plus at most one 1024 px detail map |
| Standard kit house | <= 9,000 average, 12,000 max | shared kit set |
| Kit module set (unique meshes) | <= 60,000 | one shared set: 2048 px base colour + 2048 px normal + packed roughness |
| Street (12-16 houses) | <= 170,000 | none extra |
| Kit GLB on disk | | <= 15 MB |

Town implication: 135 houses x 9,000 is about 1.2 M triangles before level-of-detail, so M7 must rely on
Godot's import-time LOD and repeated meshes. Per-block variation and grime use vertex colour, not extra
textures.

## Risks

- Repeated houses read as copy-paste. Mitigation: seeded variation + adjacency gate + owner look in P3.
- "Too perfect" CG look returns. Mitigation: de-perfection is in P1/P2 acceptance, not a later pass.
- Grader chase loop (M5 cost two rounds). Mitigation: owner plates first, grader advisory.
- Street replacement collides with M2 roads or M3 walls. Mitigation: footprint-vs-road/curb clearance gate.
- Slow rounds. Mitigation: P0 fast loop before any art work.

## Open questions (owner only; default in bold, so approval can be one "yes")

1. Representative street: **Zone 4 residential radial, 12-16 houses** (alternative: Zone 2 market
   boulevard, the Shot 2 camera, 12 slots).
2. Roof colours: **hero house blue; kit 60% blue / 30% terracotta / 10% slate** (the concept shows both
   blue and red roofs).
3. Budgets: **as in the Budgets table.**
4. Gate: **owner sign-off decides; grader score reported, advisory** (as at M5 sign-off).
5. Generated props (flowers, pots): **none at M6; all procedural.**
6. Door size: **3.2 m arched front door per the concept board** (2.46x the 1.30 m player).

## Acceptance criteria

- [ ] P1-P4 each shown to the owner; owner sign-off on P4 recorded in the master checklist.
- [ ] Hero house D1 built to the dimensions above, with every listed real-3D feature.
- [ ] Kit of about 40 modules with manifest + README; 7 designs, 35 seeded variations.
- [ ] Zone 4 street built from the kit with five or more visible variations, no adjacent repeats.
- [ ] Gates for openings, seams, scale, snap, variety and budgets green, each proven red by a mutation.
- [ ] All standard M6 plates delivered with the common submission contract and QA register.
- [ ] Grader run twice with the same-prompt method, previous build re-scored; result recorded.
- [ ] Single-asset render loop under ~1 min exists and was used for tuning.
- [ ] M1-M5 regression gates green; Godot-extracted textures committed; worktree clean.

## Assumptions not verified on disk

- Script name `blender_maro_m6_houses.py` and writing into `maro_bell_m1_masterplan.glb` (pattern from M5).
- That glTF mesh reuse imports into Godot as shared meshes; checked in P3.
- That M1 houses carry collision to be replaced; not inspected.
- The number of M1 houses near the Zone 4 street (12-16 is an estimate from 7.5 m street + 2.5 m bays).
