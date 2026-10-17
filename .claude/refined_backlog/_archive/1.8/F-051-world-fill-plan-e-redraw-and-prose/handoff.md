# F-051 completion — handoff

**Goal (verbatim):** Finish Plan E (Tasks 15-16), pay the measured hardening debt, ship
F-051 to release/1.8, and put 1.8 in front of the owner for promote.

**Plan:** `.claude/refined_backlog/F-051-world-fill-plan-e-redraw-and-prose/plan.md`
**Spec:** `completion-scope.md` beside it (audited; appendix carries the trail).

**State at handoff (2026-08-29, `54c2ee6`, tree clean):**
- Plan E Tasks 1-14 committed and reviewed. 40/40 zone records, Z2 closed both directions.
- `check_content --require-complete` = 1 failure (`placement-thornveil`, needs a ruling).
- Gate 1 PASS 12/12. scripts suite 1287/1287 (~500 s). mapforge 786. storybook 86/86.
- Nothing pushed. Release 1.8 open since 2026-08-09.

**Next step:** Task 1 (prose reconciliation, ~77 edits — the plan's "22" is exact but is the
small half; the 24 tower/relay encodings in story JSON are invisible to the old plan).

**Hard rules:** one suite-running lane at a time (concurrency destroyed uncommitted work
twice and produced phantom failures); never `--amend`; a green claim names its sha.
**R0 gate:** Task 7 promote deploys to production — stop for the owner.
