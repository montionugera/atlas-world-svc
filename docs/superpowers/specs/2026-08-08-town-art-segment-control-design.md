---
title: "Town concept art: segment control, an acceptance bar, and the three missing block-ins"
date: 2026-08-08
idea: I-050
wave: 6
order: 4
release: "1.7"
status: "design — awaiting owner review"
supersedes_clause: "I-050's title reads 'regenerate the 6 placeholders'. Measured: it is not a regeneration job — the control signal cannot express a river. §1."
---

# Town concept art — why the six cannot simply be regenerated

**`F-026` shipped a measured environment recipe and left a PARTIAL HOLD. This settles what the
hold was actually hiding**: the depth block-in carries only three tiers, so a river and its far
bank are the same pixel value, and a mill-wheel housing is indistinguishable from a house.

---

## 0. Decisions this design executes

| # | Question | Ruling |
| --- | --- | --- |
| **D1** | How does the block-in gain enough resolution to keep a river and a water-wheel? | **Segment control over the per-mass `value` colours already authored in every brief.** Add `renderSegmentPng()`; leave `renderDepthPng()` and the frozen depth recipe untouched. |
| **D2** | What counts as done? | **All six towns in one pass** — author the two missing block-ins, re-author Embervale, regenerate all six. Mitigation for the risk this carries: **Millcross regenerates first**, so the new block-ins are authored with evidence rather than ahead of it. |

<div class="callout warn">

**D2 was chosen over a phase gate, and the risk is stated rather than hidden.** It commits to
authoring three block-ins before segment control is proven on any subject. If §2 fails on
Millcross, that authoring is wasted. The owner took that trade knowingly on 2026-08-08; the
Millcross-first ordering is the only mitigation this design offers.

</div>

---

## 1. The measured gap — this is not a regeneration job

A live generation was run on 2026-08-08 through the shipped pipeline
(`node generate/env.mjs --brief A1-ART-02 --seed 12345`, 218 s, exit 0, no OOM).
**It produced a better painting and a worse Millcross.**

Against its own brief — *"a wall-less crossing town on **both banks of a grey river**, seen from
the road at cart height … one **mill-wheel housing** is the only structure above one storey; a
queue of loaded carts stretches **toward the ford**"* — the render had:

- **no river and no ford**, the town's entire reason to exist;
- **a windmill** (tower mill with sails) instead of a water-wheel over a race;
- **a lattice pylon**, the exact artifact F-026 logged in 5 of 16 cells, recurring first try;
- motor vehicles among the carts, and an elevated camera where the brief says cart height.

### Why — measured, not inferred

`buildDepthSvg` fills every polygon with `PLANE_DEPTH[plane]`. **The per-mass `value` field is
never read by the depth path.** Histogram of the rendered control image:

<div class="metric-grid">
<div class="metric-tile"><strong>0</strong><br/>black — sky<br/><em>54.5% of frame</em></div>
<div class="metric-tile"><strong>51</strong><br/><code>#333333</code> — <em>all</em> bg masses<br/><em>5.1%</em></div>
<div class="metric-tile"><strong>140</strong><br/><code>#8C8C8C</code> — <em>all</em> mg masses<br/><em>18.4%</em></div>
<div class="metric-tile"><strong>180</strong><br/><code>#B4B4B4</code> — <em>all</em> fg masses<br/><em>7.5%</em></div>
</div>

Three tiers plus sky. Both failures follow directly:

| brief intent | authored as | rendered as | consequence |
| --- | --- | --- | --- |
| `river` | `plane: bg`, `value #9aa4a8` | `#333333` | merges with `far-bank` into one 5%-tall band — **no river can exist** |
| `far-bank` | `plane: bg`, `value #7d8288` | `#333333` | identical to the river |
| `millwheel-housing` | `plane: mg`, `value #5c4a34`, rect y 0.36→0.90 | `#8C8C8C` | a 12%-wide, 54%-tall column at the *same depth as the houses* — a tower silhouette |
| `town-row-left` | `plane: mg`, `value #8f8a82` | `#8C8C8C` | identical to the mill |

<div class="callout danger">

**No ControlNet strength value fixes this, and the parameter sweep F-026 left open would not
have found it.** Two masses painted the identical colour cannot be separated by amplifying the
signal — raising strength enforces "one flat far band plus a tower" *harder*. This narrows
F-026's PARTIAL HOLD: the lattice-pylon artifact may still be a parameter problem, but the river
and the mill were never one.

</div>

---

## 2. Segment control

The union ControlNet in use (`flux-controlnet-union-pro-2.0`) advertises, via
`GET /object_info/SetUnionControlNetType`: `auto, openpose, depth, hed/pidi/scribble/ted,
canny/lineart/anime_lineart/mlsd, normal, segment, tile, repaint`.

**`segment` is the signal this data was already authored for.** Every brief carries eight
semantically distinct `value` colours that the depth path discards.

### The change

- **`tools/art-forge/generate/blockin.mjs`** gains `renderSegmentPng()`, a sibling of
  `renderDepthPng()`. Same masses, same back-to-front `PLANE_ORDER` so nearer masses still win
  overlaps, same `-blur 0x6` rasterisation — but each polygon is filled with **`mass.value`**
  rather than `PLANE_DEPTH[mass.plane]`. Canvas fill stays `#000000` (unlabelled space).
- **`forge.config.json`**'s `environment` profile gains a `segment` control block. The existing
  `controlNet` (depth, strength 0.30) block is **left byte-identical.**

<div class="callout danger">

**`renderDepthPng` must not be repointed at the new fill.** F-026's entire 16-generation
replication record, its measured 0.30–0.40 strength finding, and DR-002 appendix B are all
depth-based. Silently changing what that function emits would invalidate the evidence without
changing a single test. Add a sibling; do not mutate.

</div>

**Open, and honestly unmeasured:** the correct `strength` for segment control. F-026's 0.30–0.40
window was measured for depth and **does not transfer**. Millcross's first run establishes it.

---

## 3. The acceptance bar — because the budget cannot see quality

`art-town` reads **6 / 6 met** today, with all six images tagged `placeholder-quality`. The
measure counts manifest entries by key prefix (`scripts/lib/season1.mjs`, `countArtPrefix`).
**It cannot distinguish a faithful crude image from a beautiful wrong one.** Today's Millcross
render would have replaced a correct image with an incorrect one and left the line reading met.

So each brief gains two lists, derived from its own prompt and `A1-geography-cluster1.md` §6:

- **`mustShow`** — Millcross: river · ford approach · mill-**wheel** housing · cart queue
- **`mustNotShow`** — the failures actually observed: lattice pylons or power lines · motor
  vehicles · windmill sails · painted road markings

**Rules:**

1. An image replaces a placeholder **only if** every `mustShow` is present and no `mustNotShow`
   is.
2. **The tag is dropped per town, never in bulk.** A town that fails keeps its placeholder image
   *and* its `placeholder-quality` tag.
3. The verdict is a **human visual judgement**, recorded per town in the ABP document with the
   seed and settings that produced it. **This design does not propose machine vision.**

Consequence worth stating: a partial pass leaves I-050 partially done, and that is the correct
outcome — better than six replacements the budget scores as met.

---

## 4. The three block-ins

Only four briefs exist: `A1-ART-02` Millcross, `-03` Embervale, `-06` Rooktide, `-07` Cindervast.

| # | Subject | State | Work |
| --- | --- | --- | --- |
| 1 | **Millcross** `A1-ART-02` | exists | regenerate **first** under segment control — the proof |
| 2 | **Embervale** `A1-ART-03` | exists, **known bad** | re-author |
| 3 | **Norhollow** `A1-ART-04` | **absent** | author new |
| 4 | **Gildmark** `A1-ART-05` | **absent** | author new |
| 5 | **Rooktide** `A1-ART-06` | exists | regenerate |
| 6 | **Cindervast** `A1-ART-07` | exists | regenerate |

**Embervale's defect is documented and specific.** Its ledge midpoints are
`0.54 / 0.54 / 0.54 / 0.54 / 0.53 / 0.505` — a symmetric, centred stack, which F-026 established
renders as *one monumental building* rather than a terraced town. The re-author must produce
asymmetric, broken, off-centre masses. **Re-authoring invalidates its four measured replication
cells**, which is precisely why F-026 deferred it; that cost is accepted here.

**The two new block-ins derive from `A1` §6, not from invention** — Norhollow's continuous
palisade of sharpened trunks with roofs sitting below its top and the tally boards at the gate;
Gildmark's five terraces up a rock headland ending in the mirror tower, with the bar of mudflat,
wrecked hulls and sandbar in front of it.

---

## 5. The hires pass is in scope

The placeholders' own manifest note reads: *"below the §6.0 asset quality bar (turbo model,
single pass, **no upscaler**); regenerate when an environment-capable model is installed."*
Shipping a second single-pass image would not clear the bar the note names.

F-026 shipped `--hires` (4x-UltraSharp.pth, 10 steps @ 0.40, verified at 1920×1248 without OOM).
**Re-verify before relying on it:** the box measured **3.9 GB VRAM free of 24** on 2026-08-08,
and F-026's headroom check was made under different conditions.

---

## 6. Deliverables

| # | Artifact | Kind |
| --- | --- | --- |
| 1 | `renderSegmentPng()` in `tools/art-forge/generate/blockin.mjs` | code |
| 2 | Tests in `tools/art-forge/tests/blockin.test.mjs` — incl. one asserting the segment fill uses `mass.value` and **one asserting `renderDepthPng` still emits `PLANE_DEPTH`** | tests |
| 3 | `forge.config.json` — `environment.segment` block; depth block unchanged | config |
| 4 | `A1-ART-04` (Norhollow) and `A1-ART-05` (Gildmark) block-in briefs | new data |
| 5 | `A1-ART-03` (Embervale) re-authored asymmetric | data |
| 6 | `mustShow` / `mustNotShow` on all six briefs | data |
| 7 | Up to six regenerated images under `game-client/assets/art/concept/` | art |
| 8 | `art-manifest.json` — `gen` metadata updated; `placeholder-quality` dropped **per passing town** | manifest |
| 9 | `docs/worldbuilding/ABP-segment-control.md` — segment-vs-depth comparison, the measured segment strength, and the six acceptance verdicts | record |

---

## 7. Costs, limits and risks

- **The strength window is unknown** for segment control; F-026's 0.30–0.40 was depth-measured
  and does not transfer.
- **VRAM is tight** — 3.9 GB free measured. The base pass succeeded at 218 s; the hires pass is
  unverified under that pressure.
- **Three block-ins are authored before the mechanism is proven** — D2's accepted risk.
- **A partial pass is a legitimate outcome.** Rule 2 of §3 means I-050 may ship with some towns
  still tagged.
- **The lattice-pylon artifact is explicitly NOT solved here.** Segment control may suppress it
  as a side effect; if it does not, `mustNotShow` catches it and it becomes its own idea rather
  than swelling this one.

---

## 8. What this does not change

- `renderDepthPng()`, `PLANE_DEPTH`, `CANVAS_FILL`, and the `environment` profile's depth
  `controlNet` block — all byte-identical, so F-026's replication record stands.
- The `character` profile (denoise 0.82 / steps 24 / cfg 3), frozen by F-024.
- `scripts/lib/season1.mjs`'s `townArt` measure, and the `art-town` budget line's target of 6.
- `A1-geography-cluster1.md` §6 and the art briefs' prose — the block-ins derive from them; they
  are not rewritten.
- Every town that fails its acceptance bar keeps its current image unchanged.

---

## 9. Open questions

1. **What segment strength?** Millcross's first run answers it; nothing in the repo predicts it.
2. **Does segment control suppress the lattice pylon?** Unknown, and deliberately not this
   design's problem to solve — only to detect.
3. **Should `mustShow` / `mustNotShow` eventually be machine-checked?** A vision check would make
   the bar reproducible. Out of scope; noted because the manual bar is the weakest link here.
4. **Does I-061 (biome art) inherit segment control?** Probably — its `art:biome` group is empty
   and it uses the same recipe — but that is I-061's call, not this one's.

---

## 10. Verification

```bash
# from tools/art-forge, with the SSH tunnel up:
#   ssh -f -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100
node --test tests/*.test.mjs                                   # blockin suite, incl. the depth-unchanged guard
node generate/env.mjs --brief A1-ART-02 --seed 12345            # Millcross under segment control
node generate/env.mjs --brief A1-ART-02 --seed 12345 --hires    # only after the base pass is accepted
```

**Acceptance:** the blockin suite green with the new segment tests *and* the guard proving
`renderDepthPng` is unchanged; Millcross showing a river, a ford approach and a water-wheel with
no pylon, vehicle or windmill sail; and every town's verdict — pass or fail — recorded in
`ABP-segment-control.md` with its seed and settings.

**Never write `$?` after a pipe.** Redirect to a file, then read it.
