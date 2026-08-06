# L1 Cosmology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the world a deep past, a material origin for Void, and an explanation for its own short memory — by joining two facts already in canon, with no god and no new force.

**Architecture:** Content-and-documentation change, not code. The "tests" are the repo's content gate (`scripts/check_content.mjs`) and the scripts test suite. Work proceeds outside-in: first remove the king theme that blocks the deep timeline, then write the artifact, then amend canon, then add the player-facing lore that the gate validates.

**Tech Stack:** Markdown, JSON (`content/story/lore.json`), Node 26 + `node --test` (`scripts/`), `ajv` schema validation via `check_content.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-06-l1-cosmology-design.md` (approved 2026-08-06).

## Global Constraints

- **No god, no deity, no creation myth, no afterlife, no soul in the factual layer.** Owner ruling 2026-08-05: no god exists; there is only belief. Deities may appear *only* as things characters wrongly believe.
- **No absolute years anywhere.** This world dates by event. `canon.md` §1 anchors on Day 0; Rooktide measures only "before the return" and "after."
- **`style.md:59` ban list, no exceptions:** never write **okay, guys, tech, percent, boss**.
- **G7 — zero real-world nouns.** No real country, city, region, people, language, religion, institution or historical person, in any authored prose. Not as a name, not as a wink.
- **G4 — voice.** No capital-letter portent, no prophecy cadence, no invented archaisms.
- **The Widow may not be resolved** (`DR-001-L1-scope.md:190`) — no defeat event, no boss fight, no redemption arc. Untouched by this plan.
- **Never `git commit --amend`.** New commit on top, always.
- **Never write `$?` after a pipe** — it reports the last pipeline element, not your command.
- **Four things must stay unanswered:** what the age was called, who those people were, how the weapons work, why they were used. Content answering any of them contradicts the spec.

---

## Working location

All work happens in the **`_release` worktree** on branch `release/1.7`:
`/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release`

This is documentation and content only — no feature worktree is required, and no `F-NNN` claim is needed to execute this plan. If a claim is later minted for release accounting, the branch merge is trivial because nothing here touches `colyseus-server/`.

**Before Task 7**, ensure gate dependencies exist:

```bash
cd .claude/worktrees/_release/scripts && npm install
```

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md` | Modify — §7 resolved, status accepted | 1 |
| `docs/story/undertow/core-story.md` | Modify — remove king theme from the narrative spine | 2 |
| `docs/story/undertow/glossary-th.md` | Modify — two glossary rows | 2 |
| `docs/story/undertow/novel-complete.md` | Modify — two prose sites in the shipped novel | 3 |
| `docs/story/undertow/novel-illustrated-edition.html` | Modify — one aria-label, one card paragraph | 3 |
| `docs/worldbuilding/A0-current-world.md` | Modify — resolve §1.1, G2, G13; drop the exclusivity claim | 4 |
| `docs/worldbuilding/A1-cosmology.md` | **Create** — the L1 artifact | 5 |
| `content/story/canon.md` | Modify — §1 chronology entry, §5 Void origin | 6 |
| `content/story/lore.json` | Modify — five nodes on thread `the-unsealed-years` | 7 |
| `.claude/idea_backlog/I-0NN-*/` | **Create** — two follow-up ideas | 8 |

**Already committed** (`6489d50`, done during brainstorming, do not redo): the design spec, `docs/worldbuilding/DR-006-swf-scope.md`, and the rewritten `.claude/idea_backlog/I-051-*/spec.md`.

---

### Task 1: Close SWF §7

**Files:**
- Modify: `docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md:4` and `:215-226`

**Interfaces:**
- Consumes: `docs/worldbuilding/DR-006-swf-scope.md` (already committed).
- Produces: an accepted contract. Every later task cites it as the governing checklist.

- [ ] **Step 1: Verify the current state**

Run:
```bash
cd .claude/worktrees/_release
sed -n '4p' docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md
```
Expected output: `**Status:** proposed — awaiting one decision (§7)`

- [ ] **Step 2: Update the status line**

Replace exactly:
```
**Status:** proposed — awaiting one decision (§7)
```
with:
```
**Status:** accepted 2026-08-07. Its one open decision (§7) is settled by `docs/worldbuilding/DR-006-swf-scope.md`.
```

- [ ] **Step 3: Replace §7 with the ruling**

Replace the whole of §7 — from the line `## 7. The one open decision` to the end of the file — with:

```markdown
## 7. Scope — settled

**Ruling: option 3, everything on the table**, including `canon.md`, the story graph, the
shipped novel and its illustrated edition, the five-act structure and the bestiary.

Settled 2026-08-06 and recorded in full, with its limits, at
`docs/worldbuilding/DR-006-swf-scope.md`. It was forced rather than chosen: the owner's
decision to remove the king theme reaches into `novel-complete.md` and
`novel-illustrated-edition.html`, which options 1 and 2 both forbid.

**Option 3 is a licence to amend deliberately, never a licence to let two files disagree.**
Every amendment names its collisions and ships the fix in the same commit (`canon.md` §6).
Three things it does not reopen: the Widow may not be resolved; no god may be added; and no
change may ship without its collision list.
```

- [ ] **Step 4: Verify no placeholder survives**

Run:
```bash
cd .claude/worktrees/_release
grep -n "awaiting one decision\|The one open decision" docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md; echo "grep-exit=${PIPESTATUS[0]}"
```
Expected: no output lines, `grep-exit=1`.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/_release
git add docs/superpowers/specs/2026-08-01-synthesis-workflow-contract.md
git commit -m "docs(I-051): accept SWF contract, settle scope as option 3"
```

- [ ] **Step 6: Quality gate**

Dispatch an independent reviewer against this task's diff only (`git show HEAD`). Reviewer checks: does the contract still read coherently with §7 replaced; does anything else in the file still assume the decision is open. Fix findings before Task 2.

---

### Task 2: Remove the king theme from the narrative spine

**Files:**
- Modify: `docs/story/undertow/core-story.md` — lines 32, 34, 42, 48, 59, 68, 138, 190
- Modify: `docs/story/undertow/glossary-th.md` — lines 70, 71

**Interfaces:**
- Consumes: nothing.
- Produces: the phrases `กษัตริย์องค์เดียว`, `องค์ที่สอง` and `สาบส่งคำว่ากษัตริย์` are gone from these two files. Tasks 3 and 4 assert the same absence in their own files.

**What is being removed:** the claim that the land had exactly one king ever, and the land-wide taboo that made "king" a curse word. **What stays:** the Last King of Cindervast, his three-layer villainy, the relic weapon, the erased city, the Cindered, the Stoneguard.

**The replacement idea, used consistently:** the land does not refuse kings out of a word-taboo; it refuses **central power**. Iron Regent does not want to be "the second king"; he wants to be **the only power left**.

- [ ] **Step 1: Line 32 — the section heading**

Replace:
```
### แผ่นดินไร้กษัตริย์ — เงาของ Cindervast
```
with:
```
### เงาของ Cindervast
```

- [ ] **Step 2: Line 34 — the exclusivity claim**

Replace:
```
ชั่วอายุคนก่อน แผ่นดินนี้เคยมีกษัตริย์องค์เดียวในประวัติศาสตร์: **กษัตริย์องค์สุดท้ายแห่ง Cindervast** ตำนานของเขาเลวเป็นสามชั้น และเป็นเหตุผลว่าทำไมวันนี้ทั้งแผ่นดินจึงไม่มีกษัตริย์
```
with:
```
ชั่วอายุคนก่อน Cindervast มีกษัตริย์องค์สุดท้ายของมัน: **กษัตริย์องค์สุดท้ายแห่ง Cindervast** ตำนานของเขาเลวเป็นสามชั้น และเป็นเหตุผลว่าทำไมวันนี้ไม่มีเมืองไหนยอมอยู่ใต้อำนาจกลางอีก
```

- [ ] **Step 3: Line 42 — the curse word**

Replace the opening clause:
```
ตั้งแต่นั้น "กษัตริย์" กลายเป็นคำหยาบของแผ่นดิน ไม่มีใครกล้าสวมมงกุฎอีก ทุกเมืองปกครองตัวเอง
```
with:
```
ตั้งแต่นั้น ไม่มีเมืองไหนยอมยกอำนาจให้ศูนย์กลางอีก ทุกเมืองปกครองตัวเอง
```
Leave the rest of the line (from `วันนี้ Cindervast คือแดนร้างต้องสาป` onward) **unchanged**.

- [ ] **Step 4: Line 48 — the crown image**

Replace:
```
หลังมงกุฎหลอมละลายที่ Cindervast ไม่มีอำนาจกลางอีกเลย
```
with:
```
หลัง Cindervast ล่มสลาย ไม่มีอำนาจกลางอีกเลย
```

- [ ] **Step 5: Line 59 — fear of crowns**

Replace:
```
เพราะแผ่นดินหลังกษัตริย์องค์สุดท้ายกลัวกองทัพพอๆ กับกลัวมงกุฎ
```
with:
```
เพราะแผ่นดินหลัง Cindervast กลัวกองทัพพอๆ กับกลัวอำนาจที่รวมศูนย์
```

- [ ] **Step 6: Line 68 — the town table row**

Replace the row's closing clause:
```
— เหตุผลที่ทั้งแผ่นดินสาบส่งคำว่ากษัตริย์ |
```
with:
```
— เหตุผลที่ไม่มีเมืองไหนยอมอยู่ใต้อำนาจกลางอีก |
```

- [ ] **Step 7: Line 138 — the Iron Regent's secret**

Replace:
```
**เขาอยากเป็นกษัตริย์องค์ที่สองของแผ่นดินที่สาบส่งคำว่ากษัตริย์**
```
with:
```
**เขาอยากเป็นอำนาจเดียวที่เหลือของแผ่นดินที่ไม่ยอมมีศูนย์กลางอีกแล้ว**
```

- [ ] **Step 8: Line 190 — the relic deal**

Replace:
```
(และอยากเป็นกษัตริย์องค์ที่สอง — ดูส่วนที่ 3)
```
with:
```
(และอยากเป็นอำนาจเดียวที่เหลือของแผ่นดิน — ดูส่วนที่ 3)
```

- [ ] **Step 9: glossary-th.md line 70**

Replace:
```
"อยากเป็นกษัตริย์องค์ที่สอง"; Last-King shadow (weapon that erased Cindervast)
```
with:
```
"อยากเป็นอำนาจเดียวที่เหลือ"; Cindervast's shadow (weapon that erased Cindervast)
```

- [ ] **Step 10: glossary-th.md line 71**

Replace:
```
| relic weapon / Last-King shadow | อาวุธที่ไม่เผาแต่ลบ (จากซาก Cindervast) | ch4: the weapon the last king used to erase his own city of 40,000;
```
with:
```
| relic weapon / Cindervast's shadow | อาวุธที่ไม่เผาแต่ลบ (จากซาก Cindervast) | ch4: the weapon Cindervast's last king used to erase his own city of 40,000;
```

- [ ] **Step 11: Verify the theme is gone from these two files**

Run:
```bash
cd .claude/worktrees/_release
git grep -nE "กษัตริย์องค์เดียว|องค์ที่สอง|สาบส่งคำว่ากษัตริย์|กลัวมงกุฎ" -- docs/story/undertow/core-story.md docs/story/undertow/glossary-th.md
echo "hits above should be none"
```
Expected: no output.

- [ ] **Step 12: Verify the Last King survived**

Run:
```bash
cd .claude/worktrees/_release
grep -c "กษัตริย์องค์สุดท้าย" docs/story/undertow/core-story.md
```
Expected: a non-zero count. If this is 0, the removal went too far — the Last King must remain.

- [ ] **Step 13: Commit**

```bash
cd .claude/worktrees/_release
git add docs/story/undertow/core-story.md docs/story/undertow/glossary-th.md
git commit -m "docs(I-051): drop the single-king claim and the king taboo from the spine"
```

- [ ] **Step 14: Quality gate**

Independent reviewer on `git show HEAD`. Checks: every edited Thai sentence still reads naturally; the Iron Regent still has a coherent motive; no site was missed; the Last King is intact. Fix findings before Task 3.

---

### Task 3: Remove the king theme from the shipped novel

**Files:**
- Modify: `docs/story/undertow/novel-complete.md` — lines 582, 636
- Modify: `docs/story/undertow/novel-illustrated-edition.html` — lines 670, 693

**Interfaces:**
- Consumes: the replacement idea fixed in Task 2 — *the only power left*, not *the second king*. Wording must match Task 2 so the novel and the spine agree.
- Produces: the shipped narrative agrees with the amended spine.

**This task is the one that required SWF option 3.** These are published artifacts.

- [ ] **Step 1: novel-complete.md line 582**

Replace:
```
ทั้งแผ่นดินสาบส่งคำว่ากษัตริย์มาตั้งแต่คืนนั้น และตอนนี้มีชายคนหนึ่งที่อยากเป็นกษัตริย์องค์ที่สอง กำลังซื้ออาวุธชิ้นเดียวกันนั้นออกมาจากซาก
```
with:
```
ไม่มีเมืองไหนยอมอยู่ใต้อำนาจกลางอีกเลยตั้งแต่คืนนั้น และตอนนี้มีชายคนหนึ่งที่อยากเป็นอำนาจเดียวที่เหลือ กำลังซื้ออาวุธชิ้นเดียวกันนั้นออกมาจากซาก
```

- [ ] **Step 2: novel-complete.md line 636**

Replace:
```
กำลังเดินทางไปหาชายที่อยากเป็นกษัตริย์
```
with:
```
กำลังเดินทางไปหาชายที่อยากเป็นอำนาจเดียวที่เหลือ
```

- [ ] **Step 3: Confirm line 422 is left alone**

Run:
```bash
cd .claude/worktrees/_release
sed -n '422p' docs/story/undertow/novel-complete.md | grep -c "กษัตริย์องค์สุดท้ายของมัน"
```
Expected: `1`. This line says "*its* last king" — it asserts no exclusivity and must **not** be edited.

- [ ] **Step 4: novel-illustrated-edition.html line 670 — the aria-label**

Replace:
```
aria-label="ภาพเงาผู้สำเร็จราชการเหล็ก มีเค้ามงกุฎจางๆ"
```
with:
```
aria-label="ภาพเงาผู้สำเร็จราชการเหล็ก มีเงาเหยี่ยวเหนือศีรษะ"
```

**Do not shorten this to the role alone.** Every sibling portrait card in this file pairs the role
with a distinguishing detail that is actually drawn — the Widow's sparks (`:538`), the traveller's
staff (`:567`), the Broker's wax seal (`:635`), the Ash Prophet's torn cloak (`:696`). Dropping the
crown without naming the hawk would leave a screen-reader user with no identity cue for this one
character while sighted users still get one. The hawk silhouette is drawn at `:687` and stays.

- [ ] **Step 5: Check whether the SVG actually draws a crown**

The removed alt-text described *"a faint crown"*. The drawing may contain one.

Run:
```bash
cd .claude/worktrees/_release
sed -n '669,690p' docs/story/undertow/novel-illustrated-edition.html
```

Inspect the shapes in that `<svg>`. If a crown-like polygon or path is present, remove that element only, leaving the silhouette intact. **If no crown shape exists, change nothing and record that in the commit message** — do not invent an edit.

- [ ] **Step 6: novel-illustrated-edition.html line 693 — the character card**

Replace:
```
เขาอยากเป็น <em>กษัตริย์องค์ที่สอง</em> ของแผ่นดินที่สาบส่งคำว่ากษัตริย์
```
with:
```
เขาอยากเป็น <em>อำนาจเดียวที่เหลือ</em> ของแผ่นดินที่ไม่ยอมมีศูนย์กลางอีกแล้ว
```

- [ ] **Step 7: Verify across the whole undertow directory**

Run:
```bash
cd .claude/worktrees/_release
git grep -nE "กษัตริย์องค์เดียว|องค์ที่สอง|สาบส่งคำว่ากษัตริย์" -- docs/story/undertow/
echo "hits above should be none"
```
Expected: no output.

- [ ] **Step 8: Verify the HTML still parses**

Run:
```bash
cd .claude/worktrees/_release
python3 -c "
import html.parser,sys
class P(html.parser.HTMLParser): pass
p=P(); p.feed(open('docs/story/undertow/novel-illustrated-edition.html',encoding='utf-8').read())
print('parsed ok')
"
```
Expected: `parsed ok`.

- [ ] **Step 9: Commit**

```bash
cd .claude/worktrees/_release
git add docs/story/undertow/novel-complete.md docs/story/undertow/novel-illustrated-edition.html
git commit -m "docs(I-051): amend the shipped novel for the king-theme removal"
```

- [ ] **Step 10: Quality gate**

Independent reviewer on `git show HEAD`. Checks: does the amended prose still scan as the same narrator's voice; does the illustrated card still match `core-story.md:138`; was the SVG decision recorded honestly. Fix findings before Task 4.

---

### Task 4: Resolve A0's cosmology gaps

**Files:**
- Modify: `docs/worldbuilding/A0-current-world.md` — §1.1, and lines 115, 193, 320, 380, 391, 442, 486

**Interfaces:**
- Consumes: Tasks 2 and 3 — A0 quotes `core-story.md`, so its quotes must be updated to the amended text.
- Produces: G2, G13 and §1.1 marked resolved with a pointer to `A1-cosmology.md`. Task 5 writes the file they point at.

A0 is a survey document. **Gaps are marked resolved, not deleted** — the record of what was once missing is part of its value.

- [ ] **Step 1: §1.1 — add a resolution banner**

Immediately under the `## 1.1 Cosmology — **none exists**` heading, insert:

```markdown
> **Resolved 2026-08-07 by I-051.** The absence recorded below was real and is now closed by
> `docs/worldbuilding/A1-cosmology.md`. **It was closed without adding a god** — the owner's
> 2026-07-23 exclusion holds at full strength, and the cosmology is a belief layer over a
> material history. Read the section below as the survey that motivated the artifact, not as
> current state.
```

- [ ] **Step 2: Line 115 — update the quoted core-story text**

The quote `"แผ่นดินหลังกษัตริย์องค์สุดท้ายกลัวกองทัพพอๆ กับกลัวมงกุฎ"` and its gloss `(after the Last King, the land feared armies as much as it feared crowns)` no longer match the source.

Replace the quote with `"แผ่นดินหลัง Cindervast กลัวกองทัพพอๆ กับกลัวอำนาจที่รวมศูนย์"` and the gloss with `(after Cindervast, the land feared armies as much as it feared central power)`.

- [ ] **Step 3: Line 193 — drop the exclusivity**

Replace:
```
The land's only king in all history — the **Last King** —
```
with:
```
Cindervast's last king — the **Last King** —
```

- [ ] **Step 4: Line 320 — drop the exclusivity from the V5 row**

Delete the clause `The land's only king in all history;` from the V5 row, leaving the rest of the row intact. In the same row's third column, replace `the source of "king" as a curse word, of the Stoneguard` with `the source of the Stoneguard`.

- [ ] **Step 5: Line 380 — mark G2 resolved**

Replace the G2 row's first cell content:
```
**No deep time.** The oldest thing in the world is the Brotherhood Caravan at ~100 years; the deepest history is the Last King, one generation back. Nothing older is mentioned anywhere
```
with:
```
**~~No deep time.~~ RESOLVED 2026-08-07 (I-051).** Was: the oldest thing in the world is the Brotherhood Caravan at ~100 years and nothing older is mentioned anywhere. Now closed by `A1-cosmology.md` — the shallowness is the scar of the event, and the count begins at the first sealed record
```

- [ ] **Step 6: Line 391 — mark G13 partially resolved**

Replace the G13 row's first cell content:
```
**No origin for Void, magic stones, or the relic weapons.** The relic is "ancient"; nobody made it, nobody knows what it is. Magic stones are mined and sold with no explanation of what they are
```
with:
```
**PARTIALLY RESOLVED 2026-08-07 (I-051).** Void and the relic weapons now have an origin (`A1-cosmology.md` C1–C3, C6). **Magic stones deliberately do not** — C7 keeps them ordinary minerals so that one era does not become the answer to everything. That half of this gap is open by choice
```

- [ ] **Step 7: Line 442 — update the derived claim**

Replace `after the Last King the land feared armies as much as crowns` with `after Cindervast the land feared armies as much as central power`.

- [ ] **Step 8: Line 486 — replace the numbered claim**

Replace numbered item 3 in full:
```
3. **Exactly one king in all recorded history, and "king" now a curse.** A continent with one king ever is a different claim about a different world. The Last King legend is simultaneously the world's only deep history, its only political taboo, the origin of the Stoneguard, the Cindered, the Ash Prophet, the relic weapon and act 4's stake.
```
with:
```
3. **~~Exactly one king in all recorded history, and "king" now a curse.~~ REMOVED 2026-08-07 (I-051, `DR-006`).** The claim and the taboo are gone from every file, including the shipped novel. What remains and still carries the same weight: the Last King *of Cindervast*, the relic weapon, the Stoneguard, the Cindered, the Ash Prophet and act 4's stake. The land refuses **central power**, not a word.
```

- [ ] **Step 9: Verify**

Run:
```bash
cd .claude/worktrees/_release
git grep -nE "only king in all history|กษัตริย์องค์เดียว|สาบส่งคำว่ากษัตริย์|องค์ที่สอง|curse word|dares wear a crown|feared crowns" -- docs/ content/ ':!docs/superpowers/'
echo "hits above should be none"
```
Expected: no output — this is now the repo-wide assertion, since Tasks 2, 3 and 4 have all landed.

- [ ] **Step 10: Commit**

```bash
cd .claude/worktrees/_release
git add docs/worldbuilding/A0-current-world.md
git commit -m "docs(I-051): resolve A0 cosmology gaps and drop the exclusivity claim"
```

- [ ] **Step 11: Quality gate**

Independent reviewer on `git show HEAD`. Checks: every A0 quote still matches its source file verbatim; resolved gaps point at a file that Task 5 will actually create; nothing was deleted that should have been struck through. Fix findings before Task 5.

---

### Task 5: Write the artifact

**Files:**
- Create: `docs/worldbuilding/A1-cosmology.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-06-l1-cosmology-design.md` §§1–8, which this file renders as world prose rather than as a design argument.
- Produces: **the seven claims C1–C7 and the era name "the unsealed years"**, both cited by Tasks 6 and 7. Claim ids must be exactly `C1`…`C7`.

**Filename is load-bearing.** SWF §2 reserves `A3` for L3 and `A2` for L2. Cosmology is L1, so it is `A1-cosmology.md`, sitting beside `A1-geography-cluster1.md`. Do not name it `A3-*`.

- [ ] **Step 1: Create the file with the nine required sections**

The artifact is **rejected if any section is missing** (SWF §3). Required, in order: Provenance · Claims · Causal links · Consequences · Costs & limits · Known-wrong · What this does not change · Contradiction rule · Open questions.

Write each section from the corresponding section of the design spec, converted from design register to world register. The design argues *why*; the artifact states *what is true*. Copy no argumentation about owner decisions or process into the artifact — that belongs in the spec and `DR-006`.

Front matter:
```markdown
---
title: "A1 — Cosmology: the unsealed years"
date: 2026-08-07
level: L1
idea: I-051
derives_from: "A0-current-world.md, A1-geography-cluster1.md, canon.md §1 and §5"
researched_against: "docs/research/2026-08-01-dossier-death-relics-forbidden.md, docs/research/2026-08-01-dossier-bells-and-news.md"
---
```

- [ ] **Step 2: State the seven claims exactly as the spec numbers them**

C1 people before the count who made the relic weapons · C2 their age ended in erasing weapons used at land scale · C3 Void is the residue of dead who left no body to bury · C4 their records were erased, not burned · C5 the count begins at the first sealed record · C6 nobody alive can make a relic, all are salvage · C7 magic stones are **not** of that age.

- [ ] **Step 3: Include the four permanent unknowns as their own section**

What the age was called · who those people were · how the weapons work · why they were used. State explicitly that content answering any of them contradicts this artifact.

- [ ] **Step 4: Run the swap test (G1)**

Replace every proper noun in your draft with a placeholder and read it. If it reads as generic high fantasy, it is a re-skin — rewrite. The claim that must survive the swap is: *a weapon that erases leaves no body to bury; unburied dead breed monsters; therefore burial is a defence budget.*

- [ ] **Step 5: Run the G7 scan**

Run:
```bash
cd .claude/worktrees/_release
grep -noEi "\b(England|Britain|Venice|Rome|Roman|Norse|Latin|Greek|Egypt|China|Japan|Europe|Christian|Catholic|Buddhis[tm]|Islam)\b" docs/worldbuilding/A1-cosmology.md
echo "hits above should be none"
```
Expected: no output.

- [ ] **Step 6: Run the G4 ban-list scan**

Run:
```bash
cd .claude/worktrees/_release
grep -noEi "\b(okay|guys|tech|percent|boss)\b" docs/worldbuilding/A1-cosmology.md
echo "hits above should be none"
```
Expected: no output.

- [ ] **Step 7: Verify all nine sections are present**

Run:
```bash
cd .claude/worktrees/_release
for s in Provenance Claims "Causal" Consequences "Costs" "Known-wrong" "does not change" Contradiction "Open questions"; do
  printf "%-20s " "$s"
  grep -qi "$s" docs/worldbuilding/A1-cosmology.md && echo present || echo "MISSING"
done
```
Expected: every line `present`.

- [ ] **Step 8: Commit**

```bash
cd .claude/worktrees/_release
git add docs/worldbuilding/A1-cosmology.md
git commit -m "docs(I-051): A1 cosmology - the unsealed years"
```

- [ ] **Step 9: Quality gate**

Independent reviewer on `git show HEAD`, given SWF §3 and §4 verbatim. Reviewer scores G1–G7 and reports each as pass/fail with evidence. **Any G failure blocks Task 6.** Fix and re-verify before advancing.

---

### Task 6: Amend canon

**Files:**
- Modify: `content/story/canon.md` — §1 chronology, §5 elements

**Interfaces:**
- Consumes: C1–C6 and the era name from Task 5.
- Produces: canon states Void's origin. Task 7's lore nodes dramatise what canon here asserts, and must not contradict it.

**canon.md is world law.** It carries the elements in words only — no lore body, quest or dialogue line may quote a multiplier (`canon.md:351-354`, `style.md` §6 rule 5). Keep it that way.

- [ ] **Step 1: Add the chronology entry**

In `## 1. World chronology`, insert as the **first** bullet, above `- **About a generation before Day 0 — Cindervast's fall.**`:

```markdown
- **Before the count — the unsealed years.** The land was lived in long before anyone kept a
  record of it. That age made the relic weapons and ended in their use; its own records were
  erased in the same event, which is why nothing older than the first sealed record can be
  dated at all. The present count begins at that first sealed record, not at the first event.
  What people believe about the unsealed years is in `docs/worldbuilding/A1-cosmology.md`;
  what is actually known is this paragraph and nothing more.
```

- [ ] **Step 2: Add Void's origin to §5**

Immediately after the existing paragraph beginning `**War-scar monsters are Void-line.**` (`canon.md:346`), insert:

```markdown
**Where Void comes from.** Void is not a will and not a punishment. It is what collects
where the dead were never buried, and it collects in proportion to them. A battlefield left
unburied breeds it; an age left unburied is why there is any of it in the ground at all.
Burial is the only prevention and Holy is the only answer, and neither undoes what has
already taken. This is why a town's burial is argued over in council alongside its walls.
```

- [ ] **Step 3: Verify no multiplier leaked into canon prose**

Run:
```bash
cd .claude/worktrees/_release
grep -nE "2\.0|0\.5|×2|x2\.0" content/story/canon.md
```
Expected: no output. Canon carries elements in words only.

- [ ] **Step 4: Verify no absolute year was introduced**

Run:
```bash
cd .claude/worktrees/_release
grep -nE "[0-9]{3,4} (years|ปี) ago|ราว [0-9]{3,4} ปีก่อน" content/story/canon.md
```
Expected: no output.

- [ ] **Step 5: Run the content gate**

Run:
```bash
cd .claude/worktrees/_release
node scripts/check_content.mjs
echo "exit=$?"
```
Expected: `0 failures`, `exit=0`. (`canon.md` is prose, so this is a regression check that nothing else broke.)

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/_release
git add content/story/canon.md
git commit -m "docs(I-051): canon gains the unsealed years and Void's origin"
```

- [ ] **Step 7: Quality gate**

Independent reviewer on `git show HEAD`. Checks: the new §5 paragraph does not contradict the existing elements table; the chronology entry introduces no absolute date; no god was smuggled in. Fix findings before Task 7.

---

### Task 7: Add the five lore nodes

**Files:**
- Modify: `content/story/lore.json`
- Test: `scripts/check_content.mjs` (the gate is the test)

**Interfaces:**
- Consumes: C3, C5 and C6 from Task 5; Void's origin paragraph from Task 6.
- Produces: thread `the-unsealed-years` with exactly five fragments. Nothing later depends on it.

**Schema** (`content/schemas/lore.schema.json`, `additionalProperties: false`): required `id, title, kind, summary, links, body, anchor, thread`. `id` matches `^lore-[a-z0-9]+(-[a-z0-9]+)*$`. `kind` is the constant `"lore"`.

**Two gate rules that will reject a mistake:**
- `check_content.mjs:235` — hard FAIL if `anchor` does not resolve to an existing story node.
- `check_content.mjs:472` — WARN if a thread has only one fragment.

**Bodies below are drafts, per the owner's instruction to build the world first and sharpen prose later.** They are written to pass G4 and G7 as-is; sharpening is Task 8's second idea.

- [ ] **Step 1: Verify gate dependencies are installed**

Run:
```bash
cd .claude/worktrees/_release/scripts && npm install && cd .. && node scripts/check_content.mjs; echo "exit=$?"
```
Expected: `exit=0`. This is the **baseline** — record the failure and warning counts before adding anything.

- [ ] **Step 2: Append the five nodes to `content/story/lore.json`**

```json
{
  "id": "lore-the-ground-that-keeps-count",
  "kind": "lore",
  "title": "The Ground That Keeps Count",
  "summary": "A burial detail on the Ashvale Front explains why the digging never stops, without knowing he is explaining anything.",
  "body": "Two seasons I have dug here and I have stopped asking which side a man came from. You bury them or you fight them again in the spring, and the second time they do not stop when you shout. The Embervale lads dig the north rows, we dig the south, and not one person on either side has ever said a word about that arrangement out loud.",
  "anchor": "region-ashvale-front",
  "thread": "the-unsealed-years",
  "links": []
},
{
  "id": "lore-nothing-left-to-bury",
  "kind": "lore",
  "title": "Nothing Left to Bury",
  "summary": "A Cindered survivor on the one thing the city could not do for its dead.",
  "body": "People ask what we buried. We buried nothing. That is the whole of it. There was no body to carry, no weight to lower, no place to set a name down. The wall kept the shadow and the ground kept nothing. A grief you cannot put in the earth is a different animal than the kind you can.",
  "anchor": "region-cindervast",
  "thread": "the-unsealed-years",
  "links": []
},
{
  "id": "lore-the-first-seal",
  "kind": "lore",
  "title": "The First Seal",
  "summary": "The oldest sealed record in the tower archive, and the honest thing a bell-warden says about it.",
  "body": "It is a grain tally. Four lines, the date we count from, and the seal. Every claim of age in this land measures back to it and stops there. I tell the students what my warden told me: this is not the oldest thing that happened, it is the oldest thing anyone signed for. What came before it is not lost. It was never written.",
  "anchor": "faction-bellfaith",
  "thread": "the-unsealed-years",
  "links": []
},
{
  "id": "lore-the-vacuum-holds",
  "kind": "lore",
  "title": "The Vacuum Holds",
  "summary": "The Ash Prophet preaches a meaning for the erasure, and nobody corrects him.",
  "body": "They tell me the ruin is empty. I have stood in it. It is the fullest place in this land. What was taken there was taken on purpose and by a hand, and a thing done on purpose can be answered. Bring me someone willing to say that much about a famine.",
  "anchor": "char-the-ash-prophet",
  "thread": "the-unsealed-years",
  "links": []
},
{
  "id": "lore-what-the-ice-gives-back",
  "kind": "lore",
  "title": "What the Ice Gives Back",
  "summary": "The expedition camp catalogues something the ground surrendered that predates every record they have.",
  "body": "Sixth crate this season. Same as the others — worked metal, no maker's mark, and an edge that has not dulled in whatever time it spent down there. It gets logged as salvage because there is no other column to put it in. I have started a second book. It has one column and no dates in it.",
  "anchor": "region-icefield",
  "thread": "the-unsealed-years",
  "links": []
}
```

- [ ] **Step 3: Verify the JSON parses and the thread has five members**

Run:
```bash
cd .claude/worktrees/_release
python3 -c "
import json
d=json.load(open('content/story/lore.json'))
t=[n for n in d if n.get('thread')=='the-unsealed-years']
print('total nodes:', len(d))
print('thread members:', len(t))
assert len(t)==5, 'expected 5'
print('ok')
"
```
Expected: `thread members: 5`, `ok`.

- [ ] **Step 4: Run the gate**

Run:
```bash
cd .claude/worktrees/_release
node scripts/check_content.mjs
echo "exit=$?"
```
Expected: `0 failures`, `exit=0`, and **no new warning** about `the-unsealed-years`. If an anchor fails to resolve, the message names the offending id — fix the anchor, do not invent a story node.

- [ ] **Step 5: Run the scripts suite**

Run:
```bash
cd .claude/worktrees/_release/scripts && npm test
```
Expected: all pass. **Do not** run `node --test scripts/tests/` — that is `MODULE_NOT_FOUND`, exit 1, on Node 26.

- [ ] **Step 6: G4 and G7 scan on the new bodies**

Run:
```bash
cd .claude/worktrees/_release
python3 -c "
import json,re
d=json.load(open('content/story/lore.json'))
t=[n for n in d if n.get('thread')=='the-unsealed-years']
blob=' '.join(n['body']+' '+n['summary']+' '+n['title'] for n in t)
bad=re.findall(r'\b(okay|guys|tech|percent|boss|England|Rome|Roman|Norse|Latin|Greek|Europe|Christian|Islam)\b',blob,re.I)
print('violations:', bad or 'none')
"
```
Expected: `violations: none`.

- [ ] **Step 7: Commit**

```bash
cd .claude/worktrees/_release
git add content/story/lore.json
git commit -m "feat(I-051): five lore nodes on the unsealed-years thread"
```

- [ ] **Step 8: Quality gate**

Independent reviewer on `git show HEAD`. Checks: no fragment contradicts `canon.md` §5 as amended in Task 6; the Ash Prophet fragment is left wrong and uncorrected; no fragment names a god; no fragment answers any of the four permanent unknowns; the gate output is genuinely clean and was not read off a piped `$?`. Fix findings before Task 8.

---

### Task 8: Capture the two follow-up ideas

**Files:**
- Create: two `.claude/idea_backlog/I-0NN-<slug>/` folders via the toolkit skill

**Interfaces:**
- Consumes: the holes named in Task 2 (Iron Regent's motive) and Task 7 (draft prose).
- Produces: nothing downstream. This task exists so the holes are tracked rather than forgotten.

- [ ] **Step 1: File the Iron Regent idea**

Invoke `/ps-release-workflow:idea`. Title: *"Iron Regent's replacement motive — the king-taboo his ambition was built on was removed by I-051"*.

Problem to record: `core-story.md:138` and `:190` now read *"the only power left"*, which is coherent but blunter than the removed *"second king of a land that curses the word king"*. The antagonist's deepest secret lost its edge, deliberately and with the owner's agreement that holes may be filled later.

- [ ] **Step 2: File the prose-sharpening idea**

Invoke `/ps-release-workflow:idea`. Title: *"Sharpen the five the-unsealed-years lore bodies"*.

Problem to record: the bodies committed in Task 7 are gate-passing drafts written under the owner's *world first, prose later* instruction. They have not been through `story-content-writer` craft review.

- [ ] **Step 3: Verify both landed in the catalog**

Run:
```bash
cd .claude/worktrees/_release
python3 -c "
import json
d=json.load(open('.claude/idea_backlog/_catalog.json'))
for e in d[-3:]: print(e['id'], '|', e['title'][:70])
"
```
Expected: the two new ideas appear as the most recent entries.

- [ ] **Step 4: Final repo-wide verification**

Run:
```bash
cd .claude/worktrees/_release
echo "--- king theme gone ---"
git grep -nE "กษัตริย์องค์เดียว|องค์ที่สอง|สาบส่งคำว่ากษัตริย์|only king in all history|curse word|dares wear a crown" -- docs/ content/ ':!docs/superpowers/' ':!docs/worldbuilding/DR-006-swf-scope.md'
echo "--- content gate ---"
node scripts/check_content.mjs; echo "gate-exit=$?"
echo "--- scripts suite ---"
cd scripts && npm test
```
Expected: no grep hits, `0 failures`, `gate-exit=0`, all tests pass.

- [ ] **Step 5: Quality gate**

Final independent review across the whole change set (`git log --oneline release/1.7 ^HEAD~8`). Reviewer checks spec coverage: every deliverable in design §9 has a commit. Report any gap.

---

## Self-Review

**Spec coverage** — every deliverable in design §9 maps to a task:

| Design §9 deliverable | Task |
| --- | --- |
| 9.1 `A1-cosmology.md` | 5 |
| 9.2 five lore nodes, thread `the-unsealed-years` | 7 |
| 9.3 king theme removal — core-story, glossary | 2 |
| 9.3 king theme removal — shipped novel, HTML | 3 |
| 9.3 king theme removal — A0 | 4 |
| 9.4 canon §1 and §5 | 6 |
| 9.5 `DR-006` | **already committed** in `6489d50` |
| 9.6 two follow-up ideas | 8 |
| SWF §7 pointer (design §9.5 consequence) | 1 |

**Placeholder scan** — no TBD, TODO, "similar to Task N", or "add appropriate handling". Every edit carries its exact before and after string. The one judgement call left to the implementer is Task 3 Step 5 (whether the SVG draws a crown), which is written as a conditional with an explicit "change nothing" branch rather than an open instruction.

**Type consistency** — the replacement phrasing is fixed once in Task 2 and reused verbatim in Tasks 3 and 4: **อำนาจเดียวที่เหลือ** for the Iron Regent's ambition, **ไม่ยอมมีศูนย์กลาง / ไม่ยอมอยู่ใต้อำนาจกลาง** for the land's refusal. Claim ids `C1`–`C7` and the thread id `the-unsealed-years` are used identically in Tasks 5, 6 and 7.

**Known limitation carried from the spec:** `cosmology-draft-zero.md`, which SWF §1 describes as the kept no-research baseline, does not exist in any branch. There is no baseline to score this against.
