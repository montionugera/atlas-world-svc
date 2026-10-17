#!/usr/bin/env node
// G-SLOT-STABLE — the byte comparison that catches a SILENT REBINDING.
//
// content/world/resolved/*.json is committed (decision D5). It is the only
// file renderers read, so a record that quietly re-bound to a different
// handle would otherwise change what is drawn with no reviewable diff
// anywhere. This regenerates the join and byte-compares, exactly as
// check_spine_emit.mjs --check does for the node table.
//
//   node scripts/check_resolved.mjs --write   # regenerate
//   node scripts/check_resolved.mjs --check   # byte-compare, exit 1 on drift
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCivil, resolveCivil } from "./lib/resolve.mjs";
import { loadDungeons } from "./lib/dungeons.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const check = argv.includes("--check");
  const rootIdx = argv.indexOf("--content-root");
  const contentRoot = rootIdx === -1 ? join(ROOT, "content") : resolve(argv[rootIdx + 1]);
  if (write === check) { console.error("usage: check_resolved.mjs --write | --check [--content-root <dir>]"); process.exit(2); }

  const world = loadCivil({ contentRoot });
  if (!world.present) { console.log("check-resolved: no content/world — skipped"); process.exit(0); }
  const { dungeons } = loadDungeons({ contentRoot });

  const outDir = join(contentRoot, "world/resolved");
  let drift = 0, written = 0;
  for (const [continent, fabric] of Object.entries(world.fabric).sort()) {
    const { resolved, problems } = resolveCivil({
      fabric, handles: world.ledgers[continent],
      civil: { pinned: world.pinned, bound: world.bound },
      dungeons: dungeons.filter((d) => (d.bind?.handle ?? "").startsWith(continent + "/")),
    });
    for (const p of problems) console.log(`PROBLEM ${p}`);
    const file = join(outDir, `continent-${continent.slice(1)}.json`);
    const bytes = JSON.stringify(resolved, null, 2) + "\n";
    if (write) { mkdirSync(outDir, { recursive: true }); writeFileSync(file, bytes); written++; continue; }
    const have = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (have !== bytes) {
      drift++;
      console.log(`G-SLOT-STABLE: content/world/resolved/continent-${continent.slice(1)}.json differs from the recomputed join — a record rebound without a commit saying so`);
    }
  }
  console.log(write ? `check-resolved: wrote ${written} files` : `check-resolved: ${Object.keys(world.fabric).length} continents, ${drift} drifted`);
  process.exit(drift ? 1 : 0);
}

main();
