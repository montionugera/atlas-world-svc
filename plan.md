# F-047 — World Fill Plan B: Vocabulary and Render

**This file is a pointer. Do not implement from it.**

The real documents, in the order you must read them:

1. **`docs/superpowers/plans/world-fill-STATE.md`** — the running handover. Read this FIRST.
   It carries the measured baselines, the "nothing moved" invariant, the nine places the plan
   documents are wrong, and the traps that have already bitten.
2. **`docs/superpowers/plans/2026-08-16-world-fill-b-vocabulary-and-render.md`** — the plan.
   12 tasks in two halves. Read only the sections you were dispatched for.
3. **`docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md`** —
   the approved design, for background only.

`.claude/refined_backlog/F-047-world-fill-plan-b-vocabulary-and-render/plan.md` is a verbatim
copy of (2), kept there by the release workflow.

## The one-line goal

Give the repo a content vocabulary and a renderer that can draw the target world *before* the
target world exists — and move no part of the world while doing it.

## The invariant, on every commit

```bash
node scripts/check_spine_emit.mjs --check          # clean, no drift
node scripts/check_render_lock.mjs --check         # clean, WITHOUT --write (Tasks 1-11)
(cd colyseus-server && npx jest mapDimensions)     # green
git diff --stat plan-b-base -- colyseus-server/    # prints nothing
```

The base tag is `plan-b-base`.
