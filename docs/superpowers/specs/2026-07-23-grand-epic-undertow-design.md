# The Undertow — Grand Epic Content Design (Sub-project B)

**Date:** 2026-07-23
**Status:** Approved creative design (brainstormed with user, Thai-language session)
**Depends on:** F-014 Narrative System v2 (shipped, release/1.4)
**Program:** B of A→B→C→D. This spec **supersedes the act sketch in the A spec §7** — the Antagonist Doctrine *principles* still bind, but the concrete premise below replaces the "Unclaimed King" sketch.

<div class="callout info">
<strong>The whole story in three sentences:</strong> (1) Two sister towns are manipulated into war by a merchant town that engineered a false-flag incident to sell arms to both sides. (2) The player, raised poor in a crossroads town, slowly unwinds the spy networks and money trails to the truth. (3) The truth comes out — <mark>and the war does not stop</mark>, because the hatred now belongs to the people; the ending is the first small human bonds that cross the line anyway.
</div>

## 1. Theme identity: Ashen Vigil + Gilded Rot

- **Ashen Vigil** (the world's body): wind-worn frontier grit, terse compound naming (Stoneguard, Thornveil — the existing register), muted earth palette, one accent color per faction, quartermaster's-log surface voice with grief underneath.
- **Gilded Rot** (the antagonist bloc's skin): decayed opulence — tarnished gold, wax-seal jewelry, frayed embroidery; ledger-and-chronicle diction; menace delivered as polite accounting.
- Codified in **`content/story/style.md` — the theme bible, Task 1 of the plan** (user decision 2026-07-22): per-town/faction/people identity tables (naming morphology, diction, palette + costume motifs, emblem), global tone rules (register, banned vocabulary), dark-quest writing rules (§8), magic rules (§6). Enforcement is editorial — the bible binds authoring agents and reviewers; **no new schema or gate machinery** (simplicity-first).

## 2. The world: six towns, six peoples

Six towns, each embodying one beat of the theme. Working names follow Ashen Vigil morphology; the theme bible may refine them.

| # | Town (working name) | Role in the story |
|---|---|---|
| 1 | **Millcross** — crossroads town | Player start #1. Poor, kind, refugee crossroads. Home of the love/poverty threads. |
| 2 | **Embervale** | War side A. Sister town of Norhollow; believes Norhollow burned its caravans. |
| 3 | **Norhollow** | War side B. Believes Embervale struck first. Neither is right. |
| 4 | **Gildmark** — the merchant port | Looks neutral and prosperous; engineered the war, arms both sides. Gilded Rot incarnate. |
| 5 | **Cindervast** — the fallen city | Collapsed a generation ago: its ruler unleashed a relic weapon on his own rebelling people. Now a cursed ruin (explorable dungeon zone) and the story's standing warning. |
| 6 | **Rooktide** | Nearly collapsed once, recovered — proof recovery is possible; the ending's model and the recruiting ground for hope. |

**Starter towns (deep content now):** Millcross, plus starter arcs hosted at **Embervale** and **Norhollow** outskirts — one starting perspective per war side + one neutral. The other three towns are story stages, not starters. More starter hubs are a later season (system already supports parallel arcs per act).

**Six peoples** (lore-level identities defined in the theme bible; playable races are explicitly out of scope — that is C/D + asset work): human expedition-stock, beast-blooded (เผ่าสัตว์ — Ashfang-adjacent clans), ice-born (Stoneguard descendant lineage), bramble-kin (Thornveil), gild-blooded (old Gildmark merchant lines), and **the Cindered** — survivors of Cindervast, scattered as refugees through every town. Love across peoples and across front lines is a standing motif.

**Seed reconciliation (existing 25-node graph keeps working):** the current meadow/icefield arcs become Millcross-side act-1/act-2 content. The **Stoneguard Remnant is re-anchored as Cindervast's old city guard** — "a defensive order that outlived what it guarded" now literally: their city is the fallen one. Existing wilderness factions (Ashfang, Thornveil, Unaligned) stay as-is. The two `the-first-claim` lore fragments are re-threaded into `the-cindervast-fall` (small content edit, gate-checked).

## 3. The five acts (single canon; net of parallel arcs, linear spine)

| Act | Title (working) | Movement |
|---|---|---|
| 1 | **Small Lives** | Life in the starter towns: odd jobs, mob culls, family. Everything looks calm — but crates with no maker's mark pass through, and letters arrive already opened. 3 parallel starter arcs (Millcross / Embervale-side / Norhollow-side). Existing seed arcs slot here. |
| 2 | **The War Comes Home** | Open war between Embervale and Norhollow. Refugees flood Millcross; families separate. The player finds the first proof that "the incident" was staged (a salvaged caravan seal that matches neither side). ✝ Farrow the Forward (scout the player has bonded with) dies in the field. |
| 3 | **The Ledger Game** | Espionage act: infiltrate Gildmark, steal ledgers, follow the money, meet double agents. Politics kills, monsters don't: ✝ a named whistleblower ("the Clerk of Gildmark") and ✝ a Thornveil war-speaker die to keep the secret. The four political pillars (§5) all on stage. |
| 4 | **The Truth Arrives Late** | The false flag is exposed — and it doesn't matter. The Broker twists the reveal into "enemy propaganda"; mobs burn the messengers. Embervale nearly repeats Cindervast (the Broker offers its council the relic weapon). ✝ **The Quartermaster of Millcross** — the story's beloved anchor NPC — dies shielding refugees from a mob of her own neighbors. The war's darkest hour is entirely human-made. |
| 5 | **The Undertow** | The Broker falls; the money trail is cut; the relic sale is stopped at the brink — **and the war does not end.** The hatred now belongs to the people: real graves, real grudges. The ending: no peace treaty — instead the first small bonds that cross the line anyway (a letter finally delivered, two families burying their sons together, Rooktide taking in both towns' wounded), seeded by every side quest the player completed. Open-ended: unwinding hatred is the next season's long war. |

**Deaths (no plot armor, all `diedAt` events):** Twin-Strike (act 1, exists) · Farrow the Forward (act 2) · the Clerk of Gildmark (act 3) · Thornveil War-Speaker (act 3) · the Quartermaster (act 4). The story takes whom it must — deaths are as the narrative demands, not rationed (user direction 2026-07-23). Theme-bible rule: every named death must be causally human (orders, mobs, betrayal) — monsters kill only unnamed characters.

## 4. The villain: the Broker (Joker-class, information warfare)

Human, no supernatural power. The hidden hand of Gildmark's arms trade and its spy network. **He never kills anyone himself — he releases true information at the wrong time, and false information at the right one**, then lets people do the rest.

- **Thesis:** *"People don't want the truth. People want an enemy — give them one and they'll do the rest themselves."*
- **Method (collateral targeting):** staged incidents, intercepted letters re-sealed and re-routed, mercy convoys "accidentally" mis-flagged, the reveal of a real atrocity by side A timed to bury proof of the false flag.
- **Mirror of hypocrisy:** he's not 100% wrong — act 4 proves it: given the truth, the mobs choose rage. The ending's small bonds are the story's only counter-argument, which is exactly why the side quests matter structurally.
- **Immaterial motivation:** money is his instrument, not his goal (the ledgers show him spending fortunes to keep wars *balanced*, never won). What he wants is to be right about people. The epic never fully explains him — HK-style, his fragments (`the-brokers-hand` thread) let players argue.

## 5. The four political pillars (concrete, on stage)

- **Rulers:** real and present — Embervale's grieving War-Countess, Norhollow's veteran Speaker, Gildmark's Harbor Council (the Broker's glove), Cindervast's dead tyrant (the warning), Rooktide's reformed council (the model). No abstract vacuum: named rulers with courts, marriages, and mistakes.
- **Faith:** the Bellfaith — a church of bells whose tolling carries news between towns; no gods on stage, no sacrifice rites (user exclusion). Its corruption is informational: **whoever owns the bells owns the truth**, and the Broker has bought bell-ringers. A reformer bell-warden is a key act-3/4 ally.
- **Corruption:** exemption papers sold, witnesses paid, mercy convoys taxed, bells rung selectively — gentleman's corruption in Gilded Rot diction.
- **Sacrifice:** no ritual; the human kind — parents for children, the Quartermaster for refugees, whistleblowers for truth. The ending asks the towns to sacrifice being right about each other.

## 6. Fantasy integration (the world's physics, never a plot eraser)

1. **Monsters are war-scars** — unburied battlefields and lingering fear breed the wild factions; grinding = clearing war's residue. Existing mob families fit unchanged.
2. **Arms are fantastic** — Gildmark sells bound war-beasts and relics dug from Cindervast; danger tiers follow the trade routes.
3. **Cindervast is a magical wound** — the relic its tyrant used made it a cursed ruin (this world's City of Tears); dungeon zone + the act-4 stake (the Broker is selling its sibling weapon to both sides).
4. **Fantastic espionage** — message-birds that can be intercepted, lovers' ink readable only by the beloved, far-mirrors monopolized by Gildmark.
5. **The iron rule:** magic is a scarce, contested *resource* (oil, not miracle). No spell resolves a political knot, cures grief or trauma, or raises the dead. Deaths are permanent; love and politics are decided by human action. The theme bible enforces this editorially.

## 7. Love as the through-line (letters = lore threads)

Lore fragments are predominantly **letters**, discovered world-wide in any order (HK-style optional depth): `letters-across-the-line` (lovers on opposite sides), `the-quartermasters-log` (her decades at the crossroads — read fully only after her death), `a-fathers-postage` (father → conscripted child), `the-cindervast-fall` (the fallen city, re-threaded seed), `the-brokers-hand` (the villain's fragments), `rooktide-ledger-of-return` (how a town comes back). Target ≥6 threads, every thread ≥2 fragments (gate WARN rule).

## 8. Dark side quests (optional; the ending's evidence)

War's human cost, Witcher-3-Bloody-Baron register: the veteran who still hears the battle bells (quest ends with one night's sleep, not a cure); the mother cooking a weekly meal for a son whose grave she already knows; the last letter delivered after the death notice; the orphan selling battlefield salvage who won't sell one medal; the deserter hated as a traitor who refused to fire on civilians. **Writing rules (theme bible):** pain shown through behavior, never diagnosis labels; no quest "cures" anyone; rewards favor lore/understanding over loot; each side quest's small bond is eligible to reappear in the act-5 ending montage. System-wise these are ordinary quests/events/dialogue with no main-spine dependents.

## 9. Content budget (fits F-014 scale targets)

~10 arcs (3 starter + spine + side-packs) · ~30 quests (main ~18, side ~12) · 5 acts · ~12 regions (6 towns + existing 3 wilds + Cindervast ruin districts) · ~9 factions (5 existing + Gildmark council, Bellfaith, war-town leaderships) · ~16 named characters (mortal) · ~14 events · ~20 dialogue · ~36 lore fragments across ≥6 threads. All content must keep `check_content.mjs` green (0 failures; mob refs must use the 6 real server mob types) and both visualizers in sync.

## 10. Out of scope for B

Runtime binding (C) · story UI (D, Godot-gated) · playable races/character creation · map-file authoring for new towns (story regions only; `content/maps/` work is a separate feature) · new schema kinds or gate rules · branching endings (single canon, program-wide).
