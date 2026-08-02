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
| 4 | **The Truth Arrives Late** | The false flag is exposed — and it doesn't matter. The Broker twists the reveal into "enemy propaganda"; mobs burn the messengers. Embervale nearly repeats Cindervast (the Broker offers the relic weapon; the Iron Regent is the buyer). The Bell-Keeper breaks — betrays the Broker for his daughter and hands the player the proof. ✝ **The Quartermaster of Millcross** — the story's beloved anchor NPC — dies shielding refugees from the Widow's mob. The war's darkest hour is entirely human-made. |
| 5 | **The Undertow** | The Broker falls; the money trail is cut; the relic sale is stopped at the brink — **and the war does not end**, because the Widow of the First Caravan is still standing and the hatred now belongs to the people: real graves, real grudges. The ending: no peace treaty — instead the first small bonds that cross the line anyway (a letter finally delivered, two families burying their sons together, Rooktide taking in both towns' wounded), seeded by every side quest the player completed. Open-ended: unwinding hatred is the next season's long war. |

**Deaths (no plot armor, all `diedAt` events):** Twin-Strike (act 1, exists) · Farrow the Forward (act 2) · the Clerk of Gildmark (act 3) · Thornveil War-Speaker (act 3) · the Quartermaster (act 4). The story takes whom it must — deaths are as the narrative demands, not rationed (user direction 2026-07-23). Theme-bible rule: every named death must be causally human (orders, mobs, betrayal) — monsters kill only unnamed characters.

## 4. The villain constellation: five antagonists, five drives

Five human villains (user direction 2026-07-23), each embodying one characteristic, each testing the player differently, each foregrounded by a different act. They conflict with **each other** as much as with the player — the player prevails through the cracks between them, never through raw strength. All are ordinary character nodes + factions + fates; no schema support needed.

| Drive | Villain (working name) | Who they are | Acts |
|---|---|---|---|
| **IDEAL** | **the Broker** | The constellation's center. Gildmark's hidden hand; Joker-class information warfare — never kills anyone himself, releases true information at the wrong time and false at the right one. Thesis: *"People don't want the truth. People want an enemy — give them one and they'll do the rest themselves."* His ledgers show fortunes spent keeping the war **balanced**, never won: money is instrument, being right about people is the goal. Never fully explained (`the-brokers-hand` thread lets players argue). | 3–5 |
| **POWER** | **the Iron Regent** | The War-Countess's hawk brother in Embervale. Doesn't care who staged the war — cares who rules when it ends. Ratchets emergency powers, and is the buyer in act 4's relic-weapon deal. Power that calls itself protection. | 3–4 |
| **LOVE** | **the Bell-Keeper** | The tragic one. Master of the bell-tower who has bent the news for the Broker all along **because his daughter is held hostage**. Every mis-rung bell is a father's love. In act 4 love breaks the plan: he betrays the Broker and hands the player the proof. Love in this story is both its light (side quests) and a knife. | 2–4 |
| **HATRED** | **the Widow of the First Caravan** | The story's final adversary. Her husband died in the staged incident — she learned the truth before anyone, **and doesn't care**: she wants both towns to burn. Leads the mob that burns the messengers in act 4. When the Broker falls, she is why the war doesn't end — hatred that no longer needs its author, the ending's thesis in a human face. | 4–5 |
| **CHAOS** | **the Ash Prophet** | The variable no one controls. A Cindervast deserter who believes *"the fallen city is the only honest one — everything should fall."* Leads raiders and war-scarred beasts, takes no money, makes no demands. Every faction's plan — including the player's — breaks on him at least once. | 2–5 |

**Per-act spotlight:** act 1 — Chaos's shadow (border raids) · act 2 — Love (the bent bells) · act 3 — Ideal (the Broker unmasked) · act 4 — Power + Hatred erupt together · act 5 — Hatred, not the Broker, is the last thing standing between the towns and peace.

## 5. The four political pillars (concrete, on stage)

- **Rulers:** real and present — Embervale's grieving War-Countess, Norhollow's veteran Speaker, Gildmark's Harbor Council (the Broker's glove), Cindervast's dead tyrant (the warning), Rooktide's reformed council (the model). No abstract vacuum: named rulers with courts, marriages, and mistakes.
- **Faith:** the Bellfaith — no gods on stage, no sacrifice rites (user exclusion). Its power is the news system, which works in three layers (user correction 2026-07-23 — bells alone cannot carry detail): **bells signal** (simple codes only: danger, war, all-clear, "assemble for a proclamation"); **bell-wardens proclaim** (the detailed news is read aloud beneath the tower — people believe it because it arrives with the sacred toll); **the bell-seal certifies** (inter-town proclamations and news-letters count as true only when stamped with the Bellfaith's seal — a state news agency and notary in one). So "whoever owns the bells owns the truth" means owning the proclamations and the seal, and the Bell-Keeper's bent news is human: which proclamations get sealed, which get burned, and what the official reading of "the caravan incident" says. A reformer bell-warden is a key act-3/4 ally.
- **Corruption:** exemption papers sold, witnesses paid, mercy convoys taxed, bells rung selectively — gentleman's corruption in Gilded Rot diction.
- **Sacrifice:** no ritual; the human kind — parents for children, the Quartermaster for refugees, whistleblowers for truth. The ending asks the towns to sacrifice being right about each other.

## 6. Fantasy integration (the world's physics, never a plot eraser)

1. **Monsters are war-scars** — unburied battlefields and lingering fear breed the wild factions; grinding = clearing war's residue. Existing mob families fit unchanged.
2. **Arms are fantastic** — Gildmark sells bound war-beasts and relics dug from Cindervast; danger tiers follow the trade routes.
3. **Cindervast is a magical wound** — the relic its tyrant used made it a cursed ruin (this world's City of Tears); dungeon zone + the act-4 stake (the Broker is selling its sibling weapon to both sides).
4. **Fantastic espionage** — message-birds that can be intercepted, lovers' ink readable only by the beloved, far-mirrors monopolized by Gildmark.
5. **The iron rule:** ~~magic is a scarce, contested *resource* (oil, not miracle)~~ — **the scarcity half is superseded by F-017; see `content/story/canon.md` §5.** Magic is everyday, widespread and cheap; what gates it is *runes* — knowledge and training — not shortage. Nobody rations spell fuel, hoards it, or goes to war over it, so no plot may turn on magic scarcity, a black market in it, or mages conscripted to secure supply. **The surviving half still holds:** no spell resolves a political knot, cures grief or trauma, or raises the dead. Deaths are permanent; love and politics are decided by human action. The theme bible enforces this editorially.

## 7. Love as the through-line (letters = lore threads)

Lore fragments are predominantly **letters**, discovered world-wide in any order (HK-style optional depth): `letters-across-the-line` (lovers on opposite sides), `the-quartermasters-log` (her decades at the crossroads — read fully only after her death), `a-fathers-postage` (father → conscripted child), `the-cindervast-fall` (the fallen city, re-threaded seed), `the-brokers-hand` (the villain's fragments), `rooktide-ledger-of-return` (how a town comes back). Target ≥6 threads, every thread ≥2 fragments (gate WARN rule).

## 8. Dark side quests (optional; the ending's evidence)

War's human cost, Witcher-3-Bloody-Baron register: the veteran who still hears the battle bells (quest ends with one night's sleep, not a cure); the mother cooking a weekly meal for a son whose grave she already knows; the last letter delivered after the death notice; the orphan selling battlefield salvage who won't sell one medal; the deserter hated as a traitor who refused to fire on civilians. **Writing rules (theme bible):** pain shown through behavior, never diagnosis labels; no quest "cures" anyone; rewards favor lore/understanding over loot; each side quest's small bond is eligible to reappear in the act-5 ending montage. System-wise these are ordinary quests/events/dialogue with no main-spine dependents.

## 9. Content budget (fits F-014 scale targets)

~10 arcs (3 starter + spine + side-packs) · ~30 quests (main ~18, side ~12) · 5 acts · ~12 regions (6 towns + existing 3 wilds + Cindervast ruin districts) · ~9 factions (5 existing + Gildmark council, Bellfaith, war-town leaderships) · ~18 named characters (mortal; includes the 5 villains) · ~14 events · ~20 dialogue · ~36 lore fragments across ≥6 threads. All content must keep `check_content.mjs` green (0 failures; mob refs must use the 6 real server mob types) and both visualizers in sync.

## 10. Out of scope for B

Runtime binding (C) · story UI (D, Godot-gated) · playable races/character creation · map-file authoring for new towns (story regions only; `content/maps/` work is a separate feature) · new schema kinds or gate rules · branching endings (single canon, program-wide).
