# DR-002 — FLUX.1-dev: accepted licence risk

**Date:** 2026-08-01
**Decision by:** the repo owner, explicitly, after the risk was stated
**Status:** accepted, with mitigations

## The decision

Install and use **FLUX.1-dev** for environment concept art, obtained from the ungated mirror
`Comfy-Org/flux1-dev` (`flux1-dev-fp8.safetensors`, 16.06 GB).

## The risk, stated plainly

- `black-forest-labs/FLUX.1-dev` is **licence-gated** (`gated: auto`) and carries the **FLUX.1-dev
  Non-Commercial License**.
- The `Comfy-Org/flux1-dev` mirror is **ungated** (`gated: False`) and requires no licence
  acceptance to download — but **downloading via a mirror does not change the licence terms.**
- This project is a game intended to ship. Shipping assets generated with a non-commercially
  licensed model is a **real legal exposure**, not a technicality.
- **FLUX.1-schnell**, already installed, is **Apache-2.0** and carries no such restriction.

The owner was shown this comparison and chose to proceed. This record exists so the choice is
traceable rather than discovered later.

## Why dev was wanted

FLUX.1-schnell is **guidance-distilled**: it runs at cfg 1 and has **no guidance lever at all**.
Measured consequence (`ABP-flux-eval.md`): schnell renders far better than the previous turbo model
— 5/7 acceptance criteria against 1/7 — but is **less brief-faithful**, dropping named specifics
(tarred black seaward faces, wrecked hulls, mudflat, faction emblems) and overriding stated
palettes. FLUX.1-dev exposes `FluxGuidance`, the control schnell structurally lacks.

## Mitigations — these are the point of accepting rather than refusing

1. **Every dev-generated asset is tagged at intake.** Its `gen` block records
   `model: "flux1-dev-fp8"` and `license: "non-commercial"`, and its `tags` include
   `licence-restricted`. A single manifest query then lists every affected asset.
2. **Schnell stays installed and working.** Any dev asset can be regenerated on schnell from the
   same brief and seed — the briefs, the recipe and the `gen` params are all committed, so
   regeneration is mechanical rather than archaeological.
3. **The composition anchor is built regardless.** It is the fix for the _composition_ failure,
   which is model-independent, and it improves schnell output too. Dev is not a substitute for it.
4. **Revisit before any commercial release.** If the project ships, either replace dev assets from
   schnell or obtain a commercial licence from the model's authors.

## What would reverse this

- A commercial launch becoming concrete
- The composition anchor closing the fidelity gap well enough on schnell alone, making dev
  unnecessary
- Any Apache-2.0 or similarly permissive model reaching dev-class prompt adherence

## Not decided here

Whether dev-generated art may enter `art-manifest.json` as **shipped** art rather than as
review-only material. Until decided, treat dev output as evaluation material.

---

## Appendix A — 2026-08-01, later the same day: the risk is wider than recorded

Decision records append; the body above is left as written.

**The quality question is answered.** `ABP-controlnet-rescue.md` measured schnell + ControlNet
(depth, **strength 0.30**, denoise 1.0) keeping **95%** of schnell's free-running paint quality
while taking the layout — beating dev+anchor on detail density (+55% Gildmark, +6% Norhollow),
winning material read, and fixing set coherence, the criterion dev failed hardest. Note the
non-obvious setting: at the conventional strength 0.8–1.0 it collapses into flat vector art
(−88% detail). Only ~1/3 strength works.

**But the licence question got worse, not better.** The recipe is
"Apache-2.0 schnell + a **FLUX.1-dev-derived ControlNet**", and the ControlNet carries
`license_name: flux-1-dev-non-commercial-license`, `base_model: black-forest-labs/FLUX.1-dev`.
The restriction is not escaped — the exposure merely moved from a 16 GB file to a 4 GB one.

**Checked, all identically restricted:** `Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0`,
`XLabs-AI/flux-controlnet-depth-v3`, `XLabs-AI/flux-controlnet-canny-v3`,
`InstantX/FLUX.1-dev-Controlnet-Union`, `jasperai/Flux.1-dev-Controlnet-Depth`,
`Shakker-Labs/FLUX.1-dev-ControlNet-Depth`. **There is no permissively licensed Flux ControlNet.**

**Process failure worth naming:** the ControlNet was downloaded without checking its licence,
immediately after this record was written about that exact risk. **Any model download must check
`cardData.license` before the bytes move** — the check costs one API call and would have caught
this before 4 GB crossed the wire.

### The real options now

1. **Buy a commercial licence for FLUX.1-dev** from its authors. Converts an open-ended legal
   exposure into a line item, and unlocks the measured-best recipe. The clean answer for a game
   intended to ship.
2. **Ship on schnell alone**, accepting weaker composition — the only zero-cost, zero-restriction
   route, since schnell cannot hold layout and paint well simultaneously without a control signal.
3. **Keep the restriction for pre-production only** — use the best recipe for concept art that
   guides human or 3D work and never ships as a game asset. Requires the shipped/evaluation
   boundary this record left open to actually be enforced.

**Unchanged:** the reversal condition is still measurably unmet, and dev-derived output remains
evaluation material until the owner decides otherwise.
