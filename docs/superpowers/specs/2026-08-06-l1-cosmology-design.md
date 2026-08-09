---
title: "L1 cosmology — the unsealed years, what Void is, and why the world's memory is short"
date: 2026-08-06
idea: I-051
wave: 5
release: "1.7"
status: "design — awaiting owner review"
contract: "docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md (SWF §3 artifact contract, §4 gates)"
---

# L1 cosmology — the unsealed years

**This artifact is the missing half of L1.** `A1-geography-cluster1.md` settled where the world
is. This settles how old it is, what Void is, and what the people in it believe that is false.

<div class="callout danger">

**The one-line summary.** The relic weapon does not burn — it *erases*, leaving no body to bury.
Void grows from the unburied dead. Those two facts have sat on separate pages of `canon.md` since
the beginning. **Join them, and the world gets a deep past, an origin for Void, and an explanation
for its own short memory — without inventing a single new force.**

</div>

## 0. Decisions this design executes

Five owner decisions, taken 2026-08-05/06 during the I-051 brainstorm. Each is binding on
everything below.

| # | Decision | Consequence |
| --- | --- | --- |
| D1 | **No god exists. Only belief.** | The 2026-07-23 exclusion (*"no gods on stage, no sacrifice rites"*) holds at full strength. The factual layer stays wholly secular; deities appear only as things people believe. |
| D2 | **Ship a derivation doc *and* player-readable lore.** | `A1-cosmology.md` plus lore nodes in `content/story/lore.json`, reusing the existing schema and gate. No new gate. |
| D3 | **Write a real deep timeline**, not a shrug. | The deep past becomes binding canon, not ambiguity. Legends are its shadow. |
| D4 | **Remove the king theme**, including "king" as the land's curse word. | The exclusivity claim and the land-wide taboo go. The Last King of Cindervast himself stays. |
| D5 | **Amend the shipped novel too.** | This answers SWF §7 as **option 3 — everything on the table**. Recorded separately as `DR-006`. |

**Owner instruction on sequencing:** *world first, prose polish later.* The lore-node bodies in
this design are drafts sufficient to pass the gate. Sharpening them is filed as a separate idea,
not done here.

## 1. Provenance

- **Derives from:** `A0-current-world.md` (§1.1 cosmology absent, G2 no deep time, G13 no origin
  for relics), `A1-geography-cluster1.md` (the L1 geography half), `content/story/canon.md` §1 and §5.
- **Researched against:** `docs/research/2026-08-01-dossier-death-relics-forbidden.md` (death rites
  and the unburied; relic authentication and fraud; forbidden knowledge) and
  `docs/research/2026-08-01-dossier-bells-and-news.md` (bells as legal instrument; institutional
  control of information; folk vs institutional religion).
- **Research stage satisfied:** both dossiers pre-date this design and cover all six research lines
  in SWF §5. Synthesis is therefore permitted under SWF §1.

<div class="callout warn">

**`cosmology-draft-zero.md` no longer exists.** SWF §1 describes it as the deliberately-kept
"no research" baseline, parked uncommitted. It is not on disk and appears in no commit in any
branch (`git log --all --diff-filter=A -- "*cosmology*"` returns nothing). **The comparison
baseline the contract assumes is gone.** This design cannot be scored against it; that is a
limitation, not a claim of superiority.

</div>

## 2. Claims — the new facts, numbered and binding

**C1.** There were people before the present count. They were capable enough to make the relic
weapons.

**C2.** Their age ended in the use of erasing weapons at the scale of the whole land.

**C3.** **Void is the residue of dead who left no body to bury**, at that scale. It is a
consequence of what people did, not a force, a curse, or a will.

**C4.** Their records did not burn and did not rot. **They were erased**, by the same weapons, in
the same event.

**C5.** The present count of time begins at the **first sealed record** — the first document the
Bellfaith vouched for. Everything before it is *the unsealed years*.

**C6.** **No one alive can make a relic.** Every relic in the world is salvage from the unsealed
years. There is no industry, no forge, no school.

**C7.** **Magic stones are not of that age.** They remain ordinary minerals, mined in many towns
and sold like any other good, exactly as `canon.md` §5 already states.

<div class="callout info">

**C7 exists to stop this design from becoming the answer to everything.** One era explaining
relics *and* Void *and* magic stones *and* the elements would be a re-skin of "ancient
civilisation did it". Magic stones stay mundane and unexplained. That is deliberate restraint
(SWF Q6).

</div>

## 3. Causal links — what each claim explains that was already on the page

A claim that explains nothing is decoration (SWF §3.3).

| Claim | Existing fact it explains |
| --- | --- |
| C1 | `core-story.md:40` — the Last King took an **ancient weapon** from the palace vault. Ancient *to whom*, made *by whom*, was never answerable. Now it is. |
| C2 | Why exactly one weapon class of this kind exists, with no supply chain, no rival, and no second example in production. |
| C3 | `canon.md:354` — *"War-scar monsters are Void-line"*, and `A0:278` — void is the most common element in the corpus (28 uses), **concentrated on the war ground**. Void was already behaving like a by-product of battle. This names the mechanism. |
| C4 | `A0` G2 — the world's memory is ~100 years deep and nothing older is mentioned anywhere. The shallowness stops being a gap and becomes the scar of the event. |
| C5 | `canon.md` §4 — the Bellfaith owns the news, the proclamation and the seal. Its authority is now **historically** founded: it did not become powerful by being holy, it became powerful by being **first to write things down and vouch for them**. |
| C6 | Act 4's entire stake. The relic sale is the world's most consequential transaction because the supply is fixed at whatever survived — `event-relic-deal-struck`, `event-relic-sale-stopped`. |
| C7 | `canon.md:301` — magic is cheap, ordinary, no shortage, no black market. Untouched. |

## 4. Consequences — second-order effects on ordinary life

SWF §3.4 requires at least two per claim, and G6 requires that a miller, a caravan guard and a
bell-warden all become legible.

### From C3 — burial is infrastructure, not piety

1. **A town's burial budget is a defence budget.** Burying the dead is pest control with a
   liturgy on top. A town that cannot afford to bury gets monsters in its fields the following
   season. This is a line item, argued over in council.
2. **Gravedigging is a paid trade with a wartime surge price**, and body-recovery is a clause in a
   caravan guard's contract — the guard is paid to bring bodies back, not out of sentiment, but
   because the alternative breeds what he will have to fight next year.
3. **Ashvale Front is the one thing the two towns cooperate on.** `canon.md:188-189` already says
   *"neither town claims it, both bury their dead in it."* That is not a truce gesture. It is both
   towns paying into the same defence.

### From C5 — the seal is the oldest thing in the world

1. **An unsealed document is worth nothing**, and the Bellfaith charges to seal. It is a notary
   with a monopoly and a founding myth that happens to be true.
2. **Forging a seal is the highest-value crime available**, which is exactly the Bell-Keeper's
   crime (`canon.md` §3) — now with a motive the world explains rather than asserts.
3. **A miller dates his lease from the count.** Nobody can date anything before it, so nobody
   tries; "before the seal" is how ordinary people say "so long ago it does not matter."

### From C6 — salvage economy with a fixed supply

1. **Relic tokens are a market with no producers**, which makes authentication the whole business.
   The Cindered each carry one (`lore-what-the-prophet-carries`); who certifies a token, and for
   how much, is a racket waiting to be written.
2. **Cindervast is the richest ruin in the world and nobody will go in**, which is why the
   Stoneguard's pointless gate-keeping has value it does not understand.

## 5. Costs and limits

Power with no cost is not worldbuilding (SWF §3.5).

- **The erasing weapons cannot be made, counted, or studied.** Using one destroys the record of
  its own use — including any record of how many were made. Nobody can prove how many remain.
  This is the standing threat, and it is unresolvable by design.
- **Void cannot be cured, only answered.** Holy counters it (`canon.md:382`); burial prevents it.
  Neither undoes it. Ground that has held unburied dead stays Void-line.
- **The Bellfaith's authority has an expiry it cannot admit.** The count began when someone chose
  to start writing. It is arbitrary, and the Bellfaith knows the first sealed record is not the
  first event — only the first one anybody vouched for.
- **Nothing here gives a player a new power.** This design mints no ability, no item, no stat.

## 6. Known-wrong — what people believe that is false

In the style of `canon.md` §3's who-knows-what matrix. These are the belief slots the lore nodes
fill.

| Belief, widely held | What is actually true |
| --- | --- |
| Void is a punishment, a curse, or the breath of something that wants in | It is the arithmetic of unburied dead. Nothing wants anything. |
| The world is about as old as the count | The count is a filing decision. The world is much older. |
| Relics are *found* | Relics are *inherited*. Someone made them, and that someone died in what they made. |
| The unsealed years were a golden age, or a savage one | Both are guesses. No record survives to support either, which is precisely why both persist. |
| The Bellfaith's authority is sacred in origin | It is clerical in origin. It wrote first. |

<div class="callout danger">

**The Ash Prophet is the most fervently wrong.** `char-the-ash-prophet` already *"holds the
vacuum as a religion"* (`A0:113`) and shows his relic token as a sermon
(`lore-what-the-prophet-carries`). Under C3 he is preaching the meaning of an industrial
accident. **This design does not correct him, and no content may.** He is the load-bearing
example that belief in this world runs ahead of fact.

</div>

## 7. What this does not change

Explicit, per SWF §3.7. Everything in this list stays valid without amendment.

- **The magic model** — `canon.md` §5 in full: magic is cheap and everyday, runes are the real
  limit, rune-craft is public, High-Tier is the ceiling.
- **The six elements and the resistance table** — including Holy ⇄ Void mutual ×2.0.
- **Magic stones** — mined, sold, unexplained (C7).
- **Classes and races** — all 64 pairings, all leans, and the rule that none of it exists in game
  state yet.
- **The five-act epic** — every event id, every character fate, every quest. Nothing in acts 1–5
  is touched.
- **The 116-monster bestiary**, the Thornveil placement file, and every mob type.
- **The Last King of Cindervast himself** — the three-layer villainy, the seventy hanged, the
  relic weapon, the 92% erased, the standing statues, the Cindered, the Stoneguard. All intact.

## 8. What is deliberately left unanswered — and must stay unanswered

Restraint is a scored item (SWF Q6), but these are stronger than restraint: **content that answers
them contradicts this design.**

1. **What the age was called.** No record survived, so it has no true name. *The unsealed years* is
   what this generation calls it, not what it called itself.
2. **Who those people were** — whether they were like us, what they wanted, how they were governed.
3. **How the weapons work.**
4. **Why they were used.**

If all four were answered, the belief layer would have nothing left to be wrong about, and §6
collapses.

## 9. Deliverables

### 9.1 New — the artifact

`docs/worldbuilding/A1-cosmology.md`, carrying §§1–8 above in full prose.

<div class="callout warn">

**The filename matters.** SWF §2 reserves **A3 for L3** (races, dungeons, camps, bosses) and A2
for L2. Cosmology is **L1**, so it is `A1-cosmology.md`, sitting beside
`A1-geography-cluster1.md`. An earlier draft of this design called it `A3-cosmology.md`, which
would have squatted on L3's slot.

</div>

### 9.2 New — five lore nodes, one thread

Thread `the-unsealed-years` in `content/story/lore.json`. Five fragments matches the house size —
existing threads run 4–6 nodes. `check_content.mjs:472` warns on a thread of one.

Every anchor below was verified present in the story graph. `check_content.mjs:235` hard-fails an
anchor that does not resolve.

| id | anchor | what the fragment carries |
| --- | --- | --- |
| `lore-the-ground-that-keeps-count` | `region-ashvale-front` | Someone who works the burial ground states the material rule without knowing it is one. |
| `lore-nothing-left-to-bury` | `region-cindervast` | The city-scale echo: what erasure leaves, said plainly by someone who was there. |
| `lore-the-first-seal` | `faction-bellfaith` | The oldest sealed record, and the fact that it is not the oldest event. |
| `lore-the-vacuum-holds` | `char-the-ash-prophet` | The most fervent wrong belief, uncorrected. |
| `lore-what-the-ice-gives-back` | `region-icefield` | Physical evidence surfacing where the ground never thaws. |

**Bodies are drafts.** Per the owner's sequencing instruction, prose sharpening is out of scope
here and filed as a follow-up idea.

### 9.3 Amended — the king theme removal (D4, D5)

Surgical, roughly 15 sites. **What goes:** the claim that the land had exactly one king ever, the
land-wide "king is a curse word" taboo, and the Iron Regent's ambition framed as *becoming the
second king*. **What stays:** the Last King of Cindervast and everything that hangs off him.

| File | Sites | Note |
| --- | --- | --- |
| `docs/story/undertow/core-story.md` | §heading :32, :34, :42, :59, :68, :138, :190 | `:117` refers only to the Last King's legend — leave it. |
| `docs/story/undertow/novel-complete.md` | :582, :636 | **`:422` needs no edit** — it says "the last king *of Cindervast*", asserting no exclusivity. |
| `docs/story/undertow/novel-illustrated-edition.html` | :670, :693 | Shipped artifact — amended under D5. |
| `docs/story/undertow/glossary-th.md` | :70, :71 | |
| `docs/worldbuilding/A0-current-world.md` | :115, :193, :320, :380, :442, :486 | :380 (G2) and the §1.1 / G13 entries become *resolved*, not deleted. |

`content/story/style.md:133` — Cindervast's heraldry, *"a broken crown over ash"* — **is not
edited.** It refers to that city's own fallen king, not to a land-wide taboo.

**The Iron Regent keeps a coherent motive** (a man who wants power without limit) rather than a
sharpened one. A stronger replacement is filed as a follow-up idea, per the owner's instruction
that holes may be filled later.

### 9.4 Amended — canon and chronology

- `content/story/canon.md` §1 — one entry above Cindervast's fall: *before the count*.
- `content/story/canon.md` §5 — a short paragraph giving Void a material origin, replacing nothing
  in the elements table.

### 9.5 New — decision record

`docs/worldbuilding/DR-006-swf-scope.md` — settles SWF §7 as **option 3, everything on the table**,
because D5 amends the shipped novel. SWF §7 states every later level inherits this answer, so it
is recorded once, here.

### 9.6 New — two follow-up ideas, captured not built

1. The Iron Regent's replacement motive.
2. Prose sharpening of the five `the-unsealed-years` lore bodies.

## 10. Contradiction rule

Matching `canon.md` §6. Content authored after this design that contradicts it is a review
finding; fix the content, not this file. Where this design contradicts existing content, the
collision is named in §9.3 and the fix ships in the same commit.

## 11. Gate self-check (SWF §4)

| Gate | Status | Evidence |
| --- | --- | --- |
| **G1 · swap test** | pass | Strip every proper noun and the claim remains *"a weapon that erases leaves no body to bury, and unburied dead breed monsters, so burial is a defence budget."* That is a materialist causal chain, not generic high fantasy. |
| **G2 · explains, not appends** | pass | Every claim in §2 is tied in §3 to a fact already on the page. |
| **G3 · has a cost** | pass | §5 — unmakeable, uncountable, uncurable, and it mints no player power. |
| **G4 · voice** | **to verify at authoring** | `style.md:59` ban list is *okay, guys, tech, percent, boss*. No capital-letter portent, no prophecy cadence, no invented archaisms. The lore drafts must be checked against this before commit. |
| **G5 · no contradiction** | pass with named collisions | §9.3 names every collision and ships the fix in the same commit, per canon §6. |
| **G6 · ordinary life legible** | pass | §4 — the miller dates his lease from the count, the caravan guard is paid to bring bodies back, the bell-warden sells the seal. |
| **G7 · zero real-world nouns** | **to verify at authoring** | No real place, people, language, religion or person appears in this design. Must be re-grepped over the authored prose before acceptance. |

Scored items: Q1 second-order yield — burial-as-defence-budget, seal-forgery motive, and the
Stoneguard's accidental value were not set out to be written. Q3 inversion — the Bellfaith's
authority is clerical, not sacred. Q6 restraint — §7 and §8 are the restraint.

## 12. Open questions handed to L2/L3

1. **Where does physical evidence surface, and how often?** `region-icefield` is proposed as the
   one place the ground gives things back. Whether other zones do is unanswered.
2. **Does any relic other than Cindervast's exist on the map?** C6 implies a fixed surviving
   supply but does not count it. Deliberate — counting it would cap the sequel.
3. **What does the first sealed record actually say?** Named in §9.2 but not written. It is a
   strong hook and should be spent carefully, not here.
4. **Do the other nine zones get placement-style cosmology detail**, or is this the whole layer?

## 13. Verification

1. `cd scripts && npm install` in a fresh worktree, then `cd scripts && npm test`.
   **Not** `node --test scripts/tests/` — that is `MODULE_NOT_FOUND` on Node 26.
2. `node scripts/check_content.mjs` from the repo root — must report 0 failures, and the new
   thread must not raise the single-fragment warning.
3. Grep the authored prose for real-world proper nouns (G7) and for the `style.md` ban list (G4).
4. `git grep -nE "กษัตริย์องค์เดียว|องค์ที่สอง|สาบส่งคำว่ากษัตริย์"` must return **nothing** after §9.3.
5. Never write `$?` after a pipe — it reports the last pipeline element, not the command.
