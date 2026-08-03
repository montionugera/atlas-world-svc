---
title: "Handoff — continue from here (release 1.6)"
date: 2026-08-04
release: "1.6"
main_at: "da67c6e — unchanged since the 1.5 promote on 2026-07-30"
supersedes: "2026-07-31-release-1.6-handoff.md (its four lanes are all resolved or absorbed)"
---

# Continue from here

Written 2026-08-04. Read the **Decision** section first — it is the only thing that
needs a human, and everything else is downstream of it.

<div class="callout success">

**State.** Release **1.6** in progress: **9 shipped**, **1 claimed and in flight**
(F-029), 2 stale `open` rows. `main` still at `da67c6e` — **nothing has been promoted in
5 days** while nine features accumulated. Ideas: **75 total, 46 unpromoted.**

</div>

## 1. In flight — do not disturb

**F-029** (← I-059) *L2 ecology: biome and habitat lore for cluster-1's zones*.
Claimed 2026-08-03 by `claude-a6c35399`, worktree
`.claude/worktrees/F-029-l2-ecology-biome-and-habitat-lore-for-cl`, **7 commits ahead of
`release/1.6`, working tree clean**, HEAD `e10a508`.

Its spec (15.1K) and plan (42.1K) are carried into
`.claude/refined_backlog/F-029-*/`. Last three commits show it mid-review-cycle
(`test(F-029)` → `docs(F-029) derivation` → `docs(F-029) fix three citation-fidelity
defects`), so it is progressing normally.

**If you are resuming F-029:** `cd` into that worktree, read its `plan.md`, and continue.
It is the only claim; nothing else is competing for it.

**If you are starting something else:** leave it alone. Do not promote the release out
from under it — see the Decision.

## 2. The Decision — promote 1.6, or keep filling it?

This is the only call that needs you, and it has been open for three status reports.

| | promote now | keep filling |
| --- | --- | --- |
| size | 9 features — 4.5× the size 1.5 promoted at | grows further |
| blocker | **F-029 is claimed and unshipped** | none |
| risk | promoting mid-claim strands F-029 on a dead release branch | the 46-idea unpromoted backlog keeps growing; nothing reaches `main` |

<div class="callout warn">

**You cannot promote cleanly while F-029 is claimed.** Promote's cleanup prunes
per-feature worktrees and branches, and it verifies the PR merged before pruning. A
claimed, unshipped feature in the middle of that is exactly the state the guards exist to
refuse. **Either ship F-029 first, or unclaim it** (`/ps-release-workflow:unclaim F-029`
— always keeps the branch), then promote.

</div>

**Recommended order:**

1. Finish and ship **F-029** (it is 7 commits in, clean, and close).
2. Close the two stale rows — **F-002** and **F-015** (§3).
3. **Full promote 1.6** → opens 1.7.
4. Open 1.7 with the hardening batch (§4).

## 3. Two stale rows — a 5-minute release-manager call, not work

These have appeared in every status report since 1.5 and are pure noise:

- **F-002** "Asset build pipeline" — **already delivered.** All 7 tasks shipped in
  release **1.2** (squash `3cf96e7`, 2026-07-19), reconciled 2026-07-20 by F-006, with a
  full task → deliverable → commit provenance table in its `spec.md`. The row is a
  bookkeeping artifact: F-002 predates the point where asset work was routed through
  claim → ship → promote.
- **F-015** "CI: add scripts test-suite step" — **`status: invalid-wont-do`**, verified
  2026-07-22. CI already runs that suite: `ci.yml:78` runs `npm test --prefix scripts`
  inside the step *named* "Content gate".

**Why it needs you:** there is no sanctioned toolkit path to retro-promote a feature whose
work shipped under another feature's release, and hand-editing `_catalog.json` is
forbidden (**R1, release-manager owned**). Decide *how* to close them — retro-promote vs
formal-close — then it is a one-line change.

## 4. Ranked next work — the 1.7 opening batch

All unpromoted (`promoted_to: null`), all verified against the backlog on 2026-08-04.

### Tier 1 — fails silently, which is the expensive kind

**`I-070` — `GameSimulationSystem`'s single try/catch drops the rest of a tick.**
One throw silently skips every remaining stage: physics → projectiles → players → AI →
mob lifecycle → mobs → NPCs → projectile cleanup → zone effects → battle messages. The
sim loop is the hottest path in the server and this degrades gameplay **without surfacing
an error**. Highest-risk item in the backlog.

**`I-072` — `aoi_snapshot_bytes` metric has no code.** F-027 (AOI/StateView) shipped
2026-08-02; its entire payoff is currently unmeasurable in production. This is the
cheapest it will ever be to add — the context is 2 days old. Leave it and the capacity
claims become folklore.

### Tier 2 — real, not urgent

**`I-071`** — `MobLifeCycleManager` mob ids use a 2-char suffix and **collide on burst
spawn**. Correctness bug with a small blast radius until burst spawning gets used in
anger.

**`I-073`** — no nightly CI job runs the load harness, so the capacity table silently
rots. Pairs naturally with I-072: one makes capacity observable, the other keeps it
honest over time.

**`I-036`** — *the parity/pack test harness.* The one lane from the 2026-07-31 handoff
never picked up. `f018-model-parity.test.ts` still carries `it.failing` tolerance
assertions, so the balance model **remains unverified against a real fight**.

<div class="callout danger">

**Before planning I-036, re-read its handoff against reality.** F-023 (boss threat/aggro)
shipped on 2026-07-31 and **invalidated part of what I wrote**. Specifically: a threat
table *concentrates* boss damage on the tank rather than spreading it, so the
even-spread acceptance signal in `2026-07-31-lane-C-sim-test-harness.md` and
`2026-07-31-lane-D-boss-aggro-decision.md` is **wrong** for the shipped design. The
authority is `2026-07-31-boss-threat-aggro-design.md` (`status: IMPLEMENTED in F-023`),
whose §1 documents the correction. The pack half of I-036 is unaffected.

</div>

### Tier 3 — content, when you want content rather than hardening

`I-059` is consumed by F-029. The remaining 46 unpromoted ideas include a Season-1
content-audit cluster (`I-065` NPC roster, `I-066` item/equipment scheme, `I-067`/`I-068`
budget assertions) and `I-053` (phasing spike).

## 5. Housekeeping

**Nine stale feature worktrees** — `F-020` … `F-028` all still exist on disk. This is
**expected**: `ship` does not prune worktrees; promote's cleanup does. They will all
disappear when 1.6 promotes. No action needed, but do not mistake them for in-flight work
— only **F-029** is claimed.

**Three legacy worktrees, deliberately untouched** — `lane/C-content` (8 unmerged
commits), `feature/colyseus-0.17-migration` (49), `feature/godot-game-client` (49). The
last is almost certainly the Godot 4 client migration decided 2026-07-11 — live strategic
work, not debris. Removing the *directories* is reversible; deleting the *branches* is
not. All are far behind `main`; merge before resuming either.

## 6. Invariants — every one of these cost real time

1. **Cut your branch, then immediately `git merge release/1.6 --no-edit`.** The claim
   script cuts from **`main`**, which is 5 days and 9 features stale. This bit both F-018
   and F-019.
2. **A green jest run does not prove the build compiles.** `tsc` checks the project
   including `src/tests/**`; ts-jest transpiles per file and **caches**. On 2026-07-30
   jest reported 571 passed / 0 failed and the next docker build failed with three errors
   in a file it had just "passed". Always `cd contracts && pnpm build` first — a **stale
   `dist` typechecks green against the OLD types** — then `npx tsc --noEmit`.
3. **Run Gate 1 before shipping:** `./scripts/precheck.sh` (`--no-install` if deps are
   warm). It exists only as of 1.5; before that `ship` silently skipped it, and **every
   feature in this repo's history shipped through a gate that did not exist**.
4. **Read the backlog `spec.md` before planning anything.** `status: open` in
   `_catalog.json` does **not** mean unbuilt — F-002 shipped in 1.2, F-015 is
   `invalid-wont-do`. Two of four lanes in the 2026-07-31 handoff were wrong because I
   planned from titles.
5. **Read what a CI step RUNS, not what it is NAMED.** `ci.yml:78`'s `npm test --prefix
   scripts` lives inside a step called "Content gate". Grepping names for `node --test`
   finds nothing and looks like a gap — this exact mistake has now been made twice.
6. **There is no prod deploy.** `ci.yml` runs tests only on push to `main`; the only
   deploy script is `scripts/deploy-local.sh` (local k8s). The ps-release-workflow docs
   describe one generically; it is not true here.
7. **`--babysit` races CI registration** — it reports `no checks reported → PR checks
   FAILED` while checks are still `IN_PROGRESS`. **`no checks` ≠ `red checks`.** Verify
   with `gh pr view <n> --json statusCheckRollup`; never merge over genuinely red checks.
8. **Promote's cleanup refuses if `main` has uncommitted tracked changes.** Commit or
   stash first. `main` currently carries uncommitted `CLAUDE.md`,
   `.claude/settings.local.json` and untracked `docs/agents/`.

Use **pnpm**, never npm. Never `git commit --amend`. Do not run prettier on
`tools/combat-lab/combat-model.json` (generated, `.prettierignore`).
`.claude/refined_backlog/*/plan.md` is gitignored — canonical specs and plans live under
`docs/superpowers/`.

## 7. Starting fresh work

```bash
# ideas need a solid spec BEFORE refine — that gate is deliberate
/superpowers:brainstorming            # -> docs/superpowers/specs/<date>-<topic>-design.md
/ps-release-workflow:refine I-0NN     # mints F-NNN
/ps-release-workflow:claim F-NNN      # creates the worktree

cd .claude/worktrees/F-NNN-<slug>
git merge release/1.6 --no-edit       # invariant 1 — do not skip
pnpm install && (cd contracts && pnpm build)
```

**Refusing to refine an idea whose spec is still the empty skeleton is the point of the
gate** — it mints an `F-NNN` and tempts an immediate claim before anyone has decided what
is being built.
