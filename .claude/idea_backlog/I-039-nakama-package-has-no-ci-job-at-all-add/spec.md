---
title: "nakama package has no CI job at all — add typecheck/test/esbuild gate"
id: I-039
status: idea
canonical_spec: docs/superpowers/specs/2026-07-31-lane-A-nakama-ci.md
---

# nakama package has no CI job at all — add typecheck/test/esbuild gate

> **The canonical spec is [`docs/superpowers/specs/2026-07-31-lane-A-nakama-ci.md`](../../../docs/superpowers/specs/2026-07-31-lane-A-nakama-ci.md)**
> (release 1.6, Lane A — committed `23b5338`). It is self-sufficient and already
> approved. This stub exists only to give the finding a backlog id. Read the lane
> doc, not this file.

## Problem

`grep -rn "nakama" .github/workflows/` returns nothing — verified 2026-07-31 on
`release/1.6`. CI covers `colyseus-server` (`ci.yml`), `contracts`
(`contracts.yml`), and `scripts` (`ci.yml:78`, `npm test --prefix scripts`, inside
the step named "Content gate"). `nakama/` is covered by nothing.

It matters more than a normal coverage gap because `nakama/` is bundled by esbuild
into the Nakama server runtime (goja). A type error there does not surface as a
failing test — it breaks `InitModule` at load, taking down auth, matchmaking and
the loadout RPCs for the whole deployment. It is also the package most exposed to
`@atlas/contracts` shape changes: F-019 changed `PrimaryStats` and `ProfileDoc`,
and both `nakama/src/storage.ts` and `nakama/src/rpc/allocateStats.ts` had to
change with it.

`scripts/precheck.sh` (Gate 1, `b164c11`, landed in 1.5) gates nakama locally, so
nothing catches a break on a PR pushed from a machine that skipped the gate.

## Why now

Release 1.6 Lane A. It is small, it is fully parallel with Lane B (zero file
overlap — `.github/workflows/` vs `colyseus-server/src/modules/Battle*`), and
1.5 just demonstrated the cost of trusting an ungated path: two features shipped
through a Gate 1 that did not exist because nobody checked.

## Sketch

`@atlas/nakama-runtime` already defines every script CI needs (`build` →
`node esbuild.config.mjs`, `typecheck` → `tsc --noEmit`, `test` → `jest`). CI
simply never calls them. Add a workflow mirroring `contracts.yml` — closest shape
(single package, pnpm workspace, `pnpm --filter`, contracts-built-first ordering).

Ordering is not optional: build `@atlas/contracts` before typechecking nakama.
nakama imports contracts from its `dist/`; a missing dist gives phantom `TS2307`s
and a stale dist typechecks green against the old types. Both fail silently.

Include the **esbuild build**, not just typecheck + test — the bundle is the
artifact that actually loads into Nakama, and it can fail on things `tsc` accepts
(e.g. a top-level `fs`/`path` import; `contracts/src/meta/catalogs.ts` carries a
long comment about exactly this hazard).

**Done when** a PR shows the new check reporting, *and* the gate is proven to bite:
introduce a deliberate type error in `nakama/src/`, confirm CI goes red, revert.
A gate that has never failed is not known to work.
