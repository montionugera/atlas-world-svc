# Worldbuilding roles — charter for L0 and L1

**Date:** 2026-08-01
**Serves:** `2026-08-01-synthesis-workflow-contract.md` (the SWF contract)
**Purpose:** define who builds `A0` and `A1`, what each role decides, and what each may veto — so the world is argued into shape rather than narrated by one voice.

<div class="callout info">
<strong>Why roles.</strong> A single author produces a world with one texture: everything is
equally detailed, equally important, and quietly consistent with itself in ways nobody
challenged. Roles create <strong>internal disagreement</strong>, and disagreement is what
surfaces the assumptions that make a world feel unexamined.
</div>

## 1. Standing decisions these roles inherit

Settled by the owner; roles may not reopen them without escalating.

| Decision | Value |
|---|---|
| Tone | **Contrast is deliberate** — bright readable art, grim world |
| Game shape | **Persistent MMO** |
| World scale | **Large**, comparable to a major MMO continent; may start small and scale |
| Revision scope | **Everything on the table** — canon, the 5-act epic, the novel, the 116 monsters |
| Real-world nouns | **Zero** in world artifacts (gate G7) |

## 2. The roles

### 2.1 Core — required for L0 and L1

| Role | Owns | Decides | Veto |
|---|---|---|---|
| **Archivist** | `A0` | What the world currently *is*; what each existing fact actually says | **G5** — blocks any claim that contradicts existing content without naming the collision and proposing the fix |
| **Political Economist** | Trade, licences, monopolies, prices, who profits | How any new thing is paid for, owned and abused | **G3** — blocks anything with no cost, no scarcity and no loser |
| **Theologian** | The god, Void, doctrine, the Bellfaith's practice *and* its business | What the divine is, what it wants, how it manifests, what it refuses | Blocks any use of Holy/Void inconsistent with the settled model |
| **Deep-Time Historian** | Legend, the layer above record | What happened before memory, and crucially **what people wrongly believe** | Blocks legends with no transmission path — who told this, and why did it survive? |
| **Cartographer** | The large world | Where things are, how far apart, why a settlement exists at all | Blocks geography that ignores water, terrain, trade routes or travel time |
| **Namer** | Naming systems | Naming conventions per region and culture; every proper noun | **G7** — blocks any real-world noun, near-homophone or transplant |
| **Cliché Auditor** | The quality bar | Nothing — this role only attacks | **G1** — runs the swap test on every artifact and blocks re-skins |
| **Systems Designer** | MMO constraints | What the world must support: zones, level bands, progression, density | Blocks lore that cannot be built or played at MMO scale |

| **Narrative Director** | Dramatic integrity | Whether a story *works as drama* — its engine, its cast, its ending | Blocks structures that destroy the drama, however consistent or buildable they are |
| **Player Experience** | What the player *is* | The player's role, fantasy and relationship to the story | Blocks worlds where the player has no place, or where thousands of players must each be the sole protagonist |
| **Art Director** | Visual language | The tone-contrast mandate, palette, the silhouette anchor system | Blocks content whose register the art cannot carry |

<div class="callout warn">
<strong>Eleven roles is the ceiling.</strong> Past that you get averaging instead of argument, and
averaging is how worlds turn generic. <strong>Live Ops</strong> and <strong>Localisation</strong>
stay out: the Thai glossary is a <em>cost the Archivist prices</em>, not a voice at the table.
</div>

<div class="callout danger">
<strong>Correction, recorded 2026-08-01.</strong> The Art Director was originally deferred to L2.
That was wrong: the tone-contrast mandate is at risk in the <em>scope</em> decision, which happens
at L1. It is pulled forward. The Narrative Director was missing entirely — a charter for building
a <em>story</em> world had nobody who owned whether the story works as drama.
</div>

### 2.2 Deferred — join at L2 and later

| Role | Joins at | Why not yet |
|---|---|---|
| **Naturalist** | L2 (biomes) | Needs the map and climate before ecology means anything |
| **Quest Designer** | L3 | Needs places and factions to hang hooks on |
| **Linguist (deep)** | optional | Only if the world wants real conlang depth rather than consistent naming |

## 3. How they work

```mermaid
flowchart TD
  OWNER["Owner — final authority"]
  ARCH["Archivist → A0"]
  RES["Research (dossiers, cited)"]
  PANEL["Panel: Economist · Theologian · Historian · Cartographer · Systems"]
  NAME["Namer"]
  AUD["Cliché Auditor"]
  SYN["Showrunner → synthesis"]
  ART["A_N"]

  ARCH --> PANEL
  RES --> PANEL
  PANEL -->|competing proposals| SYN
  SYN --> NAME --> AUD
  AUD -->|pass| ART
  AUD -->|reject with reason| PANEL
  ART --> OWNER
  OWNER -->|amend / accept| ART
```

**The loop:**

1. **Archivist** assembles `A0` — what is true now, with every gap and contradiction listed.
2. **Research** supplies cited mechanisms (dossiers already exist for bells/news and death/relics/forbidden).
3. **Panel** each proposes independently against the same brief. **They must not converge early** — the point is competing answers, not a committee average.
4. **Showrunner** (me) synthesises the strongest combination, and records what was rejected and why.
5. **Namer** replaces every placeholder with real names under the naming system.
6. **Cliché Auditor** attacks the result. A reject sends it back to the panel with a reason, not to the Showrunner to patch.
7. **Owner** accepts or amends. Only the owner may reopen a §1 standing decision.

## 4. Rules that make this work rather than theatre

<div class="callout warn">
<strong>A veto is a block, not an opinion.</strong> If a role vetoes, the artifact does not
proceed. It returns to the panel. The Showrunner may not overrule a veto — only the owner can.
</div>

- **Independent proposals first.** Panel roles are briefed separately and do not see each other's answers until all are in. Sequential briefing produces agreement, not options.
- **Every proposal names its cost.** A role that proposes a thing without saying who pays for it has not finished.
- **The Auditor never proposes.** It has no constructive duty. Giving the critic authorship destroys the critique.
- **Disagreement is recorded, not resolved away.** The artifact ships with a "rejected alternatives" section, so later levels can revisit a road not taken instead of rediscovering it.
- **Roles are briefs, not personalities.** No accents, no in-character flourish. A role is a domain, a decision right and a veto.

## 5. First run — what L0 and L1 actually produce

**L0 · Archivist alone.** Output: `A0` — the world as it stands. Every fact, every gap, every internal contradiction, plus what the shipped novel and 152 story nodes commit us to. No invention.

**L1 · Full panel.** Output: `A1`, covering:

- the god, and what Void is
- deep-time legend — what is true, and what people believe wrongly
- the large-world map: continents or regions, why settlements sit where they do
- the six existing towns, re-grounded at the new scale
- the naming system every later level inherits

**Open question for the owner (§7 of the SWF contract remains):** whether `A1` may propose *replacing* parts of the Undertow story, now that revision scope is "everything on the table". The Archivist will list exactly what any such proposal would cost.
