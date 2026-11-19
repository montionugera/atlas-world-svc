---
title: "Maro Bell M6: hero house and shared modular facade kit"
id: I-319
status: idea
---

# I-319: Maro Bell M6, hero house and shared modular facade kit

**Spec status:** approved by the owner 2026-11-18 (decisions below).

**สรุปสั้น (Thai summary):** สร้างบ้านต้นแบบ 1 หลัง (hero house กว้าง 10 ม. หลังคากระเบื้องสีฟ้า) ให้เจ้าของอนุมัติก่อน แล้วแตกเป็นชุดชิ้นส่วนผนัง/หลังคา/หน้าต่าง/หน้าร้านที่ต่อกันได้ (modular kit ราว 54 ชิ้น) ได้บ้าน 7 แบบ 35 รูปแบบ วางเป็นบ้านใหม่ 10 หลัง สองฝั่งถนนตลาดสายหลัก Zone 2 ช่วงระหว่างบันไดสองช่วง (ถนนใน Shot 2 ที่ M7 ใช้ตัดสิน) ให้เป็นถนนตลาดคึกคัก: ร้านค้าและโรงงานชั้นล่าง บ้านอยู่ชั้นบน กันสาดลายทาง ป้ายแขวน ระเบียงและกระบะดอกไม้ และเปิดมุมมองไปยังหอระฆังไว้ สีหลังคาทั้งเมือง ฟ้า 45% / ส้มอิฐ 45% / เทาหินชนวน 10% (ถนน M6 อยู่ใกล้วิหาร จึงเป็น ฟ้า 7 ส้ม 2 เทา 1 หลัง สัดส่วนทั้งเมืองครบใน M7) บ้านต้องสูงเพรียว: สันหลังคาสูงอย่างน้อย 1.3 เท่าของความกว้างหน้าบ้าน งบบ้านหนึ่งหลังเฉลี่ย 9,000 สามเหลี่ยม ไม่เกิน 4 draw call ไม่มีโมเดลที่ generate ใช้ Blender Python แบบเดียวกับ M1-M5 ด่านผ่าน M6 (และ M7): คะแนนกรรมการ AI ต้องได้ >= 8.0 ทั้งสองรอบ และเจ้าของต้องเซ็นรับ (M5 ได้ 7.5 ไม่เคยถึง 8.0 จึงเป็นความเสี่ยงจริง) เจ้าของดูภาพทุกเฟสและเราแก้สิ่งที่เจ้าของชี้ก่อน

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

1. **Grader score >= 8.0 AND owner sign-off** on the P4 plates (owner decision 2026-11-18, applies to M6
   and M7; matches the master checklist line 6 hard gate). Both are required: the milestone does not pass
   below 8.0 even if the owner likes it, and does not pass on score alone. The score comes from the pinned
   grader method in "Verification": two runs on the same build, both >= 8.0. **Risk stated plainly:** M5
   measured 7.5 under the comparable method and never reached 8.0, so 8.0 at M6 is a real risk, not a
   formality.
2. **Standard pass criteria (M6, engineering standard 2026-11-16):** doors and windows have real
   openings; shutters have depth; timber framing is structurally coherent; blue tiled roof silhouettes
   are distinctive; balconies, eaves, flowers and details read correctly; all modules share documented
   snap conventions.
3. **No standard hard FAIL:** no blank walls pretending to be houses; no random generated meshes with
   mismatched scale; no roof, facade piece or floor that fails to meet its neighbour.
4. **Art-direction checks A1-A5** (below, from GPT's art-direction answer) pass on the hero house, every
   kit design and the street.
5. All gates in "Verification" green, each shown able to fail.
6. Godot's extracted GLB textures (PNG + `.import` next to the GLB) committed with the feature, so the
   worktree is clean.

## Scope

**In:**
- Hero house (design D1 below), finished to final art quality.
- Modular kit: about 54 modules, 7 designs, 35 variations, a variation table, a kit README with snap rules.
- One representative street: the **Zone 2 main market boulevard, the stretch between the two M1 stairs**
  (y = -120 to -72, between `M1_Tier1AB_BoulevardStair` and `M1_Tier1to2_PlazaApproachStair`). The road
  is 16 m wide (x = -8 to +8). P4 lays out **new plots** along both curbs; it does not swap M1 houses in
  place. The six M1 houses on this stretch (`M1_Z2_Blvd_W/E_03..05`, at y = -110, -94, -78) are removed.
  **Measured frontage:** 48 m clear per side (no ring-street junction on this stretch). Plan: **10 new
  houses, 5 per side**, D1 among them (layout in "The street" below). Build line at x = +/-12.5 so the M1
  market stalls (reaching x = +/-11.9) stay clear; the 0.45 m jetty and 0.8 m eaves overhang above stall
  height. This stretch is the boulevard the F224 Shot 2 ("Main Market Boulevard") and M1 View 4b look along.
- Render anti-aliasing turned on and checked for all M6 plates (M5 repeat defect "jagged edges").
- Irregular masonry coursing in the kit's stone (M5 repeat defect "grid-regular joints"), kit only.

**Out (waits for M7):**
- Replacing the other 100 M1 houses (including the 6 boulevard houses south of the lower stair), the guild
  hall and the inn. Reaching the 45/45/10 town-wide roof mix (M7 placement).
- Walkable interiors. Windows show a shallow dark interior box only.
- Generated props (Tripo / Meshy): none at M6 (owner-approved); flowers, pots and wear are procedural.
- Carried M5 repeat defects: blue stair runner breaking at landings, uniformly bright gold, stair
  striping, grid joints on M5 masonry.
- M2/M3 Blender-rendered views 1-3 still showing pre-M5 geometry, and the sanctuary-vs-blockout mismatch
  in the M2 uphill view. M6 fixes the mismatch only on its one street; town-wide is M7.
- The older F-183 proof-of-concept house props (`env:maro-house-*` in `content/maps/maro-bell.json`).

## Art-direction checks (GPT, 2026-11-18)

GPT named five likely mistakes. Each is an explicit acceptance check on the hero house, every kit design
and the street, checked in the manifest/geometry where possible and on the plates otherwise:

- **A1 Not squat: tall, narrow facades and steep roofs.** Proportion rule: for every 2-storey and
  1-storey kit design, **ridge height (ridge cap included) >= 1.3 x street-facade unit width**. A facade
  unit is the street frontage between corners or party walls (a terrace pair has two units). Gate-checked
  from the manifest. This check changed the first-draft numbers: see "Proportion changes" below.
- **A2 Timber framing is not a uniform grid.** Substantial posts and beams sized by role (corner posts
  0.28, main posts 0.22 at bay lines, window studs 0.15 only where a window needs them); diagonal braces
  only selectively (end bays and flanking the balcony / cross-gable), on at most 40% of upper-floor
  panels; no single panel pattern repeated across more than 2 adjacent bays.
- **A3 Not every opening arched.** Arched heads are reserved for doors (front door, workshop door). All
  windows (ground, upper, dormer) are rectangular, upper windows small rectangular or mullioned. Gate:
  only door modules in the manifest carry an arched head.
- **A4 No flat white walls.** Plaster is warm cream (all 4 tints with R >= G >= B and no channel above
  240/255); every timber design shows a visibly stone ground floor (D6 is all stone).
- **A5 The roof is not a plain triangular cap.** Deep eaves (0.8 overhang, verge 0.5), stepped tile
  courses with visible thickness and tile texture, ridge caps; every 2-storey design has at least one of
  dormers, a front cross-gable or a gable to the street; each street side shows at least 2 projecting or
  street-facing gables.

**Proportion changes (from the A1 check).** The first draft had ridge / width = 13.71 / 12.5 = 1.10 for
the hero house, 1.10 for D5, 0.65 for the 10 m cottage D3 and 0.91 for the 15 m single-ridge terrace D7:
all squat. Changed: D1 hero house 12.5 -> **10.0 m wide** (ratio 1.39); D5 main block 12.5 -> 10.0 m
(1.39); D3 -> a **gable-front 1-storey shop 5.0 m wide** (1.33); D7 -> **two 7.5 m gable-front units**
on a party wall (1.65 each). D2, D4, D6 already passed (1.65, 1.39, 1.65). The ridge cap is fixed at
0.15 so the ratio is exact. Eaves deepened 0.6 -> 0.8 and verge 0.4 -> 0.5 (A5).

## The hero house (D1)

Scale follows the Maro Bell concept board (`10-maro-bell-town-concept-showcase.png`): player 1.30 m,
door about 3.0-3.5 m, 1-storey house 6-7 m, 2-storey house 11-14 m. The references
(`05-maro-bell-riverside-market.png`, board 10) show stone ground floors, plastered half-timbered upper
floors that overhang the street, steep blue tile roofs with dormers, flower balconies and shutters.
Roof colour: **blue tile #365B87**.

| Part | Size (metres) | vs 1.30 m mannequin |
|---|---|---|
| Footprint | 10.0 wide x 10.0 deep (4 x 4 bays of 2.5 m); ground floor bays: window, door, window, window | |
| Ground floor (stone) | 4.0 tall, walls 0.5 thick | |
| Upper floor (timber + warm cream plaster) | 3.5 tall, walls 0.3 thick, overhangs the front by 0.45 (jetty) | |
| Floor band between storeys | 0.25 | |
| Eaves height | 7.75 (4.0 + 0.25 + 3.5) | |
| Roof | 50 degree pitch, ridge parallel to the street, span 10.0, ridge at 7.75 + 5.0 x tan 50 = 7.75 + 5.96 = 13.71, cap 0.15 -> 13.86; eaves overhang 0.8, gable overhang 0.5 | inside the 11-14 m band; ridge / width 1.39 |
| Front door | arched, 1.8 wide x 3.2 tall (semicircular head, springs at 2.3), recessed 0.35 in a stone reveal, in bay 2 under the balcony | 2.46x mannequin height |
| Ground windows | rectangular 1.2 x 1.8, sill at 1.0, glass set 0.25 back | sill below mannequin shoulder |
| Upper windows | rectangular or mullioned 1.1 x 1.6, sill 0.8 above upper floor, glass 0.12 back | |
| Shutters | pair per window, each half the window width plus a 0.05 lap: 0.65 wide on ground windows, 0.60 on upper windows; 0.06 thick, hinged 0.04 off the wall, plank grooves | |
| Balcony | bays 2-3: 5.0 wide x 1.0 deep at upper floor, rail 1.0 tall, on 3 timber brackets | rail at 0.77x mannequin |
| Front cross-gable | over the balcony bays, span 5.0, same 50 degree pitch, ridge at 7.75 + 2.5 x tan 50 = 10.73 (+0.15 cap, below the main ridge) | |
| Dormers | 2 on the front slope, rectangular window 1.0 x 1.2, own small blue roofs | |
| Chimney | stone, 0.9 x 0.9, 1.2 above the ridge | |
| Flower boxes | 0.9 x 0.25 x 0.25 under each upper window and on the balcony rail | |

**Timber frame logic (must be structurally coherent, A2):** a sill beam (0.25 x 0.25) sits on the stone
wall; corner posts 0.28 and main posts 0.22 stand on it at bay lines, window studs 0.15 only where a
window needs them; a top plate (0.25) carries the roof; diagonal braces (45-60 degrees) only in the end
bays and flanking the balcony, never in every panel; the jetty overhang rests on visible joist ends or
corbels every 1.25 m. Timber stands 0.06 proud of the plaster. No timber floats or ends mid-wall.

**Real-3D features required (no painted fakes):** recessed arched door with a separate door leaf; every
window a true hole with frame, mullion and inset glass, dark interior box 0.6 m behind; shutters as
separate pieces with depth; protruding timber; balcony with real rail and brackets; dormers that cut the
roof; tile roof built as stepped tile courses (real thickness visible at eaves and verges) with ridge caps;
chimney; flower boxes with flower clusters.

**Hero acceptance:** A1-A5 all pass on D1 (ratio 1.39; braces selective; only the door arched; cream
plaster over stone; 0.8 eaves, dormers and a cross-gable).

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
  10.0 adds 5.96. Ridge cap fixed at 0.15. Eaves overhang 0.8, verge 0.5.
- Hanging signs and awnings fix to the ground-floor top level (4.0, or 3.5 on 1-storey) on bay lines;
  sign boards hang at least 2.6 m clear above the street.
- Seams must close within 1 mm (same tolerance M2 used).

**Module list (about 54):** stone wall bays (plain, door, shop window, window; 4.0 and 3.5 tall), upper
timber bays (plain, window, balcony door, two brace patterns), corner pieces for both storeys, jetty band,
gable ends, roof pieces per span (eaves, mid, ridge, verge, valley for cross-gables and twin gables),
dormer, chimney, balcony, door leaves (3), window frames (3: ground rectangular, upper small rectangular,
upper mullioned), shutters (3 styles), flower box, foundation plinth that runs below terrain (keeps M1's
no-floating rule). **Market-street modules (added for the boulevard decision):** open shopfront bay with
counter (4.0 and 3.5 tall), workshop wide-door bay (4.0), striped awning (1-bay and 2-bay), hanging sign
bracket, sign boards (2 shapes). Count: 46 in the first list + 1 mullioned frame + 7 market-street
modules = 54.

**Seven designs (heights from the rule above; measured ridge includes the 0.15 cap):**

| Design | Footprint (w x d) | Storeys | Eaves | Roof span | Ridge (cap incl.) | Band | Ridge / unit width (A1 >= 1.3) |
|---|---|---|---|---|---|---|---|
| D1 hero house | 10.0 x 10.0 | 2 | 7.75 | 10.0 + 5.0 cross-gable | 13.86 | 11-14 | 1.39 |
| D2 narrow gable-front | 7.5 x 10.0 | 2 | 7.75 | 7.5 (ridge perpendicular to street) | 12.37 | 11-14 | 1.65 |
| D3 1-storey gable-front shop | 5.0 x 7.5 | 1 | 3.5 | 5.0 (ridge perpendicular to street) | 6.63 | 6-7 | 1.33 |
| D4 shop house (shopfront + striped awning + sign) | 10.0 x 10.0 | 2 | 7.75 | 10.0 | 13.86 | 11-14 | 1.39 |
| D5 L-shaped corner house | 10.0 x 10.0 + 5.0 wide wing | 2 | 7.75 | 10.0 main, 5.0 wing | 13.86 main, 10.88 wing | 11-14 | 1.39 (main facade) |
| D6 stone-only workshop (no timber) | 7.5 x 7.5 | 2 | 7.75 | 7.5 | 12.37 | 11-14 | 1.65 |
| D7 terrace pair (two gable-front units, shared party wall, valley between) | 15.0 x 10.0 | 2 | 7.75 | 7.5 per unit | 12.37 | 11-14 | 1.65 per unit |

(History: D3 was 10 x 7.5 at 6.5 m in the first draft, then 10 x 5.0 with a street-parallel ridge; both
failed A1. D1 and D5 were 12.5 m wide and D7 one 15 m ridge; see "Proportion changes".)

**35 variations:** about 5 per design from a seeded variation table: roof colour (recorded per
variation: 16 blue #365B87, 16 terracotta #C96E42, 3 grey slate #687780, close to 45/45/10), plaster tint
(4 warm creams, A4), timber stain (2), shutter colour (4), dormers 0-2, balcony on/off, flower boxes,
awning stripe colour and sign shape (D3, D4), mirrored plan. The same seed always gives the same house.

**Roof colour placement rule (GPT, owner-delegated):** town-wide blue 45% / terracotta 45% / grey slate
10%. Blue around the sanctuary, the central boulevard and important market buildings; terracotta across
residential clusters and the hillside; slate sparingly on workshops, service buildings and scattered
homes. Placement picks the variation by zone, so the 45/45/10 total is reached in M7 when all 106
houses are placed; the M6 boulevard is a blue zone and is mostly blue (below).

**Kit acceptance:** every design passes A1 (ratio column above, gate-checked), A2-A5; module origins
and levels on the snap grid.

**Town count:** the town has 106 houses, so 35 variations means each repeats about 3 times town-wide.
Repeats on one street must not stand side by side (gate).

## The street (decision, GPT via owner, 2026-11-18)

A lively market street that frames the sanctuary without competing with it. Mostly two-storey houses
with occasional one-storey shops and varied rooflines. Facades sit close to a consistent building line
(x = +/-12.5; small recesses of 0-0.5 m behind it, never forward of it) with varied widths, gables and
recesses. Shops and workshops at ground level, homes above; striped awnings, hanging signs, balconies and
flower boxes. Nothing is placed in the road (x = -8 to +8), so the central view up the boulevard toward
the bell stays open.

| Side (south -> north, y = -120 -> -72) | Plots (design, width, roof) | Frontage used / slack |
|---|---|---|
| West (x = -12.5) | D4 10.0 blue; D2 7.5 terracotta; **D1 10.0 blue**; D6 7.5 slate; D3 5.0 blue | 40.0 / 8.0 |
| East (x = +12.5) | D7 15.0 blue; D4 10.0 blue; D2 7.5 blue; D3 5.0 terracotta; D2 7.5 blue | 45.0 / 3.0 |

Slack goes to passages between plots (at least 1.0 m) and stair-landing clearance. **Roof split on the
street: 7 blue / 2 terracotta / 1 slate**. Ground floors: 4 shopfronts (D4 x 2, D3 x 2), 1 workshop (D6),
the rest doors and windows with homes above. Street-facing gables: west D2, D1 cross-gable, D3; east
D7 x 2, D2 x 2, D3 (A5 needs >= 2 per side). The two D2 on the east side are different variations and
not adjacent.

## Approach options

| Option | Fit | Problem |
|---|---|---|
| A. Procedural Blender Python, like M1-M5 | Exact sizes, exact snap, real openings by construction, seeded variation, same verify chain | Organic detail (flowers, wear) costs code |
| B. Generated meshes (Tripo / Meshy) | Fast organic detail | Standard hard FAIL risk (mismatched scale), openings not real, no snap; Godot 4.7 cannot load meshopt / quantized / Draco GLB; reduction only via the generator's low-poly or Blender Decimate with silhouette protection |
| C. Hybrid: A for all architecture, B for small dressing | Organic props | Two pipelines, licence and style matching for little gain at M6 |

**Decision: A** (owner-approved: no generated meshes at M6). Houses are architecture whose pass criteria
are exact openings, snap and seams, which procedural code guarantees and generated meshes break. Flowers,
wear and grime are done in code too (vertex colour + small procedural clusters).

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
points at first (M5 process lesson), then the grader findings. The milestone itself still needs grader
>= 8.0 on both P4 runs plus owner sign-off.

| Phase | Build | Owner sees |
|---|---|---|
| P0 Tooling | (a) Blender fast loop built on the existing `tools/env_turntable.py` (Workbench, 4 orthographic views at 0/90/180/270 with a 1.30 m box), adding a three-quarter view; target under ~1 min per house. (b) Godot single-view render flag: today `ATLAS_VERIFY_MARO_BELL` is read in `VerticalSliceRoot.cs:196` and `MaroBellVerify` runs every probe check (folk girl, POC 01-05, ...) before `Render`, so the flag must also skip those checks; its run time is not measured yet (it still loads the 26.9 MB town GLB), P0 measures and records it. (c) M6 input/output paths as above. (d) Extend the M6 grader rubrics (`~/.local/bin/codex-qa` M6 entry, line 74; `tools/jev_env_qa.py` M6 entry, line 98) with shutters, balconies, flowers, blue roofs and snap rules, write the fixed grader prompt file, then **freeze both** before the first scored run. (e) Proportion (A1) and arch-only-on-doors (A3) manifest gates. | nothing (tooling) |
| P1 Hero blockout | D1 massing (10.0 x 10.0) with real openings, timber layout, roof, balcony, dormers; no materials polish | front/side/back + mannequin plate. Owner approves proportions |
| P2 Hero finished | Materials, bevels, colour variation, grime, off-true lines, flowers, AA | all hero plates + grader (2 runs, pinned method; early warning against 8.0) |
| P3 Kit | Modules cut from D1 incl. market-street modules, manifest + README, D2-D7, 35 variations | exploded module sheet + a lineup of the 7 designs + grader (2 runs) |
| P4 Street | 10 new plots on the boulevard stretch, full verify, all standard plates | full QA plate set + grader (2 runs, both >= 8.0). Grader pass + owner sign-off close M6 |

## Verification

**Gates (each gets a mutation test that turns it red: e.g. fill one window, shift one module 5 cm,
scale one house 1.2x, drop a roof 10 cm, widen D2 to 10.0 m, give a window an arched head):**
- Openings are real: a ray through each door and window centre passes the wall plane and travels at
  least the stated recess depth before hitting glass or leaf.
- Pieces meet: every module seam and roof-to-top-plate joint closes within 1 mm; foundations reach below
  terrain at every corner.
- Scale: door height 3.2 m +/- 0.05; eaves exactly on their snap level (3.5 for 1-storey, 7.75 for
  2-storey) +/- 0.05; ridge, cap included, inside the 1-storey (6-7 m) or 2-storey (11-14 m) band;
  mannequin 1.30 m in every scale plate.
- Proportion (A1): ridge (cap included) >= 1.3 x street-facade unit width for every design.
- Arches (A3): only door modules carry an arched head. Plaster (A4): every tint R >= G >= B, no channel
  above 240/255.
- Snap: every module origin on the 2.5 m grid and the listed levels, read from the manifest.
- Variety: no two identical variations adjacent on the street.
- Roof colours: street split 7 blue / 2 terracotta / 1 slate as laid out; hero house blue.
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

**Grader method (binding, pinned so the score is reproducible):**
- (a) Tool: atlas-3d MCP `vision_qa` with `rubric: env`, `milestone: M6` (M7 for M7), `structured: true`,
  default backend (`codex`) and default model (no override); a fresh conversation each run (no
  `thread_id`).
- (b) Fixed image set per submission: the QA plates above (hero front / side / back orthographic,
  three-quarter, 1.30 m mannequin comparison, modular exploded sheet, the street with five or more
  variations), plus native-resolution crops of each, plus the concept references
  `art-refs-gpt-env/10-maro-bell-town-concept-showcase.png`, `05-maro-bell-riverside-market.png` and
  `11-atlas-cala-knight-town-design-board.png` (in `atlas-3d-plan/`).
- (c) Identical prompt text every run, stored as a file (proposed: `atlas-3d-plan/tools/qa_prompts/m6_env.txt`),
  with no mention of revisions, fixes or intent.
- (d) Two runs per build; **both** must score >= 8.0.
- (e) When comparing builds, the previous build is re-scored under the same conditions; only same-method
  scores are compared.
- (f) The M6 rubric in `~/.local/bin/codex-qa` (line 74) and `tools/jev_env_qa.py` (line 98) is extended in
  P0 to cover shutters, balconies, flowers, blue roofs and snap rules **before** the first scored run, then
  frozen; each submission records the git revision of the rubric and prompt files. Changing either after
  the freeze restarts scoring for every build being compared.
- Baseline: M5 scored 7.5 under the comparable method and never reached 8.0.

**Speed:** tuning uses the P0 Blender loop (target under ~1 min). The full Godot verify plus all plates
(an M5 round took 5-17 min) runs only when a phase converges.

## Budgets (owner-approved 2026-11-18)

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
| Standard kit house (D7 pair counts as one) | <= 9,000 average, 12,000 max | <= 4 | shared kit set |
| Kit module set (54 unique meshes) | <= 60,000 (about 1,100 per module; the added sign, bracket and awning pieces are small) | n/a (not loaded by Godot) | one shared set: 2048 px base colour + 2048 px normal + packed roughness |
| Street (10 houses) | <= 110,000 (20,000 + 9 x 9,000 = 101,000 planned) | <= 48 (6 + 9 x 4 = 42 planned) | none extra |
| Kit GLB on disk | | | <= 15 MB |

The D1 narrowing (12.5 -> 10.0 m) and the market-street modules leave these totals unchanged; the
arithmetic above still holds.

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

- **Score plateaus below 8.0.** M5 stopped at 7.5. If two P4 runs stay below 8.0 after the 3-attempt cap
  (three fix rounds on the grader's defects), stop: bring the owner the plates and the defects the grader
  repeated across runs, and let the owner decide the next step. Do not loosen the method (no prompt or
  rubric edits after the freeze, no dropped images, no best-of-N runs).
- Repeated houses read as copy-paste. Mitigation: seeded variation + adjacency gate + owner look in P3.
- "Too perfect" CG look returns. Mitigation: de-perfection is in P1/P2 acceptance, not a later pass.
- Grader chase loop (M5 cost two rounds). Mitigation: owner plates first and owner fixes first each phase;
  grader early-warning runs at P2 and P3 so P4 is not the first surprise.
- New plots collide with the boulevard, stairs, stalls or M3 walls. Mitigation: footprint-vs-road/curb
  clearance gate.
- Mesh reuse lost on Godot import (draw calls jump). Mitigation: checked in P3 with a Godot frame count.
- Slow rounds. Mitigation: P0 fast loop before any art work.

## Decisions (owner, 2026-11-18)

GPT answer file: `/Users/pasitnusso/asset-studio-private/atlas-3d-plan/art-refs-gpt-env/gpt-m6-street-roof-consult-2026-11-18.md`.

1. **Gate** (owner): grader score >= 8.0 required for M6 and M7, two runs both >= 8.0 under the pinned
   method, together with owner sign-off. Replaces the first draft's "owner's eye decides, grader advisory".
2. **Street** (GPT, on the owner's instruction "talk with GPT"): the Zone 2 central boulevard, as a lively
   market street (see "The street"); market-street modules added to the kit.
3. **Roof colours** (GPT, on the owner's instruction): blue 45% #365B87 / terracotta 45% #C96E42 / grey
   slate 10% #687780 town-wide, placed by zone; hero house blue; M6 street 7 / 2 / 1.
4. **Approved as recommended** (owner): budgets (9,000 triangles and 4 draw calls per standard house;
   110,000 triangles and 48 draw calls for the street; hero house 20,000 / 6), the 3.2 m arched hero door,
   no generated meshes at M6.

## Acceptance criteria

- [ ] P1-P4 each shown to the owner; owner sign-off on P4 recorded in the master checklist.
- [ ] Grader: two runs on the final P4 build, both >= 8.0, pinned method (a)-(f); rubric and prompt frozen
      in P0 before the first scored run; previous builds re-scored under the same conditions; results recorded.
- [ ] Hero house D1 built to the dimensions above, with every listed real-3D feature.
- [ ] Art-direction checks A1-A5 pass on D1, D2-D7 and the street.
- [ ] Kit of about 54 modules (including shopfront, workshop door, striped awnings, sign bracket and
      boards) with manifest + README; 7 designs, 35 seeded variations; every design's eaves, ridge and
      ridge / width ratio match the design table.
- [ ] Boulevard street built from the kit on new plots (10 houses, layout above) with five or more
      visible variations, no adjacent repeats, roofs 7 blue / 2 terracotta / 1 slate, road kept clear.
- [ ] Gates for openings, seams, scale, proportion, arches, plaster, snap, variety, roof colours and
      budgets (triangles + draw calls) green, each proven red by a mutation.
- [ ] All standard M6 plates delivered with the common submission contract and QA register; cameras pass
      the F-232 parity gate.
- [ ] Blender fast loop under ~1 min exists and was used for tuning; Godot single-view run time recorded.
- [ ] Builder reads the M5 .blend and writes only into M6's own worktree.
- [ ] M1-M5 regression gates still green; Godot-extracted textures committed; worktree clean.

## Assumptions to verify in P0

- That the Shot 2 / View 4b cameras frame the y = -120 to -72 stretch well: they look north along the
  boulevard from about y = -62 and y = -80 (Godot z = 62 / 80); not checked by a render. If the plots need
  to be further into frame, the stretch above the upper stair (y = -72 to -42, 30 m per side, stepped
  plinths) is the extension.
- Terrain steps along the plots: plot counts come from the M1 road and stair coordinates only.
- D4 shop house is 2-storey (the first draft did not say).
- That glTF mesh reuse imports into Godot as shared meshes; checked in P3.
- That M1 houses carry collision to be replaced; not inspected.
- Script name `blender_maro_m6_houses.py` and prompt path `tools/qa_prompts/m6_env.txt` are proposed.
  Writing into `maro_bell_m1_masterplan.glb` is the verified M5 pattern (m5:2497-2517).

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
  Open at that point: owner questions 1-5 (street, roof mix, budgets, gate, door size).
- 2026-11-18 owner approval: gate = grader >= 8.0 (two runs) + owner sign-off; street and roof mix per GPT; budgets/door/no-generated approved.
  - Same day, from GPT's five likely mistakes: A1-A5 checks added; the A1 proportion rule (ridge >= 1.3 x
    facade unit width) narrowed D1 and D5 to 10.0 m, made D3 a 5.0 m gable-front shop and D7 two 7.5 m
    gable-front units; ridge cap fixed at 0.15; eaves 0.8 / verge 0.5. Market-street modules added
    (kit about 40 -> 54). Alternative Zone 4 radial street dropped from the spec.
