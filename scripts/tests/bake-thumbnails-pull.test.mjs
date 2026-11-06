// F-174: a pull-only entry's bytes are private and live in the gitignored studio-cache/.
// bake_thumbnails writes into the TRACKED game-client/assets/.thumbs/, which ships in the
// release image (Dockerfile.atlas-web.dockerignore:9), so it must never queue one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectJobs } from "../bake_thumbnails.mjs";

test("bake_thumbnails never queues a pull-only entry; committed entries are still queued", () => {
  const gc = mkdtempSync(join(tmpdir(), "bake-pull-"));
  const assets = join(gc, "assets");
  mkdirSync(assets, { recursive: true });
  const sha = "7".repeat(64);
  writeFileSync(join(assets, "manifest.json"), JSON.stringify({ entries: {
    "npc:pulled": { scene: `res://studio-cache/${sha}.glb`, kind: "pipelineCharacter",
      pull: { from: "asset-studio", assetStudioAsset: "a-1", tag: "t-1", sha256: sha } },
    "npc:committed": { scene: "res://assets/characters/c.glb", kind: "character" },
  } }));
  writeFileSync(join(assets, "catalog-manifest.json"), JSON.stringify({ entries: {} }));
  const spec = { kindDefaultRender: { character: "model3d", pipelineCharacter: "model3d" }, extRender: { ".glb": "model3d" } };
  const jobs = collectJobs(spec, { assets, gameClient: gc, artRoot: join(assets, "art") });
  assert.deepEqual(jobs.map((j) => j.key), ["npc:committed"]);
  assert.ok(jobs.every((j) => !j.srcPath.includes("studio-cache/")));
});
