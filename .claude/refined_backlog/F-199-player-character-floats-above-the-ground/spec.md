---
title: "Player character floats above the ground in Maro Bell (feet not on the ground); check model pivot/foot offset and block-top ground sampling in VerticalSliceRoot/TerrainElevation"
id: F-199
status: refined
from_idea: I-274
---

# Player character floats above the ground in Maro Bell (feet not on the ground); check model pivot/foot offset and block-top ground sampling in VerticalSliceRoot/TerrainElevation

## Problem

The player appears to float above the ground in the main scene. The HUD reads Alt +0.04 m [GROUND], so the height value is fine; suspect the model pivot or foot offset.

## Sketch

Measure the lowest vertex of the loaded player model against PlayerAvatar.Position.Y in the main scene; correct the offset the way the sandbox does (GROUNDED check).

## Acceptance criteria

- [ ] A probe measures the player model's lowest point within 0.02 m of the ground height in the main scene.
- [ ] A main-scene render shows the feet touching the ground (owner looks).
