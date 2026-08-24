// Plan D — the name generator.
//
// Replaces tools/mapforge/lib/world-gen.mjs:70-71's 12 x 10 = 120-combination
// pool. 626 names are needed. Uniqueness was never the problem: the old pool
// is already 100% unique and still unusable, because every name is a
// two-syllable Germanic trochee and nothing tells you what the place IS.
//
// Determinism: sha256 over (stream, attempt). No Math.random, no mutable
// module state. Given the same (register, form, classifier, stream, used,
// reserved) the same name comes out on every engine.
import { createHash } from "node:crypto";

export const REGISTERS = Object.freeze([
  "basin-anglic", "north-log", "moorstone", "sandtongue", "reedspeech",
]);
export const NAME_FORMS = Object.freeze(["stem", "stem-classifier", "of-form", "compound"]);

// A 32-bit unsigned draw from a named stream at a given attempt index.
function draw({ stream, attempt, slot }) {
  const h = createHash("sha256").update(`${stream}:${attempt}:${slot}`).digest();
  return h.readUInt32BE(0);
}

const pick = (arr, n) => arr[n % arr.length];

function buildName({ register, form, classifier, attempt, stream }) {
  const onset = pick(register.onsets, draw({ stream, attempt, slot: "onset" }));
  const rime = pick(register.rimes, draw({ stream, attempt, slot: "rime" }));
  const link = pick(register.links, draw({ stream, attempt, slot: "link" }));
  const onset2 = pick(register.onsets, draw({ stream, attempt, slot: "onset2" }));
  const stem = `${onset}${rime}`;
  if (form === "stem") return stem;
  if (form === "stem-classifier") return classifier ? `${stem} ${classifier}` : stem;
  if (form === "of-form") return classifier ? `${classifier} ${link} ${stem}` : `${onset2} ${link} ${stem}`;
  return `${onset}${pick(register.rimes, draw({ stream, attempt, slot: "rime2" }))}${rime}`;
}

// Draws until the candidate is neither used nor reserved. The attempt index is
// part of the hash input, so the search itself is deterministic; a caller that
// mints the same sequence twice gets the same sequence.
export function mintName({ register, form, classifier, stream, used, reserved }) {
  for (let attempt = 0; attempt < 4096; attempt++) {
    const cand = buildName({ register, form, classifier, attempt, stream });
    if (!used.has(cand) && !reserved.has(cand)) return cand;
  }
  // In-band, never a throw: a caller in a gate must be able to report this.
  return `UNMINTABLE:${stream}:${form}`;
}

// Phoneme normalisation: collapse the digraphs that carry one sound, drop
// doubled letters and a silent trailing e, so Rooktide/Rooktyde read as near
// and Thornveil/Tornveil read as identical onsets.
function phonemes({ name }) {
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/th/g, "T").replace(/sh/g, "S").replace(/ch/g, "C")
    .replace(/ck/g, "k").replace(/ph/g, "f").replace(/qu/g, "kw")
    .replace(/(.)\1+/g, "$1")
    .replace(/y/g, "i")
    .replace(/e$/, "");
}

export function phonemeDistance({ a, b }) {
  const x = phonemes({ name: a }), y = phonemes({ name: b });
  const prev = new Array(y.length + 1);
  const cur = new Array(y.length + 1);
  for (let j = 0; j <= y.length; j++) prev[j] = j;
  for (let i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= y.length; j++) prev[j] = cur[j];
  }
  return prev[y.length];
}

const STOP_WORDS = Object.freeze(new Set(["the", "of", "and"]));

// ERRATUM vs the plan text: the drafted counter kept a word-final silent e,
// so "Rooktide" read as 3 syllables and the plan's own G-NAME-PROSODY fixture
// (four two-syllable trochees) measured syllableShare 0.50 / threePlusShare
// 0.50 and could never pass. A silent trailing e is not a syllable — strip it
// per content word before counting vowel groups.
//
// ERRATUM to the first erratum: an earlier revision used a `w.length > 2`
// guard around that strip so short words kept their trailing e. That guard
// was an undocumented fudge whose only effect was turning "the" into "th" —
// character-stripping a stop-word deletes a whole word instead of counting
// zero for it. Articles/conjunctions/prepositions carry no prosodic weight,
// so stop-words are now excluded ENTIRELY, as whole words, before counting;
// every remaining content word gets the shipped silent-e strip unconditionally.
//
// Plan-fixture reconciliation: the plan pins "The Drowned Stair" = 3 and this
// still holds — "the" contributes 0, vowel-group counting reads "drowned" as
// two groups (o, e; the final e is NOT silent because the word ends in "d")
// plus "stair" as one → 0 + 2 + 1 = 3. No conflict with correct English
// behaviour or the committed-name counts (Millcross=2, Gildmark=2,
// Rooktide=2, Norhollow=3), none of which contains a stop-word.
export function syllableCount({ name }) {
  const words = name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w));
  if (!words.length) return 0; // a title made only of stop-words carries no prosody
  const m = words.map((w) => w.replace(/e$/, "")).join(" ").match(/[aeiouy]+/g);
  return m ? m.length : 1;
}

export function prosody({ names }) {
  if (!names.length) return { syllableShare: 0, threePlusShare: 0, ofFormShare: 0 };
  const counts = new Map();
  let threePlus = 0, ofForm = 0;
  for (const n of names) {
    const s = syllableCount({ name: n });
    counts.set(s, (counts.get(s) ?? 0) + 1);
    if (s >= 3) threePlus++;
    if (/\s(of|of the|under|beyond|among|between|below|within|off|past|across|through|at|by|over|out of|north of|beneath)\s/i.test(n)) ofForm++;
  }
  return {
    syllableShare: Math.max(...counts.values()) / names.length,
    threePlusShare: threePlus / names.length,
    ofFormShare: ofForm / names.length,
  };
}

export function registerOf({ continent, registers }) {
  return registers.continentRegister[continent] ?? null;
}
