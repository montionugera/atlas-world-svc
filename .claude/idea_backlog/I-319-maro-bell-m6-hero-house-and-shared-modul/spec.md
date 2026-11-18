---
title: "Maro Bell M6: hero house and shared modular facade kit"
id: I-319
status: idea
---

# I-319: Maro Bell M6, hero house and shared modular facade kit

**สรุปสั้น (Thai summary):** สร้างบ้านต้นแบบ 1 หลัง (hero house) ให้เจ้าของอนุมัติก่อน แล้วแตกเป็นชุดชิ้นส่วนผนัง/หลังคา/หน้าต่างที่ต่อกันได้ (modular kit) ได้บ้าน 7 แบบ 35 รูปแบบ วางเป็นแถวบ้านใหม่ 10 หลัง (วัดแล้ว สองฝั่งถนน) บนถนนตลาดสายหลัก Zone 2 ช่วงระหว่างบันไดสองช่วง ซึ่งเป็นถนนใน Shot 2 ที่ M7 ใช้ตัดสิน ทั้งเมืองมีบ้าน 106 หลัง แต่ละรูปแบบซ้ำราว 3 ครั้ง บ้านหนึ่งหลังมีงบไม่เกิน 9,000 สามเหลี่ยมโดยเฉลี่ยและไม่เกิน 4 draw call ใช้ Blender Python แบบเดียวกับ M1-M5 เจ้าของดูภาพทุกเฟส และสายตาเจ้าของคือด่านตัดสิน (กรรมการ AI เป็นแค่ความเห็นประกอบ)

## Problem

Maro Bell's houses are still the M1 blockout: `build_pitched_house_massing()` in
`atlas-3d-plan/tools/blender_maro_m1_masterplan.py` makes each house a plaster box with a pitched roof
and a 3.5 m stone basement. 106 of them exist: 12 on the Zone 2 market boulevard
(`M1_Z2_Blvd_W/E_00..05`) and 94 `M1_DistrictHouse_NNN` on five terrace rings (counted by re-running the
placement loop at m1:1067-1111; the "~135" in the m1:1065 comment is out of date). They have no real
doors, windows, shutters, timber or balconies, which the M6 standard calls a hard FAIL ("blank walls
pretending to be houses"). Next to the detailed M5 sanctuary they look out of place (the owner saw this in
the M2 uphill view).

## Why now

M5 (landmarks) has owner sign-off (Rev 9, 2026-11-17). The gate order is M1 -> ... -> M6 -> M7, and
M7 (full-town assembly) needs a house kit to fill the town. Every M7 hero shot is mostly houses.

## Goal and definition of done

**Goal:** one owner-approved hero house, a reusable modular house kit built from it, and one dense
representative street showing at least five house variations, all in the Maro Bell scene.

Done means all of these:

1. **Owner sign-off** on the P4 plates. The owner's eye is the gate. The automatic grader is advisory:
   its score is reported (the master checklist's >= 8.0/10 target), but it never blocks a build the owner
   accepts, and the owner is shown plates before chasing grader findings (M5 lesson). The master
   checklist line 6 still makes >= 8.0 a hard gate; that wording is owner question 4, not changed here.
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
- One representative street: the **Zone 2 main market boulevard, the stretch between the two M1 stairs**
  (y = -120 to -72, between `M1_Tier1AB_BoulevardStair` and `M1_Tier1to2_PlazaApproachStair`). The road
  is 16 m wide (x = -8 to +8). P4 lays out **new plots** along both curbs; it does not swap M1 houses in
  place. The six M1 houses on this stretch (`M1_Z2_Blvd_W/E_03..05`, at y = -110, -94, -78) are removed.
  **Measured frontage:** 48 m clear per side (no ring-street junction on this stretch), which fits 3 plots
  at 12.5 m, 4 at 10 m, 6 at 7.5 m, or **5 with a 12.5 + 10 + 10 + 7.5 + 7.5 mix (47.5 m)**. Plan:
  **10 new houses, 5 per side**, D1 among them. Build line at x = +/-12.5 so the M1 market stalls
  (reaching x = +/-11.9) stay clear; the 0.45 m jetty overhangs above stall height.
  This stretch is the boulevard the F224 Shot 2 ("Main Market Boulevard") and M1 View 4b look along.
- Render anti-aliasing turned on and checked for all M6 plates (M5 repeat defect "jagged edges").
- Irregular masonry coursing in the kit's stone (M5 repeat defect "grid-regular joints"), kit only.

**Alternative street (not recommended): Zone 4 residential radial** (`Radial_Zone4_Residential_NW`,
7.5 m wide, segment (-32, 12) to (-128, 56), 105.6 m). Only 6 M1 houses lie within 20 m of it (5
clearly, a sixth, D051, at 19.4 m), and they are ring houses placed across the street, not along it
(D004's centre is 2.8 m from the road centreline). `Ring_Tier2_Inner_W` crosses the segment mid-way and
`Ring_Tier2_Outer_W` meets its west end. About 94 m of clear frontage per side would take about 18 new
10 m plots after removing those 6 houses (not checked against terrain steps). It is on none of the F224
hero shots except as a speck in the Shot 5 bird's-eye.

**Out (waits for M7):**
- Replacing the other 100 M1 houses (including the 6 boulevard houses south of the lower stair), the guild
  hall and the inn.
- Walkable interiors. Windows show a shallow dark interior box only.
- Generated props (Tripo / Meshy): none at M6; flowers, pots and wear are procedural.
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
| Eaves height | 7.75 (4.0 + 0.25 + 3.5) | |
| Roof | 50 degree pitch, ridge parallel to the street, span 10.0, ridge at 7.75 + 5.0 x tan 50 = 7.75 + 5.96 = 13.71; eaves overhang 0.6, gable overhang 0.4 | inside the 11-14 m band |
| Front door | arched, 1.8 wide x 3.2 tall (semicircular head, springs at 2.3), recessed 0.35 in a stone reveal | 2.46x mannequin height |
| Ground windows | 1.2 x 1.8, sill at 1.0, glass set 0.25 back | sill below mannequin shoulder |
| Upper windows | 1.1 x 1.6, sill 0.8 above upper floor, glass 0.12 back | |
| Shutters | pair per window, each half the window width plus a 0.05 lap: 0.65 wide on ground windows, 0.60 on upper windows; 0.06 thick, hinged 0.04 off the wall, plank grooves | |
| Balcony | centre 2 bays: 5.0 wide x 1.0 deep at upper floor, rail 1.0 tall, on 3 timber brackets | rail at 0.77x mannequin |
| Front cross-gable | over the balcony bays, span 5.0, same 50 degree pitch, ridge at 7.75 + 2.5 x tan 50 = 10.73 (below the main ridge) | |
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
- Horizontal grid 2.5 m (one bay); vertical levels 0 (ground), 3.5 (1-storey eaves), 4.0 (2-storey
  ground-floor top), 4.25 (upper floor), 7.75 (2-storey eaves).
- Authored Z-up in Blender, exported to glTF Y-up. Module origin = bottom-left corner on the outer wall
  plane; the outside faces the module's local front. Corners are their own modules, so walls never overlap.
- Wall thickness fixed per storey (stone 0.5, upper 0.3); jetty offset fixed at 0.45. 1-storey stone
  walls are 3.5 tall (the 3.2 m door leaves a 0.3 m head).
- One roof pitch (50 degrees) for every roof, so ridges and valleys always meet; spans 5.0, 7.5 and
  10.0 m. Ridge = eaves + (span / 2) x tan 50 (tan 50 = 1.192): span 5.0 adds 2.98, 7.5 adds 4.47,
  10.0 adds 5.96.
- Seams must close within 1 mm (same tolerance M2 used).

**Module list (about 40):** stone wall bays (plain, door, shop window, window; 4.0 and 3.5 tall), upper
timber bays (plain, window, balcony door, two brace patterns), corner pieces for both storeys, jetty band,
gable ends, roof pieces per span (eaves, mid, ridge, verge, valley for cross-gables), dormer, chimney,
balcony, door leaves (3), window frames (2), shutters (3 styles), flower box, awning, foundation plinth
that runs below terrain (keeps M1's no-floating rule).

**Seven designs (heights from the rule above; ridge caps add up to 0.2 and must stay inside the band):**

| Design | Footprint (w x d) | Storeys | Eaves | Roof span | Ridge | Band |
|---|---|---|---|---|---|---|
| D1 hero house | 12.5 x 10.0 | 2 | 7.75 | 10.0 | 7.75 + 5.96 = 13.71 | 11-14 |
| D2 narrow gable-front | 7.5 x 10.0 | 2 | 7.75 | 7.5 (ridge perpendicular to street) | 7.75 + 4.47 = 12.22 | 11-14 |
| D3 1-storey cottage | 10.0 x 5.0 | 1 | 3.5 | 5.0 | 3.5 + 2.98 = 6.48 | 6-7 |
| D4 shop house (shop window + awning) | 10.0 x 10.0 | 2 | 7.75 | 10.0 | 13.71 | 11-14 |
| D5 L-shaped corner house | 12.5 x 10.0 + 5.0 wide wing | 2 | 7.75 | 10.0 main, 5.0 wing | 13.71 main, 10.73 wing | 11-14 |
| D6 stone-only (no timber) | 7.5 x 7.5 | 2 | 7.75 | 7.5 | 12.22 | 11-14 |
| D7 terrace pair (shared party wall) | 15.0 x 10.0 | 2 | 7.75 | 10.0 | 13.71 | 11-14 |

(D3 was 10 x 7.5 at 6.5 m tall in the first draft; with one 50 degree pitch that gives 8.47 m on a 4.0 m
wall, so the cottage now uses the 3.5 m eaves level and a 5.0 m span.)

**35 variations:** about 5 per design from a seeded variation table: roof colour (blue tile 60%,
terracotta 30%, slate 10%), plaster tint (4), timber stain (2), shutter colour (4), dormers 0-2, balcony
on/off, flower boxes, mirrored plan. The same seed always gives the same house.

**Town count:** the town has 106 houses, so 35 variations means each repeats about 3 times town-wide.
Repeats on one street must not stand side by side (gate).

## Approach options

| Option | Fit | Problem |
|---|---|---|
| A. Procedural Blender Python, like M1-M5 | Exact sizes, exact snap, real openings by construction, seeded variation, same verify chain | Organic detail (flowers, wear) costs code |
| B. Generated meshes (Tripo / Meshy) | Fast organic detail | Standard hard FAIL risk (mismatched scale), openings not real, no snap; Godot 4.7 cannot load meshopt / quantized / Draco GLB; reduction only via the generator's low-poly or Blender Decimate with silhouette protection |
| C. Hybrid: A for all architecture, B for small dressing | Organic props | Two pipelines, licence and style matching for little gain at M6 |

**Recommendation: A.** Houses are architecture whose pass criteria are exact openings, snap and seams,
which procedural code guarantees and generated meshes break. Flowers, wear and grime are done in code too
(vertex colour + small procedural clusters). No generated props at M6.

**Input and output (P0 fixes these):** the M5 script opens the M4 scene
(`maro_bell_m4_water_system.blend`, m5:2319), exports the whole town into `maro_bell_m1_masterplan.glb`
(m5:2497-2507) and copies it into the hard-coded F-230 worktree (`WT_F230`, m5:245, m5:2509-2517). The
new builder (`tools/blender_maro_m6_houses.py`, proposed name) opens **`maro_bell_m5_landmarks.blend`**,
exports the town GLB the same way, and copies it into **M6's own feature worktree** (a path derived from
the claimed worktree, not a copy of `WT_F230`). Godot loads only the town GLB. The separate kit GLB holds
the modules for the gates and the exploded module sheet; Godot never loads it. Verify extends
`MaroBellVerify.cs`.

## Phased plan (owner looks at every phase)

Each phase ends with: gates green -> plates -> one consolidated review -> owner look -> fix what the owner
points at. Grader findings are listed, not chased, until the owner has seen the plates.

| Phase | Build | Owner sees |
|---|---|---|
| P0 Tooling | (a) Blender fast loop built on the existing `tools/env_turntable.py` (Workbench, 4 orthographic views at 0/90/180/270 with a 1.30 m box), adding a three-quarter view; target under ~1 min per house. (b) Godot single-view render flag: today `ATLAS_VERIFY_MARO_BELL` is read in `VerticalSliceRoot.cs:196` and `MaroBellVerify` runs every probe check (folk girl, POC 01-05, ...) before `Render`, so the flag must also skip those checks; its run time is not measured yet (it still loads the 26.9 MB town GLB), P0 measures and records it. (c) M6 input/output paths as above. (d) Extend the M6 grader rubrics (`~/.local/bin/codex-qa` M6 entry, line 74; `tools/jev_env_qa.py` M6 entry, line 98) with shutters, balconies, flowers, blue roofs and snap rules. | nothing (tooling) |
| P1 Hero blockout | D1 massing with real openings, timber layout, roof, balcony, dormers; no materials polish | front/side/back + mannequin plate. Owner approves proportions |
| P2 Hero finished | Materials, bevels, colour variation, grime, off-true lines, flowers, AA | all hero plates + grader (2 runs, previous build scored too) |
| P3 Kit | Modules cut from D1, manifest + README, D2-D7, 35 variations | exploded module sheet + a lineup of the 7 designs |
| P4 Street | 10 new plots on the boulevard stretch, full verify, all standard plates | full QA plate set. Owner sign-off closes M6 |

## Verification

**Gates (each gets a mutation test that turns it red: e.g. fill one window, shift one module 5 cm,
scale one house 1.2x, drop a roof 10 cm):**
- Openings are real: a ray through each door and window centre passes the wall plane and travels at
  least the stated recess depth before hitting glass or leaf.
- Pieces meet: every module seam and roof-to-top-plate joint closes within 1 mm; foundations reach below
  terrain at every corner.
- Scale: door height 3.2 m +/- 0.05; eaves exactly on their snap level (3.5 for 1-storey, 7.75 for
  2-storey) +/- 0.05; ridge, cap included, inside the 1-storey (6-7 m) or 2-storey (11-14 m) band;
  mannequin 1.30 m in every scale plate.
- Snap: every module origin on the 2.5 m grid and the listed levels, read from the manifest.
- Variety: no two identical variations adjacent on the street.
- Budgets (below), triangles and draw calls, measured from the exported GLB and a Godot frame.
- Cameras: M6 render cameras are `M6CamViewN` constants and the plates are named `m6_view*`, so the
  existing F-232 camera parity gate (`scripts/tests/env-cam-parity.test.mjs`, already in `fastcheck.sh`
  and `precheck.sh`) checks them. No new camera mechanism.
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

**Speed:** tuning uses the P0 Blender loop (target under ~1 min). The full Godot verify plus all plates
(an M5 round took 5-17 min) runs only when a phase converges.

## Budgets

Reference: the whole town GLB after M5 (`maro_bell_m5_landmarks.glb`, copied into
`maro_bell_m1_masterplan.glb`) is 26,945,916 bytes (26.9 MB) with 507,436 triangles in 426 meshes on 426
nodes (no mesh reuse today). The M5 landmark nodes alone came to 142,846 triangles as measured in Blender
by the Rev 9 build; that figure is not stored on disk. The town currently draws 931 draw calls and 529,776
primitives per frame (`env/m5/m5_gpu_profile.json`, water disabled, Godot 4.6 Forward+ on an Apple M3
Max). That machine is not an agreed target: target hardware is undefined until M7, so the draw-call
numbers below are ceilings for M6, not a performance verdict.

| Item | Triangles | Draw calls | Textures |
|---|---|---|---|
| Hero house D1 | <= 20,000 | <= 6 | shared kit set only, plus at most one 1024 px detail map |
| Standard kit house | <= 9,000 average, 12,000 max | <= 4 | shared kit set |
| Kit module set (unique meshes) | <= 60,000 | n/a (not loaded by Godot) | one shared set: 2048 px base colour + 2048 px normal + packed roughness |
| Street (10 houses) | <= 110,000 (20,000 + 9 x 9,000 = 101,000 planned) | <= 48 | none extra |
| Kit GLB on disk | | | <= 15 MB |

**Draw-call rule:** modules are a build-time unit, not a runtime one. Each placed house is exported as a
few merged meshes, one per material: kit opaque (stone, timber, plaster and roof on the shared texture set,
roof colour by vertex colour), glass, dark interior, flowers. Two placed houses that use the same variation
share one mesh (glTF mesh reuse), so at most 35 unique house meshes exist town-wide. Merging per house
gives up per-module reuse in exchange for a small, fixed draw-call count.

Town implication: 106 houses x 9,000 is about 0.95 M triangles before level-of-detail (the whole town is
0.51 M today), and 106 x 4 is about 424 house draw calls before shadows. M7 must rely on Godot's
import-time LOD and shared meshes, and must set the target hardware. Per-block variation and grime use
vertex colour, not extra textures.

## Risks

- Repeated houses read as copy-paste. Mitigation: seeded variation + adjacency gate + owner look in P3.
- "Too perfect" CG look returns. Mitigation: de-perfection is in P1/P2 acceptance, not a later pass.
- Grader chase loop (M5 cost two rounds). Mitigation: owner plates first, grader advisory.
- New plots collide with the boulevard, stairs, stalls or M3 walls. Mitigation: footprint-vs-road/curb
  clearance gate.
- Mesh reuse lost on Godot import (draw calls jump). Mitigation: checked in P3 with a Godot frame count.
- Slow rounds. Mitigation: P0 fast loop before any art work.

## Open questions (owner only; each one word, default in bold)

1. Street: Zone 2 boulevard between the stairs, 10 new houses? **Yes** (no = Zone 4 radial, ~18 new plots,
   not on a hero shot).
2. Roof colours: hero house blue, kit 60% blue / 30% terracotta / 10% slate? **Yes**.
3. Budgets: 9,000 triangles and 4 draw calls per house, street 110,000 triangles and 48 draw calls? **Yes**.
4. Gate: owner's eye decides M6 and M7, grader score advisory (changes master checklist line 6)? **Yes**.
5. Door: 3.2 m arched front door (2.46x the 1.30 m player)? **Yes**.

## Acceptance criteria

- [ ] P1-P4 each shown to the owner; owner sign-off on P4 recorded in the master checklist.
- [ ] Hero house D1 built to the dimensions above, with every listed real-3D feature.
- [ ] Kit of about 40 modules with manifest + README; 7 designs, 35 seeded variations; every design's
      eaves and ridge match the design table.
- [ ] Boulevard street built from the kit on new plots (10 houses) with five or more visible variations,
      no adjacent repeats.
- [ ] Gates for openings, seams, scale, snap, variety and budgets (triangles + draw calls) green, each
      proven red by a mutation.
- [ ] All standard M6 plates delivered with the common submission contract and QA register; cameras pass
      the F-232 parity gate.
- [ ] Grader rubrics extended (P0); grader run twice with the same-prompt method, previous build
      re-scored; result recorded.
- [ ] Blender fast loop under ~1 min exists and was used for tuning; Godot single-view run time recorded.
- [ ] Builder reads the M5 .blend and writes only into M6's own worktree.
- [ ] M1-M5 regression gates green; Godot-extracted textures committed; worktree clean.

## Assumptions not verified on disk

- Script name `blender_maro_m6_houses.py` (proposed). Writing into `maro_bell_m1_masterplan.glb` is the
  verified M5 pattern (m5:2497-2517).
- That glTF mesh reuse imports into Godot as shared meshes; checked in P3.
- That M1 houses carry collision to be replaced; not inspected.
- That the boulevard stretch y = -120 to -72 is well framed by Shot 2 / View 4b: the cameras look north
  along the boulevard from about y = -62 and y = -80 (Godot z = 62 / 80); not checked by a render. If the
  owner wants the plots further into frame, the stretch above the upper stair (y = -72 to -42, 30 m per
  side, stepped plinths) is the extension.
- D4 shop house is 2-storey (the first draft did not say).
- Plot counts come from the M1 road and stair coordinates; terrain steps on the plots are not checked.

## Appendix — audit trail

- 2026-11-18 self-grill-audit: verdict safe-with-fixes. Corrected:
  - Street: Zone 4 radial (6 M1 houses within 20 m, not 12-16; one ring street crosses it) replaced by the
    Zone 2 boulevard stretch between the stairs, 10 new plots measured from 48 m clear frontage per side.
  - Heights: cottage D3 now 10 x 5.0 on a 3.5 m eaves level (ridge 6.48, was 8.47 on the old design); a
    design table shows eaves, span and ridge for every design; scale gate checks eaves on snap levels and
    ridge in bands.
  - Draw calls: per-house (<= 4, hero <= 6) and street (<= 48) budgets plus a merge-by-material,
    share-per-variation rule; 931 draw calls on an M3 Max cited as reference, target hardware undefined
    until M7.
  - Paths: builder input is the M5 .blend, output copies into M6's own worktree, kit GLB is gates-only.
  - Reference numbers: 26.9 MB / 507,436 triangles is the whole town GLB; 142,846 is a Blender-measured M5
    node figure not on disk.
  - Town count: 106 houses (not ~135); about 0.95 M triangles and ~3 repeats per variation.
  - Tooling: P0 builds on `tools/env_turntable.py` and the F-232 camera parity gate; P0 extends the
    codex-qa and jev M6 rubrics; Godot flag read site corrected to `VerticalSliceRoot.cs:196` and the
    flag must skip the probe checks.
  - Shutters 0.65 / 0.60 wide so a pair covers the window.
  - Generated props moved from a question to a decision (none at M6).
  - Audit claim "5 houses within 20 m" measured as 6 (D051 at 19.4 m); claim "two ring streets cross"
    measured as one crossing plus one meeting the west end.
  Open: owner questions 1-5 above (street, roof mix, budgets, owner-eye gate for M6/M7, door size).
