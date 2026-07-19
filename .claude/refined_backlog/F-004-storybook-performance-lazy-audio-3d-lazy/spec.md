---
title: "storybook-performance: lazy audio + 3D lazy-mount/dispose + per-card asset sizes"
id: F-004
from_idea: I-005
status: refined
---

# Asset-Storybook performance — design

## Goal

Make `tools/asset-storybook/index.html` cheap to open and smooth to scroll now
that the manifests carry 55 `model3d` entries (~11.76 MB of glTF) and 51 SFX —
without changing what any card renders.

## Architecture

All changes live in the single inline `<script>` of `index.html`. Three levers:
defer SFX decode until viewed, make 3D idle-static with hover-only motion and
lazy-mount/dispose per card, and probe each asset's size with a `HEAD` request.
No manifest, render-spec, or drift-gate changes — the render-type mapping is
untouched.

## Components (each one responsibility)

- **SFX lazy warm-up** — `IntersectionObserver` on the soundboard + idempotent
  per-tile `ensureDecode()`; decode on section-visible or first hover/focus.
- **3D motion gate** — `applyMotion()` toggles `auto-rotate` + clip playback on
  `:hover` only; no `autoplay`/`auto-rotate` at idle.
- **3D lifecycle** — `mount()` (create `<model-viewer>` within 400px of
  viewport) / `dispose()` (`removeAttribute("src")` + `remove()` beyond a 1200px
  band); health counted once per card via a `counted` flag.
- **Size probe** — concurrency-capped `HEAD` sweep → `Content-Length` →
  `filename · 241 KB` on every visual card.

## Data flow / state

Per-card closures hold `mv`, `counted`, `decodeStarted`. Two `IntersectionObserver`s
per model card (near-mount 400px, far-dispose 1200px). A shared probe queue caps
concurrent HEAD requests. glTF bytes persist in model-viewer's URL cache across
dispose, so re-reveal costs a GPU re-upload, not a re-download.

## Tests / acceptance criteria

- At rest (no scroll): 0 SFX decoded, 0 real glTF downloads, 0 `<model-viewer>`
  mounted; every card shows its size. (Verified: `audio_at_rest 0`,
  `real_glb_downloads 0`, `model_viewers_mounted_at_rest 0`, `filesize 61/61`.)
- Hover a 3D card → mounts (if needed), spins, plays its clip; leaving stops.
- Scroll far past a card → its model-viewer disposes (bounded memory); scroll
  back → re-reveals with no network re-fetch.
- `node --check` on the inline script passes; Prettier clean.
