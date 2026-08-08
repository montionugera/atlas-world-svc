// F-035 — guards the seal-provenance rule and the citations that point at it.
//
// Two failure modes this exists for:
//   1. A world rule with no test can be deleted silently (see the F-029 lesson:
//      a green suite is not a covering suite).
//   2. A0 cited canon.md:280-285 for a claim that range never contained, and
//      nothing noticed. Citations into canon.md are line-numbered, so any edit
//      above them rots them. These tests resolve the citations for real.
//
// Spec: docs/superpowers/specs/2026-08-08-bellfaith-seal-provenance-design.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANON_PATH = join(REPO, 'content', 'story', 'canon.md');
const A0_PATH = join(REPO, 'docs', 'worldbuilding', 'A0-current-world.md');

const canon = () => readFileSync(CANON_PATH, 'utf8');
const a0 = () => readFileSync(A0_PATH, 'utf8');

/** The 1-indexed line a `canon.md:N` citation points at, or undefined. */
const canonLine = (n) => canon().split('\n')[n - 1];

test('canon states that the seal certifies provenance, not truth', () => {
  assert.match(
    canon(),
    /certifies provenance, not truth/,
    'canon.md must carry the F-035 rule (spec D1)',
  );
  assert.match(
    canon(),
    /a statement was given to the Bellfaith\s+and recorded/,
    'canon.md must say what the seal actually attests, not only that it does',
  );
});

test('canon does not reassert that a sealed proclamation is true', () => {
  assert.doesNotMatch(
    canon(),
    /count as true only when stamped/,
    'the pre-F-035 wording asserted the exact thing D1 denies; it must stay removed',
  );
});

test('canon says forging the seal is worthless rather than impossible', () => {
  assert.match(
    canon(),
    /Nobody forges the seal\*\*, because forging it is worthless/,
    'spec D2: forgery is possible and pointless — never "impossible", which would need a mechanism canon.md section 5.3 forbids',
  );
});

test('every canon.md citation in A0 resolves to a real line', () => {
  const cites = [...a0().matchAll(/`canon\.md:(\d+)(?:-(\d+))?`/g)];
  assert.ok(cites.length > 0, 'A0 should cite canon.md somewhere');

  const total = canon().split('\n').length;
  for (const [raw, start, end] of cites) {
    const last = Number(end ?? start);
    assert.ok(
      last <= total,
      `A0 cites ${raw} but canon.md has only ${total} lines`,
    );
  }
});

test('the two citations F-035 owns point at the sentences they claim', () => {
  // The wax-seal property. A0 was the sole carrier of this claim until F-035
  // promoted the sentence into canon; both A0 sites must now resolve to it.
  const waxCites = [...a0().matchAll(/`canon\.md:(\d+)`/g)]
    .map((m) => Number(m[1]))
    .filter((n) => /tampered with/.test(canonLine(n) ?? ''));
  assert.ok(
    waxCites.length >= 2,
    'A0 must cite the canon line carrying "tampered with" from both its narrative note and the V16 row',
  );

  // The utility-magic list, whose citation was stale before F-035.
  const utilityCites = [...a0().matchAll(/`canon\.md:(\d+)`/g)]
    .map((m) => Number(m[1]))
    .filter((n) => /is utility: the Bellfaith's bells/.test(canonLine(n) ?? ''));
  assert.ok(
    utilityCites.length >= 1,
    'A0 must cite the canon line carrying the utility-magic list',
  );
});

test('the V16 row still carries the wax claim and its faith-or-magic ambiguity', () => {
  const v16 = a0()
    .split('\n')
    .find((l) => l.startsWith('| V16 '));
  assert.ok(v16, 'A0 must still have a V16 row');
  assert.match(v16, /wax seals crack only when tampered with/);
  assert.match(
    v16,
    /declines to say whether this is faith or magic/,
    'the ambiguity is the only posture compatible with "no god exists, only belief" — it may not be resolved',
  );
  assert.match(v16, /`canon\.md:\d+`/, 'V16 must cite where the claim lives');
});
