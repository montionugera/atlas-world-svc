# F-035 — Seal Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write into world law that the Bellfaith seal certifies *provenance, not truth*, fix the citation defect that made this gap visible, and add a guard test so neither can silently vanish.

**Architecture:** Three tasks, each independently reviewable. Task 1 puts the rule in `canon.md` §4 where the seal is already described. Task 2 repairs `A0-current-world.md` V16, whose citation points at a paragraph that does not contain the claim it attributes. Task 3 adds a `node --test` guard covering both, then sweeps the existing corpus for collisions with grep evidence.

**Tech Stack:** Markdown world-law documents (`content/story/canon.md`, `docs/worldbuilding/A0-current-world.md`), Node's built-in test runner (`node --test`, `scripts/tests/*.test.mjs`), `scripts/check_content.mjs`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-08-bellfaith-seal-provenance-design.md`, status `accepted`. It is binding; do not re-derive its decisions.
- **Add no new magic.** `canon.md` §5.1 (magic is cheap and everyday), §5.3 (rune-craft belongs to everyone; no church holds defense over another), §5.4 (no spell resolves a political knot) all hold unchanged.
- **Add no new access rule.** The gate already exists at `canon.md:252-254`. The spec removed a two-witness rule precisely because it duplicated that gate.
- **Preserve V16's faith-or-magic ambiguity verbatim** — "the text declines to say whether this is faith or magic". This is the only posture compatible with *no god exists, only belief*.
- **Every amendment ships its collision list in the same commit** (`canon.md` §6).
- **World first, prose later.** This feature ships world law only. It authors **no** new lore node, quest or dialogue.
- **Editing rule:** work only inside the claimed `F-035` worktree. Merge `release/1.7` into `feat/F-035` before Gate 1.
- **Line numbers in this plan are as of `release/1.7` HEAD `2140c73`.** Task 1 inserts lines into `canon.md`, which shifts every later line. **Task 2 must re-locate its target by content, never by the numbers printed here.**

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `content/story/canon.md` | World law. Gains the provenance rule and the tamper-evidence sentence, both inside §4's layer-3 bullet where the seal already lives. | 1 |
| `docs/worldbuilding/A0-current-world.md` | Sharpened summary of what the world already is. V16's citation is repaired to point at the canon line that now genuinely carries the claim. | 2 |
| `scripts/tests/seal-provenance.test.mjs` | **New.** Guards both facts: canon carries the rule, and V16's citation resolves to a line that actually mentions tampering. | 3 |

---

## Task 1: Write the provenance rule into canon §4

**Files:**
- Modify: `content/story/canon.md:247-250` (the layer-3 bullet inside "How news travels")

**Interfaces:**
- Consumes: nothing.
- Produces: two sentences in `canon.md` that Task 2 cites and Task 3 tests. The exact strings later tasks match on are **`certifies provenance, not truth`** and **`cracks only when tampered with`**, the second of which must sit on a single line.

- [ ] **Step 1: Read the current bullet to confirm it is unchanged**

Run: `sed -n '247,255p' content/story/canon.md`

Expected: the numbered item 3 beginning `**The bell-seal certifies.**` followed by the blank line and the paragraph starting `The Bell-Keeper's corruption lives entirely in layers 2 and 3`.

If it differs, stop — the plan's anchor has moved and the rest of this task's line numbers are void.

- [ ] **Step 2: Replace the layer-3 bullet**

Replace exactly this text:

```markdown
3. **The bell-seal certifies.** Inter-town proclamations and news-letters
   count as true only when stamped with the Bellfaith seal — the seal is
   this world's state news agency and notary in one. An unsealed
   proclamation is just a rumor with good staging.
```

with:

```markdown
3. **The bell-seal certifies provenance, not truth.** Inter-town
   proclamations and news-letters carry weight only when stamped with the
   Bellfaith seal — the seal is this world's state news agency and notary
   in one. What it attests is that **a statement was given to the Bellfaith
   and recorded**, never that the statement is accurate. A notary certifies
   that a person signed, not that what they signed is so. An unsealed
   proclamation is just a rumor with good staging; a sealed one is a rumor
   somebody put their name to. The wax cracks only when tampered with, so
   a sealed letter cannot be opened and closed again unnoticed — the text
   declines to say whether that is faith or craft.

   **Nobody forges the seal**, because forging it is worthless. A stamped
   page with no bell tolled for it and no bell-rider carrying it is exactly
   the rumor with good staging above. The towns believe sealed news anyway;
   that they read "sealed" as "true" is the standing mistake this world is
   built on.
```

Two things about that replacement text:

**The reworded opening is deliberate.** *"count as true"* became *"carry weight"* — the old phrasing asserted the exact thing the new rule denies, so leaving it would have put a contradiction two sentences apart.

<div class="callout danger">

**Line-wrapping requirement.** `canon.md` is hard-wrapped at roughly 70 columns, and both Task 2 and Task 3 match on a **single line**. The phrase `cracks only when tampered with` must land entirely on one line, exactly as written above. If your editor reflows the paragraph, put it back before committing — a reflow that splits the phrase turns Task 2's grep and Task 3's assertion into false failures.

</div>

- [ ] **Step 3: Verify the surrounding paragraph still reads correctly**

Run: `sed -n '/bell-seal certifies provenance/,/never in the tone or timing/p' content/story/canon.md`

Expected: the new bullet, then the unchanged `The Bell-Keeper's corruption lives entirely in layers 2 and 3…` paragraph. That paragraph must **not** be edited — it is the pre-existing gate the spec relies on.

- [ ] **Step 4: Verify no gate regressed**

Run: `node scripts/check_content.mjs; echo "exit=$?"`
Expected: `exit=0` and `0 failures, 0 warnings`. (`canon.md` is prose and is not parsed by the gate; this confirms nothing else broke.)

Run: `node --test scripts/tests/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `pass 181`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add content/story/canon.md
git commit -m "docs(F-035): the bell-seal certifies provenance, not truth

canon.md section 4 layer 3 now states what the seal actually attests --
that a statement was given to the Bellfaith and recorded, never that it
is accurate -- and that forging it is possible and worthless.

Also changes the bullet's opening from 'count as true' to 'carry
weight'. The old wording asserted the exact thing the new rule denies.

The tamper-evidence sentence moves in from A0 V16, keeping its
faith-or-craft ambiguity verbatim. The Bell-Keeper gate paragraph
immediately below is deliberately untouched."
```

---

## Task 2: Repair the A0 V16 citation

**Files:**
- Modify: `docs/worldbuilding/A0-current-world.md` — row **V16** of the world-invariants table (line 337 before Task 1; **re-locate by content**)

**Interfaces:**
- Consumes: from Task 1, the string `cracks only when tampered with` now present on a single line of `content/story/canon.md`.
- Produces: a V16 row whose citation resolves. Task 3 tests exactly this.

- [ ] **Step 1: Prove the defect still exists before fixing it**

Run: `grep -n "wax seals crack only when tampered with" docs/worldbuilding/A0-current-world.md`
Expected: one hit, the V16 row.

Run: `sed -n '280,285p' content/story/canon.md`
Expected: the Gildmark far-mirror paragraph, containing **no** mention of wax, seals cracking, or tampering. This is the defect: V16 attributes a claim to a range that does not contain it.

- [ ] **Step 2: Find the new canon line number**

Run: `grep -n "cracks only when tampered with" content/story/canon.md`

Record the line number it prints — call it `<N>`. This is the line Task 1 created. Do not guess it.

- [ ] **Step 3: Fix the citation in V16**

In the V16 row, find the citation that currently reads `canon.md:280-285` and replace it with `canon.md:<N>` using the number from Step 2.

If V16 carries no explicit citation in its own cells, add one to the end of its **Source / why it matters** cell in the form `(\`canon.md:<N>\`)`, matching how neighbouring rows cite.

Leave every other word of V16 alone — in particular the phrase *"the text declines to say whether this is faith or magic"* stays exactly as written.

- [ ] **Step 4: Verify the citation now resolves**

Run:
```bash
N=$(grep -n "cracks only when tampered with" content/story/canon.md | cut -d: -f1)
sed -n "${N}p" content/story/canon.md | grep -q "tampered with" && echo "RESOLVES" || echo "BROKEN"
```
Expected: `RESOLVES`

Run: `grep -n "canon.md:280-285" docs/worldbuilding/A0-current-world.md`
Expected: no output — the stale citation is gone.

- [ ] **Step 5: Commit**

```bash
git add docs/worldbuilding/A0-current-world.md
git commit -m "fix(F-035): A0 V16 cited a canon range that never held the claim

V16 attributes 'wax seals crack only when tampered with' to
canon.md:280-285, which is the Gildmark far-mirror paragraph. The
sentence existed nowhere in canon.md at all -- A0 was the sole carrier
of a claim it presented as canon.

Task 1 put the sentence in canon.md section 4; this repoints V16 at it.
The faith-or-magic ambiguity is preserved verbatim."
```

---

## Task 3: Guard both facts with a test, then sweep for collisions

**Files:**
- Create: `scripts/tests/seal-provenance.test.mjs`
- Test: itself

**Interfaces:**
- Consumes: from Task 1 the string `certifies provenance, not truth` in `canon.md`; from Task 2 a V16 citation of the form `canon.md:<N>`.
- Produces: nothing later tasks depend on. This is the terminal task.

Why this exists: a world rule with no test can be deleted silently, and this feature's whole origin was a citation nobody had checked. Both failure modes get a assertion.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/seal-provenance.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANON = join(REPO, 'content', 'story', 'canon.md');
const A0 = join(REPO, 'docs', 'worldbuilding', 'A0-current-world.md');

test('canon states that the seal certifies provenance, not truth', () => {
  const canon = readFileSync(CANON, 'utf8');
  assert.match(
    canon,
    /certifies provenance, not truth/,
    'canon.md must carry the F-035 rule; see docs/superpowers/specs/2026-08-08-bellfaith-seal-provenance-design.md D1',
  );
  assert.match(
    canon,
    /a statement was given to the Bellfaith\s+and recorded/,
    'canon.md must say what the seal actually attests',
  );
});

test('canon does not reassert that a sealed proclamation is true', () => {
  const canon = readFileSync(CANON, 'utf8');
  assert.doesNotMatch(
    canon,
    /count as true only when stamped/,
    'the pre-F-035 wording asserted the exact thing D1 denies',
  );
});

test('A0 V16 cites a canon line that really mentions tampering', () => {
  const a0 = readFileSync(A0, 'utf8');
  const v16 = a0.split('\n').find((l) => l.startsWith('| V16 '));
  assert.ok(v16, 'A0 must still have a V16 row');

  const cite = v16.match(/canon\.md:(\d+)/);
  assert.ok(cite, 'V16 must cite a single canon.md line for the wax-seal claim');

  const line = readFileSync(CANON, 'utf8').split('\n')[Number(cite[1]) - 1];
  assert.ok(line !== undefined, `canon.md has no line ${cite[1]}`);
  assert.match(
    line,
    /tampered with/,
    `V16 cites canon.md:${cite[1]}, which does not mention tampering — this is the exact defect F-035 fixed`,
  );
});
```

- [ ] **Step 2: Run it and watch the right things pass and fail**

Run: `node --test scripts/tests/seal-provenance.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"`

Expected after Tasks 1 and 2: `pass 3`, `fail 0`.

- [ ] **Step 3: Prove the test actually guards something**

Temporarily break canon and confirm the test goes red — a test that passes on broken input guards nothing.

```bash
cp content/story/canon.md /tmp/canon.bak
sed -i '' 's/certifies provenance, not truth/certifies things/' content/story/canon.md
node --test scripts/tests/seal-provenance.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"
cp /tmp/canon.bak content/story/canon.md
```

Expected: the middle run reports `fail 1` (or more). Then restore, and re-run to confirm `pass 3`, `fail 0`.

- [ ] **Step 4: Sweep the corpus for collisions and record the evidence**

Run each and read the hits:

```bash
grep -rn "sealed" content/story/dialogue.json content/story/quests.json | head -20
grep -rn "seal" content/story/lore.json | grep -vi "unsealed" | head -20
```

Confirm each of these known sites still holds under D1, and write the finding into the commit message:

- `content/story/dialogue.json:122-123` — the Bell-Keeper's confession, *"I sealed the proclamation the Broker wrote… My own hand. My own seal."* **Consistent, and sharper**: he applied a genuine seal to a statement the Broker supplied. His crime is the burning, not a forgery.
- `content/story/lore.json:317`, `:327`, `:337`, `:343` — the warden tallies and the seal log, counting proclamations that arrived sealed and were never read. **Consistent**: they describe the omission gate, which D1 leaves untouched.
- `content/story/quests.json:231-235` and `event-the-seal-that-matched-no-one` — a **caravan** seal on a burned wagon, matching neither town. **A different object entirely**, not the Bellfaith seal. No change, and the plan flags it so no future reader conflates the two.
- `content/story/lore.json:427` (`lore-the-first-seal`) — *"every lease and every claim measures back to this page"*. **Consistent**: about dating, not about needing a seal (spec §6).

If any grep turns up a site not in this list that asserts *sealed means true*, fix it in this same commit per `canon.md` §6, and name it in the message.

- [ ] **Step 5: Run the full gates**

Run: `node scripts/check_content.mjs; echo "exit=$?"`
Expected: `exit=0`, `0 failures, 0 warnings`.

Run: `node --test scripts/tests/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `pass 184`, `fail 0` — the 181 baseline plus this task's 3.

- [ ] **Step 6: Commit**

```bash
git add scripts/tests/seal-provenance.test.mjs
git commit -m "test(F-035): guard the provenance rule and the V16 citation

Three assertions: canon carries the rule, canon no longer carries the
pre-F-035 wording that contradicted it, and A0 V16's citation resolves
to a canon line that genuinely mentions tampering. The third would have
caught the original defect.

Verified red-then-green: mutating the canon sentence turns the suite
red, so the guard is real.

Collision sweep, all consistent under D1 and none requiring an edit:
the Bell-Keeper's confession (dialogue.json:122-123, a genuine seal on
a supplied statement -- the crime is the burning); the warden tallies
and seal log (lore.json:317,327,337,343, the omission gate D1 leaves
alone); lore-the-first-seal (lore.json:427, about dating not sealing).
event-the-seal-that-matched-no-one is a caravan seal, a different
object, noted so nobody conflates it later."
```

---

## Definition of done

- `content/story/canon.md` §4 states the provenance rule and the tamper-evidence property.
- `docs/worldbuilding/A0-current-world.md` V16 cites a canon line that contains the claim.
- `scripts/tests/seal-provenance.test.mjs` exists, holds 3 assertions, and has been shown red-then-green.
- `node scripts/check_content.mjs` → exit 0, 0 failures, 0 warnings.
- `node --test scripts/tests/*.test.mjs` → 184 pass, 0 fail.
- No new lore node, quest or dialogue was authored (*world first, prose later*).
- Gate 1 (`scripts/precheck.sh`) passes before `ship`.

## Deliberately out of scope

- **A general citation-integrity sweep** over every `canon.md:NNN` reference in `A0` and the `DR-*` records. V16 is almost certainly not the only stale one — I-051 already had to repair 48 citations by hand. That deserves its own idea and its own gate, not a smuggled expansion of this feature.
- **The Iron Regent's motive (I-080).** It touches the Bellfaith and is affected by this ruling, but it is a separate creative decision the owner has not yet made.
