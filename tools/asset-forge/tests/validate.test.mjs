import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { Document } from "@gltf-transform/core";
import {
  validateGlb,
  validateManifest,
  textureBudgetStatus,
} from "../validate.mjs";
import { loadGlb, jointNames } from "../lib/gltf.mjs";

const fx = (n) => new URL(`../fixtures/${n}`, import.meta.url).pathname;
const kind = "character";

// Kind config mirroring forge.config.json's "character" entry (kept in sync
// by hand -- these multi-rig tests build their own isolated configDir so
// they never depend on whether rig-reference/kaykit-adventurer.bones.json
// has landed yet in the real config).
const CHARACTER_KIND_CONFIG = {
  heightRange: [1.6, 2.0],
  maxTriangles: 10000,
  maxTextureSize: 1024,
  requiredStates: ["idle", "walk", "run", "attack", "death"],
};
const DEFAULT_CLIP_MAP = {
  idle: "idle",
  walk: "walk",
  run: "sprint",
  attack: "attack-melee-right",
  death: "die",
};

/**
 * Builds an isolated configDir with forge.config.json (character kind +
 * defaultClipMap mirrored from the real config) whose rigReference is the
 * given list of *relative* paths -- callers write whichever of those files
 * they want to exist under `<dir>/rig-reference/`.
 */
function makeMultiRigConfigDir(rigReference) {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-forge-multirig-"));
  mkdirSync(path.join(dir, "rig-reference"), { recursive: true });
  writeFileSync(
    path.join(dir, "forge.config.json"),
    JSON.stringify({
      kinds: { character: CHARACTER_KIND_CONFIG },
      defaultClipMap: DEFAULT_CLIP_MAP,
      rigReference,
    }),
  );
  return dir;
}

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a4944415478da63000100000500010d0a2db400000000" +
    "49454e44ae426082",
  "hex",
);

// Rewrites a .glb so its images reference an external URI instead of an
// embedded bufferView (the layout the real seed glbs use for
// Textures/colormap.png). glTF-Transform can't author this shape (its writer
// requires image bytes), so patch the GLB's JSON chunk directly:
// 12-byte header | JSON chunk (len, 'JSON', data) | BIN chunk (unchanged).
function writeExternalTextureGlb(srcPath, destPath, uri) {
  const glb = readFileSync(srcPath);
  const jsonLength = glb.readUInt32LE(12); // chunk 0 data length (padded)
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  for (const image of json.images ?? []) {
    delete image.bufferView;
    image.uri = uri;
  }
  let jsonText = JSON.stringify(json);
  while (Buffer.byteLength(jsonText) % 4 !== 0) jsonText += " ";
  const jsonBuf = Buffer.from(jsonText, "utf8");
  const remainingChunks = glb.subarray(20 + jsonLength);

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + remainingChunks.length, 8);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  writeFileSync(
    destPath,
    Buffer.concat([header, jsonChunkHeader, jsonBuf, remainingChunks]),
  );
}

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

test("multi-rig: skeleton passes when it matches the SECOND reference in the list", async () => {
  // The "other" rig's joint set is the renamed_bone fixture's own joints --
  // i.e. a rig reference that doesn't exist in the real repo yet (it's what
  // rig-reference/kaykit-adventurer.bones.json would look like for this
  // fixture), built here so the test never depends on that file landing.
  const otherJoints = jointNames(await loadGlb(fx("renamed_bone.glb")));
  const dir = makeMultiRigConfigDir([
    "rig-reference/kenney-mini.bones.json",
    "rig-reference/other.bones.json",
  ]);
  try {
    writeFileSync(
      path.join(dir, "rig-reference/kenney-mini.bones.json"),
      JSON.stringify({
        joints: ["arm-left", "arm-right", "head", "leg-left", "leg-right", "root", "torso"],
      }),
    );
    writeFileSync(
      path.join(dir, "rig-reference/other.bones.json"),
      JSON.stringify({ joints: otherJoints }),
    );
    const r = await validateGlb(fx("renamed_bone.glb"), {
      kind,
      configDir: dir,
    });
    assert.ok(
      !r.failures.some((f) => f.startsWith("skeleton:")),
      `unexpected skeleton failure: ${r.failures.join(" | ")}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multi-rig: a listed reference missing on disk warns and is skipped, not a hard failure", async () => {
  const dir = makeMultiRigConfigDir([
    "rig-reference/kenney-mini.bones.json",
    "rig-reference/kaykit-adventurer.bones.json", // deliberately never written
  ]);
  try {
    writeFileSync(
      path.join(dir, "rig-reference/kenney-mini.bones.json"),
      JSON.stringify({
        joints: ["arm-left", "arm-right", "head", "leg-left", "leg-right", "root", "torso"],
      }),
    );
    const r = await validateGlb(fx("good.glb"), { kind, configDir: dir });
    assert.ok(
      !r.failures.some((f) => f.startsWith("skeleton:")),
      `unexpected skeleton failure: ${r.failures.join(" | ")}`,
    );
    assert.match(
      r.warnings.join(),
      /skeleton: reference .*kaykit-adventurer\.bones\.json missing/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multi-rig: backward compat -- a plain string rigReference still works", async () => {
  const dir = makeMultiRigConfigDir("rig-reference/kenney-mini.bones.json");
  try {
    writeFileSync(
      path.join(dir, "rig-reference/kenney-mini.bones.json"),
      JSON.stringify({
        joints: ["arm-left", "arm-right", "head", "leg-left", "leg-right", "root", "torso"],
      }),
    );
    const r = await validateGlb(fx("good.glb"), { kind, configDir: dir });
    assert.deepEqual(r.failures, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  doc.createTexture("t").setImage(PNG_1X1).setMimeType("image/png");
  assert.deepEqual(textureBudgetStatus(doc, 1024), { status: "ok", size: 1 });
});

test("external texture URI that resolves on disk validates clean", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-forge-exttex-"));
  try {
    const glbPath = path.join(dir, "ext_texture.glb");
    writeExternalTextureGlb(fx("good.glb"), glbPath, "colormap.png");
    writeFileSync(path.join(dir, "colormap.png"), PNG_1X1);
    const r = await validateGlb(glbPath, { kind });
    assert.deepEqual(r.failures, []);
    assert.ok(
      !r.warnings.some((w) => w.startsWith("resources:")),
      `unexpected resources warning: ${r.warnings.join(" | ")}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing external texture warns, never fails structurally (bespoke)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-forge-exttex-"));
  try {
    const glbPath = path.join(dir, "ext_texture.glb");
    writeExternalTextureGlb(fx("good.glb"), glbPath, "colormap.png");
    // colormap.png deliberately NOT written next to the glb.
    const r = await validateGlb(glbPath, { kind });
    assert.deepEqual(r.failures, []);
    assert.match(r.warnings.join(), /resources: colormap\.png unresolved/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
