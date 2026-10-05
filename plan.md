# Implementation Plan: F-054 AI separation and targeting query the existing spatial grid

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-054-ai-separation-and-targeting-query-the-ex`  
**Branch:** `feat/F-054`  
**Goal:** Eliminate the $O(N^2)$ all-pairs loops in mob AI by pointing separation and targeting at the existing `SpatialHash`, bringing 300 players $\times$ 1,000 mobs p95 under the 50 ms budget.

---

## Task 1: Spatial Grid Management in AIWorldInterface
- **File:** `colyseus-server/src/ai/AIWorldInterface.ts`
- **Action:**
  - Import `SpatialHash` and `SpatialEntity` from `../interest/SpatialHash`.
  - Maintain a `SpatialHash<AISpatialEntity>` with `cellSize = 50`.
  - Add `rebuildSpatialGrid(tick: number)` method that clears and indexes all alive players, npcs, and mobs once per tick. Guard with `lastRebuildTick`.
  - Expose helper query methods: `queryRadius(x, y, radius)`.
- **Verify:** TypeScript compiles cleanly: `cd colyseus-server && npm run typecheck`.

## Task 2: Refactor calculateSeparation to Use Spatial Grid
- **File:** `colyseus-server/src/ai/AIModule.ts`
- **Action:**
  - In `calculateSeparation(agent: IAgent)`, replace the `for (const { agent: other } of this.agents.values())` loop with a localized query against the spatial grid within `maxSeparationRadius` (~25–30 units).
  - Preserve identical separation force math, normalization, and team filtering.
- **Verify:** `cd colyseus-server && npx jest src/tests/boundary-avoidance.test.ts`.

## Task 3: Refactor pickTarget and getNearestMob to Use Spatial Grid
- **File:** `colyseus-server/src/ai/AIWorldInterface.ts`
- **Action:**
  - In `pickTarget(agent, position, myTeamId, perceptionRange)`, query `spatialHash.queryRadius` using `perceptionRange` (default 50 or agent's configured range).
  - In `getNearestMob(position, excludeId, searchRadius)`, query `spatialHash.queryRadius` using `searchRadius` (~100 units).
  - Invariant preservation: if the threat table has an active taunt or threat targets, guarantee those targets are included in candidate list even if beyond base perception range.
- **Verify:** `cd colyseus-server && npx jest src/tests/ai-mob-decision.test.ts src/tests/ai-npc-targeting.test.ts`.

## Task 4: Unit Test Suite Verification
- **Action:** Run all existing AI tests to prove zero behavioral regressions.
- **Verify:** `cd colyseus-server && npx jest src/tests/ai-*.test.ts src/tests/bot-mode.test.ts`.

## Task 5: Load Harness Capacity Benchmark
- **Action:** Run `roomLoad.harness.ts` to verify capacity targets.
- **Verify:** `cd colyseus-server && npm run load 2>&1 | grep -E "^(OK|OVER|Capacity)"` confirms 300 players $\times$ 1,000 mobs passes with p95 $< 50\text{ ms}$.

## Task 6: Linter & Precheck
- **Action:** Run formatting and precheck.
- **Verify:** `cd colyseus-server && npm run lint && npm run typecheck`.
