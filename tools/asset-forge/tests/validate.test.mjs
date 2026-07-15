import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document } from "@gltf-transform/core";
import {
  validateGlb,
  validateManifest,
  textureBudgetStatus,
} from "../validate.mjs";

const fx = (n) => new URL(`../fixtures/${n}`, import.meta.url).pathname;
const kind = "character";

test("good passes", async () => {
  const r = await validateGlb(fx("good.glb"), { kind });
  assert.deepEqual(r.failures, []);
});

test("too short fails on height (bespoke) / warns (seed)", async () => {
  assert.match(
    (await validateGlb(fx("too_short.glb"), { kind })).failures.join(),
    /height/,
  );
  const seed = await validateGlb(fx("too_short.glb"), { kind, tier: "seed" });
  assert.deepEqual(seed.failures, []);
  assert.match(seed.warnings.join(), /height/);
});

test("missing clip fails naming the state", async () => {
  assert.match(
    (await validateGlb(fx("missing_clip.glb"), { kind })).failures.join(),
    /death.*die/,
  );
});

test("renamed bone fails skeleton", async () => {
  assert.match(
    (await validateGlb(fx("renamed_bone.glb"), { kind })).failures.join(),
    /skeleton/,
  );
});

test("no provenance warns only", async () => {
  const r = await validateGlb(fx("no_provenance.glb"), { kind });
  assert.deepEqual(r.failures, []);
  assert.match(r.warnings.join(), /provenance/);
});

test("big texture fails texture budget (bespoke) / warns (seed)", async () => {
  const bespoke = await validateGlb(fx("big_texture.glb"), { kind });
  assert.match(bespoke.failures.join(), /textures/);
  assert.match(bespoke.failures.join(), /2048/);

  const seed = await validateGlb(fx("big_texture.glb"), {
    kind,
    tier: "seed",
  });
  assert.deepEqual(seed.failures, []);
  assert.match(seed.warnings.join(), /textures/);
});

test("textureBudgetStatus: no textures at all is not a warning", () => {
  const doc = new Document();
  assert.deepEqual(textureBudgetStatus(doc, 1024), { status: "empty" });
});

test("textureBudgetStatus: texture with no image data warns, never silently passes or fails", () => {
  const doc = new Document();
  doc.createTexture("unbacked");
  assert.deepEqual(textureBudgetStatus(doc, 1024), { status: "unreadable" });
});

test("textureBudgetStatus: readable texture within budget passes silently", () => {
  const doc = new Document();
  const png1x1 = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000a4944415478da63000100000500010d0a2db400000000" +
      "49454e44ae426082",
    "hex",
  );
  doc.createTexture("t").setImage(png1x1).setMimeType("image/png");
  assert.deepEqual(textureBudgetStatus(doc, 1024), { status: "ok", size: 1 });
});

test("manifest mode: bespoke entry fails, seed entry warns only", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-forge-manifest-"));
  const manifestPath = path.join(dir, "manifest.json");
  try {
    const manifest = {
      version: 1,
      entries: {
        "mob:too_short": {
          scene: fx("too_short.glb"),
          source: "market",
          license: "CC0",
          tier: "bespoke",
          kind: "character",
        },
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const bespoke = await validateManifest(manifestPath);
    assert.ok(bespoke.failures.length > 0);

    manifest.entries["mob:too_short"].tier = "seed";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const seed = await validateManifest(manifestPath);
    assert.deepEqual(seed.failures, []);
    assert.ok(seed.warnings.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("manifest mode: unknown kind is skipped with a warning", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-forge-manifest-"));
  const manifestPath = path.join(dir, "manifest.json");
  try {
    const manifest = {
      version: 1,
      entries: {
        "vfx:thing": {
          scene: fx("good.glb"),
          source: "market",
          license: "CC0",
          tier: "seed",
          kind: "vfx",
        },
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const r = await validateManifest(manifestPath);
    assert.deepEqual(r.failures, []);
    assert.match(r.warnings.join(), /unknown kind/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("manifest mode: missing file is skipped silently (drift-gate's job)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-forge-manifest-"));
  const manifestPath = path.join(dir, "manifest.json");
  try {
    const manifest = {
      version: 1,
      entries: {
        "mob:ghost": {
          scene: path.join(dir, "does-not-exist.glb"),
          source: "market",
          license: "CC0",
          tier: "seed",
          kind: "character",
        },
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const r = await validateManifest(manifestPath);
    assert.deepEqual(r.failures, []);
    assert.deepEqual(r.warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
