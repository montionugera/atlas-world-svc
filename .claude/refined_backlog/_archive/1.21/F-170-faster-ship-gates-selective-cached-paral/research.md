# F-170 lane D: Rust gate experiment

Crate-cold reset before every measurement: `touch server-rs/src/lib.rs content/bestiary/bestiary.json`. From `server-rs`, with `CARGO_TARGET_DIR` set to this worktree’s `server-rs/target`, `/usr/bin/time -l sh -c "cargo fmt --check && cargo clippy --jobs N --all-targets -- -D warnings && cargo test --jobs N -- --test-threads=N"`. Times are seconds; RSS is bytes reported by macOS time as maximum resident set size of a process, not the aggregate concurrent process tree.

| N | Before wall | Before RSS | Experimental after wall | Experimental after RSS |
|---|---:|---:|---:|---:|
| 2 | 169.92 | 693485568 | 36.82 | 624984064 |
| 4 | 69.93 | 694304768 | 26.12 | 652918784 |
| 6 | 73.63 | 622100480 | 25.99 | 639205376 |

Each gate run passed with 368 passed, 0 failed, 2 ignored. Before: 56 integration test binaries; experimental after: one. Integration names gained the former file name as a module prefix. The first run may include additional cache warming, so its difference cannot be attributed solely to job count.

After the same reset, `cargo build --tests --timings --jobs 6` completed in 18.60s. Cargo timing report: library 8.5s (frontend 5.0s, codegen 3.5s), library test 7.9s, server binary 2.1s, largest individual integration target live_runtime 1.8s, nakama_wiring and ws_swarm_load_test 1.6s each. Cargo did not report separate link times for these test units, so compile versus link cannot be quantified from this report.

The experimental consolidation was reverted: `scripts/epic-check.sh` invokes 28 of the removed targets by name and fails with `no test target named sleeping_regions_test`. Updating that script is outside lane D ownership; preserving this gate requires coordination before consolidation can be committed. No assertion was changed. Nextest was not run after this blocking finding. Do not raise the worker default on these measurements: process-tree peak RSS with two gates and Chrome probes was not measured, so the 36 GB concurrency budget cannot be established from `time -l` alone.

## Round 2 — consolidated target and concurrent gates

Cargo auto-discovers `tests/it/main.rs`; 56 existing integration files are modules under it. Auto-discovery remains enabled so a new top-level integration target is not silently excluded. The 28 epic-check module filters list exactly the original 51 tests; the 170 integration test names match after adding their former target names as module prefixes. An unknown module causes epic-check to fail. `cargo test` passed 368 tests with 2 ignored; nextest passed 368 with 2 skipped.

Warm sequential comparisons, from `server-rs`, with `CARGO_TARGET_DIR=$PWD/target`: `cargo test --jobs N -- --test-threads=N` and `cargo nextest run --build-jobs N --test-threads N`, each timed with `/usr/bin/time -l`:

| N | cargo test wall (s) | nextest wall (s) |
|---|---:|---:|
| 2 | 11.00 | 12.31 |
| 6 | 8.02 | 7.13 |

Paired crate-cold gates: two independent copies of the target directory, each reset with `cargo clean --manifest-path server-rs/Cargo.toml -p server-rs`; each command was `/usr/bin/time -l env CARGO_TARGET_DIR=<separate-dir> bash -c 'cd server-rs && cargo fmt --check && cargo clippy --jobs N --all-targets -- -D warnings && cargo test --jobs N -- --test-threads=N'`. Both gates passed. Wall values are the separate gate durations; RSS sum adds each `time -l` maximum resident set size.

| N | Gate A wall (s) | Gate B wall (s) | A max RSS (bytes) | B max RSS (bytes) | Sum (bytes) |
|---|---:|---:|---:|---:|---:|
| 4 | 164.90 | 164.95 | 645513216 | 697516032 | 1343029248 |
| 6 | 108.91 | 109.31 | 890667008 | 859897856 | 1750564864 |

These RSS figures are **not** the simultaneous aggregate of both complete process trees: `time -l` reports individual-process maxima, which may occur at different times, and does not sum all concurrent compiler descendants. Adding 2 GB to those figures therefore cannot prove a 24 GB limit. Recommend a provisional `ATLAS_CARGO_JOBS=2`, matching the existing `ATLAS_MAX_WORKERS` default until an aggregate process-tree peak is measured; the largest safe N cannot be determined from this table. No worker default was changed.

`CARGO_TARGET_DIR=/tmp/f170-target-a CARGO_BUILD_JOBS=6 bash scripts/epic-check.sh` passed in a temporary copy, preserving the original worktree from the pipeline’s generated-file writes: 28 Rust result groups, 51 passed, 0 ignored, followed by the world pipeline PASS.
