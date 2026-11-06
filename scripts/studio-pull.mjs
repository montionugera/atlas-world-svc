#!/usr/bin/env node
// Fetch every pull-only manifest entry (F-174) into game-client/studio-cache/ and verify sha256.
// Exit 0: all present. 1: sha mismatch / bad record / studio auth failed. 2: unreachable or no token.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isCached, pullAsset, pullEntries } from "./lib/studio-pull.mjs";
import { studioToken } from "./lib/studio-token.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const manifestPath = resolve(flag("--manifest") ?? join(ROOT, "game-client/assets/manifest.json"));
const cacheDir = resolve(flag("--cache-dir") ?? process.env.ATLAS_STUDIO_CACHE_DIR ?? join(ROOT, "game-client/studio-cache"));

const rows = pullEntries(JSON.parse(readFileSync(manifestPath, "utf8")));
const token = rows.some((r) => !isCached(cacheDir, r.sha256)) ? studioToken() : null; // warm cache: no token, no kubectl
let hard = false;
let soft = false;
for (const row of rows) {
  const r = await pullAsset({ assetId: row.assetId, sha256: row.sha256, cacheDir, token });
  if (r.ok) {
    console.log(`✅ ${row.id}: ${r.cached ? "cached" : "pulled"} ${row.sha256.slice(0, 12)}… (tag ${row.tag})`);
    continue;
  }
  console.log(`❌ ${row.id}: ${r.failure}`);
  if (r.unreachable) soft = true;
  else hard = true;
}
if (soft && !hard) {
  console.log("Asset Studio is unreachable and the cache lacks the bytes. Start Asset Studio or set STUDIO_TOKEN: local Gate 1 never skips pull-only checks; only CI sets ATLAS_SKIP_STUDIO=1.");
}
console.log(`studio-pull: ${rows.length} pull-only entr${rows.length === 1 ? "y" : "ies"}`);
process.exit(hard ? 1 : soft ? 2 : 0);
