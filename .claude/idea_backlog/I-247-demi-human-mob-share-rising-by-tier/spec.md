# I-247 Demi-human mob share rising by tier

Status: idea, not designed. Needs brainstorming and an owner-approved spec before refine.

## Owner request, 2026-11-01
"for mobs should we design in the way that some of our mobs ~ 30 % look like Demi-human especially high tier". The owner's example was a dragon-headed upright boss sheet with claws, tail, scale armour and cloth. It stays outside the repo: never upload it, never copy its design.

## Measured today (content/studio/t_shaped_world_atlas.json, about 290 hostile rows)
- Humanoid by race label: 21 dark_lunar, 4 ogre_orc, about 9%. Raid tier: 0.
- 65 of 66 raid and 63 of 67 mini-boss rows are `robotic`. This looks like a filler default, unconfirmed. Check first.

## Draft targets, about 32% overall
| Tier | Rows | Demi-human share |
|---|---|---|
| Normal | 92 | 15% |
| Mini-boss | 67 | 30% |
| Raid | 66 | 40% |
| MVP | 67 | 50% |

## Constraints
- Must not read as a playable race. Human/Demi-Human, Furral and Ogre/Orc are playable, so require a monster head plus a tail or clawed feet, and no human face.
- Kiln-Saint Pyraea stays fully insect (owner, 2026-11-01). High tier needs both kinds.
- Boss scale stays 7x player or more. Rig sharing is a hypothesis to test, not a fact.
