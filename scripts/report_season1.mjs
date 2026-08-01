#!/usr/bin/env node
// Season 1 budget report (I-048). REPORTING ONLY: every input path exits 0
// except the deliberate process.exit(2) in parseArgs for an unknown flag or
// a flag missing its value.
// It is deliberately not a gate: the failure mode it exists to catch is
// authoring drift UPWARD toward a 32-zone continent, and a red floor check
// would be red for months and teach everyone to ignore it.
// Record: docs/worldbuilding/DR-003-season-1-budget.md
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows, renderTable } from "./lib/season1.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { root: ROOT, budget: null };
  const takeValue = (name, i) => {
    const v = argv[i];
    if (v === undefined) {
      console.error(`missing value for ${name}`);
      process.exit(2);
    }
    return v;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = resolve(takeValue(a, ++i));
    else if (a === "--budget") opts.budget = resolve(takeValue(a, ++i));
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  opts.budget ??= join(opts.root, "content/season-1-budget.json");
  return opts;
}

const opts = parseArgs(process.argv);

// A missing/malformed --budget file is still a report finding, not a crash:
// the "always exits 0" contract above covers every input path except the
// deliberate arg-parse exit(2) cases in parseArgs.
let budget;
try {
  budget = JSON.parse(readFileSync(opts.budget, "utf8"));
} catch (err) {
  console.log(`Season 1 budget — could not load ${opts.budget}: ${err.message}`);
  process.exit(0);
}
if (typeof budget !== "object" || budget === null || !Array.isArray(budget.lines)) {
  console.log(`Season 1 budget — could not load ${opts.budget}: expected an object with a "lines" array`);
  process.exit(0);
}
console.log(`Season ${budget.season} budget — cluster ${budget.cluster} — ${budget.record}`);
console.log(renderTable(buildRows(budget, opts.root)));
process.exit(0);
