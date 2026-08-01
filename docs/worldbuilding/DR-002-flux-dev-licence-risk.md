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
