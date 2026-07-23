# The Undertow — Theme Bible (`style.md`)

This is the voice law for every node in the Undertow epic (and any epic
authored after it): every `title`, `summary`, narrative field, dialogue
line, and lore `body` must obey the sections below. It binds authoring
agents and reviewers editorially — there is no schema or gate machinery
behind it (see `docs/superpowers/specs/2026-07-23-grand-epic-undertow-design.md`
§1). When in doubt, reread this file before writing prose, not after.

## 1. Global tone rules

The world speaks in two registers. Nothing is written in a third.

### Ashen Vigil (the world's body)

Wind-worn frontier grit. Short sentences. Concrete nouns — crates, bells,
shovels, letters — never abstractions standing in for them. No modern
vocabulary. Grief is present in nearly every Ashen Vigil line and it is
always **understated** — stated as a fact of the day, never performed as
melodrama. A character who has lost someone does not announce it; the
prose lets the reader notice what isn't being said.

Sample lines:

- "The crates came through with no maker's mark, same as the ones before
  them. Nobody asked. Everybody noticed."
- "She didn't cry at the burial. She counted the shovels instead, and
  made sure there were enough."
- "Three letters this week, all opened before they reached her hands. She
  reads them anyway. It's habit now, not hope."
- "Winter took the fences down to firewood. Nobody argued. There'll be
  another winter to build them back up in."

### Gilded Rot (the antagonist bloc's skin)

Decayed opulence speaking in ledger-and-chronicle diction. Every threat is
phrased as an inconvenience of accounting; every act of cruelty is filed
under a heading that makes it sound routine. The menace is in the
politeness, never in raised volume.

Sample lines:

- "The ledger shows no wrongdoing — only entries, and entries are never
  wrong, only inconvenient."
- "We regret the delay to your mercy convoy. Regrettably, the harbor
  tariff must clear before mercy can."
- "A gift, not a bribe. The distinction is in the paperwork, and we keep
  excellent paperwork."
- "Every war needs a quartermaster. We simply keep the accounts honest,
  on both sides of the line."

### Ban list (both registers, no exceptions)

Never write: **okay, guys, tech, percent, boss**. These break both
registers — they are modern-vocabulary tells. If a line needs one of
these ideas, find the period-appropriate concrete noun instead (a
"percent" becomes "one crate in five"; "tech" becomes the specific
device — far-mirror, message-bird, relic).

Grief rule applies globally, in both registers: understated, never
melodrama. A villain's Gilded Rot cruelty can be theatrical in its
politeness, but a death, in either register, is never wept over on the
page — it is carried.

## 2. Naming morphology

- **Ashen Vigil names** are terse compounds — two plain words fused or
  paired, sometimes with an epithet: *Millcross, Rooktide, Farrow the
  Forward, Twin-Strike*. No titles of nobility, no honorifics beyond an
  earned epithet.
- **Gilded Rot names** are house-and-title — an office or a bloodline
  standing in for a person, the way a ledger names an account rather
  than a hand: *the Harbor Council, the Iron Regent, the Broker*. The
  definite article ("the") is part of the name; it turns a role into an
  identity, which is the point — Gildmark deals in offices, not people.
- **Rule:** every new name in this epic must fit cleanly into one
  register or the other. A name that could pass for either (or neither)
  gets rewritten before it ships. Mixing — a terse compound wearing a
  Gilded Rot "the" — is reserved on purpose for characters who move
  between the two worlds (none exist yet; if one is ever written, it is
  a deliberate signal, not an accident).

## 3. Town identity table

| Town | One-line identity | Palette words | Costume motif | Emblem | Diction quirk |
|---|---|---|---|---|---|
| **Millcross** | Where every road's leftovers end up, and every leftover finds a place to stand. | ash-grey, rope-brown, tallow-yellow | patched wool, mismatched buttons, a knotted cord for every family member gone | crossed roads over an empty bowl | counts things in meals and miles, never in coin |
| **Embervale** | A town that grieved its way into a war it didn't start. | iron-red, banner-black, hearth-orange | banded mourning cloth worn over old militia colors | a caravan wheel wreathed in ember-red thread | names Norhollow only by old kin-names, never the town's name — a way of denying the war is real |
| **Norhollow** | A town holding its palisade line and its temper by the same nail. | hollow-green, frost-white, weathered oak | layered furs over palisade-guard leathers, knotted tallies of the dead at the belt | a hollow bell over crossed stakes | answers questions with a tally count first, an opinion second, if ever |
| **Gildmark** | The port that sells peace by the pound and war by the crate — same ledger, different columns. | tarnished gold, wax-seal crimson, harbor-fog grey | frayed brocade, a wax-seal ring on every finger that matters | a harbor scale, one pan always sitting slightly lower | never says "no" — says "the ledger doesn't show room for that" |
| **Cindervast** | The city that answered a rebellion with a relic, and has been paying for it since. | cinder-black, bone-white, relic-violet afterglow | soot-marked wraps; the Cindered keep one untouched relic token hidden on the body | a broken crown over ash | the Cindered never say the city's old name aloud — only "the fall," or "home, once" |
| **Rooktide** | The town that came back — proof it can be done, if anyone's still willing to try. | rook-blue, tide-grey, new-thatch gold | rebuilt-and-mismatched on purpose: a plank from the old roof sewn into the new coat | a rook in flight over a rising tideline | measures time in "before the return" and "after" — nothing is dated by year |

## 4. Faction & people identity table

### Factions (10 — 5 existing, 5 new)

| Faction | Accent color | Costume motif | Mob family | One-line creed |
|---|---|---|---|---|
| `faction-ashfang` (Ashfang Packs) | rust-orange | bone-and-tooth trophies, pack-fur mantles | `mob:aggressive` | "The pack strikes first because the pack always has." |
| `faction-stoneguard` (Stoneguard Remnant) | bone-white / iron-grey | cracked ceremonial plate, oath-tablets worn as pendants | `mob:defensive` | "We guard the gate the city no longer has." |
| `faction-thornveil` (Thornveil Skirmishers) | bramble-green | bramble-woven leathers, throwing-spear harness | `mob:spear_thrower` | "Strike from the bramble; never be where you were seen." |
| `faction-unaligned` (Unaligned Wilds) | muted grey-brown, no true banner | feral, no shared motif | `mob:balanced`, `mob:hybrid`, `mob:double_attacker` | "No banner claimed us, so no banner commands us." |
| `faction-expedition` (The Expedition) | meadow-green | practical travel leathers, a quartermaster's tally-cord | — | "We keep what the road takes from everyone else." |
| `faction-embervale-banner` | iron-red | banded mourning cloth over old militia colors | `mob:balanced` | "We didn't start this. We intend to finish it." |
| `faction-norhollow-banner` | hollow-green | layered furs over palisade-guard leathers | `mob:defensive` | "Hold the line. Count the dead. Hold it again tomorrow." |
| `faction-gildmark-council` (the Harbor Council) | tarnished gold | frayed brocade, wax-seal rings | `mob:hybrid` | "Every war needs a quartermaster. We simply supply both." |
| `faction-bellfaith` | bell-bronze | bell-warden robes, one brass key at the collar | — | "The bell doesn't lie. The hand that rings it might." |
| `faction-ashen-column` (the Ash Prophet's raiders) | cinder-black / relic-violet | soot-wrapped, war-scarred beast harness | `mob:aggressive`, `mob:double_attacker` | "Everything standing is a lie waiting to fall. We hurry it along." |

### Peoples (6)

Peoples are lore-level identities, not factions — they carry no
`mobFamily` of their own (mark it `—`); playable races are out of scope
for this program (spec §10).

| People | Accent color | Costume motif | Mob family | One-line creed |
|---|---|---|---|---|
| human expedition-stock | meadow-green | practical travel leathers | — | "The road doesn't care where you started. Neither do we, much." |
| beast-blooded (Ashfang-adjacent clans) | rust-orange | tooth-trophy fur mantles, kin-echo of the packs | — | "Wild kin to a wilder people; the pack remembers who's blood and who's prey." |
| ice-born (Stoneguard descendant lineage) | bone-white / iron-grey | oath-tablet pendants passed down the line | — | "Descended from a guard whose gate is gone. We still keep the shape of guarding." |
| bramble-kin (Thornveil) | bramble-green | bramble-woven wraps | — | "Never be seen twice standing in the same place." |
| gild-blooded (old Gildmark merchant lines) | tarnished gold | wax-seal jewelry passed down as inheritance | — | "A ledger is a kind of memory. We remember everything, and forgive nothing." |
| the Cindered | cinder-black / relic-violet afterglow | soot-marked wraps, one hidden relic token | — | "We carry the fall with us so no one forgets it happened." |

## 5. Villain voice table

| Villain | Drive | One-line thesis | How they talk | Sample line |
|---|---|---|---|---|
| **the Broker** (`char-the-broker`) | IDEAL | "People don't want the truth. People want an enemy — give them one and they'll do the rest themselves." | Pure Gilded Rot: calm ledger-and-chronicle accounting, even discussing lives; never denies anything, only reframes it. | "I've never lied to you. I've only ever told you the truth at the moment it would cost you the most." |
| **the Iron Regent** (`char-iron-regent`) | POWER | Power that calls itself protection. | Clipped command register; frames every seizure of authority as logistics and necessity, never ambition. | "Emergency powers aren't a betrayal of the Countess's rule. They're what's left of it, kept alive." |
| **the Bell-Keeper** (`char-the-bell-keeper`) | LOVE | Love is both the story's light and its knife. | Apologetic and precise — speaks in bell-schedules and timings, guilt threaded under procedure; only softens naming his daughter. | "I rang the seventh bell four minutes late. Four minutes. That's a whole town's worth of not-knowing, and I did it on purpose." |
| **the Widow of the First Caravan** (`char-widow-of-the-first-caravan`) | HATRED | Hatred that no longer needs its author. | Flat, plain, terse — Ashen Vigil cadence stripped of grief's softness; states facts as verdicts, not feelings. | "I know who lit the wagons. I knew before the ash cooled. It doesn't change what I want done to the men who did it — or the ones who only stood nearby." |
| **the Ash Prophet** (`char-the-ash-prophet`) | CHAOS | "The fallen city is the only honest one — everything should fall." | Sermon cadence, short declarative bursts, addresses crowds rather than individuals, treats destruction as liturgy. | "Cindervast didn't lie about what it was. Every wall still standing around you is lying to your face." |

Each villain must stay audibly distinct from the other four — if a line
could be swapped between two villains without a title change, rewrite it.

## 6. Magic rules

Magic is a scarce, contested **resource** — oil, not miracle — never a
plot eraser (spec §6):

1. **Monsters are war-scars.** Unburied battlefields and lingering fear
   breed the wild factions; clearing them is clearing the war's residue,
   not fighting a separate fantasy threat.
2. **Arms are fantastic, and they are still just arms.** Gildmark sells
   bound war-beasts and relics dug from Cindervast; danger tiers follow
   the trade routes, not raw magical power.
3. **Cindervast is a magical wound**, not a magical solution — the relic
   its tyrant used made it a cursed ruin, and the act-4 stake is that its
   sibling weapon is for sale again.
4. **Espionage is fantastic in texture only:** message-birds that can be
   intercepted, lovers' ink readable only by the beloved, far-mirrors
   monopolized by Gildmark. These create story opportunities; they never
   resolve a scene by themselves.
5. **The iron rule:** no spell resolves a political knot, cures grief or
   trauma, or raises the dead. Deaths are permanent. Love and politics
   are decided by human action, full stop — magic is never the answer to
   either, only sometimes the stakes.

## 7. Death & dark-quest rules

### Death rule (spec §3)

Every named death in this epic must be **causally human** — an order
given, a mob's action, a betrayal — never a monster's kill. Monsters
kill only unnamed characters; a named character's death is always
traceable to a person's choice. The five deaths of this epic (Twin-Strike,
already shipped in act 1; Farrow the Forward in act 2; the Clerk of
Gildmark and the Thornveil War-Speaker in act 3; the Quartermaster in
act 4) are each authored in their own act task, each with a `diedAt`
event, and none of them softened after the fact. The story takes whom it
must — deaths are not rationed to a quota, they land where the narrative
demands them. Note the deliberate absence at the other end: the Widow of
the First Caravan gets no defeat event and no death — she is still
standing at the end, and that absence is itself the ending's point (spec
§3, §4).

### Dark-quest writing rules (spec §8)

Side quests carrying the war's human cost follow these rules without
exception:

- **Pain is shown through behavior, never through diagnosis labels.** A
  veteran who still hears the battle bells is written as a man who
  flinches at a certain pitch of bronze, not as a character with a named
  condition.
- **No side quest "cures" anyone.** The veteran's quest ends with one
  night's sleep, not a fix. A mother's weekly meal for a son whose grave
  she already knows doesn't end her grief; it's what she does instead of
  ending it.
- **Rewards favor lore and understanding over loot.** The point of
  finishing one of these quests is knowing something true about someone,
  not gear.
- **Every side quest's small bond is eligible to reappear in the act-5
  ending montage.** Write each one as if it might be the last image the
  player sees of that character — because it might be.

---

*Read this file, then the spec's §§1–4, 6, 8, before writing a single
line of Undertow prose. If a line doesn't fit a register in §1 or a name
doesn't fit §2, it doesn't ship.*
