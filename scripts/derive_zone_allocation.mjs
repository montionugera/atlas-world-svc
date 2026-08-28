#!/usr/bin/env node
// Plan E Task 10 — render docs/worldbuilding/A4-zone-allocation.md's table.
//
// The table is a GENERATED artifact: it is derived from
// content/world/fabric/continent-NN.json, content/world/names/*.json and the
// ten committed content/zones/*.json records by scripts/lib/zone-allocation.mjs.
// Do not hand-edit the rows between the BEGIN/END markers — change the fabric,
// the registers or the licence rule and re-run this.
//
//   node scripts/derive_zone_allocation.mjs            # print the table
//   node scripts/derive_zone_allocation.mjs --write    # rewrite A4 in place
//   node scripts/derive_zone_allocation.mjs --check    # exit 1 on drift
//
// scripts/tests/zone-allocation.test.mjs is the gate; --check is the same
// comparison for a human at a terminal.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allocate } from "./lib/zone-allocation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A4 = join(ROOT, "docs/worldbuilding/A4-zone-allocation.md");
export const BEGIN = "<!-- BEGIN GENERATED TABLE -->";
export const END = "<!-- END GENERATED TABLE -->";

/** The GFM table, exactly as A4 carries it. Pure over the allocation. */
export function renderTable({ rows }) {
  const out = [
    "| zone | continent | region | terrain | kinds | landmarks | join |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    out.push(`| ${r.zone} | ${r.continent} | ${r.region} | ${r.terrain} | ${r.kinds.join(", ")}`
      + ` | ${r.landmarks.join(" / ")} | ${r.derived ? "derived" : "PLACEHOLDER"} |`);
  }
  return out.join("\n");
}

export function splice({ text, table }) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`A4 is missing the ${BEGIN} / ${END} markers`);
  return `${text.slice(0, a + BEGIN.length)}\n\n${table}\n\n${text.slice(b)}`;
}

// Only run the CLI when invoked directly: the test imports renderTable/splice
// from this file, and a top-level main() would fire (and could exit) on import.
const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!invokedDirectly) { /* imported as a library */ } else main();

function main() {
const mode = process.argv[2] ?? "";
const { rows, problem } = allocate({ root: ROOT });
if (problem) {
  console.error(`derive_zone_allocation: ${problem}`);
  process.exit(1);
}
const table = renderTable({ rows });

if (mode === "--write") {
  writeFileSync(A4, splice({ text: readFileSync(A4, "utf8"), table }));
  console.log(`derive_zone_allocation: wrote ${rows.length} rows to docs/worldbuilding/A4-zone-allocation.md`);
} else if (mode === "--check") {
  const want = splice({ text: readFileSync(A4, "utf8"), table });
  const have = readFileSync(A4, "utf8");
  if (want !== have) {
    console.error("derive_zone_allocation: A4's table has drifted from the fabric — re-run with --write");
    process.exit(1);
  }
  console.log(`derive_zone_allocation: A4 matches the fabric (${rows.length} rows)`);
} else {
  console.log(table);
}
}
