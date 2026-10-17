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
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANON_PATH = join(REPO, 'content', 'story', 'canon.md');
const WB_DIR = join(REPO, 'docs', 'worldbuilding');
const A0_PATH = join(WB_DIR, 'A0-current-world.md');

const canon = () => readFileSync(CANON_PATH, 'utf8');
const a0 = () => readFileSync(A0_PATH, 'utf8');

/** The body under the first `##`/`###` heading whose title starts with `headingPrefix`,
 *  up to the next heading of the same or higher level. */
const sectionBody = (text, headingPrefix) => {
  const rows = text.split('\n');
  const start = rows.findIndex(
    (l) => /^(##|###) /.test(l) && l.replace(/^#+ /, '').startsWith(headingPrefix),
  );
  if (start === -1) return '';
  const level = rows[start].match(/^#+/)[0].length;
  const end = rows.findIndex(
    (l, i) => i > start && new RegExp(`^#{1,${level}} `).test(l),
  );
  return rows.slice(start, end === -1 ? rows.length : end).join('\n');
};

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

test('no world doc reasserts that a sealed proclamation is true', () => {
  // canon alone is not enough: A0 is the sharpened summary of canon and carried
  // the retracted sentence verbatim while canon had already dropped it.
  const offenders = [['canon.md', canon()]];
  for (const f of readdirSync(WB_DIR).filter((f) => f.endsWith('.md'))) {
    offenders.push([f, readFileSync(join(WB_DIR, f), 'utf8')]);
  }
  // Tolerate markdown emphasis inside the phrase — DR-001 writes it as
  // "_count as true_ only when stamped" and a literal match sailed past it.
  const RETRACTED = /count as true[_*\s]+only when[\s_*]+stamped/;
  const hits = offenders
    .filter(([, text]) => RETRACTED.test(text))
    // A record may quote the old wording if it marks it superseded.
    .filter(([, text]) => !/Superseded in part by F-035/.test(text))
    .map(([name]) => name);
  assert.deepEqual(hits, [], `retracted pre-F-035 wording still live in: ${hits.join(', ')}`);
});

test('no world doc calls forging the seal the high-value crime', () => {
  // A1 asserted the exact inverse of D2 and shipped on release/1.7.
  const hits = readdirSync(WB_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /Forging a seal is the highest-value crime/.test(readFileSync(join(WB_DIR, f), 'utf8')));
  assert.deepEqual(hits, [], `contradicts canon section 4 (F-035 D2): ${hits.join(', ')}`);
});

test('canon says forging the seal is worthless rather than impossible', () => {
  assert.match(
    canon(),
    /Forging the seal is possible, and worthless/,
    'spec D2 says forgery is POSSIBLE and worthless. "Nobody forges it" states the wrong fact — a quest author greps the bold line and gets the belief the spec set out to retire.',
  );
});

// Superseded by G-CITE (Plan E Task 1): the blank-line citation test and its
// KNOWN_STALE tolerance set are gone — G-CITE bans the line form outright, so
// there is no rot left to tolerate.

test('the two citations F-035 owns point at the sections they claim', () => {
  // The wax-seal property. A0 was the sole carrier of this claim until F-035
  // promoted the sentence into canon; both A0 sites must now resolve to it.
  // Section-form since G-CITE: the cited SECTION BODY must carry the claim.
  const cites = a0(); // the citations live in A0; the claims live in canon
  const text = canon();
  const news = /`canon\.md §4 "How news travels \(the Bellfaith, three layers, two speeds\)"`/.test(cites);
  assert.ok(
    news,
    'A0 must cite the canon section carrying the wax rule — V16 is the site that makes the claim',
  );
  const newsBody = sectionBody(text, 'How news travels');
  assert.match(newsBody, /tampered with/, 'the cited section must carry the wax claim');

  // The utility-magic list, whose citation was stale before F-035.
  const model = /`canon\.md §5 "The magic model"`/.test(cites);
  assert.ok(model, 'A0 must cite the canon section carrying the utility-magic list');
  assert.match(
    sectionBody(text, 'The magic model'),
    /is utility: the Bellfaith's bells/,
    'the cited section must carry the utility-magic list',
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
  assert.match(v16, /`canon\.md §\d+ "/, 'V16 must cite where the claim lives');
});
