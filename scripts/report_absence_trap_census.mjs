#!/usr/bin/env node
// F-051 completion Task 8, Step 1 — run and print the absence-trap census
// (see scripts/lib/absence-trap-census.mjs for what is being measured and
// why the numbers will not byte-match the unrecoverable original run).
//
// ALWAYS EXITS 0. This is a REPORT, not a gate — Task 8 Steps 4-6 (turning
// this into a gate rule) are deliberately deferred to a later feature.
import { readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { censusAbsenceTrap } from "./lib/absence-trap-census.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { contentRoot: join(ROOT, "content"), verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--content-root") opts.contentRoot = resolve(argv[++i]);
    else if (a === "--verbose") opts.verbose = true;
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (!existsSync(join(opts.contentRoot, "zones"))) {
  console.error(`no content/zones under ${opts.contentRoot}`);
  process.exit(2);
}

const result = censusAbsenceTrap({ contentRoot: opts.contentRoot });

console.log("# Absence-trap census — content/zones/*.json");
console.log(`records:                 ${result.recordCount}`);
console.log(`prose fields:            ${result.proseFieldCount}`);
console.log(`marker-only tier:        ${result.tier1.records} records, ${result.tier1.sentences} sentences`);
console.log(`marker+scope tier:       ${result.tier2.records} records, ${result.tier2.sentences} sentences`);
console.log(`  of which carry a number: ${result.tier2.sentencesWithNumber}`);
if (result.problems.length) {
  console.log(`\nproblems (${result.problems.length}):`);
  for (const p of result.problems) console.log(`  ${p}`);
}
if (opts.verbose) {
  console.log(`\ntripped sentences (${result.trippedSentences.length}):`);
  for (const t of result.trippedSentences)
    console.log(`  [${t.tier}] ${t.zone} ${t.field}: "${t.sentence}"`);
}

console.log("\n# Design's recorded figures (completion-scope.md, audit M2)");
console.log("records: 40 | prose fields: 294 | marker-only: 36/40 records, 111 sentences | " +
  "marker+scope: 19/40 records, 40 sentences, 16 with a number");
