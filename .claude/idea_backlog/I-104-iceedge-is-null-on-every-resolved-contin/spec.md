---
title: "iceEdge is null on every resolved continent, including both ice caps"
id: I-104
status: idea
---

# iceEdge is null on every resolved continent, including both ice caps

## Problem

`content/world/resolved/continent-*.json`'s `iceEdge` key is `null` on all 13 resolved continents (verified at 786a709, e.g. `continent-11.json:330`, `continent-12.json:463`), including `n-rimewall-cap` (96.9% ice, `class:"cap"`) and `n-skerryfast` (75% ice). No ice-edge feature is ever emitted anywhere in the world. Task 8 (F-051 completion) hit this directly: the Wealdmarch continent sheet's note reads "iceEdge none in the resolved doc" instead of drawing it — the draw path is proven live through an injected content root, so it is dormant for want of DATA, not because the code is dead.

## Why now

Ruling 8 (STATE §28) names `iceEdge` as one of the five resolved subject keys the retired basin sheet's successor is meant to draw from. Nobody has decided whether the resolved-join pipeline should populate it for ice-bearing continents, or whether the two ice caps should render without an ice edge by design.

## Sketch

(rough shape; not a design yet)
