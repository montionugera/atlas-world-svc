---
title: "Town concept art: the block-in cannot express a river — segment control, an acceptance bar, and the three missing block-ins"
id: I-050
status: idea
wave: 6
order: 4
sequence_why: "regenerate towns (needs I-049)"
design: docs/superpowers/specs/2026-08-08-town-art-segment-control-design.md
---

# Town concept art — not a regeneration job

<div class="callout danger">

**The canonical design is `docs/superpowers/specs/2026-08-08-town-art-segment-control-design.md`.**
Read that, not this.

**This idea's original title was wrong and has been corrected.** It read *"Regenerate the 6 town
concept placeholders with the measured recipe and drop the placeholder-quality tag"*, which
assumes the work is a re-run. It is not: **the depth block-in physically cannot encode a river**,
so re-running the measured recipe produces a prettier image that is less faithful than the
placeholder it would replace. Measured on 2026-08-08, see §1 of the design.

</div>

## Problem

A live generation through the shipped F-026 pipeline (`env.mjs --brief A1-ART-02 --seed 12345`,
218 s, exit 0) produced **a better painting and a worse Millcross**: no river, no ford, a
**windmill** instead of a water-wheel, a **lattice pylon**, and motor vehicles among the carts.

The cause is structural, not tuning. `buildDepthSvg` fills every polygon with
`PLANE_DEPTH[plane]` and **never reads the per-mass `value`**, so the entire control signal is
three greys plus black sky:

| level | covers | share of frame |
| --- | --- | --- |
| `0` | sky | 54.5% |
| `51` | **every** `bg` mass | 5.1% |
| `140` | **every** `mg` mass | 18.4% |
| `180` | **every** `fg` mass | 7.5% |

So `river` and `far-bank` render as the *same colour* and merge into one band — a river cannot
exist — and `millwheel-housing` is the same grey as the houses while spanning 54% of frame
height, which is a tower silhouette. **No ControlNet strength fixes either**; amplifying the
signal enforces the wrong geometry harder. This narrows F-026's PARTIAL HOLD: the lattice-pylon
artifact may be a parameter problem, the river and the mill never were.

Two further blockers: **Norhollow (`A1-ART-04`) and Gildmark (`A1-ART-05`) have no block-in at
all**, and **Embervale's is known bad** — its six ledge x-midpoints are `0.540, 0.540, 0.540,
0.540, 0.530, 0.505`, a symmetric centred stack that F-026 established renders as one monumental
building.

## Why now

- **The GPU box is back.** `tailscale status` shows mont-pc active; ComfyUI 0.24.1 answers 200
  through the SSH tunnel; a full generation completed without OOM at 3.9 GB free.
- **The budget cannot see this.** `art-town` reads **6 / 6 met** with all six images tagged
  `placeholder-quality`, because `countArtPrefix` counts manifest keys. Replacing six faithful
  crude images with six beautiful wrong ones leaves the line reading met — a regression the
  budget is structurally blind to. That is why the design adds an acceptance bar.
- Wave 6's other art lane, [[I-061]] biome art, uses the same recipe and would inherit whatever
  this settles.

## Sketch

- **Segment control over the colours already authored.** The union ControlNet advertises a
  `segment` type; every brief already carries eight distinct per-mass `value` colours that the
  depth path discards. Add `renderSegmentPng()` beside `renderDepthPng()` — **do not repoint the
  existing function**, or F-026's 16-cell replication record is invalidated without a test
  failing.
- **An acceptance bar per town:** `mustShow` (river, ford approach, mill-wheel, cart queue) and
  `mustNotShow` (pylons, motor vehicles, windmill sails, painted road markings). A town that
  fails **keeps its placeholder and its tag** — the tag drops per town, never in bulk.
- **Three block-ins**: two authored new from `A1` §6, one re-authored asymmetric.
- **The hires pass is in scope** — the placeholders' own note names "no upscaler" as a defect.
- **Out of scope:** the lattice-pylon parameter sweep. Detected by `mustNotShow`, solved
  elsewhere.

Related: [[I-061]], [[I-049]], [[f-026-environment-art-status]].
