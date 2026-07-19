---
title: "storybook-performance: lazy audio + 3D lazy-mount/dispose + per-card asset sizes"
id: I-005
status: refined
---

# Asset-Storybook performance — design

## Goal

Make `tools/asset-storybook/index.html` cheap to open and smooth to scroll now
that the manifests carry 55 `model3d` entries (~11.76 MB of glTF) and 51 SFX —
without changing what any card renders.

## Problem (measured)

- **Audio:** all 51 SFX were `fetch()`ed + `decodeAudioData()`'d during `init()`
  (throttled to 4, but every file) — ~0.69 MB compressed → several MB of decoded
  PCM resident before the SFX section is ever viewed.
- **3D:** every one of the 55 `<model-viewer>` cards carried `auto-rotate` +
  `autoplay`, so each loaded+visible model ran a continuous WebGL render loop.
  A dozen on screen = a dozen render loops on one thread → main-thread lockup on
  scroll. model-viewer lazy-*loads* by default but never *unloads*, so scrolling
  the whole page left all 55 models resident.
- **No size signal:** cards showed key/filename/badges but not on-disk size, so
  heavy assets (e.g. `tree.glb` at 3.3 MB) were invisible until downloaded.

## Approach (all client-side, in the single inline script)

1. **SFX lazy** — decode is deferred behind an `IntersectionObserver` on the
   soundboard: the pack loads only when the SFX section nears the viewport (or
   on first hover/focus of a tile). Idempotent per-tile `ensureDecode()`.
2. **3D idle-static + hover-motion** — drop always-on `auto-rotate`/`autoplay`;
   a loaded model-viewer with neither renders one frame then stops. Auto-rotate
   + clip playback turn on only while the pointer is over the card. At most one
   card animates at a time.
3. **3D lazy-mount + dispose** — the `<model-viewer>` is created only when its
   card is within 400px of the viewport, and torn down (`removeAttribute("src")`
   + `remove()`) when it leaves a wider 1200px band (hysteresis avoids churn),
   freeing GPU resources. glTF bytes stay in model-viewer's URL cache, so
   re-scroll re-reveals without re-download. Health counted once per card.
4. **Per-card size** — a concurrency-capped `HEAD` sweep reads `Content-Length`
   (no body) and renders `filename · 241 KB` on every visual card, mirroring how
   audio tiles show KB.

## Acceptance criteria

- At rest (no scroll): 0 SFX decoded, 0 real glTF downloads, 0 `<model-viewer>`
  mounted; every card shows its size.
- Hover a 3D card → it mounts (if needed), spins, and plays its clip; leaving
  stops motion.
- Scrolling past a card and far away disposes its model-viewer (bounded memory);
  scrolling back re-reveals it without a network re-fetch.
- No change to which render-type any entry uses; drift-gate untouched.
- `node --check` on the inline script passes; Prettier clean.
