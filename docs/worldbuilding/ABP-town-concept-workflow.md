# ABP · Town concept-art workflow — brief-check → map-derive → cells → reviewer → owner

**Date:** 2026-09-01 · **Branch:** `feat/F-039` · **Follows:** `ABP-segment-control.md`
(mechanism + measured window), `ABP-flux-dev-and-anchor.md` (anchor recipe + grain law),
`ABP-controlnet-replication.md` (frozen depth path) · **Consumes:** `tools/art-forge/`
(briefs, generator, run ledger) and `.claude/agents/town-canon-reviewer.md`

## What this is

The standing procedure for producing a **town concept image derived from the town map** at
long-term high quality (owner direction 2026-08-29/30, DR-002 licence accepted). It encodes the
stage machine the Millcross loop (A1-ART-02, verdicts #1–#14) actually converged on, including
the measured recipe, the lever ledger, and the stop conditions. Any second town reuses this
document; only the brief and the criteria rows are per-town.

## The stage machine

```
brief-check ──→ map-derive ──→ generate ≤5 cells ──→ reviewer verdict ──→ owner decision
     ▲                                                    │                  │
     └──────────────── record / stop ◄────────────────────┴──────────────────┘
```

1. **Brief-check.** The brief (`tools/art-forge/briefs/A1-ART-NN.json`) must pass
   `prompt-lint.mjs` (negation-free, cliché-token-free, `mustAssert` honoured) and the town
   criteria gates (`scripts/check_content.mjs` 0 failures). `mustCompose` fails the build before
   GPU queueing if a listed style clause is missing (`env.mjs`).
2. **Map-derive.** Every mass in the brief is derived from the rendered town plan
   (`content/towns/town-*.json` → `docs/worldbuilding/A3-*.png`); `map-derived-concept`
   (`content/world/town-criteria.json`) makes a render contradicting the plan fail *even if the
   prompt was clean*.
3. **Generate ≤5 cells.** One roll is one measurement. See the recipe table below. Rolltag every
   probe/re-roll (`--rolltag`) — rail 7: **a new measurement never overwrites a cell a previous
   verdict reviewed.**
4. **Reviewer verdict.** Dispatch the Town Canon & Plausibility Reviewer (`general` subagent,
   her definition inlined, writes only `docs/worldbuilding/reviews/**`). She runs the machine
   gates herself, judges per criterion with citations, rules per cell, issues a minimal change
   set or closes the lever, and returns ≤15 lines. Every verdict sheet is committed and wired
   into `tools/asset-storybook/env-index.json` (a render cannot hide; the parity gate enforces
   the row).
5. **Owner decision.** ACCEPT → sign-off. ACCEPT-WITH-REFINEMENT → the named refinement lever
   gets ONE cell, then re-review. REJECT with levers remaining → next change-set cell. Levers
   exhausted → the owner fork (below). **No lever is spent twice after it is measured dead; no
   canon amendment is ever a loop outcome — it is the owner's call.**

## The measured recipe (Millcross A1-ART-02, 2026-09-01)

| Pass | Command shape | Recipe | Status |
| --- | --- | --- | --- |
| Segment base (carrier) | `env.mjs --brief A1-ART-02 --seed 12345 --model dev --control segment --strength 0.45` | flux1-dev, 20 steps, cfg 1, guidance 5.0, denoise 1.0 + segment label map | **cell of record** (`segment-subject-probe-seed12345-s0.45`) |
| Depth base | `--control depth --strength 0.40` | F-026 frozen path + dev | measured dead for the wall (thin/dark signals dropped) |
| Anchor (colour img2img) | `--anchor` | 27 steps, denoise 0.75 over grained colour block-in | register hijack measured; parked |
| Materials refine | `--refine <cell> --rolltag <t> --denoise <0..1>` | anchor graph over a FINISHED cell | **measured dead at both window ends (0.75 harmful #13, 0.45 inert-and-regressing #14)** |

Seeds are not interchangeable: per-seed register lanes survive flow changes (12345 matte = the
on-law lane; 42424 painterly; 10001 glossy). The operating strength 0.45 is the measured window
top (0.30–0.45); the segment pin lives in `forge.config.json:89-95`.

## The lever ledger (measured, not guessed)

Landed as `millcross-materials-lever-ledger` in `content/world/town-criteria.json` `measured[]`:

- Positive-only rewording: **inert** for fachwerk/slate/brick.
- Subject-position rewording (plaster as sentence subject): **moved fachwerk** (cleared on all
  three surfaces) — the loop's only landing wording lever; keep.
- Slate/brick: immune to wording; brick is sampler prior (not in prompt). img2img refine:
  **dead** at both window ends.
- Remaining levers: seed change (prior LOW), control-map emphasis for the mill, **deliberate
  canon amendment (owner's call)**.
- Sampler-side risk: low-denoise refine surfaced modern car-like vehicles in the queue (era risk
  is sampler-side — check the gate/queue region on any future refine cell).

## Owner fork (open, 2026-09-01)

The cell of record is ACCEPT-WITH-REFINEMENT. Remaining fails: slate roofs, brick (sampler
prior), the mill (15 rolls), the ford, corner watermark, lamp post. The fork — accept the
remaining drift as declared register drift with a per-town note, vs deliberate canon amendment —
and the mill control-map emphasis cell are **owner decisions**, per the criteria ledger entry.

## Commands

```bash
# gates (all must be green before/after any change)
node scripts/check_content.mjs && npm test --prefix scripts
(cd tools/art-forge && node --test tests/*.test.mjs)
node --test tools/asset-storybook/tests/env-index.test.mjs

# roll a carrier cell (GPU: ssh -f -N -L 8188:127.0.0.1:8188 mont@100.66.190.100 first)
(cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 \
  --model dev --control segment --strength 0.45 --rolltag <tag>)

# review surface
nohup python3 -m http.server 6007 --bind 127.0.0.1 &   # → tools/asset-storybook/index.html
```
