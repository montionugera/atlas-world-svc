import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { intake, parseArgs } from "../intake.mjs";

const fx = (n) => new URL(`../fixtures/${n}`, import.meta.url).pathname;

const KEY = "mob:aggressive";
const LICENSE = "CC0 test";

/**
 * Builds a fresh sandbox: `<root>/game-client/assets/{manifest.json,
 * characters/}` seeding a `mob:aggressive` entry at tier "seed", plus
 * `<root>/art-source/LICENSES.md` covering the fixture basenames this suite
 * intakes ("good", "too_short") so the license-ledger rule passes for them.
 */
function makeSandbox() {
  const root = mkdtempSync(path.join(tmpdir(), "asset-forge-intake-"));
  const assetsDir = path.join(root, "game-client/assets");
  mkdirSync(path.join(assetsDir, "characters"), { recursive: true });
  mkdirSync(path.join(root, "art-source"), { recursive: true });

  const manifestPath = path.join(assetsDir, "manifest.json");
  const manifest = {
    version: 2,
    entries: {
      [KEY]: {
        scene: "res://assets/characters/aggressive.glb",
        source: "seed",
        license: "CC0",
        tier: "seed",
        kind: "character",
      },
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    path.join(root, "art-source/LICENSES.md"),
    "# Licenses\n\n- good: CC0\n- too_short: CC0\n",
  );

  return { root, manifestPath };
}

test("happy path flips entry and copies glb", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true);
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(m.entries[KEY].tier, "bespoke");
    assert.equal(m.entries[KEY].kind, "character");
    assert.equal(m.entries[KEY].source, "internal");
    assert.equal(m.entries[KEY].license, LICENSE);
    assert.equal(m.entries[KEY].scene, "res://assets/characters/good.glb");
    assert.ok(
      existsSync(path.join(root, "game-client/assets/characters/good.glb")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("drift-gate failure rolls everything back", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const before = readFileSync(manifestPath, "utf8");
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: false }),
    });
    assert.equal(r.ok, false);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.ok(
      !existsSync(path.join(root, "game-client/assets/characters/good.glb")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validation failure aborts with zero side effects", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const before = readFileSync(manifestPath, "utf8");
    const r = await intake(fx("too_short.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /height/.test(f)));
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.ok(
      !existsSync(
        path.join(root, "game-client/assets/characters/too_short.glb"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dry-run reports actions, writes nothing", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const before = readFileSync(manifestPath, "utf8");
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      dryRun: true,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true);
    assert.ok(r.actions.length > 0);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.ok(
      !existsSync(path.join(root, "game-client/assets/characters/good.glb")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed manifest aborts with zero side effects (no orphaned glb)", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    writeFileSync(manifestPath, "{ this is not valid json");
    const before = readFileSync(manifestPath, "utf8");
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    // Manifest must be untouched and no glb may be left copied on disk.
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.ok(
      !existsSync(path.join(root, "game-client/assets/characters/good.glb")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rollback restores a pre-existing glb rather than deleting it", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    // Simulate a previously-shipped asset already living at destPath.
    const destPath = path.join(root, "game-client/assets/characters/good.glb");
    const priorBytes = "PRIOR-SHIPPED-GLB-BYTES";
    writeFileSync(destPath, priorBytes);
    const before = readFileSync(manifestPath, "utf8");

    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: false }),
    });
    assert.equal(r.ok, false);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    // The pre-existing asset must be restored to its original bytes,
    // not deleted by the rollback.
    assert.ok(existsSync(destPath));
    assert.equal(readFileSync(destPath, "utf8"), priorBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseArgs accepts --flag=value so values may start with --", () => {
  const { positional, flags } = parseArgs([
    "some.glb",
    "--key=mob:aggressive",
    "--license=--CC0 public domain--",
    "--dry-run",
  ]);
  assert.deepEqual(positional, ["some.glb"]);
  assert.equal(flags.key, "mob:aggressive");
  assert.equal(flags.license, "--CC0 public domain--");
  assert.equal(flags["dry-run"], true);
});

test("re-run same key is idempotent", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const first = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(first.ok, true);
    const second = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(second.ok, true);

    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(Object.keys(m.entries).length, 1);
    assert.equal(m.entries[KEY].tier, "bespoke");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
