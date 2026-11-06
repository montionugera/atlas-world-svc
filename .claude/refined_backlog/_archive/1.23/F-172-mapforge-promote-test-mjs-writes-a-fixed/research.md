
## Verification (2026-11-06)
- Targeted test green; with the OUTSIDE refusal removed from promote-world.mjs:282 it goes red (AC3) and leaves no file in $TMPDIR (AC2).
- Two concurrent `node --test atelier/mapforge/tests/promote.test.mjs`: 42/42 each (AC4). Full mapforge suite 787/787.
