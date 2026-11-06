
## Verification (2026-11-06)
- precheck-parallel.test.mjs 20/20; full scripts suite 1500 pass / 0 fail.
- Mutations: group kill removed -> both orphan tests red; own-group guard removed -> AC4 red.
- Real gate: parallel GATE 1 PASS; GATE_PARALLEL=0 serial GATE 1 PASS (107 s).
- Review: no HIGH; MEDIUM serial live output fixed; MEDIUM gate-pgid SIGKILL documented (psrw uses plain subprocess.run); LOW guard test fixed.
