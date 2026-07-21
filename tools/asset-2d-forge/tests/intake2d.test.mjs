import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { intake2d } from "../intake2d.mjs";

// tools/asset-2d-forge/tests -> repo root is three levels up.
const REAL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const REAL_SPEC = path.join(REAL_ROOT, "game-client/assets/render-spec.json");
const REAL_GATE = path.join(REAL_ROOT, "scripts/check_asset_manifest.mjs");

// A real 1x1 transparent PNG (bytes only matter to the gate as "non-empty
// file with .png ext"; using a genuine PNG keeps the fixture honest).
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Build a fresh sandbox repo-root mirroring the layout the gate needs:
 *   game-client/assets/{render-spec.json, catalog-manifest.json,
 *     manifest.json, audio-manifest.json, music-manifest.json}
 *   keys.json
 * The catalog starts empty; render-spec is the real one (single contract).
 * Also drops a source PNG at <root>/src.png to intake.
 */
function makeSandbox() {
  const root = mkdtempSync(path.join(tmpdir(), "asset-2d-forge-"));
  const assetsDir = path.join(root, "game-client/assets");
  mkdirSync(assetsDir, { recursive: true });

  copyFileSync(REAL_SPEC, path.join(assetsDir, "render-spec.json"));

  const catalogPath = path.join(assetsDir, "catalog-manifest.json");
  writeFileSync(catalogPath, `${JSON.stringify({ version: 1, entries: {} }, null, 2)}\n`);
  // Sibling manifests the gate reads (must exist; empty is fine).
  writeFileSync(path.join(assetsDir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
  writeFileSync(path.join(assetsDir, "audio-manifest.json"), JSON.stringify({ version: 1, entries: {} }));
  writeFileSync(path.join(assetsDir, "music-manifest.json"), JSON.stringify({ version: 1, entries: {} }));
  writeFileSync(path.join(root, "keys.json"), JSON.stringify({ version: 1, keys: [] }));

  const srcPng = path.join(root, "src.png");
  writeFileSync(srcPng, PNG_1x1);

  return { root, catalogPath, srcPng, assetsDir };
}

// Injectable drift-gate that runs the REAL check_asset_manifest.mjs against
// the sandbox tree via override flags — proves a happy-path intake lands an
// entry the standing gate accepts.
function realGateAgainst(root) {
  const a = (f) => path.join(root, "game-client/assets", f);
  return async () => {
    try {
      execFileSync(
        process.execPath,
        [
          REAL_GATE,
          "--keys", path.join(root, "keys.json"),
          "--render-spec", a("render-spec.json"),
          "--manifest", a("manifest.json"),
          "--audio-manifest", a("audio-manifest.json"),
          "--catalog-manifest", a("catalog-manifest.json"),
          "--music-manifest", a("music-manifest.json"),
          "--game-client", path.join(root, "game-client"),
        ],
        { encoding: "utf8" },
      );
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };
}

test("(a) dry-run emits the expected entry and writes nothing", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "image",
      license: "CC0",
      source: "hand",
      root,
      dryRun: true,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.entry, {
      scene: "res://assets/icons/src.png",
      render: "image",
      source: "hand",
      license: "CC0",
    });
    // Nothing written: catalog byte-identical, no PNG copied.
    assert.equal(readFileSync(catalogPath, "utf8"), before);
    assert.ok(!existsSync(path.join(root, "game-client/assets/icons/src.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(b) tileset without tileSize aborts, catalog byte-identical", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcPng,
      key: "tileset:cave",
      render: "tileset",
      license: "CC0",
      source: "hand",
      // tileSize deliberately omitted
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /tileSize/.test(f)));
    assert.equal(readFileSync(catalogPath, "utf8"), before);
    assert.ok(!existsSync(path.join(root, "game-client/assets/tiles/src.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(c) reserved-namespace key (mob:foo) aborts", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcPng,
      key: "mob:foo",
      render: "image",
      license: "CC0",
      source: "hand",
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /reserved codegen namespace/.test(f)));
    assert.equal(readFileSync(catalogPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(d) happy path appends an entry and leaves the real gate green", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "image",
      license: "CC0",
      source: "hand",
      root,
      driftGate: realGateAgainst(root),
    });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    assert.ok(r.actions.includes("drift-gate: passed"));

    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    assert.deepEqual(catalog.entries["icon:sword"], {
      scene: "res://assets/icons/src.png",
      render: "image",
      source: "hand",
      license: "CC0",
    });
    // PNG landed in the icons/ subdir.
    assert.ok(existsSync(path.join(root, "game-client/assets/icons/src.png")));

    // Independent confirmation: run the real gate directly — still green.
    const gate = await realGateAgainst(root)();
    assert.equal(gate.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(e) forced gate failure rolls back to a byte-identical catalog", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "image",
      license: "CC0",
      source: "hand",
      root,
      driftGate: async () => ({ ok: false }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /drift-gate/.test(f)));
    // Catalog restored to exact snapshot bytes; copied PNG deleted.
    assert.equal(readFileSync(catalogPath, "utf8"), before);
    assert.ok(!existsSync(path.join(root, "game-client/assets/icons/src.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ninepatch happy path lands in ui/ with patchMargins", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const r = await intake2d({
      src: srcPng,
      key: "ui:frame_stone",
      render: "ninepatch",
      license: "CC0",
      source: "hand",
      patchMargins: { l: 8, t: 8, r: 8, b: 8 },
      root,
      driftGate: realGateAgainst(root),
    });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    assert.deepEqual(catalog.entries["ui:frame_stone"].patchMargins, {
      l: 8, t: 8, r: 8, b: 8,
    });
    assert.ok(existsSync(path.join(root, "game-client/assets/ui/src.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-2D render (model3d) is refused", async () => {
  const { root, srcPng } = makeSandbox();
  try {
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "model3d",
      license: "CC0",
      source: "hand",
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /not a 2D renderer/.test(f)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(f1-license) dry-run of a disallowed license (MIT) returns ok:false", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "image",
      license: "MIT",
      source: "hand",
      root,
      dryRun: true,
      driftGate: async () => ({ ok: true }),
    });
    // Was falsely ok:true before Fix 1 — validate2d ignored license policy.
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /MIT/.test(f) && /not allowed/.test(f)));
    // Dry-run still touches nothing.
    assert.equal(readFileSync(catalogPath, "utf8"), before);
    assert.ok(!existsSync(path.join(root, "game-client/assets/icons/src.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(f1-ext) dry-run of a wrong extension (.gif for image) returns ok:false", async () => {
  const { root, catalogPath } = makeSandbox();
  try {
    const srcGif = path.join(root, "src.gif");
    writeFileSync(srcGif, PNG_1x1); // bytes irrelevant; ext is what fails
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcGif,
      key: "icon:sword",
      render: "image",
      license: "CC0",
      source: "hand",
      root,
      dryRun: true,
      driftGate: async () => ({ ok: true }),
    });
    // Was falsely ok:true before Fix 1 — validate2d ignored file extension.
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /\.gif/.test(f) && /not allowed/.test(f)));
    assert.equal(readFileSync(catalogPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(f2-ccby) CC-BY-4.0 image WITH author intakes and leaves the real gate green", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "image",
      license: "CC-BY-4.0",
      source: "poly-pizza",
      author: "Jane Doe",
      root,
      driftGate: realGateAgainst(root),
    });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    assert.ok(r.actions.includes("drift-gate: passed"));

    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    assert.deepEqual(catalog.entries["icon:sword"], {
      scene: "res://assets/icons/src.png",
      render: "image",
      source: "poly-pizza",
      license: "CC-BY-4.0",
      author: "Jane Doe",
    });
    // Independent confirmation: real gate directly — still green.
    const gate = await realGateAgainst(root)();
    assert.equal(gate.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("(f2-ccby) CC-BY-4.0 WITHOUT author fails validation", async () => {
  const { root, catalogPath, srcPng } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: srcPng,
      key: "icon:sword",
      render: "image",
      license: "CC-BY-4.0",
      source: "poly-pizza",
      // author deliberately omitted
      root,
      dryRun: true,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /author/.test(f)));
    assert.equal(readFileSync(catalogPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing source file aborts with zero side effects", async () => {
  const { root, catalogPath } = makeSandbox();
  try {
    const before = readFileSync(catalogPath, "utf8");
    const r = await intake2d({
      src: path.join(root, "does-not-exist.png"),
      key: "icon:sword",
      render: "image",
      license: "CC0",
      source: "hand",
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /source file not found/.test(f)));
    assert.equal(readFileSync(catalogPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
