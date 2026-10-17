---
title: "L1 cosmology: the unsealed years, what Void is, and deep-time legend"
id: F-032
from_idea: I-051
status: shipped
wave: 5
design: docs/superpowers/specs/2026-08-06-l1-cosmology-design.md
plan: docs/superpowers/plans/2026-08-07-l1-cosmology.md
---

# F-032 — L1 cosmology: the unsealed years

> **The canonical documents are elsewhere and this file is only a pointer.**
> Design: `docs/superpowers/specs/2026-08-06-l1-cosmology-design.md`
> Plan: `docs/superpowers/plans/2026-08-07-l1-cosmology.md`
> Artifact: `docs/worldbuilding/A1-cosmology.md`

**The original idea title was wrong and has been corrected in both catalogs.** It read
*"the god, what Void is, and deep-time legend — run Theologian, Deep-Time Historian and Political
Economist against the two cited research dossiers"*. The owner ruled on 2026-08-05 that **no god
exists** — there is only belief — and the work was done by direct synthesis against the two
dossiers rather than by convening those three roles.

## Status — SHIPPED to `release/1.7` (2026-08-08)

**This feature was built before it was refined**, because the work began as a wave-5 brainstorm on
the idea and ran to completion on the release branch. There is **no `feat/F-032` branch**; the 16
commits sit directly on `release/1.7`, from `6489d50` to `1a9bdfd`.

Consequence for the release workflow: `/ps-release-workflow:claim` and `:ship` do not apply here in
their normal form — there is no feature branch to cut or merge. The catalog row should be marked
shipped against 1.7 directly.

## What it does

Joins two facts already in `canon.md` — the relic weapon **erases rather than burns, leaving no
body to bury**, and **Void grows from the unburied dead** — to give the world a deep past, a
material origin for Void, and an explanation for its own ~100-year memory, **with no god and no new
force**.

## Delivered

- `docs/worldbuilding/A1-cosmology.md` — the L1 artifact, all nine SWF §3 sections
- Five lore nodes on thread `the-unsealed-years` in `content/story/lore.json`
- `content/story/canon.md` §1 (the unsealed years) and §5 (where Void comes from)
- The king-theme removal across the working docs **and the shipped novel**
- `docs/worldbuilding/DR-006-swf-scope.md` — settles SWF §7 as option 3
- SWF contract moved to `accepted`

## Verification at time of refine

```
content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 0 failures, 0 warnings
gen_story_graph --check: in sync (158 nodes, 345 edges)
scripts suite: 181 pass / 0 fail, true exit 0
```

Independent gate review against SWF §4 returned **all seven G-items PASS** and a final verdict of
**ACCEPT** after four blocking factual defects were fixed.

## Follow-ups, captured not built

- **I-080** — the Iron Regent's replacement motive
- **I-081** — sharpen the five lore bodies, shipped as drafts under *world first, prose later*
