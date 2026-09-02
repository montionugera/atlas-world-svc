# ABP — the town-art loop (roll → canon review → verdict sheet → change set)

**Status:** measured over five rolls (2026-08-25 → 2026-08-30), three full loop iterations on the
dev recipe. **Owner decisions pending — see §Decisions.** This doc records the loop as it actually
runs; nothing here is aspirational.

## The loop

```
ground truth (content/towns/*.json, A1/A3 canon)
        │
        ▼
  brief (tools/art-forge/briefs/A1-ART-NN.json)
  prompt + mustAssert + masses (block-in, normalised 0..1)
        │  prompt-lint (R1 negation, R2 forbidden tokens, R3 unbounded scale,
        │             R4 missing assertion, mustCompose, town-criteria vocabulary)
        ▼
  depth control (generate/blockin.mjs — plane buckets 0/51/140/180)
        │
        ▼
  roll (generate/env.mjs — 3 seeds × 1 strength; run ledger runs/A1-ART-NN.json)
        │
        ▼
  town-canon-reviewer verdict sheet (docs/worldbuilding/reviews/)
  per-cell × per-criterion PASS/OBJECTION/VETO; machine gates re-run by the reviewer
        │
        ├─ ACCEPT / ACCEPT-WITH-REFINEMENT → storybook index, ship path
        └─ REJECT → minimal change set (data/wording only) → next roll
```

Each artifact lands in the storybook (`tools/asset-storybook/env-index.json`, parity-gated) —
the 2026-08-15 owner rule that every produced artifact is observable in a review surface.

## Measured findings (do not re-learn these)

1. **Negation summons its subject** (2026-08-08): "no modern vehicles" delivered vehicles in every
   cell. Positive-only prompts are enforced at composition (prompt-lint R1).
2. **Unbounded scale tiles to the horizon** (2026-08-25): extent words need an in-sentence bound
   (R3) and briefs declare required assertions (R4).
3. **The block-in coordinate contract is 0..1 normalised** (2026-08-30, s040 verdict): plan-grid
   rect values silently clip off-canvas — the wall ring was invisible to five rolls before the
   regression test (`blockin.test.mjs` "every mass rect … 0..1").
4. **Depth maps speak in plane buckets, not values** (2026-08-30, v4 verdict): per-mass darkness is
   not expressible on the depth path; distinctness comes from plane membership. Segment control is
   the only path that can express a dark wall band.
5. **dev honours large light masses; drops thin, dark, and absence-shaped signals** (2026-08-30,
   v3/v4 verdicts): queue wedge and mill column survive; wall band and race notch do not — even as
   explicit, distinct, dark masses. The same brief + control on schnell followed the control
   literally (walls, passage, wading, grey sky) — the control-quality excuse is closed; the
   residual failures are recipe/model-side.
6. **Bridge hallucination survives a mustAssert-guarded "only crossing" sentence** (v3/v4): a
   cart-capable stone arch bridge rendered in 2 of 3 cells in both rolls. Text levers for
   composition are spent.

## Standing verdict state (A1-ART-02 Millcross, dev, depth 0.40)

All cells of the v2/v3/v4 rolls REJECT. Standing VETOs: wall ring (0/12 dev cells across three
rolls), one-cart-crossing breaches (2/3 per roll). Strong objections: gate tower, town edge,
materials (fachwerk 12/12), mill+race placement, style register, palette. Passes: venues, cart
queue, era contamination, hallucinated text.

## Decisions pending (owner)

1. **Recipe path** (reopened; reviewer recommends (a)): (a) resume the parked block-in anchor path
   — the control-quality excuse is gone; (b) accept manual curation of many-seed rolls; (c) park
   Millcross concept art. Segment control is the only measured lever that can express the wall's
   darkness (finding 4).
2. **Ratify `structure-not-decoration` as style law** — decorative fachwerk is 12/12 cells and
   currently only a reviewer objection, not a VETO.
3. **Review-surface rule** — env renders are wired (env-index + parity gate); decide whether UI
   panels for them are required or the index suffices.

## Loop contracts

- **Reviewer independence:** the reviewer edits nothing outside `docs/worldbuilding/reviews/` and
  her criteria file; she runs the gates herself; verdict vocabulary is PASS / STRONG OBJECTION /
  VETO / UNVERIFIED per criterion, ACCEPT / ACCEPT-WITH-REFINEMENT / REJECT per cell.
- **Change sets are minimal and evidence-backed**; no anchor work, no guidance change, no negative
  conditioning unless the owner reopens those levers.
- **Provenance:** every render is ledgered (`runs/A1-ART-NN.json`: ts, seed, control, strength,
  briefHash, out); sheets cite the ledger; the storybook index cross-checks it.
- **Same filename, new provenance:** re-rolls overwrite the cell file; the ledger carries the
  chain; the env-index row pins the current hash and names the sheets that reviewed each era.
