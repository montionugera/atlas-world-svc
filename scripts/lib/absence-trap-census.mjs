// F-051 completion, Task 8 Step 1 — the absence-trap census, saved.
//
// WHY THIS FILE EXISTS. `.claude/refined_backlog/F-051-.../completion-scope.md`
// (audit M2) reports six precise numbers about `content/zones/*.json` prose —
// 40 records / 294 prose fields; a "marker-only" trigger of 36/40 records and
// 111 sentences; a tighter "marker+scope" tier of 19/40 records and 40
// sentences (of which 16 carry a number) — and then states plainly that NO
// SCRIPT PRODUCING THOSE NUMBERS WAS EVER COMMITTED. A number nobody can
// re-derive is not a measurement, it is a claim, and this programme has
// already shipped several of those (see MEMORY "Green suite is not a
// covering suite"). This file is the derivation, committed so the next
// person (including a future me) gets a number instead of a memory.
//
// WHAT COUNTS AS "A PROSE FIELD" — reverse-engineered from the fact that
// EXCLUDING `hazards[].note` reproduces 294 exactly against the corpus as it
// stood at the design's measurement time, while including it does not. So a
// zone record's prose fields are: `reasonToGo`, every `hazards[].description`,
// every `resources[].description`, every `landmarks[].description`. NOT
// `hazards[].note` — an optional field only 25 of the corpus's hazards carry,
// and folding it in overshoots 294 by exactly that count.
//
// WHAT "MARKER" AND "SCOPE" MEAN HERE. The original word lists were never
// committed either, so the two regexes below are THIS SESSION'S OWN
// derivation from the plan's own definition of the absence trap
// (`plan.md` Global Constraints: "any exclusive, superlative, first/last or
// negative-existence claim") and from reading the corpus's own six confirmed
// archetypes (only-ground claims, "every other" inversions, false
// superlatives, miscounted landmass totals, unverified settlement
// comparisons, and "the only lava tube in the world"). They will not
// byte-for-byte reproduce the original run — that run is unrecoverable — but
// they are committed, so THIS run is reproducible from here on.
//
// These patterns ARE the measurement: changing one changes the denominator.
// Widening them to make a report number look smaller is exactly the "rule
// that can no longer fail" defect the plan calls out ten times this week —
// don't.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The four prose fields a zone record carries, in file order. Derived from
 * content/schemas/zone-content.schema.json's required shape, not retyped. */
export function zoneProseFields(doc) {
  const fields = [];
  if (typeof doc?.reasonToGo === "string")
    fields.push({ field: "reasonToGo", text: doc.reasonToGo });
  for (const h of doc?.hazards ?? [])
    if (typeof h?.description === "string")
      fields.push({ field: `hazards[${h.id ?? "?"}].description`, text: h.description });
  for (const r of doc?.resources ?? [])
    if (typeof r?.description === "string")
      fields.push({ field: `resources[${r.id ?? "?"}].description`, text: r.description });
  for (const l of doc?.landmarks ?? [])
    if (typeof l?.description === "string")
      fields.push({ field: `landmarks[${l.id ?? "?"}].description`, text: l.description });
  return fields;
}

export function zoneFiles({ contentRoot }) {
  const dir = join(contentRoot, "zones");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^zone-.+\.json$/.test(f)).sort();
}

// Tier 1 — "marker-only": loose, high-recall vocabulary for exclusivity,
// negative existence, and superlative/first-last claims. Deliberately loose:
// its job (per the design) is to catch every archetype, at the cost of also
// catching plenty of ordinary sequencing prose ("it takes a boot first").
//
// WIDENED (review round 1, F2). The reviewer verified live that this list
// missed a whole superlative family the corpus actually uses — "thinnest",
// "longest", "highest", "steepest" — plus the negative-existence pair
// "never"/"none", and named a genuine archetype this dropped:
// zone-brightreef-geo's "The thinnest ground the survey has walked on
// Driftholt...". Added below. "never"/"none" are common enough in ordinary
// local negation ("never let out", "carries none") that tier 1 (already
// documented as deliberately noisy) will over-trigger on them more than on
// the other markers — that noise is tier 1's known job; SCOPE_RE is what is
// supposed to filter it back out for tier 2, and Step 1's report attributes
// the resulting count change explicitly rather than publishing one number.
export const MARKER_RE =
  /\b(the\s+only|only\s+(?:ground|forest|walked|surveyed|canon|region|isle|place|reason|route|road|way|water|reliable)|solely|\bsole\b|no\s+other|nowhere\s+else|nothing\s+else|nobody\s+else|not\s+a\s+single|every\s+other|the\s+first|the\s+last|largest|smallest|biggest|greatest|fewest|thinnest|longest|highest|steepest|the\s+most|in\s+the\s+world|whole\s+world|entire\s+world|never|none)\b/i;

// Tier 2 — "marker+scope": the marker sentence must ALSO name an explicit
// whole-population scope, narrowing to genuine corpus-wide claims and
// dropping local/sequential uses of "first"/"last" ("it takes a boot first").
export const SCOPE_RE =
  /\b(in the world|on this (?:isle|landmass|continent)|on the (?:isle|landmass|continent)|of the world|whole world|entire world|anyone has|in existence|the whole|every account|in all the)\b/i;

const NUMBER_RE = /\d/;

const sentencesOf = (() => {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return (text) => [...segmenter.segment(text)]
    .map((s) => s.segment.trim())
    .filter((s) => s.length > 0);
})();

/**
 * The census. Returns per-record and corpus-wide tallies for both tiers, plus
 * the raw tripped sentences (so a human can spot-check the classification).
 * Never throws — an unreadable/invalid zone file is named as a problem and
 * skipped, matching this codebase's gate-reader convention.
 */
export function censusAbsenceTrap({ contentRoot, files = null }) {
  const rels = files ?? zoneFiles({ contentRoot });
  const problems = [];
  const perRecord = [];
  let recordsTier1 = 0, recordsTier2 = 0;
  let sentencesTier1 = 0, sentencesTier2 = 0, sentencesTier2WithNumber = 0;
  let totalProseFields = 0;
  const trippedSentences = [];

  for (const rel of rels) {
    const full = join(contentRoot, "zones", rel);
    let doc;
    try {
      doc = JSON.parse(readFileSync(full, "utf8"));
    } catch (e) {
      problems.push(`census: zones/${rel} is unreadable or invalid JSON: ${e.message}`);
      continue;
    }
    const fields = zoneProseFields(doc);
    totalProseFields += fields.length;
    let recordTier1 = 0, recordTier2 = 0;
    for (const { field, text } of fields) {
      for (const sentence of sentencesOf(text)) {
        const isMarker = MARKER_RE.test(sentence);
        if (!isMarker) continue;
        recordTier1++;
        sentencesTier1++;
        const isScoped = isMarker && SCOPE_RE.test(sentence);
        if (isScoped) {
          recordTier2++;
          sentencesTier2++;
          if (NUMBER_RE.test(sentence)) sentencesTier2WithNumber++;
        }
        trippedSentences.push({
          zone: doc.zone ?? rel, field, sentence,
          tier: isScoped ? "marker+scope" : "marker-only",
        });
      }
    }
    if (recordTier1 > 0) recordsTier1++;
    if (recordTier2 > 0) recordsTier2++;
    perRecord.push({ zone: doc.zone ?? rel, file: rel, proseFields: fields.length,
      tier1Sentences: recordTier1, tier2Sentences: recordTier2 });
  }

  return {
    problems,
    recordCount: rels.length,
    proseFieldCount: totalProseFields,
    tier1: { records: recordsTier1, sentences: sentencesTier1 },
    tier2: { records: recordsTier2, sentences: sentencesTier2, sentencesWithNumber: sentencesTier2WithNumber },
    perRecord,
    trippedSentences,
  };
}
