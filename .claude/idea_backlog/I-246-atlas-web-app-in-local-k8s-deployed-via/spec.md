---
title: "Atlas web app in local k8s deployed via release: images and Game DB"
id: I-246
status: idea
---

# Atlas web app in local k8s deployed via release: images and Game DB

## Problem

Owner, 2026-11-01: "for image change and Atlas Game DB we can having small app in local k8s and deploy via release".

Today the atlas-world web surface is not a cluster workload. `scripts/deploy-local.sh` says it is a Mac host process, `scripts/catalog_explorer_web.py` on port 8788, and the cluster reaches it through the `atlas-world-studio-host` service. What it shows follows whichever checkout started it, not a release.

## Why now

Owner wants image changes to land predictably through the standard release flow.

## Sketch

Small app in namespace `atlas-world`, context `orbstack`, built and rolled out by `scripts/deploy-local.sh`, serving concept art and game data from a release-built image.

Undecided, for brainstorming: what "Atlas Game DB" means here (no code uses that name), whether this replaces the port 8788 host process or sits beside it, and how live panels that read the working tree keep working.

## Acceptance criteria

- [ ] To be written in brainstorming, before refine.
