---
title: "Map mob:* asset keys to glb scenes so promoted mobs stop rendering as nothing: the storybook COVERAGE section red-cards four unmapped keys (bramble_stalker, veil_spearling, bramble_drake, thorncrown_drake). plantwarrior.glb suits bramble_stalker, but EVERY model in game-client/assets/characters is humanoid — the two drakes need a quadruped source first, and a half-wrong mapping is worse than an honest red card"
id: I-078
status: idea
---

# Map mob:* asset keys to glb scenes so promoted mobs stop rendering as nothing: the storybook COVERAGE section red-cards four unmapped keys (bramble_stalker, veil_spearling, bramble_drake, thorncrown_drake). plantwarrior.glb suits bramble_stalker, but EVERY model in game-client/assets/characters is humanoid — the two drakes need a quadruped source first, and a half-wrong mapping is worse than an honest red card

## Problem

Four server-real mobs render as **nothing** in the client.

The asset storybook's COVERAGE section red-cards every codegen key with no manifest entry.
After F-031 that list is four:

| key | state |
| --- | --- |
| `mob:bramble_stalker` | no manifest entry — kind: character |
| `mob:veil_spearling` | no manifest entry — kind: character |
| `mob:bramble_drake` | no manifest entry — kind: character |
| `mob:thorncrown_drake` | no manifest entry — pre-existing, from F-030 |

All four spawn, chase and attack on the server. None has a `.glb`. F-031 took this list
from 1 to 4.

No gate catches it: `check_content.mjs` only requires a manifest entry when a sheet is
`status: forged` or `shipped`, and all four are `status: concept`.
`check_asset_manifest.mjs` reports them UNMAPPED but runs stage-0 (warning) and is not run
by `integration.sh` at all. The storybook is currently the only place this is visible.

## Why now

Four is the point where it stops being one boss's rough edge and becomes the default state
of every promoted mob. Each future promotion lane adds to the pile.

## Sketch

The tempting move — map each key to an existing CC0 model — is **only half available**, and
resolving that is the crux:

- `game-client/assets/characters/` holds ~50 models. `plantwarrior.glb` genuinely suits
  `bramble_stalker`; `rogue` / `marksman` / `archer` could carry `veil_spearling`.
- But **every one of them is humanoid**. There is no quadruped in the library, so
  `bramble_drake` (cart-length, radius 5) and `thorncrown_drake` (barn-sized, radius 9)
  have no truthful source at all.

Mapping a barn-sized quadruped onto a humanoid body creates false visual canon that then
sticks — the same trap the humanoid *art* anchor sprang in F-031. Four honest red cards beat
a half-wrong mapping.

So the real work is: **source quadruped models first** (CC0 hunt, or asset-forge/Blender per
the F-003 kitbash procedure), then map all four in one pass and flip the sheets to
`status: forged`. Decide in the brainstorm whether the two humanoids get mapped early as a
partial win, or held so the set lands coherently.
