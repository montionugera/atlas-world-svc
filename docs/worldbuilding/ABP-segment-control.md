# ABP · Segment control over the zone block-in — negative result

**Date:** 2026-08-29 · **Branch:** `feat/F-039` · **Hardware:** GPU 0 (~3.87 GB VRAM free of 24),
ComfyUI 0.24.1 on `127.0.0.1:8188` via SSH tunnel · **Follows:** `ABP-controlnet-replication.md`,
the segment-control design `docs/superpowers/specs/2026-08-08-town-art-segment-control-design.md`
· **Consumes:** the `environment.segment` block in `tools/art-forge/forge.config.json` (Task 2
wiring) and the Millcross segment control map `tools/art-forge/out/control/segment/A1-ART-02-segment.png`

## Verdict up front

<div class="callout danger">

**NEGATIVE — the plan stops here.** The full strength ladder (0.30 → 0.90, five cells, seed
12345) was run against the Millcross acceptance bar and **no cell passes**. Per Task 3's written
stop clause: `environment.segment.strength` stays `null`, `control` stays `"depth"`, and Tasks
4–8 do not proceed. The frozen depth path is untouched and still reproduces F-026 byte-for-byte.
An idea for the next mechanism is filed separately; the direction is recorded at the bottom of
this document.

</div>

## The problem, restated from measurement

The depth control path renders only FOUR luminance levels (measured 2026-08-08: sky 54.5%,
all-bg 5.1%, all-mg 18.4%, all-fg 7.5%), so a river and its far bank are the same pixel value and
no ControlNet strength can separate them. The segment mechanism replaces the luminance gradient
with a **label map**: each semantic zone gets its own flat colour (river `#9AA4A8`, far bank
`#7D8288`, mill `#5C4A34`, town rows beige), rendered from the block-in with a `-blur 0x6`
rasterisation, and fed to `SetUnionControlNetType: segment` (option verified live on this
install, 2026-08-08 and again 2026-08-29).

The premise under test: a label map carries the river/bank separation the depth map cannot, and
some strength makes FLUX.1-schnell *paint* it instead of tracing it.

The control map itself passed the pre-generation eyeball check (river band vs far-bank band
visibly distinct; mill column distinct; town rows lighter and separate) — the premise failed at
the model, not at the block-in rendering.

## The Millcross acceptance bar (from briefs/A1-ART-02.json + A1-geography-cluster1.md §6)

- **mustShow:** grey river · ford / crossing approach · mill-wheel housing over a race · queue of
  loaded carts and led animals · single-storey plank/canvas town on both banks
- **mustNotShow:** lattice pylons or power lines · motor vehicles · windmill sails · painted road
  markings · a town wall

## Ladder — every cell run, every verdict recorded

All cells: `--brief A1-ART-02 --seed 12345 --control segment`, sampler 8 steps / cfg 1 /
euler / simple, 1280×832. Images in `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s*.png`.

| strength | seconds | painted? | verdict | rejection reason |
| --- | --- | --- | --- | --- |
| 0.30 | 218.8 (cold) | yes | **FAIL** | River unreadable (dark pond at right edge only); ford not readable; lattice pylons at both horizons (mustNotShow violation, the known artifact from `ABP-controlnet-replication.md`). Mill wheel, cart queue, both-bank town all present — the closest cell, and still not close. |
| 0.45 | 18.4 | mostly | **FAIL** | River band misread as a paved road with white markings (mustNotShow violation); town both-banks weak (one side only); flatter read. |
| 0.60 | 16.8 | no | **FAIL** | Flat-vector collapse begins; cart queue absent; mill wheel gone (plain column). |
| 0.75 | 15.6 | no | **FAIL** | Full collapse: abstract dark slabs, no scene content. |
| 0.90 | 15.4 | no | **FAIL** | Same, more severe. |

Timing note: 0.30 includes cold model load; later cells reused warm models (15–18 s each).

The trend is monotonic and fatal: **adherence rises, picture quality falls** — the same
collapse-to-vector axis F-026 measured for depth, arriving *earlier* than the 0.30–0.40 depth
window would have suggested, and with the river never painted correctly at any strength.

## The human verdict, recorded

Owner reviewed all five cells (2026-08-29) and rejected the mechanism outright: **the brief is
novelistic prose** ("a queue of ox-carts … fills the rutted earth road from the foreground to the
ford, longer than the town is wide"), and neither carrier in this pipeline can hold that content —
the zone block-in encodes *where categories are*, not *the composition the prose describes*, and a
prose prompt alone demonstrably does not make the model compose it (the queue, the ford, the
cart-height POV never co-occur in any cell). The failure is not a tuning problem; it is a
representation problem.

## What consumes this number

Nothing. `environment.segment.strength` remains `null` on purpose and `env.mjs` still refuses to
run segment mode without an explicit `--strength`. `--control depth` reproduces F-026 exactly from
committed code. The Task 2 wiring (`--control depth|segment`, the `environment.segment` block, the
positive-prompt lint) is kept: it is the transport the next mechanism will ride if it also needs a
control image, and the frozen path is proven unaffected.

## Direction for the next mechanism (to be refined into an idea)

The composition must come from a source that actually encodes it. Candidates, in the order they
should be evaluated:

1. **A drawn perspective block-in** — a rough line/tonal sketch (or cheap 3D render) of the
   actual scene: queue receding to the ford, mill beside it, shacks behind. ControlNet over
   lineart/canny of a *real composition*, not zone colours.
2. **Freehand txt2img + select + refine** — drop control entirely for the concept pass; take the
   prose brief straight to the model at the F-026 recipe, cherry-pick, then lock composition with
   img2img.
3. **Hybrid** — freehand pass to discover composition, then rebuild the chosen one as a drawn
   block-in for reproducible batch generation of the remaining towns.

Six-town verdict table intentionally **not** started — the mechanism it was meant to fill is dead.
