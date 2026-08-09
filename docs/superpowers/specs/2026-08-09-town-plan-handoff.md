---
title: "Handoff — Millcross town plan, and how to work so this one doesn't drift"
date: 2026-08-09
release: "1.7"
supersedes_clause: "Written because the previous session drifted repeatedly. §1 is the working method; read it before §2."
---

# Handoff — the Millcross town plan

**Read §1 first. It is the reason this file exists.** The previous session produced good work and
drifted off-goal repeatedly — the owner asked for a town map and got zone-polygon topology
analysis. The method below is the fix, agreed with the owner on 2026-08-09.

---

## 1. How to work on this

<div class="callout danger">

**Be a thin orchestrator. Do not explore inline.**

- Hold **the goal, the state, the next step**. Nothing else.
- **Dispatch** plan → exec → verify as separate agents. Each gets the goal statement verbatim and
  returns **≤15 lines: status, artifact paths, next state.** No transcripts into your context.
- **Curiosity is the drift vector.** If a question needs investigating, dispatch it. Do not run the
  grep yourself and follow where it leads.
- **File off-goal findings; never chase them.** This is the highest-value rule. Something real but
  outside the goal becomes one backlog line and you move on.
- **Re-state the goal in one sentence before each dispatch.**

</div>

**Decide, don't ask.** The owner found constant questions exhausting. Judge against written
criteria and report outcomes. Stop only for a genuine **R0** (promote to `main`, prod deploy) or a
blocker you cannot resolve. One question maximum when one is truly needed, and never a question
plus a next-steps list in the same message.

**Communication:** short, scannable, outcomes not menus. The owner reads on a phone sometimes.

---

## 2. The goal — one sentence

> **Produce a top-down town plan for Millcross** — roads with real widths, building footprints, the
> ford, the cart yard, the mill — as `content/towns/town-millcross.json`, **plus a renderer that
> draws it as an image**, plus gate rules that prove it is walkable.

The owner's reference is Genshin's Mondstadt town map: a plan view with a road spine, footprints,
plazas and landmarks. **Take the method, not the form** — Mondstadt is walled, planned and tiered;
`A1` §6 says Millcross has *"no wall and no plan"*.

**The renderer is not optional.** The owner has asked to *see* things all session. A plan that
cannot be looked at cannot be judged. Cheapest path: the same SVG → PNG route
`tools/art-forge/generate/blockin.mjs` already uses (`magick`), drawing roads and footprints
instead of grey masses.

---

## 3. Everything you need — this lane is self-sufficient

### 3.1 The design is already written and approved

`docs/superpowers/specs/2026-08-09-town-plan-view-design.md` — idea **I-088**, captured, not yet
refined. It carries the schema, the scale contract, the T1–T7 gate rules, the collision binder and
the Millcross derivation. **Read it; do not redesign it.** Its four decisions are settled with the
owner:

| | |
| --- | --- |
| **D1** | town is **~200 world units** across — ten seconds to cross |
| **D2** | the plan lives in **its own local coordinate space**, anchored to the geography `at` point |
| **D3** | the **collision binder ships with it** — data nothing can collide with is inert |
| **D4** | **Millcross only**; the other five follow once the pattern is proven |

### 3.2 The scale numbers — measured, not invented

| fact | value | source |
| --- | --- | --- |
| player radius | **1.3**, hard-clamped | `colyseus-server/src/schemas/Player.ts` |
| mob radii | **3 – 5** — mobs are *bigger* than players | `src/config/mobs/definitions/*.ts` |
| player speed | **20 u/s** | `Player.ts` |
| world | 1000 × 1000 units | `src/config/gameConfig.ts` |
| **static collision bodies in the whole game** | **4** — the world boundary walls | `src/physics/PlanckPhysicsManager.ts` |
| map data converted to collision | **none** | verified — no `regions`/`mapConfig` reference in the physics manager |

Derived widths: a road mobs use must clear **12 units** (largest mob radius 5 → diameter 10, plus
clearance); a player-only alley **4 units**. The 12 is counter-intuitive and correct — a street
sized for a player is impassable to a bramble drake.

**Good news the previous session verified: the engine already supports this.** Planck static bodies
work — the four world walls prove it. The capability exists; only the authoring and the wiring are
missing. This is a content problem, not an engine problem.

### 3.3 Millcross is dictated by canon — transcribe, do not invent

`docs/worldbuilding/A1-geography-cluster1.md` §6:

> *"A town with **no wall and no plan**, built along **both banks** of a river crossing and spilling
> a quarter-mile up each road out of it… one tall thing, the **mill-wheel housing over the race**…
> First thing a traveller sees: **the cart queue**. It starts before the town does, sometimes a mile
> out… the refugee camps on the east bank never came down, and the tents have grown plank walls and
> doorframes."*

Which yields: a river across the middle · a ford where the road crosses · roads converging on it ·
ribbon sprawl along them · **no wall, no gate** · the mill at the race as the only two-storey mass ·
a plank-and-tent quarter east · a cart yard where the queue waits.

**Standing lesson from this repo: adding specificity is the fastest way to contradict canon.** In a
recent lore pass, four of six defects came from invented detail. Transcribe §6; invent only what it
leaves open, and say which is which.

### 3.4 The load-bearing gate rule

**T6 — connectivity.** The walkable area must be one connected region by flood fill: no sealed
courtyard, no island. It is the analogue of F-029's G4 and F-037's Z2 — the rule that makes
correctness provable by gate rather than by eye. A town that looks fine and cannot be walked is the
exact failure this feature exists to prevent.

**Test discipline, non-negotiable here.** This repo has shipped correct code that nothing pinned
**five times** in the last two features, and every single one was caught by mutation testing, never
by reading. So: **delete each rule and re-run.** If the suite stays green, that rule is unprotected.
Include a deliberately sealed courtyard and a road-overlapping footprint in the fixtures, or T4 and
T6 are decorative.

---

## 4. State — what is done, claimed, and parked

| item | state |
| --- | --- |
| **F-037** zone content | ✅ **shipped** to `release/1.7`. Ten zones with hazards/resources/landmarks, gate rules Z1–Z7. The `zones` season-1 budget line reads **10/10 met** for the first time. |
| **F-039** town art | **claimed**, worktree live. Tasks 1–2 shipped good tested infrastructure. Task 3 failed its gate. **Parked, not abandoned.** |
| **I-088** town plan | captured, spec written, **not refined**. This handoff's goal. |
| **release/1.7** | **7 shipped, not promoted.** Promote is R0 and belongs to the owner. |

### F-039 — what is worth keeping and what failed

**Keep:** `renderSegmentPng`, the `--control depth|segment` selector, a near-separation warning, and
a **prompt-lint guard** that throws before a job is queued. Suite went 79 → 143 passing. `--control
depth` still reproduces F-026 byte-for-byte.

**The prompt-lint guard is the session's most valuable find.** The pipeline was composing its
*positive* prompt by appending the *negative* word list as literal text — so the model was handed
`cars`, `trucks`, `power lines`, `paved roads` as tokens to attend to. **The guard was summoning
what it forbade.** Confirmed twice from data already on disk: F-026 recorded lattice pylons in 5/16
cells, and Cindervast's brief said *"there is no rubble"* while its renders showed rubble **4 of 4
times**. Diffusion models do not process negation.

**Failed:** regenerating the six town images. Four generations at ControlNet strengths 0.00–0.60 all
rejected. Two root causes, neither fixable by any knob that lane owned — the block-in is eight
axis-aligned rectangles that can only describe boxes, and the environment recipe runs
`flux-schnell` at **steps 8 / cfg 1**, values the repo's own character profile explicitly records as
producing *"flat vector cartoon output, not the house style"*. The six shipped placeholders were
made with `z_image_turbo` at **steps 24 / cfg 3** — the house recipe. **Switching environments to
schnell was a style regression nobody noticed.**

---

## 5. File these; do not chase them

Real, verified, and **outside this goal**. One backlog line each, then move on.

1. **Four unexplained zone-polygon overlaps** in `cluster1-geography.json` — `meltwash-terrace ×
   hollowmarch` 7.4%, `millcross-ford × rooktide-reach` 2.9%, `meltwash-terrace × thornveil` 1.0%,
   `meltwash-terrace × millcross-ford` 0.6%. (The two `ashvale-front` overlaps are intentional — it
   carries `gradient: true` and A1 §4.3 calls it a strip, not a band.) **Not blocking:** D2 puts the
   town plan in local space, so region topology is irrelevant to it. Chasing this is exactly the
   drift that produced this handoff.
2. **Environment recipe regression** — port the character recipe (`z_image_turbo`, img2img at
   denoise 0.82, steps 24, cfg 3, anchored) to environments. The block-in may work well as an
   **img2img anchor** even though it failed as a ControlNet signal: same data, right socket.
3. **`mob-bramble-stalker` lost its `validated` flag** — its approved image used a negation clause.
   Needs re-QC at seed 88421.
4. **The era block dropped a measured clause** (*"horizon is open farmland and low hills"* — false
   for tidal and upland towns) and widened materials. Not re-measured.

---

## 6. Traps

1. **A fresh worktree has no deps.** `npm install --prefix scripts`, and `( cd tools/art-forge && npm install )`.
2. **Never a bare `cd` in a command block** — it persists and breaks the next repo-root line. Use
   `--prefix` or an explicit `( … )` subshell.
3. **Never `$?` after a pipe** — it reports the last pipeline element. Redirect, then read it.
4. **`refine` overwrites the backlog `spec.md` with a skeleton.** Back it up first, restore after.
   Two sessions have been bitten.
5. **Another session works this repo concurrently.** It minted F-036 and F-038 mid-run and swept an
   untracked file into its own commit. Commit your files promptly; re-read claim state right before
   `refine`/`claim`.
6. **Check `git symbolic-ref --short HEAD` before committing.** A subagent left HEAD detached and a
   fix commit was reachable from no ref — merging would have shipped the tree the review rejected.
7. **Gate 1 (`precheck.sh`) runs neither the content gate nor the scripts suite.** CI runs both;
   Gate 2 runs the gate with `--require-complete`. Run them by hand before shipping.
8. The **art GPU box** is `mont-pc`, reachable only through a tunnel:
   `ssh -f -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100`. It binds localhost-only; its Tailscale
   address never works directly. Not needed for this goal.

---

## 7. First three moves

1. **Refine I-088 → F-NNN and claim it.** Back up `spec.md` first (trap 4). Then, inside the new
   worktree, `git merge release/1.7 --no-edit` — the claim script cuts from `main`, which lacks most
   of this content.
2. **Dispatch a plan agent** against `2026-08-09-town-plan-view-design.md`. Take back ≤15 lines.
3. **Exec → verify per task**, mutation-testing every gate rule. Report outcomes, not transcripts.

**Definition of done:** the owner can look at a rendered top-down map of Millcross, the gate proves
it is walkable, and `buildTownStatics` puts one static body under each building.
