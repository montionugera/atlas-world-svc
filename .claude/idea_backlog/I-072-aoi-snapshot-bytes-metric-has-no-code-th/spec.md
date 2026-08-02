---
title: "aoi_snapshot_bytes metric has no code — the Stage 1 payoff is invisible in production"
id: I-072
status: idea
---

# The AOI bandwidth win is invisible in production

## Problem

The seamless-world design (`docs/superpowers/specs/2026-08-01-seamless-large-world-scaling-design.md`, Observability) names `aoi_snapshot_bytes` as **"the Stage 1 payoff metric"**. F-027 shipped Stage 1. The metric was never implemented.

A Prometheus exporter already exists (`http://localhost:9091/metrics`, Grafana on 3000), so there is no infrastructure to build — only the instrumentation.

Today the 68× bandwidth reduction (41,280 bytes → 600 bytes for one player among 200 mobs) exists **only inside a test assertion**. In production there is:

- no evidence the filtering is actually working against real traffic,
- no signal if a future change silently widens what each client receives,
- no data to size `aoiRadius`, which is still an unvalidated placeholder (`AOI_CONFIG.radius = 150`).

## Why now

The value is highest immediately after shipping, while there is a known-good baseline to compare against. A regression that lands before the metric exists will not be attributable afterwards.

## Sketch

- Emit encoded per-client view size as a Prometheus histogram, sampled every N ticks rather than every tick.
- Label by room so a hot room is identifiable.
- Add a companion `aoi_visible_entities` gauge — bytes alone do not distinguish "many entities" from "large entities".
- Add a Grafana panel alongside the existing dashboards.
- Use the observed distribution to replace the placeholder `AOI_CONFIG.radius` with a measured value.
