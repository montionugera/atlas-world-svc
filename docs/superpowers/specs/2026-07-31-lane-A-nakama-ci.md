---
title: "Lane A — nakama has no CI job at all"
lane: A
release: "1.6"
date: 2026-07-31
status: "unfiled finding — needs an idea ticket before work starts"
parallel_with: "B (damageType), and the F-002 bookkeeping decision"
blocks: nothing
---

# Lane A — `nakama` has no CI job at all

Self-sufficient. You do not need the other lane docs.

<div class="callout danger">

**This is an unfiled finding, not a backlog item.** Do not go looking for an `F-NNN`.
File it as an idea first (`/ps-release-workflow:idea`), then refine and claim, or — if
the release manager agrees it is trivial — land it as a small direct change on
`release/1.6`. **It replaces the lane that was originally written as F-015, which turned
out to be invalid** (see *Why F-015 is not this lane* below).

</div>

## The finding

`grep -rn "nakama" .github/workflows/` returns **nothing**. Verified 2026-07-31.

CI coverage today:

| package | workflow | covered? |
| --- | --- | --- |
| `colyseus-server` | `.github/workflows/ci.yml` | ✅ typecheck · format · jest |
| `contracts` | `.github/workflows/contracts.yml` | ✅ build · unit · codegen · drift · smoke |
| `scripts` | `ci.yml:78` — `npm test --prefix scripts` | ✅ (inside the "Content gate" step) |
| **`nakama`** | — | ❌ **nothing** |

**Why it matters more than a normal gap.** `nakama/` is bundled by esbuild into the
Nakama server runtime (goja). A type error there does not produce a failing test — it
breaks `InitModule` at load, taking down auth, matchmaking and the loadout RPCs for the
whole deployment. It is also the package most exposed to `@atlas/contracts` shape
changes: F-019 changed `PrimaryStats` and `ProfileDoc`, and `nakama/src/storage.ts` and
`nakama/src/rpc/allocateStats.ts` both had to change with it.

`scripts/precheck.sh` (Gate 1, landed `b164c11` in 1.5) gates nakama locally. CI does
not, so nothing catches it on a PR from a machine that skipped the gate.

## The work

`@atlas/nakama-runtime` already defines everything needed — CI simply never calls it:

```json
{ "build": "node esbuild.config.mjs",
  "typecheck": "tsc --noEmit",
  "test": "jest" }
```

**Files:** add a job to `.github/workflows/ci.yml`, or a new
`.github/workflows/nakama.yml`. Mirror `contracts.yml` — it is the closest shape (single
package, pnpm workspace, `pnpm --filter` invocation) and it already handles the
contracts-must-be-built-first ordering.

**Ordering that is not optional:** build `@atlas/contracts` before typechecking nakama.
nakama imports contracts from its `dist/`, so a missing dist gives phantom `TS2307`s and a
**stale** dist typechecks green against the old types. Both failure modes are silent.

```bash
pnpm --filter @atlas/contracts run build
pnpm --filter @atlas/nakama-runtime run typecheck
pnpm --filter @atlas/nakama-runtime run test
pnpm --filter @atlas/nakama-runtime run build   # esbuild bundle — the goja artifact
```

Include the **esbuild build**, not just typecheck+test. The bundle is the artifact that
actually loads into Nakama, and it can fail on things `tsc` accepts (e.g. a top-level
`fs`/`path` import — `contracts/src/meta/catalogs.ts` carries a long comment about
exactly this hazard).

## Done when

- A PR shows the new nakama check reporting.
- **Proven to bite:** introduce a deliberate type error in `nakama/src/`, confirm CI goes
  red, revert. A gate that has never failed is not known to work — this repo's own rule,
  and 1.5 shipped two features through a Gate 1 that did not exist because nobody checked.

## Why F-015 is not this lane

`.claude/refined_backlog/F-015-.../spec.md` is **`status: invalid-wont-do`**, verified
2026-07-22. It proposed adding a `node --test` step for `scripts/`, but CI already runs
that suite via `npm test --prefix scripts` at `ci.yml:78`. Its spec records the reason the
ticket existed at all: a reviewer "looked for a literal `node --test` step and missed the
`npm test` indirection."

An earlier draft of the 1.6 handoff repeated that identical mistake — grepping step
*names*, seeing "Content gate", and never reading its `run:` block. **Read what a CI step
executes, not what it is called.** If you take nothing else from this lane, take that.

Do not claim F-015. Do not "fix" it. It is correctly closed.

## Shared invariants (repeated so this file stands alone)

1. **Cut your branch, then immediately `git merge release/1.6 --no-edit`.** The claim
   script cuts from `main`; this bit both F-018 and F-019 in 1.5.
2. **A green jest run does not prove the build compiles.** `tsc` checks the project
   including tests; ts-jest transpiles per file and caches. On 2026-07-30 jest reported
   571 passed / 0 failed and the next docker build failed with three errors in a file it
   had just "passed". Always `cd contracts && pnpm build` first, then `npx tsc --noEmit`.
3. **Run Gate 1 before shipping:** `./scripts/precheck.sh` (add `--no-install` if deps are
   warm). New in 1.5 — before it, `ship` silently skipped Gate 1 entirely.
4. **There is no prod deploy.** `ci.yml` runs tests only on push to `main`; the sole
   deploy script is `scripts/deploy-local.sh` (local k8s). Do not tell anyone a merge
   ships to production.
5. **`--babysit` races CI registration** — it reports `no checks reported → PR checks
   FAILED` while checks are still `IN_PROGRESS`. `no checks` ≠ `red checks`. Verify with
   `gh pr view <n> --json statusCheckRollup` before believing a failure.

Use **pnpm**, never npm, for installs. Never `git commit --amend`.
