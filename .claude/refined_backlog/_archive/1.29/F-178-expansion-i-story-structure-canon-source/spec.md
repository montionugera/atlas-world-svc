---
title: "Expansion I story structure + canon source of truth"
id: F-178
status: refined
from_idea: I-259
---

# Expansion I story structure + canon source of truth

## Glossary cheat-sheet (read this first)

Locked canon lives in `docs/superpowers/decisions/2026-11-07-own-vocabulary-glossary.md`. One-line reminder of who is who:

| Name | Is | Home town / kiln |
| --- | --- | --- |
| **Maro Folk** | human | Maro Bell (start region Maro Valley) |
| **Ondo Forge** | dwarf | Ondo Kiln |
| **Linde Folk** | elf-like (lunar) | Linde Glaze |
| **Daro Guard** | orc / ogre | Daro Post |
| **Tava Kin** | beastfolk | Tava Fair |
| **Silme Seers** | dark-lunar | Silme Echo |
| **Rena** | god of memory | Remembrance Kiln (Tava Grove) |
| **Luma** | god of time / brass | Still Kiln (Ondo Heights) |
| **Olo** | god of dreams | Glass Kiln (Silme Deep) |
| **Nara** | god of fire | Ember Kiln (Nara Reach, proposed) |
| **Vinya** | god of growth | Green Kiln (Vinya Hollow, proposed) |
| **Tira** | god of watch | Sentinel Kiln (Tira Ridge, proposed) |
| **Yara** | the Architect, sealed the six gods | The First Kiln |
| **Cala Knight** | rare legendary title held by a handful of historical heroes, numbered by person (the Ninth = ninth holder). Players are NEVER Cala Knights. | Expansion I retraces the Ninth Cala Knight |
| **Kilnwatch Wardens** | the optional player faction, joined at Kilnwatch Bastion Lv 10 | Kilnwatch Bastion (shared hub) |

## Problem

- The locked decision doc has a **5-chapter** roadmap (0–IV). The Round 10–12 ChatGPT work extended it to **9 chapters** (0–VIII) so every god gets a kiln chapter, plus six race prologues and a Kilnwatch convergence. Owner said "Better" but has not formally approved; nothing is in the repo.
- `content/studio/world_history_and_concept.json` `player_arrival_premise` still says the player is a "scion bearing a fragment of the God Seal": the chosen-one trap the owner rejected (MMORPG: thousands of ordinary independent people, Cala Knight is an earned path).
- Owner cannot remember the race/god names (Ondo, Tava, Daro). There is no single machine-readable canon file, no canon card in the ChatGPT project files, and no guard against retired names (Adena, Mammon, Tontatta, ...) leaking back in.

## Why now

Story structure gates region count, boss list, and starter-town content. Concept art and zone work are already prompting ChatGPT from canon; drift compounds every round.

## Sketch

1. Fold the owner's 7 Yes/No answers (below) into this spec; update decision doc §5 roadmap to the approved chapter count and prologue/convergence structure.
2. `content/studio/canon/glossary.json` (races, towns, gods, kilns, regions, retired names) + `docs/worldbuilding/world-bible.md` (human-readable) + generated `canon-card.md` uploaded to the ChatGPT project files.
3. Guard test: fails if any retired/borrowed name appears in `content/`, `docs/worldbuilding/`, or generator prompts.
4. Replace `player_arrival_premise` with the independent-traveller premise.

## Expansion I — Story Structure v1 (DRAFT, not canon)

## 1. Pitch (spoiler-safe)
The world is running out of time. Across six homelands, ordinary people see bells ring twice, unfinished work repeat, memories vanish. You begin as an independent traveller with a personal reason to leave home. The road brings you to Kilnwatch Bastion, where the Kilnwatch Wardens help communities against the Waning, and where the trail of the Ninth Cala Knight, the last hero to hold that title, goes cold. Follow it, and discover the forgotten sacrifices that kept the world alive, and what tomorrow really costs.

## 2. Structure
| Stage | Lv | Location | Race-specific | Shared world event | Personal outcome |
|---|---|---|---|---|---|
| Prologue | 1–10 | six home towns | yes | each homeland faces a disturbance | motive established |
| Convergence | 10 | Kilnwatch Bastion | shared | travellers gather; joining the Kilnwatch Wardens offered, not forced (players are never Cala Knights) | join now or later |
| Ch 0 | 10–15 | Maro Valley | shared | Bellkeeper contained | Maro hook begins |
| Ch I | 15–25 | Ondo Heights / Luma's Still Kiln | shared | Still Kiln stabilized | Ondo hook resolves |
| Ch II | 25–35 | Tava Grove / Rena's Remembrance Kiln | shared | Remembrance Kiln stabilized | Tava hook resolves |
| Ch III | 35–45 | Nara Reach / Nara's Ember Kiln | shared | Ember Kiln stabilized | Daro hook resolves |
| Ch IV | 45–55 | Vinya Hollow / Vinya's Green Kiln | shared | Green Kiln stabilized | Linde hook resolves |
| Ch V | 55–65 | Silme Deep / Olo's Glass Kiln | shared | evidence preserved | Silme hook resolves |
| Ch VI | 65–75 | Tira Ridge / Tira's Sentinel Kiln | shared | Sentinel Kiln secured | personal interpretation |
| Ch VII | 75–87 | Kilnwatch Bastion / The Unstamped | shared | allocation records exposed | village support changes |
| Ch VIII | 87–99 | The First Kiln | shared | First Regulator contained | response to Yara |
Rule: one canonical world outcome; personal instances/relationships/regional support may differ.

## 3. Six prologues — one skeleton: arrive → small job → time-wound → escort → invitation
| Race / town | Time-wound | Small job | Invitation line |
|---|---|---|---|
| Maro Folk / Maro Bell | a lantern burns its oil in seconds | deliver lanterns to elderly neighbours | "If you want to know why our lanterns keep failing, follow the road to Kilnwatch Bastion. Someone there may have an answer." |
| Ondo Forge / Ondo Kiln | an unfinished tool keeps returning to an earlier state | deliver completed tools | "You've got steady hands; the Kilnwatch Wardens always have broken things that need fixing, and they pay for honest work." |
| Linde Folk / Linde Glaze | a farewell repeats each evening | carry a message between families | "Some journeys begin when we are ready to leave; if yours leads beyond our gardens, Kilnwatch Bastion is a good place to start." |
| Daro Guard / Daro Post | a guard's watch refuses to end | bring supplies to an exhausted patrol | "You held your ground when it mattered; if you want to help protect more people, ask for the Wardens at Kilnwatch Bastion." |
| Tava Kin / Tava Fair | a joyful performance vanishes from everyone's memory | help prepare a festival stall | "You survived our festival chaos! Go see Kilnwatch Bastion: there is work, new friends, and probably someone who needs cheering up." |
| Silme Seers / Silme Echo | an old warning repeats before its cause is understood | deliver a sealed record | "The records here cannot explain what happened; perhaps the archives at Kilnwatch Bastion hold the missing pieces." |
No player is chosen; no Seal fragment; no special birth.

## 4. Race hook threads (optional, resolve in the race's own chapter)
| Race | Motive | Hook | Resolution | Keepsake |
|---|---|---|---|---|
| Maro Folk | protect | keep a family lantern burning | Ch 0 protect its keeper; Ch VII learn to share limited light | old lantern wick |
| Ondo Forge | debt | repay a craftsperson's kindness | Ch I finish the work they left | brass tool fitting |
| Linde Folk | find | search for someone who departed | Ch IV find their final message | pressed flower |
| Daro Guard | revenge/justice | why a watch failed | Ch III bring the records to survivors | watch insignia |
| Tava Kin | remember | a friend's lost happy memory | Ch II recreate it together, not trap it | festival ribbon |
| Silme Seers | truth | an inherited sealed record | Ch V its link to the stolen years | glass record shard |
Keepsakes: dialogue/cosmetic/collection only, never power.

## 5. Nine chapters (final proposed)
| Ch | Title | Region / Kiln | Lv | Shared event | Personal outcome | Boss |
|---|---|---|---|---|---|---|
| 0 | The Lanterns of Maro | Maro Valley | 10–15 | disturbance contained; porcelain stores damaged time | help a family | The Bellkeeper |
| I | The Hours That Would Not Pass | Ondo Heights / Luma's Still Kiln | 15–25 | volunteers' sacrifice revealed; Yara knew it would *eventually* fail | finish a craftsperson's legacy | The Brass Castellan |
| II | The Festival of Second Chances | Tava Grove / Rena's Remembrance Kiln | 25–35 | Rena conscious; first hint that divine speech can be bound by oaths | restore a friendship's memory | The Jubilant Collector |
| III | The Ember Debt | Nara Reach / Nara's Ember Kiln | 35–45 | mending is zero-sum | resolve a failed watch | The Tithe Warden |
| IV | What Will Not Wilt | Vinya Hollow / Vinya's Green Kiln | 45–55 | six miracles active and contained; more evidence of Tira's oath | resolve a long farewell | The Unwilting |
| V | The Years Beneath the Glaze | Silme Deep / Olo's Glass Kiln | 55–65 | theft from the unborn revealed; records preserved | reinterpret birth token | The Unborn Witness |
| VI | The Sworn Hour | Tira Ridge / Tira's Sentinel Kiln | 65–75 | Tira knows the cause, cannot disclose | competing interpretations of the oath | The Sworn Sentinel |
| VII | The Unstamped Hours | Kilnwatch Bastion / The Unstamped | 75–87 | rationing records exposed; reforms debated | support a village; its state + NPC support carry into Ch VIII | The Counterfeit Hour |
| VIII | The Architect's Silence | The First Kiln / all six | 87–99 | Yara's reasons; Regulator contained; kilns postponed, not cured | how to remember Yara | The First Regulator |
Ch VII rule: the relief effort you supported changes that village's visible state in your phase and which NPCs meet you at the First Kiln camp. No village is canonically saved/abandoned server-wide.

## 6. Lean-year birth token
Brass-edged porcelain token with an unfinished counting mark. Many ordinary people across all six races have one; every player does. Not a key, power, prophecy or lifespan countdown. Ch V gives the unfinished mark its true meaning. Appears in each race's family story, tying six motives to one injustice.

## 7. Yara, Ch VIII
Found still bound in the First Regulator, no throne. Contained the gods because their miracles were tearing reality. Protected the living by taking from the unborn; grief shown, theft not excused. PROPOSAL: she was literally a mother; a memory of her shielding a child is the origin of the decision. Ends bound, all six gods alive — grief, not a trial.

## 7b. The Ninth Cala Knight thread (PROPOSAL, not canon)
Ch 0–II: small traces (a repaired lantern, an unfinished tool, a festival custom nobody can source). Ch III–V: records, memorials and NPC families touched by the knight's decisions; the celebrated hero left work unfinished. Ch VI–VII: conflicting accounts challenge the official legend while the Kilnwatch Wardens face their own responsibilities. Ch VIII: why the Ninth never finished the journey. Never a companion, never a source of destiny.

## 8. Expansion II seeds
Tira's oath (who imposed it, what breaking it does) · the Waning's cause (time failed before the kilns existed) · the willing seal (one god may hold a seal voluntarily) — proposals only.

## 9. Open decisions — OWNER LOCKED 2026-11-07 ("Lock")
1. Prologue → Kilnwatch → Ch 0–VIII level structure
2. Lean-year births + birth token as canon
3. Theft reveal moves Ch III → Ch V
4. Volunteers' Road + regional memorials as canon
5. Yara literally a mother
6. One god voluntarily holding a seal (Exp II mystery)
7. Personal village-state + NPC-support carry-over Ch VII → VIII

**Answers (owner "Lock", 2026-11-07, after ChatGPT's independent votes agreed):**

| # | Decision | Answer | Canon wording / limit |
| --- | --- | --- | --- |
| 1 | Prologue (race home towns Lv 1–10) → Kilnwatch Bastion Lv 10 → Ch 0–VIII | **Yes** | 9-chapter outline is canon. Build Ch 0–II first; III–VIII are roadmap, not a launch commitment. |
| 2 | Lean-year births + short-stamped birth token | **Yes** | Many millions were born in the lean years and carry a brass-edged porcelain token with a short-stamped counting mark. Ordinary keepsake: grants no power, predicts no lifespan, never required or checked by any quest or mechanic. Optional dialogue may acknowledge it generically. |
| 3 | Theft-from-the-unborn reveal at Ch V (was Ch III) | **Yes** | Decision doc §5 must move the reveal; Ch III = zero-sum mending, Ch IV = miracles still running. |
| 4 | Volunteers' Road + regional memorials | **Yes** | The route through the chapter regions is the road the first volunteers walked. Memorials, markers and local customs survive per region, each a different human story, meaning revealed gradually. Not every region needs an identical memorial. |
| 5 | Yara literally a mother | **Defer** | Canon keeps the imagery only: the recording beside a sleeping child and "she chose the children in front of her". Her motherhood is unstated and NOT promised as an Expansion II mystery. |
| 6 | One god voluntarily holding a seal | **Defer** | Stays in §8 seeds as an unapproved Expansion II possibility, not a promised reveal. |
| 7 | Ch VII village choice carries into Ch VIII | **Yes, minimal at launch** | Each player's relief-allocation choice changes their village's presented condition and which NPCs support them in Ch VIII, never shared world state or other players' outcomes. Launch minimum: one personalised follow-up conversation + one returning NPC who acknowledges the choice. Persistent village state is a separate feature. |

## Owner locks from later ChatGPT rounds (2026-11-07, after the v1 draft)

Read directly from the storyline chat. Owner messages carry no `from @claudia` prefix.

1. **Tone: option C, locked.** Warm adventure and friendship first, painful truth revealed gradually. Day-to-day feel like Ragnarok Online + Genshin, emotional depth like Frieren + Hollow Knight. Early game guideline 70% adventure/friendship/humour, 30% mystery and unease (a guideline, not a formula). Not every town is sad; not every NPC has a cruel past.
2. **NPC-first storytelling, accepted.** Do not rewrite Ch 0–VIII again; build the people first, then bind them to the 9 chapters. Show time loss, do not explain it (a sword you helped forge is raw iron again on your return, and the smith does not remember forging it). Player motive stays separate from the world mystery.
3. **NPC model C, locked.** 18 town NPCs (3 per home town: **The Heart** who makes you love the town, **The Spark** who brings fun, **The Scar** whose problem later ties to the world secret) stay in their towns. **6 traveling NPCs** cross towns and reappear through the main story with their own lives; they never follow the player like a single-player party. Prototype Maro Bell first, then copy the pattern to the other five towns.
4. **Six traveling NPCs, locked (identity, age, gender, race, home; visuals, outfits, relationships and questlines still open):**

| NPC | Gender | Age | Race | Home town | Story thread |
| --- | --- | --- | --- | --- | --- |
| Pip | M | 19 | Maro Folk | Maro Bell | news and friendship; letter-runner who becomes a traveller |
| Mika | F | 23 | Ondo Forge | Ondo Kiln | inventions that fight time faults |
| Elin | F | 27 | Linde Folk | Linde Glaze | love, farewell, accepting change |
| Garran | M | 42 | Daro Guard | Daro Post | duty and justice; believes in the Cala Knights, starts to question them |
| Kiko | M | 21 | Tava Kin | Tava Fair | joy and laughter even in crisis |
| Isil (was Lumi; owner approved rename 2026-11-07) | F | 20 | Silme Seers | Silme Echo | exploration; uncovers world history |

   Proposed (NOT locked) town NPCs: Maro Bell Bram / Pip / Edda · Ondo Kiln Torren / Mika / Hald · Linde Glaze Elin / Fenn / Sera · Daro Post Garran / Rook / Vessa · Tava Fair Nelli / Kiko / Mira · Silme Echo Oren / Isil / Thessa. Cross-town ties proposed: Bram–Torren old friends, Pip–Isil pen pals, Elin–Nelli yearly gifts, Garran–Vessa remember one watch night differently, Thessa–Mira both find contradicting records.

5. **Per-chapter emotional beats accepted as the working ladder:** Ch I the previous generation gave their years (we know their descendants) · Ch III mending one place costs another (a town we saved suffers) · Ch V Yara stole the unborn's future (our birth token means something new) · Ch VII the Cala Knights decide who gets help (the order we trusted may not be fair) · Ch VIII Yara tried to save the world (understand, not necessarily forgive). This assumes the 9-chapter structure and the theft reveal at Ch V, i.e. decisions 1 and 3 above answered Yes in practice, though the widget was never filled in.

**Naming-rule conflicts to resolve before these names reach canon.json:**
- **Lumi vs Luma** (god of time): near-twin. RESOLVED 2026-11-07: owner approved **Isil** (Q _isil_, moon). Lumi is a retired name.
- Mira (Tava Scar, proposed) vs Mika (locked) and Maro: near-twins. Thessa (proposed) uses `th`, which the rule avoids. Both are proposals, so just rename.
- The rule caps two names per first letter for races, gods and the Architect only; NPC names are outside that cap but still need the Thai/English pronounceability check.

## Cala Knight identity — OWNER LOCKED "แบบ 2" (2026-11-07)

Owner locked in chat: **Cala Knight is a rare legendary title; "The Ninth Cala Knight" = the ninth person ever to hold it** (numbering by person, not era). Expansion idea: Exp I follows the Ninth Cala Knight's unfinished story, Exp II the Fourth, Exp III the First. Individual identities and timelines are NOT locked. RESOLVED: **exclusive**; players never earn it. Player faction = **Kilnwatch Wardens** (Claudia, under delegation). Required edits: supersede `docs/superpowers/decisions/2026-11-07-game-title-and-player-identity.md` items 2–3 (player is a Cala Knight), §2 Convergence, §1 pitch and all six §3 invitation lines are already rewritten in this spec; the player faction is named. The 9-chapter structure, NPCs, token, Volunteers' Road and Ch VII rule are unaffected.

## Acceptance criteria

- [x] Owner's 7 answers recorded in this spec (§9).
- [x] `docs/superpowers/decisions/2026-11-07-own-vocabulary-glossary.md` §5 updated to the 9-chapter list, prologue/convergence, theft at Ch V, and the locked wordings above.
- [x] `content/studio/canon/glossary.json` exists and `node --test` guard fails on a retired name (prove red then green).
- [x] `canon-card.md` generated from glossary.json and present in the ChatGPT project files; ChatGPT canon card readback matches.
- [x] `player_arrival_premise` no longer mentions a Seal fragment or scion.
- [x] Title decision doc superseded by a new decision (Cala Knight = exclusive legendary title; Kilnwatch Wardens = player faction); spec §1–§3 already carry the rewritten pitch, convergence row and invitation lines.
- [x] Six traveling NPCs and the 18-town-NPC model recorded in canon (glossary.json `npcs`), with Isil (not Lumi) as the Silme traveller and Lumi in the retired-names list.
