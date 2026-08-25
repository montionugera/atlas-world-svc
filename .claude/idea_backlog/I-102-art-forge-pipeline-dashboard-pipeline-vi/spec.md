---
title: "Art-forge pipeline dashboard: pipeline view per brief with gate verdicts and per-cell re-run"
id: I-102
status: drafting
---

# Art-forge pipeline dashboard: pipeline view per brief with gate verdicts and per-cell re-run

## Problem

Running the art-forge pipeline is opaque after the fact:

- **Outputs are loose PNGs** in git-ignored `tools/art-forge/out/env/<briefId>-seed<seed>[-hires].png`. Answering "what did we try for A1-ART-02, and what happened?" requires filesystem archaeology.
- **Gate verdicts are ephemeral.** `artifact-gate.mjs` prints metrics (`--json`) or writes a corner sheet, but nothing persists the verdict per attempt. The `--skip-artifact-gate "<reason>"` bypass is recorded in the intake manifest only for items that got intaken — flagged-and-abandoned attempts vanish entirely.
- **No pipeline state per brief.** There is no single place that says: blockin done? which seeds rendered? which passed the gate? which reached `art-manifest.json`?
- The 2026-08-15 owner rule says every produced artifact must be observable in a review surface (asset-storybook or equivalent). Pipeline *state* is currently the one forge artifact with no surface.

## Why now

- Gate hardening landed recently (I-030 concept-art manifest gate, I-054/I-055 artifact-gate hardening) — verdicts now exist but have nowhere to land visibly.
- The review→FORGE loop exists (`content/review-queue.json` work orders, see the asset-storybook review-surface design), but there is no way to *see* forge progress against it.

## Use cases

1. **Observe progress** — "where is A1-ART-03?" — see which stage each brief reached without filesystem archaeology.
2. **Observe attempts/seeds** — every render attempt per brief with its seed + variant (`--hires`), linked to its PNG; prevents silently retrying a seed already tried.
3. **Inspect results & gate verdicts** — per attempt: PASS/FLAG, gate metrics, corner sheet; answers "why was this flagged?" months later. Doubles as audit trail for `--skip-artifact-gate` bypasses.
4. **Re-run one cell** — e.g. re-render a flagged brief with a new seed, without touching blockin upstream.
5. **Re-run by fork (test run)** — a re-run never overwrites and never cascades: it appends a **new attempt** to the ledger. Downstream cells do not execute; they are marked **stale/pending-recheck**. Test-render seed 44 while keeping seed 42's row; re-run the gate on an existing PNG as a pure re-test. Promoting a test into the real chain is an explicit follow-up action, not a side effect.
6. **See the queue** — view pending re-run work orders in `review-queue.json` (what the next forge session will execute) and their completion state.
7. **Staleness detection** — brief edited after an attempt → affected cells flagged stale, so no artifact silently diverges from its brief.

## Sketch

A **"Forge" tab in the asset-storybook** showing, for each brief, a horizontal pipeline row:

```
A1-ART-03   [blockin ✓] [render s42 ⚑FLAG] [render s43 ✓] [gate ✓] [intake ✓]
A1-ART-04   [blockin ✓] [render s7 ✓]    [gate —]     [intake —]        ← stale
```

- Each **cell = one pipeline stage instance** (blockin, one render attempt per seed/variant, gate verdict, intake).
- Cells show status (done / FLAG / failed / stale / not-run) and link to the actual PNG + gate corner sheet in the detail overlay.
- **Per-cell re-run** marks that cell for regeneration by appending a **work order** to `content/review-queue.json` (the existing review-surface pattern): `{ briefId, cell: "render", seed?: 44, reason }`. The next human-run forge session picks it up. **The storybook stays static — no UI→ComfyUI invocation, ever.**

### Key design decisions (recommendations)

| # | Question | Recommendation | Why |
|---|----------|----------------|-----|
| D1 | Where does it live? | Asset-storybook tab | Owner rule mandates storybook observability; tabs/sidebar/VirtualGrid infra already exist. |
| D2 | Where does pipeline data come from? | New committed **run ledger**: `tools/art-forge/runs/<briefId>.json`, appended-to by `generate/*.mjs` and `intake-art.mjs` at run time | Nothing captures this today; loose PNGs are git-ignored so the ledger must be explicit and committed. |
| D3 | How is the gate verdict captured? | Gate script (or its caller) tees its `--json` result + corner-sheet path into the ledger entry for that attempt | Verdicts are currently print-only. |
| D4 | How is re-run invoked safely? | Work-order file only (`review-queue.json`); re-runs are **append-only** (new attempt, no overwrite) and **non-cascading** (downstream cells marked stale, not executed); generation remains human-run behind the SSH/Tailscale tunnel | Generation needs the mont-pc GPU tunnel; a static page cannot and should not execute it. File-based orders are auditable and diffable in git. |

### Non-goals

- Browser-triggered generation or any server component in the storybook.
- Live/tailing view of an in-flight run (the ledger updates at run completion boundaries; refresh is fine).
- Dashboarding for townplan/other one-off generators (can be added later if they grow seeds/verdicts).

## Open questions

- OQ1: Ledger granularity — one file per brief vs one `runs/ledger.json`? (Lean per-brief: smaller diffs, fewer merge conflicts across parallel forge sessions.)
- OQ2: Does "stale" need defining (e.g. brief edited after the render attempt)? Lean yes, compare mtime/hash of brief vs ledger entry.
