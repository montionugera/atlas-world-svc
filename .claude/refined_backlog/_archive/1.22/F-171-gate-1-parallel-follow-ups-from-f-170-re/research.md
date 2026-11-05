# I-251 research — measured parallel Gate 1 (2026-11-05)

Machine: 36 GB Mac (hw.memsize 38654705664), 16 KB pages, swap 3 GB total. Load avg 12 at start, 31-34 at peak (other sessions active).
Run: `ATLAS_PARALLEL_MIN_FREE_GB=0 PRECHECK_FULL=1 ./scripts/precheck.sh --no-install` on main 6c71f8fa8, sampler every 2 s
(sum RSS of the gate's process tree; vm_stat free+inactive+speculative; vm.swapusage). Result: GATE 1 PASS, exit 0.

| measure | value |
|---|---|
| available GB before the run | 12.1 |
| min available GB during the run | 10.1 (drop 2.0 GB, at t=26-30 s when all 5 groups were starting) |
| peak summed RSS of the tree | 7.8 GB (counts shared/file-backed pages many times; it overstates real need) |
| swap used | 2048-2057 MB the whole run (no growth) |
| wall time, parallel | 408 s |
| sum of section times (serial estimate) | 511 s (parallel saves ~103 s; rust group 407 s is the critical path) |
| group times | ts 13 s, rust 407 s, node 20 s, explorer 69 s, py 1 s |

Calibration: the parallel run needs at most ~2.0 GB on top of what the machine already has in use (measured as the
drop in available memory; swap did not grow, so no paging pressure). Floor = 1.5 x 2.0 = **3 GB**.
The F-170 readings that forced serial (4.1-5.2 GB) are all above 3 GB, so those runs would now go parallel.
The old 6 GB default was a guess, never measured.

## Verification (2026-11-05)
- precheck-parallel.test.mjs 13/13; full `node --test 'scripts/tests/*.test.mjs'` 1492 pass / 0 fail.
- Mutation: AC3 red 3/3 with the STOP step removed (kill -0 in place of kill -STOP).
- AC6: real `./scripts/precheck.sh --no-install` took the parallel path (5 groups started), 131 s, GATE 1 PASS.
