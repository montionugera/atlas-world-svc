# F-216 handoff (game DB slice S1 "Findable")

**Goal (owner, verbatim, 2026-11-14):** "อยากทำความสะอาดโปรเจค กับเกมDB มันน่าจะมีของไม่ใใช้เยอะมากๆ แล้วก็ ใช้ยาก" (clean up the project and the game DB; it has a lot of unused things and is hard to use). Direction: "สร้างใหม่จาก studio" (rebuild from the studio world).

**S1 done means:** the owner opens `http://atlas-edit.joymify.local.com/`, types "Hearthbloom" in the top-bar search box from any tab (Mac or phone), clicks the result and lands on that record's page with its related records.

- Spec: `spec.md` in this folder (approved 2026-11-15, four slices S1-S4).
- Plan: `plan.md` in this folder (S1 only; Tasks 0-3).
- State (2026-11-15): plan written, not yet claimed, no code written. Release 1.34 holds F-214 and F-215 (both shipped).
- Next step: `psrw claim F-216`, then Task 0 (design brief, controller step), then Tasks 1-3 with `subagent-driven-development`, one subagent at a time.
- Traps: `_release` must be clean before any `psrw idea/refine`; Gate 1 flake `atlas-web-read-only.test.mjs:105` "server did not start" (re-run once); the plan's "Facts checked" section lists 8 corrections to the spec.
- After S1 ships: S2, S3, S4 each get their own plan from the same spec.
