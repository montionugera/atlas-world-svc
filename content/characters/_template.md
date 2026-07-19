---
id: my-character-slug            # must equal the filename (without .md)
assetKey: "mob:balanced"         # must exist in colyseus-server/generated/asset-keys.json
name: "Display Name"
role: enemy                      # enemy | boss | npc | player-skin
status: concept                  # concept -> forged -> shipped
tier: bespoke                    # tier the asset is EXPECTED at; only cross-checked
                                 # against the manifest once status is forged/shipped
stats:                           # descriptive enums — design intent, NOT balance numbers
  archetype: bruiser             # bruiser | skirmisher | tank | caster | support
  durability: mid                # low | mid | high
  speed: mid                     # low | mid | high
  threat: melee                  # melee | ranged | zone
links:
  story: []                      # bible section ids, e.g. [faction-ashfang]
---

## Lore

Who this character is, why it exists in the world. Anchor to bible nouns
(factions, regions) — do not invent new world nouns here; add them to
`content/story/bible.md` first.

## Visual Brief

The forge's input. Cover: silhouette, palette, scale target (world units),
donor/rig (Kenney kitbash or KayKit rig), distinguishing feature, and any
clip-mapping notes (`anims` override) if not using rig defaults.

## Design Notes

Optional: balance intent, behavior hooks, open questions.
