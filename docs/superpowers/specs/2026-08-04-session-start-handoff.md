---
title: "Handoff — start here (release 1.6, after F-029 shipped)"
date: 2026-08-04
release: "1.6"
main_at: "da67c6e — unchanged since the 1.5 promote on 2026-07-30; origin/main identical"
supersedes: "2026-08-04-wave-4-handoff.md on Decision 0 ONLY — that decision is now made. Its two lane briefs (§2 Lane A, §3 Lane B) are still the authority and are NOT reproduced here."
---

# Start here

Written 2026-08-04 ~02:30 (+0700), immediately after **F-029 shipped**.

This is a **short** handoff on purpose. The long one — `2026-08-04-wave-4-handoff.md`,
723 lines — is still current for everything except its Decision 0. Read this file first,
then open that one for whichever lane you pick.

<div class="callout success">

**Decision 0 is settled.** F-029 **shipped into release/1.6** (merge `7b27e69`, catalog
`a362e15`). The release is now **10 shipped / 0 claimed / 2 stale open**. Nothing is in
flight. The next session starts from a clean claim slate.

</div>

---

## 1. What changed in the last session

| | before | after |
| --- | --- | --- |
| F-029 | `claimed`, 7 commits, unmerged | **`shipped / 1.6`** — merged, catalog updated |
| release/1.6 | 9 shipped | **10 shipped** |
| claims in flight | 1 | **0** |
| scripts test suite | 158 pass | **162 pass** |

**F-029 was audited before it shipped, not just built.** A five-dimension adversarial
sweep (citations, gate rules G1–G8, placement data, the `check_content.mjs` diff, spec
conformance) produced **zero findings that survived refutation**. Every candidate defect
was either factually wrong or reduced to optional hardening.

What the audit *did* find was worth acting on: **four gate rules the test suite could not
distinguish from their own absence.** Four tests were added and each was mutation-proved —
the rule was deleted, the suite was run, and exactly one test failed:

| rule deleted | tests that failed |
| --- | --- |
| the empty-`bestiary/`-directory soft-skip (`check_content.mjs:706`) | 1 |
| `readJson` failure-count discipline in `loadBestiaryDesigns` (`:64`) | 1 |
| `readJson` failure-count discipline in `loadGeographyZones` (`:83`) | 1 |
| G3's cross-region check (`:775`) | 1 |

<div class="callout idea">

**The transferable bit: a green suite is not a covering suite.** F-029's 19 tests all
passed and four of its rules were still free to be deleted silently. Deleting a rule and
re-running is a five-minute check that a passing suite cannot give you. Consider it for
any future gate work — `scripts/check_content.mjs` is now ~800 lines of exactly this kind
of rule.

</div>

Gate 1 (`./scripts/precheck.sh`) passed all eleven checks — deps, contracts build + jest,
server `tsc --noEmit` + jest + prettier, nakama `tsc --noEmit` + jest, client suite,
art-forge, combat-lab model gates.

**Local deploy was skipped** (`ship --no-deploy`) because a second session was committing
to `release/1.6` at the time and racing image rebuilds was pointless. To deploy:

```bash
cd .claude/worktrees/_release && ./scripts/deploy-local.sh
```

---

## 2. The decision now facing you

<div class="callout warn">

**Promote 1.6, or keep filling it?** This has been open for four status reports. It was
previously *blocked* by F-029's claim. **It is no longer blocked** — that was the whole
point of shipping F-029 first.

</div>

| | promote now | keep filling (wave 4 lanes) |
| --- | --- | --- |
| size | **10 features** — 5× the size 1.5 promoted at | grows to 11–12 |
| blockers | **none any more** | none |
| against | the two stale rows (§4) are still noise in the catalog | `main` has now been static for **5 days** while ten features piled up; 46 unpromoted ideas |

**Recommendation: promote.** Ten features is well past the size at which this repo has
historically promoted, the claim that blocked it is gone, and both remaining wave-4 ideas
need a brainstorm before they can even be refined — so nothing is lost by cutting the
release now and opening the lanes on 1.7.

```bash
/ps-release-workflow:full-promote     # Gate 2 -> PR -> babysit -> merge -> cleanup -> opens 1.7
```

Promote's cleanup prunes the nine stale feature worktrees (§5) as a side effect.

---

## 3. Wave 4 — one of three done

| order | idea | title | state |
| --- | --- | --- | --- |
| 1 | I-059 → **F-029** | L2 ecology — Thornveil | ✅ **shipped to 1.6** |
| 2 | **I-062** | L3 boss design | ❌ template stub — never opened |
| 3 | **I-064** | L4 promote monsters to playable | ❌ template stub — never opened |

Both remaining specs are **literal 22-line skeletons** — `## Problem`, `## Why now`,
`## Sketch` still hold their placeholder parentheticals; `plan.md` and `research.md` are
3 lines each. Verified by reading them, not by their line counts.

<div class="callout danger">

**Neither can be refined yet.** The gate that refuses to refine an idea whose spec is
still the empty skeleton is deliberate — it exists to stop an `F-NNN` being minted and
claimed before anyone has decided what is being built. **The next action on either lane is
`/superpowers:brainstorming`, not `/ps-release-workflow:refine`.**

</div>

### The lanes are not parallel — do not run them side by side

The wave-4 handoff's §4 settles this, and its reasoning is about coupling, not file
overlap: **I-064 is the general case of I-062.** Both are consumers of one undecided
question — *does the variant axis go on `MobTypeConfig`, or into a new spawn-entry layer
above `MOB_TYPES`?* They also collide directly on `types.ts`, `definitions/`,
`index.ts:13`, and both regenerate the same JSON artifacts.

The one genuinely independent piece is **I-062's authoring half** — picking the apex and
writing its lore — which touches only `content/bestiary/` and `docs/worldbuilding/`.

**Do I-062 first.** It is the vertical slice (ONE boss); I-064 gets cheaper once the boss
forces the `MobTypeConfig` question to be answered.

### What a brainstorm on I-062 must settle

Carried from the wave-4 handoff's open questions — these are the forks, not a checklist:

1. **Is a boss a distinct server concept, or a tuned mob type?** No flag, class, interface
   or branch exists today — `grep boss colyseus-server/src` returns only tests, one line of
   `mapConfig.ts`, and comments. **This is the biggest scope fork and the intersection with
   I-064.**
2. **Which candidate is the Thornveil apex?** *Heartwood Tyrant* (the hydrology/ecology
   argument, band 61–70, `threat: zone`) or *Thorncrown Drake* (the bestiary README's own
   `drake` family contract, band 51–60, `threat: melee`). `A2-ecology-thornveil.md` §8.1
   deliberately refuses the tie. Practical asymmetry: **`threat: zone` has no executable
   strategy** (`attackStrategyFactory.ts:102`).
3. **Does this lane fix the dead defence-element path?** `MobTypeConfig` has no `element`
   field and `MobLifeCycleManager.ts:189` never passes one — so **every mob currently
   defends as neutral**, silently voiding the 6-element table F-017 shipped. Fix here, or
   ship the boss elementally neutral?
4. **Boss art key namespace.** `art:boss-*` matches the declared art-groups `boss` group;
   `art:mob-*` is what `season1.mjs:68` actually counts, by literal id prefix. **The
   semantically correct name silently zeroes the art-bestiary budget line.**
5. **Does a promoted boss need an extra placement record**, and would that break F-029's
   G4 (every zone design placed exactly once)? Both candidates already sit in tier `heart`.

---

## 4. Two stale rows — still a 5-minute release-manager call

Unchanged from the previous two handoffs, and they will follow you into 1.7 if you promote
without settling them:

- **F-002** "Asset build pipeline" — **already delivered.** All 7 tasks shipped in release
  **1.2** (squash `3cf96e7`), reconciled 2026-07-20 by F-006, with a full provenance table
  in its `spec.md`. The row predates the point where asset work was routed through
  claim → ship → promote.
- **F-015** "CI: add scripts test-suite step" — **`status: invalid-wont-do`**, verified
  2026-07-22. CI already runs that suite: `ci.yml:78` runs `npm test --prefix scripts`
  inside the step *named* "Content gate".

**Why it needs a human:** there is no sanctioned toolkit path to retro-promote a feature
whose work shipped under another feature's release, and hand-editing `_catalog.json` is
**R1, release-manager owned**. Decide *how* to close them — retro-promote vs formal-close —
then it is a one-line change.

---

## 5. Housekeeping

**`release/1.6` is 100 commits ahead of `origin/release/1.6`.** Local `a362e15`, origin
`f09bd7f`. None of F-029, none of the three handoffs, none of the 1.6 features after that
point exist on the remote. **A fresh clone sees none of this.** `main` and `origin/main`
agree at `da67c6e`.

**Ten stale feature worktrees** — `F-020` … `F-029` all still exist on disk. **Expected**:
`ship` does not prune worktrees, promote's cleanup does. They vanish when 1.6 promotes.
Do not mistake them for in-flight work — **nothing is claimed.**

**Three legacy worktrees, deliberately untouched** — `laneC-content` (`lane/C-content`),
`phaseA-colyseus-017` (`feature/colyseus-0.17-migration`), `phaseB-game-client`
(`feature/godot-game-client`). The last is the Godot 4 client migration decided
2026-07-11 — live strategic work, not debris. Removing the *directories* is reversible;
deleting the *branches* is not. All are far behind `main`; merge before resuming either.

**A second session may still be live on `release/1.6`.** One was committing there during
the last session (it authored `2026-08-04-wave-4-handoff.md`). Check `git reflog show
release/1.6` before any write to that branch, and re-merge before shipping.

---

## 6. Invariants — every one of these cost real time

1. **Cut your branch, then immediately `git merge release/1.6 --no-edit`.** The claim
   script cuts from **`main`**, which is 5 days and 10 features stale. This bit F-018 and
   F-019, and `release/1.6` moved *twice* under F-029 mid-session.
2. **A green jest run does not prove the build compiles.** `tsc` checks the project
   including `src/tests/**`; ts-jest transpiles per file and **caches**. Always
   `cd contracts && pnpm build` first — a **stale `dist` typechecks green against the OLD
   types** — then `npx tsc --noEmit`.
3. **A green suite does not prove the rules are covered.** See §1. Delete the rule, run the
   suite; if nothing fails, the rule is unprotected.
4. **Run Gate 1 before shipping:** `./scripts/precheck.sh` (`--no-install` if deps are
   warm). It exists only as of 1.5.
5. **Read the backlog `spec.md` before planning anything.** `status: open` in
   `_catalog.json` does **not** mean unbuilt — F-002 shipped in 1.2, F-015 is
   `invalid-wont-do`.
6. **Read what a CI step RUNS, not what it is NAMED.** `ci.yml:78`'s `npm test --prefix
   scripts` lives inside a step called "Content gate". This mistake has now been made twice.
7. **There is no prod deploy.** `ci.yml` runs tests only on push to `main`; the only deploy
   script is `scripts/deploy-local.sh` (local k8s).
8. **`--babysit` races CI registration** — it reports `no checks reported → PR checks
   FAILED` while checks are still `IN_PROGRESS`. **`no checks` ≠ `red checks`.** Verify with
   `gh pr view <n> --json statusCheckRollup`.
9. **Promote's cleanup refuses if `main` has uncommitted tracked changes.** `main` currently
   carries uncommitted `CLAUDE.md` and `.claude/settings.local.json`, plus untracked
   `docs/agents/`. **Commit or stash before promoting.**
10. **`scripts/` is its own package.** `node --test scripts/tests/` from the repo root
    **fails** on Node 26 (`MODULE_NOT_FOUND`). Use `cd scripts && npm test`, or
    `cd scripts && node --test tests/<file>.test.mjs`.
11. **`docs/worldbuilding/` is NOT in the render hook's whitelist** — only
    `docs/superpowers/{specs,decisions,brainstorms}/` and `research/` are. ~20 design docs
    there are silently skipped; render them by hand with
    `bash ~/.claude/scripts/render-spec-md.sh <path>`.

Use **pnpm**, never npm. Never `git commit --amend`. Do not run prettier on
`tools/combat-lab/combat-model.json` (generated, `.prettierignore`).
`.claude/refined_backlog/*/plan.md` is gitignored — canonical specs and plans live under
`docs/superpowers/`.

---

## 7. The two ways to open the next session

```bash
# A — promote first (recommended). Nothing is claimed; nothing blocks it.
/ps-release-workflow:status                # confirm 10 shipped / 0 claimed
/ps-release-workflow:full-promote          # Gate 2 -> PR -> merge -> cleanup -> opens 1.7

# B — keep filling 1.6 with wave 4's Lane A (the boss).
/superpowers:brainstorming                 # I-062 -> docs/superpowers/specs/<date>-boss-design.md
/ps-release-workflow:refine I-062          # ONLY once that spec is solid and approved
/ps-release-workflow:claim F-0NN
cd .claude/worktrees/F-0NN-<slug>
git merge release/1.6 --no-edit            # invariant 1 — do not skip
pnpm install && (cd contracts && pnpm build)
```

**Do not chain B's three commands in one breath.** The brainstorm has to produce a spec a
human has actually read and approved before `refine` mints an `F-NNN` — that gate is the
point, and skipping it is how a feature gets claimed before anyone has decided what it is.
