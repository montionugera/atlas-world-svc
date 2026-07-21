# Atlas World Bible — v0

Free-prose source of truth for setting, tone, factions, regions. Character
sheets anchor to the ids in parentheses via `links.story`. Formal schema
lands with roadmap #3; until then, keep ids stable (kebab-case headings).

## Premise (premise)

Atlas is a fractured frontier continent. Expedition parties (players) push
out from a fortified meadow camp into wilds that were sealed for a
generation and did not stay empty. Every creature out there belongs to
something — a pack, an order, a leftover war. Nothing attacks for no reason.

## Tone (tone)

Grounded low fantasy, readable at a glance: chunky silhouettes, warm camp /
cold wilds contrast. Danger is territorial, not evil — mobs defend, hunt, or
patrol; they don't scheme. Naming: hard consonants for hostiles (Ashfang,
Stoneguard), softer compounds for places (Thornveil, Icefield).

## Regions

### Spawn Meadow (region-spawn-meadow)
The safe-ish landing: tall grass, expedition tents, training dummies. Zone
effects here are practice hazards, not threats.

### Northern Icefield (region-icefield)
~175u north of camp: a frozen shelf where freeze/stun zones occur naturally.
Home turf of the Stoneguard. First real difficulty step.

### Thornveil (region-thornveil)
Bramble forest east of the meadow — dense sightlines, ranged ambushes.
Spear-thrower territory.

## Factions

### Ashfang packs (faction-ashfang)
Aggressive pack hunters — scarred hide, ember-red markings. Charge on
sight; overwhelm through pressure, not tactics. (Asset key family:
`mob:aggressive`.)

### Stoneguard remnant (faction-stoneguard)
A defensive order that outlived whatever it guarded. Slate-grey, broad,
slow; holds ground and punishes overreach. (`mob:defensive`.)

### Thornveil skirmishers (faction-thornveil)
Lean, fast, territorial spear-throwers of the eastern brambles. Strike from
range, relocate, repeat. (`mob:spear_thrower`.)

### Unaligned wilds (faction-unaligned)
Creatures the factions never claimed — no pack, no order, no territory of
their own. They drift the meadow's edge and the ground between regions.
`mob:balanced` walks the middle line of everything; `mob:hybrid` mixes a
thrown strike with a closing one; and their apex, the twin-striking
`mob:double_attacker`, hits twice before a slower thing hits once — the
meadow's first true wall (`role:boss`).

### The Expedition (faction-expedition)
The player's own side: the party that reopened the meadow and the camp that
supports it. The `player` is an expedition member; the camp `npc` is its
quartermaster, holding the line between the tents and everything past them.
Anchored physically in `region-spawn-meadow`.

## Timeline (timeline)

v0 stub — one era: "the Reopening" (now). Expand when quests need history.
