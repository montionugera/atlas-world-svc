---
title: "CI: add scripts test-suite step (node --test in scripts/) to ci.yml"
id: F-015
from_idea: I-022
status: invalid-wont-do
---

# F-015 — INVALID (won't do)

Verified 2026-07-22: CI **already runs** the scripts test suite. The
"Content gate" step in `.github/workflows/ci.yml` runs
`npm test --prefix scripts`, and `scripts/package.json` defines
`test = node --test tests/*.test.mjs`. The F-014 final-review finding that
prompted I-022 looked for a literal `node --test` step and missed the
`npm test` indirection. Adding the step would duplicate the suite run.
