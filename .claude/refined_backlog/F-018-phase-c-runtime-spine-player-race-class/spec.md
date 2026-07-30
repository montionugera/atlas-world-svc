---
title: "Combat model physical/magical split + derivedStats reconciliation"
id: F-018
from_idea: I-028
status: refined
---

# F-018 — pointer

The canonical spec and plan are tracked under `docs/`, because
`.claude/refined_backlog/*/plan.md` is gitignored (`.gitignore:111`) and would not
travel with this branch.

| artefact | path |
| --- | --- |
| **Spec** | `docs/superpowers/specs/2026-07-30-combat-model-split-design.md` |
| **Plan** | `docs/superpowers/plans/2026-07-30-combat-model-split.md` |
| Foundation spec it extends | `docs/superpowers/specs/2026-07-30-combat-stat-model-design.md` |
| Model / gates | `scripts/gen_combat_model.mjs`, `tools/combat-lab/verify.mjs` |

## Scope

Narrowed from I-028 at refine time to the **combat-model foundation slice**:
the split-aware model extension, the `derivedStats` reconciliation (I-028's own
stated blocker), and the three tests that close the "no simulation has ever run" gap.

The race/class + per-race-leans half of I-028 was deferred to **I-034**.
