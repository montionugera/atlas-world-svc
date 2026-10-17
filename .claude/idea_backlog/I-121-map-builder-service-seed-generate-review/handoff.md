# I-121 handoff

**Goal (verbatim, owner 2026-09-13):** "all feature now, for long term greater good + consider about UX + montoring + rre-run" — build the map builder (seed → generate → review → accept into the asset-storybook) as a long-lived feature with UX, monitoring and re-run first-class.

**Spec:** `.claude/idea_backlog/I-121-map-builder-service-seed-generate-review/spec.md` (approved by owner 2026-09-13).
**Plan:** `.claude/idea_backlog/I-121-map-builder-service-seed-generate-review/plan.md` (3 phases per spec §10).

**State:** spec approved; plan being written on release/1.10 in the `_release` worktree.
**Next:** commit plan → `psrw refine I-121` → `ps-release-workflow-claim` → subagent-driven-development, phase 1 first.
**Traps:** edits only via `_release` or the claimed feature worktree (main checkout is guard-blocked); no bare `git stash`; new commits only; port 6016 not 6006.
