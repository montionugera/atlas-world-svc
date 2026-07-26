---
title: "World Wisdom: magic elements + schools + 8 races x 8 classes system (lore + gameplay classes)"
id: I-026
status: idea
---

# World Wisdom: magic elements + schools + 8 races x 8 classes (lore + gameplay classes)

## Problem

The Undertow world has deep history/politics/economy but no knowledge-and-power system:
who can use magic, who teaches what, what classes exist. Without it, character/mob/skill
design has no spine, and the new 8-race x 8-class artwork (already in the storybook,
commit 4bd18f8) has no canon behind it.

## Owner decisions (locked 2026-07-27, chat)

1. **Magic is WIDESPREAD in the current era** — not lost/shattered knowledge.
   (Consequence: needs reconciliation with novel/canon where the caravan burns and the
   war is fought with steel — see Open Questions.)
2. **Void is NOT tied to Cindervast** — it is simply the 5th element (Earth, Water,
   Wind, Fire, Void). Cindervast's fall keeps its own cause (Last King + unmaking weapon).
3. **Robot = clockwork automata powered by MAGIC STONES** (not wind-up, not sci-fi).
4. **This is BOTH a gameplay class system AND lore** — the 8x8 class art grid is the
   visual reference for playable classes.

## Sketch

Four wisdom branches (owner-defined):
- **Magic**: Earth, Water, Wind, Fire, Void — Elements Schools
- **Physical**: Sword, Spear, Dagger, Bow, Shield; materials Steel–Wood — Sword School etc.
- **Mix**: Robot (magic-stone automata — Builder School), Summoner
- **Healer**: Divine — Bell School (Bellfaith)

8 playable classes (art locked in storybook): Swordsman, Archer, Assassin, Spearman,
Mage, Summoner, Engineer, Healer.
8 races (art locked): Human, Demon, Dwarf, Immortal (Angel), Elf, Dragon, Beastkin
(kemonomimi: human face + animal ears/tail), Ogre.
Muscularity gradient canon: race axis (Elf lightest -> Ogre heaviest) x class axis
(Mage lightest -> Swordsman heaviest), score 6.0-8.5.

School-to-town mapping (draft, from chat): Builder School = Gildmark (Dwarf artisans,
arms industry -> magic-stone automata as next product line); Divine = Bellfaith
(Immortal healers; church monopolizes news AND healing); Elements Schools split by
region (Embervale fire/earth, Norhollow/Rooktide water/wind); Physical schools
everywhere; Summoner = Millcross (stateless, war-scar beast affinity).

## Open questions (must answer in refine)

- Reconcile widespread magic with The Undertow canon/novel: why is the sister-town war
  fought with steel and fire-by-hand? (candidates: magic-stone economics — stones are
  the scarce ammo; treaty bans battle-magic between the sister towns; Gildmark sells
  stones and steel alike and profits from scarcity). MUST be settled before backport.
- Who mines/controls magic stones? (natural fit: Gildmark trade + Embervale mines —
  ties into existing war-economy canon)
- Race-class affinities: free choice vs stat leanings.
- Where classes live server-side (Colyseus player schema? Nakama meta?) — C-phase concern.

## Assets already done

64 class artworks + 8 race concepts + pipeline (Z-Image + silhouette proportion lock +
muscle gradient) in tools/asset-storybook (commits 9355f05..49fd6c4 on release/1.4).
