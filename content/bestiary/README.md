# Bestiary — Undertow Monster Roster

`bestiary.json` is a **design-data** roster of 116 monsters for the Undertow
world. It is organised the way a level-band monster database is organised:
every entry carries a level band, a family, an element, a combat shape, a
home region, and a faction, so a designer can ask "what fights in the
Ashvale Front at 31–40?" and get an answer.

## This is design data only — these are not game entities

Nothing in this file is playable and nothing here spawns. A monster becomes
a game entity only when **both** of the following exist:

1. a server mob type in `colyseus-server/src/config/mobs/definitions/`,
   regenerated into `colyseus-server/generated/mob-types.json`; and
2. an `assetKey` present in `colyseus-server/generated/asset-keys.json`,
   with a matching entry in the art manifest at the declared tier.

A character sheet under `content/characters/` that names an `assetKey` which
does not exist is a **hard gate failure** — see `scripts/check_content.mjs`
(the asset-key link check, around line 512). That is why this roster lives in
its own directory as plain JSON and deliberately declares **no** `assetKey`,
`status`, or `tier`: it is a design backlog to draw from, not a shipping
manifest. Promoting one entry into the game means writing a real character
sheet, forging the asset, and re-running the gate — one monster at a time.

The gate does not read `content/bestiary/`. Adding or editing this file
cannot change gate output.

## Record shape

Every object has exactly these thirteen fields.

| Field         | Meaning                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`          | kebab-case, unique, `mob-` prefixed                                                                           |
| `name`        | display name; obeys the naming morphology in `content/story/style.md` §2                                      |
| `family`      | one of the twelve families below                                                                              |
| `levelBand`   | one of `1-10`, `11-20`, `21-30`, `31-40`, `41-50`, `51-60`, `61-70`, `71-80`                                  |
| `element`     | one of `earth`, `water`, `wind`, `fire`, `holy`, `void`, `neutral`                                            |
| `archetype`   | one of `bruiser`, `skirmisher`, `tank`, `caster`, `support` — matches `content/schemas/character.schema.json` |
| `threat`      | `melee`, `ranged`, or `zone`                                                                                  |
| `durability`  | `low`, `mid`, `high`                                                                                          |
| `speed`       | `low`, `mid`, `high`                                                                                          |
| `region`      | one of the nine regions below                                                                                 |
| `faction`     | one of the nine faction ids below                                                                             |
| `lore`        | 2–4 sentences, Ashen Vigil voice (`style.md` §1)                                                              |
| `visualBrief` | silhouette and distinguishing marks; written to drive concept-art generation later                            |

`archetype`, `durability`, `speed`, and `threat` are **design intent only**.
Numbers — HP, damage, cooldowns — stay server-side, per the source-of-truth
boundary in `content/README.md`.

## Families (12)

Families are ecological, not taxonomic: they answer "what kind of thing is
this and where does it come from," which is what makes a region's roster feel
like one place.

| Family        | What it is                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `war-scar`    | Things the unburied battlefields grow. Always Void-line (canon §5).                                                                             |
| `beast`       | Ordinary animals — pack hunters, draft stock gone feral, vermin.                                                                                |
| `undead`      | Bodies that stood back up, with a person's habit still in them.                                                                                 |
| `automata`    | Builder School clockwork driven by magic stones (canon §5) — dock cranes, gate sentries, tally-walkers, still running their last order.         |
| `spirit`      | Bodiless things: wisps, shades, echoes. Weather, grief, and cold with an outline.                                                               |
| `insect`      | Ticks, borers, swarms, weavers. The frontier's small constant tax.                                                                              |
| `plant`       | Bramble and thorn. Almost entirely Thornveil; holds ground rather than chasing.                                                                 |
| `raider`      | Hostile people — Thornveil skirmishers, Ashen Column, road wreckers.                                                                            |
| `drake`       | Scaled things, winged and wingless, that sit at the top of a region's food chain.                                                               |
| `giant`       | Oversized humanoid things: moor giants, slag hulks, ice colossi.                                                                                |
| `relic-born`  | Woken by Cindervast's relic residue and the violet afterglow. **Distinct from war-scar** — the fall had its own cause (canon §1), not the void. |
| `bound-beast` | Gildmark's harnessed and warded war-beasts, loose or never delivered (canon §4, `style.md` §6 rule 2).                                          |

## Level bands

Eight bands, in a pyramid rather than a flat spread — a frontier has far more
small trouble than large.

| Band  | Count |
| ----- | ----- |
| 1-10  | 22    |
| 11-20 | 20    |
| 21-30 | 18    |
| 31-40 | 16    |
| 41-50 | 14    |
| 51-60 | 12    |
| 61-70 | 8     |
| 71-80 | 6     |

Band correlates with distance from a town gate, not with magical exotica:
1-10 is the mill pond and the hedgerow; 71-80 is the middle of the Ashvale
Front and the deepest ruin districts of Cindervast.

## Elements, and how they follow canon §5

`content/story/canon.md` §5 is binding here. The rules this roster is built on:

- **Four elements turn in a circle.** Water puts out fire, fire cracks earth,
  earth swallows wind, wind scatters water. A creature's `element` is its
  **defensive** nature — what it is made of — which is what a party plans
  around.
- **Holy and Void are a matched pair outside the circle**, each the other's
  undoing, and plain against the four.
- **Neutral is plain matter** — most people, most beasts, most steel. Used
  here for road raiders, harbor automata, and vermin with no elemental nature
  at all.
- **War-scar monsters are Void-line** (canon §5, stated outright). Void is
  concentrated accordingly: **28 Void entries, 25 of them in Ashvale Front or
  Cindervast**, and half of them in `war-scar` alone (14). The rest are
  `drake` 4, `undead` 3, `spirit` 2, `insect` 2, `relic-born` 2, `automata` 1
  — every one of them hatched, risen, or corrupted on war ground. No Void
  beast and no Void plant exists in this roster: the void gets into what the
  war left behind, not into ordinary living things.
- **Holy is rare and Bellfaith-adjacent.** All 5 Holy entries carry
  `faction: bellfaith`, and every one of them is the Bell School's answer to
  the war-scars turned loose or turned wrong — a warden who could not stop
  ringing, a body the holy work cleaned and did not release. That is why they
  are hostile: not evil, unstoppable.
- **No entry quotes a number.** `style.md` §6 rule 5 — lore names an element
  and stops. Multipliers live in combat code.

Element distribution: `void` 28, `earth` 20, `fire` 20, `water` 17,
`neutral` 14, `wind` 12, `holy` 5.

## Regions (9)

Real geography only, from canon §4. Weighted toward Millcross's frontier and
the Ashvale Front, which is where the game and the war both are.

| Region value        | Place                                                        | Count |
| ------------------- | ------------------------------------------------------------ | ----- |
| `ashvale-front`     | The dead ground between Embervale and Norhollow              | 26    |
| `millcross`         | The hub and its frontier — meadow, mill, trade roads, quarry | 19    |
| `cindervast`        | The fallen city, north-west beyond the front                 | 15    |
| `thornveil`         | Bramble forest east of Millcross                             | 14    |
| `northern-icefield` | The frozen shelf north past the expedition camp              | 13    |
| `gildmark`          | The coast and its deepwater port                             | 10    |
| `embervale`         | Forge town, west of the Ashvale plain                        | 7     |
| `norhollow`         | Palisade town, east of the Ashvale plain                     | 7     |
| `rooktide`          | Inland, south of Millcross, off the war road                 | 5     |

Regional ecology is meant to hold: icefield rosters are white-on-white
ambushers, giants, and frozen Stoneguard; Thornveil is plants, spear-throwers,
and things that push through cane; Gildmark is automata and bound beasts off
the manifest; the Ashvale Front is war-scars and the Bellfaith's answer to
them.

## Factions (9)

Faction values are the short forms of the ids in
`content/story/factions.json` — `unaligned` here means `faction-unaligned`
there, `ashfang` means `faction-ashfang`, and so on.

| Faction value      | Count |
| ------------------ | ----- |
| `unaligned`        | 86    |
| `thornveil`        | 8     |
| `bellfaith`        | 5     |
| `stoneguard`       | 4     |
| `ashen-column`     | 4     |
| `ashfang`          | 3     |
| `expedition`       | 2     |
| `embervale-banner` | 2     |
| `norhollow-banner` | 2     |

Most wild things are `unaligned` on purpose — the Undertow's monsters are the
war's residue, not an organised enemy army (`style.md` §6 rule 1). A banner
value means the creature still carries that side's identity: a Norhollow guard
still counting his dead, Embervale hounds bred on the forge floor, expedition
draft oxen with the harness still on.

`faction-gildmark-council` has no entries. Gildmark's monsters are its
merchandise and its machines, and neither belongs to the Council once it is
off the manifest.

## Combat shape distribution

| Archetype    | Count |     | Threat   | Count |
| ------------ | ----- | --- | -------- | ----- |
| `bruiser`    | 34    |     | `melee`  | 73    |
| `skirmisher` | 31    |     | `ranged` | 23    |
| `tank`       | 22    |     | `zone`   | 20    |
| `caster`     | 21    |     |          |       |
| `support`    | 8     |     |          |       |

`bruiser` and `skirmisher` lead, as intended. `support` is deliberately the
rarest — a monster that makes other monsters worse should be a recognised
problem on sight, not background noise.

## Authoring rules for additions

1. Read `content/story/canon.md` §4 and §5 and `content/story/style.md`
   before writing a line. Contradicting canon is a review finding (canon §6).
2. Names follow `style.md` §2: terse Ashen Vigil compounds. Gilded Rot
   house-and-title naming is reserved for Gildmark's offices and machines.
3. Lore is 2–4 sentences, concrete nouns, understated, landing in one read.
   Ban list: okay, guys, tech, percent, boss.
4. Keep the pyramid: adding at 71-80 means adding more below it.
5. Void stays on the war-scar line and the war ground. Holy stays rare and
   Bellfaith-adjacent.
6. Do **not** add `assetKey`, `status`, or `tier` fields here. Those belong
   to a character sheet under `content/characters/`, and only once a real
   asset exists.
