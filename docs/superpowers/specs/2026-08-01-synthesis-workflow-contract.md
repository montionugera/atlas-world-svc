# Synthesis Workflow (SWF) — contract, research plan, quality bar

**Date:** 2026-08-01
**Status:** proposed — awaiting one decision (§7)
**Purpose:** define how world artifacts get made, so that every level is researched before it is written and every artifact is judged against the same bar.

<div class="callout warn">
<strong>Why this exists.</strong> The first attempt at the myth layer was synthesised straight
from the model's own head with no research. It is parked, uncommitted, as
<code>cosmology-draft-zero.md</code> — kept deliberately as the "no research" baseline to compare
the researched version against.
</div>

## 1. The pipeline

```mermaid
flowchart LR
  A0["A0 · current world<br/>(sharpened)"] --> S1["SWF_L1"]
  S1 --> A1["A1 · world concept"]
  A1 --> B1["ABP_1"] --> V1{"verify"} --> AS1["assets_L1"]
  A0 --> S2["SWF_L2"]
  A1 --> S2
  S2 --> A2["A2 · areas & biomes"]
  A2 --> B2["ABP_2"] --> V2{"verify"} --> AS2["assets_L2"]
  A2 --> S3["SWF_L3 → A3"]
  S3 --> S4["SWF_L4 → A4"]
```

Each `SWF_LN` is the same three-stage machine:

| Stage | Does | Output |
|---|---|---|
| **Research** | find sources → extract mechanisms → analyse | a source dossier with citations |
| **Brainstorm** | diverge; generate options; kill clichés | an options set, each with trade-offs |
| **Synthesise** | converge; write the artifact | `A_N` |

**Non-negotiable:** synthesis may not begin until research and brainstorm outputs exist as files. An artifact with no dossier behind it is rejected on process, regardless of quality.

## 2. Level definitions

| Level | Artifact | Scope |
|---|---|---|
| **L0** | `A0` | What the world already is — canon, geography, factions, magic, story, bestiary. Sharpened, not invented. |
| **L1** | `A1` | World concept: god(s), Void, deep-time legend, world map, the 6 towns |
| **L2** | `A2` | Areas & biomes: the 3 live regions, their ecology, what lives where and why |
| **L3** | `A3` | Races beyond the 8, dungeons, camps, bosses |
| **L4** | `A4` | NPCs, mobs (116 already drafted), items |

## 3. Artifact contract — what every `A_N` must contain

An artifact is **rejected** if any section is missing.

1. **Provenance** — which `A_<N` it derives from, and the dossier it was researched against.
2. **Claims** — the new facts, numbered, each declarative and binding.
3. **Causal links** — for each claim, what *already existing* fact it explains. A claim that explains nothing is decoration.
4. **Consequences** — for each claim, at least **two second-order effects** on ordinary life: work, trade, law, burial, food, travel, who gets rich.
5. **Costs & limits** — what the thing costs, who cannot have it, what it fails against. Power with no cost is not worldbuilding.
6. **Known-wrong** — what people *believe* that is false, in the style of canon §3's who-knows-what matrix.
7. **What this does not change** — explicit list of existing content left valid.
8. **Contradiction rule** — matching canon §6.
9. **Open questions** — what the next level must resolve.

## 4. Quality checklist — is this a good artifact?

Scored before acceptance. **Any ❌ on a Gate item blocks.**

### Gate items (blocking)

<div class="callout danger">
<strong>G1 · The swap test.</strong> Replace every proper noun with a placeholder. If the result
reads like generic high fantasy, it is a re-skin. <strong>Reject.</strong>
</div>

- **G2 · Explains, not appends.** Every claim ties to something already on the page (contract §3). An artifact that only adds is a parallel world, not this one.
- **G3 · Has a cost.** Every power, blessing and relic has a price, a limit, and something it loses to.
- **G4 · Voice.** Obeys `content/story/style.md`. No capital-letter portent, no prophecy cadence, no invented archaisms.
- **G5 · No contradiction.** Nothing collides with `canon.md`, the 152 story nodes, the novel, or the 116-monster bestiary — or, if it does, the collision is named and the fix is proposed in the same commit (canon §6).
- **G6 · Ordinary life is legible.** After reading it, you can say what changes for a miller, a caravan guard and a bell-warden.

<div class="callout danger">
<strong>G7 · Zero real-world nouns.</strong> No world artifact may contain the name of a real
country, city, region, people, language, religion, institution or historical person —
no <em>England</em>, no <em>Venice</em>, no <em>Rome</em>, no <em>Norse</em>, no
<em>Latin</em>. Not as a name, not as a knowing wink, not in an epigraph.
<br><br>
<strong>This also bans one-to-one transplants.</strong> A town that is recognisably a real city
with the serial numbers filed off fails this gate even if the name is invented. The research
supplies <strong>mechanisms</strong> — a price list, a licensing racket, a signalling exploit —
never settings. If a reader can say "oh, this is medieval such-and-such", it is rejected.
<br><br>
<strong>Scope:</strong> applies to <code>A1</code>…<code>A4</code> and everything derived from
them — lore, quests, dialogue, item names, place names, monster names, art prompts.
<strong>It does not apply to</strong> the research dossiers under <code>docs/research/</code>,
which must cite real sources by name to be checkable at all. Dossiers are engineering
documents, not world content, and are never shipped to a player.
</div>

**Check it like this:** grep the artifact for real-world proper nouns before acceptance, and read every invented name aloud — if it is a real-world name with one letter changed, it fails.

### Quality items (scored, not blocking)

| # | Test | Good looks like |
|---|---|---|
| Q1 | **Second-order yield** | ≥3 implications the author did not set out to write |
| Q2 | **Specificity** | Named, countable, mundane detail — not abstraction |
| Q3 | **Inversion** | At least one expectation deliberately turned over |
| Q4 | **Material grounding** | Someone profits; someone pays; there is a supply chain |
| Q5 | **Hook density** | ≥3 things a quest could be hung on |
| Q6 | **Restraint** | Leaves gaps for later levels rather than filling everything |

## 5. Research plan — where to look, and where NOT to

<div class="callout idea">
<strong>The core insight about this world.</strong> Undertow's strength is already
<strong>materialist</strong> worldbuilding: Gildmark's harbour monopoly, magic-stone economics,
antimagic runes explaining why a magical world fights with steel, a church that owns the news.
The non-cliché move is to keep researching in that register — <strong>anthropology and economics,
not fantasy fiction.</strong>
</div>

**Search (mechanisms, not aesthetics):**

- Bell traditions in real religion — passing bells, curfew bells, bells as civic infrastructure and legal instrument
- Death rites and the taboo of the unburied — what real cultures believed happens, and what it cost them to do it properly
- Relic economies — how relics were authenticated, traded, faked, and who profited
- Iconoclasm and forbidden knowledge — how and why real institutions banned a practice, and how it survived anyway
- Absent/silent-god theology, and how ordinary belief behaves when the divine is real but unresponsive
- Folk religion vs institutional religion — the gap between what the church teaches and what villagers do

**Explicitly NOT sources** — these are where cliché comes from:

- D&D / Pathfinder pantheons and cosmologies
- Tolkien and its descendants
- Generic fantasy wikis, "top 10 fantasy religions" listicles
- Other games' lore (Lineage 2 included — structure only, never substance)

**Extract into a dossier:** mechanism · who benefited · what it cost · how it failed · one concrete detail worth stealing. **Citation required per row.**

<div class="callout warn">
<strong>Steal the mechanism, never the setting.</strong> A dossier row saying "a guild banned a
craft for 285 years so it could sell exemptions" is usable. Carrying across the country, the
century, the costume or the institution's real name is a <strong>G7</strong> failure. The test:
strip the row to its causal skeleton — who wants what, who pays, who profits, how it breaks —
and build from the skeleton alone.
</div>

## 6. ABP — asset build pipeline contract

For each level, `ABP_N` turns `A_N` into assets. Every ABP must declare:

1. **Subject list** — derived from `A_N`, countable, each traceable to a claim
2. **Anchor** — what enforces visual consistency (for creatures: the flat-grey silhouette per body plan; for places: to be defined at L1)
3. **Recipe** — the validated generation settings, currently `denoise 0.82`, `steps 24`, `cfg 3`, subject-noun-first prompts with **measurements, never similes** (see §6.1)
4. **Verify gate** — a sample batch reviewed by the owner *before* the full run
5. **Sink** — which manifest and group the output lands in

### 6.0 Asset quality bar — the gap this contract originally had

<div class="callout danger">
<strong>Recorded 2026-08-01.</strong> This contract defined a rigorous quality bar for
<em>documents</em> and <strong>none for assets</strong>. Seven L1 illustrations were generated,
gated and shipped into the storybook before anyone asked whether they were good enough. The owner
had to supply reference targets <em>after</em> the fact. Reference targets are an
<strong>input</strong>, pinned before generation — never a reaction afterwards.
</div>

**Rule 1 · Pin the reference target first.** Before any batch, the owner names reference images
that represent the acceptance standard. They are recorded in the ABP for that asset class. An ABP
with no reference target may not run.

*Reference standard supplied by the owner for world/city art (Lineage II):*

- world map — `lineage.pmfun.com/data/maps/world/`, city maps — `lineage.pmfun.com/data/maps/town/`, index at `lineage.pmfun.com/list/map`
- city concept art — `legacy-lineage2.com/concept-art/Aden_Concept.jpg`, plus the Gracia and Revolution key art the owner cited

**Rule 2 · Right tool per asset class.** Not one recipe for everything.

| Asset class | Correct tool | Why |
|---|---|---|
| Character sheets | turbo diffusion + silhouette anchor | measured and validated |
| Creatures | diffusion + **body-plan silhouette anchor** | consistency comes from the anchor, not the prompt |
| Environments / towns | **higher-capacity model, real step counts, multi-pass** | turbo at 24 steps yields flat, simplified forms |
| **Maps** | **authored vector from geography data — never diffusion** | a map needs accurate coastlines, correct roads and legible labels; no image model can draw *this* world's geography |
| Icons, crests | vector or diffusion + strict silhouette | flat graphic subjects |

**Rule 3 · Multi-pass, not one shot.** Thumbnails → pick the composition → refine → upscale. A
single generation per subject is a draft, not a deliverable.

**Rule 4 · Sample-and-approve is mandatory.** A representative batch is reviewed by the owner
against the pinned references *before* the full run. Skipping this is what produced seven
unusable-as-shipped illustrations in one pass.

**Rule 5 · Record how it was made.** Every entry carries `gen` — model, steps, cfg, seed,
dimensions. Without it a *good* result cannot be reproduced, which makes iteration guesswork.

**Acceptance criteria — judged per image against the pinned references:**

| # | Criterion | Fails when |
|---|---|---|
| A1 | **Detail density** | dissolves into flat shapes at full size |
| A2 | **Depth** | no real foreground / midground / background separation |
| A3 | **Material read** | stone, timber, water and mud are indistinguishable |
| A4 | **Light** | no coherent single source, or impossible falloff |
| A5 | **Composition** | a centred object on a backdrop, no deliberate focal point |
| A6 | **Thumbnail legibility** | unreadable small |
| A7 | **Brief fidelity** | the stated subject, palette or camera was overridden |
| A8 | **Set coherence** | does not read as the same world as its siblings |

### 6.1 Known generation traps (measured, not theoretical)

- **Scale similes become the subject.** "the size of a hog" → a hog; "the size of a plough horse" → a horse. Use measurements.
- **Subject noun must lead and repeat**, or later nouns outvote it.
- **Style words alone do not carry non-humanoid subjects.** The 64 class images were consistent because of the silhouette anchor, not the prompt.

## 7. The one open decision

<div class="callout action">
<strong>How much of the existing world may research overturn?</strong>
The owner said "it can be changed", which changes the shape of every SWF run. Three readings:
<ol>
<li><strong>Additive only</strong> — canon, the 152 story nodes and the novel are fixed; research may only explain and extend.</li>
<li><strong>Canon amendable</strong> — <code>canon.md</code> may be revised where research finds something better, but the shipped novel and story graph stay.</li>
<li><strong>Everything on the table</strong> — including the 5-act epic and the 116-monster bestiary.</li>
</ol>
Each later level inherits this answer, so it is settled once, here.
</div>
