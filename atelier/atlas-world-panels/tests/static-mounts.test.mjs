// SSOT merge W4 — every URL the panels fetch is served by atlas-world's static-mount allowlist.
//
// This is the successor of dockerfile-forge.test.mjs and the two "the image ships X" tests in
// maps-fabric / maps-vocabulary: when the storybook ran in an nginx image, a path the panels
// fetched but the Dockerfile did not COPY worked on a laptop and 404'd in the container. The same
// failure now lives in scripts/atlas_world_web/static_mounts.py (an unlisted path 404s), so the
// same rule is enforced there, against the real safe_resolve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as S from "../js/state.mjs";
import { REPO_ROOT_DIR, resolveMounted } from "./_mounted.mjs";

// state.mjs URLs are relative to atelier/atlas-world-panels/index.html ("../../x") or already
// root-absolute (SB_BASE). The panels run on the page at "/", where both clamp to "/x".
const PAGE = "http://x/atelier/atlas-world-panels/index.html";
const urlPath = (u) => new URL(u, PAGE).pathname;

const FILE_URLS = {
  MANIFEST_URL: S.MANIFEST_URL,
  CATALOG_MANIFEST_URL: S.CATALOG_MANIFEST_URL,
  AUDIO_MANIFEST_URL: S.AUDIO_MANIFEST_URL,
  MUSIC_MANIFEST_URL: S.MUSIC_MANIFEST_URL,
  ART_MANIFEST_URL: S.ART_MANIFEST_URL,
  ART_GROUPS_URL: S.ART_GROUPS_URL,
  RENDER_SPEC_URL: S.RENDER_SPEC_URL,
  TAXONOMY_URL: S.TAXONOMY_URL,
  REVIEW_QUEUE_URL: S.REVIEW_QUEUE_URL,
  ASSET_KEYS_URL: S.ASSET_KEYS_URL,
  THUMB_INDEX_URL: S.THUMB_INDEX_URL,
  RENDER_LOCK_URL: S.RENDER_LOCK_URL,
  RUNS_INDEX_URL: S.RUNS_INDEX_URL,
  AUDIO_INDEX_URL: S.AUDIO_INDEX_URL,
  MAPS_INDEX_URL: S.MAPS_INDEX_URL,
  WORLD_INDEX_URL: S.WORLD_INDEX_URL,
  STORY_VIEWS_URL: S.STORY_VIEWS_URL,
  FORGE_BRIEFS_INDEX_URL: S.FORGE_BRIEFS_INDEX_URL,
};

function assertServed(name, url) {
  const p = urlPath(url);
  if (!existsSync(join(REPO_ROOT_DIR, p))) return; // gitignored/generated and absent here (thumbs, render-lock on a fresh clone)
  const served = resolveMounted([p]);
  assert.ok(served[p], `${name} (${p}) exists on disk but is not served by scripts/atlas_world_web/static_mounts.py — its panel would 404 on atlas-world`);
}

test("every data URL in state.mjs that exists on disk is served by the allowlist", () => {
  for (const [name, url] of Object.entries(FILE_URLS)) assertServed(name, url);
});

test("the Forge tab's fetch directories (ledgers + briefs) are served", () => {
  // The Forge tab fetches <RUNS_BASE_URL><brief>.json and <BRIEFS_BASE_URL><brief>.json.
  for (const [name, base] of [["RUNS_BASE_URL", S.RUNS_BASE_URL], ["BRIEFS_BASE_URL", S.BRIEFS_BASE_URL]]) {
    const dir = urlPath(base);
    const sample = readdirSync(join(REPO_ROOT_DIR, dir)).find((f) => f.endsWith(".json"));
    assert.ok(sample, `${dir} holds no .json to probe`);
    assertServed(name, base + sample);
  }
});

test("the Map Sheets panels' extra reads are served (mapforge drawing lib, world lexicon, fabric)", () => {
  const needed = [
    "/atelier/mapforge/lib/draft.mjs",
    "/atelier/mapforge/lib/glyphs.mjs",
    "/content/world/lexicon/landforms.json",
    "/content/world/render-lock.json",
  ];
  const served = resolveMounted(needed);
  for (const p of needed) {
    if (!existsSync(join(REPO_ROOT_DIR, p))) continue;
    assert.ok(served[p], `${p} is not served by static_mounts.py — the Map Sheets panel would 404 on atlas-world`);
  }
  assert.ok(served["/atelier/mapforge/lib/draft.mjs"], "the vocabulary panel imports draft.mjs from the browser");
  const fabricDir = join(REPO_ROOT_DIR, "content/world/fabric");
  if (existsSync(fabricDir)) {
    const f = readdirSync(fabricDir).find((n) => n.endsWith(".json"));
    if (f) assert.ok(resolveMounted([`/content/world/fabric/${f}`])[`/content/world/fabric/${f}`], "content/world/fabric/ must be served (fabric census panel)");
  }
});

test("the iframed Combat Lab page is served", () => {
  const p = "/atelier/combat-lab/index.html";
  assert.ok(resolveMounted([p])[p], `${p} is not served — the combat-lab panel iframe would 404`);
});
