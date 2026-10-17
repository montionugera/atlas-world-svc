// F-053 Phase 1 — the Forge tab lists every brief, ledgered or not. A static
// page cannot list atelier/art-forge/briefs/, so forge-briefs-index.json is
// hand-maintained (spec §7.1) and this parity test keeps it honest in both
// directions. It lives beside env-index.json, NOT in briefs/, because
// atelier/art-forge/tests/prompt-lint.test.mjs parses every briefs/*.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const index = JSON.parse(readFileSync(join(HERE, "..", "forge-briefs-index.json"), "utf8"));

test("forge-briefs-index.json has the {version:1, note, briefs:[{id}]} shape", () => {
  assert.equal(index.version, 1);
  assert.equal(typeof index.note, "string");
  assert.ok(Array.isArray(index.briefs));
  for (const b of index.briefs) assert.match(b.id, /^[A-Za-z0-9-]+$/);
});

test("forge-briefs-index.json ids match atelier/art-forge/briefs/*.json in both directions", () => {
  const onDisk = readdirSync(join(REPO_ROOT, "atelier/art-forge/briefs"))
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.replace(/\.json$/, ""))
    .sort();
  assert.deepEqual(index.briefs.map((b) => b.id).sort(), onDisk);
});
