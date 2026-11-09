---
title: "Player character in Godot: messy black outline shells over the model (should be a clean anime line); check inverted-hull outline_thickness 0.0065 in EntityView.cs against the pipeline char mesh"
id: I-273
status: idea
---

# Player character in Godot: messy black outline shells over the model (should be a clean anime line); check inverted-hull outline_thickness 0.0065 in EntityView.cs against the pipeline char mesh

## Problem

The player in the main game scene has a scribbly, broken dark outline (rendered on release/1.30, ATLAS_MAP_ID=maro-bell, /tmp/atlas_actual_render.png). The sandbox character looks clean.

## Sketch

Compare inverted-hull outline (outline.gdshader, thickness 0.0065) on the character that loads in the main scene vs the sandbox; fix thickness/normals or skip the outline for that material.

## Acceptance criteria

- [ ] A new render of the main scene at the same camera shows one continuous thin outline on the player, no broken or scribbled strokes (owner looks).
- [ ] The cause is recorded in the spec (which model, which material, why the outline broke).
