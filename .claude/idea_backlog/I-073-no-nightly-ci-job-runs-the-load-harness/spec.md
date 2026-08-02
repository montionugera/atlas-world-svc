---
title: "No nightly CI job runs the load harness, so the capacity table will silently rot"
id: I-073
status: idea
---

# The capacity table has no way to stay true

## Problem

The seamless-world design specifies the load harness should run **"manually and in a nightly CI job"**. F-027 shipped the harness and the `npm run load` script (`colyseus-server/package.json`), but no CI job.

The capacity table committed on 2026-08-02 is therefore a **single dated snapshot**. Every future change to physics, AI, combat, or entity schemas moves the real ceiling with nothing to notice.

This matters more than a normal stale-docs problem because that table is the designated input to the `cellSize` decision for Stage 3 of the seamless-world work. A stale capacity number is worse than no number — it looks like evidence.

## Why now

The table exists and is trustworthy right now. Every day without a job is drift accumulating against a baseline nobody is re-measuring. Wiring it up while the harness is fresh is far cheaper than reconstructing why the numbers moved six months from now.

## Sketch

- Nightly GitHub Actions workflow running `npm run load` in `colyseus-server`.
- Publish the printed table as a build artifact, and append to a committed history file so trends are visible over time.
- **Fail only on harness error, never on timing.** CI runners have variable performance; a timing-gated job would be permanently flaky and would train everyone to ignore it. Surface the numbers; do not gate on them.
- Note in the workflow that the harness is paced to real wall-clock time (required for correctness — see I-069), so runtime scales with the sweep grid. Size the grid to the runner budget.
- Optional follow-up: alert only on a large relative move against the previous night, not against an absolute threshold.
