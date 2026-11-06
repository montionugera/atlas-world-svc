import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  copyFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
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

test("anims: valid override is validated against and written into the manifest entry", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const anims = {
      idle: "idle",
      walk: "walk",
      run: "sprint",
      attack: "attack-melee-right",
      death: "die",
    };
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      anims,
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true);
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.deepEqual(m.entries[KEY].anims, anims);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("anims: unknown state key is rejected with zero side effects", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const before = readFileSync(manifestPath, "utf8");
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      anims: { idle: "idle", dance: "boogie" },
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /anims/.test(f) && /dance/.test(f)));
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.ok(
      !existsSync(path.join(root, "game-client/assets/characters/good.glb")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no anims: manifest entry has no anims field (unchanged behavior)", async () => {
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
    assert.ok(!("anims" in m.entries[KEY]));
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

test("--kind chibiPlayer applies the chibiPlayer height range and records the kind", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      kind: "chibiPlayer",
      driftGate: async () => ({ ok: true }),
    });
    // good.glb is 1.8u: fine for "character" (default), too tall for chibiPlayer.
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /height.*0\.9-1\.2/.test(f)), r.failures.join(" | "));
    assert.ok(!existsSync(path.join(root, "game-client/assets/characters/good.glb")));
    assert.ok(!JSON.parse(readFileSync(manifestPath, "utf8")).entries[KEY].kind?.includes("chibi"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown --kind 'constructor' fails cleanly (own-property lookup)", async () => {
  const { root } = makeSandbox();
  try {
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      kind: "constructor",
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /unknown kind "constructor"/.test(f)), r.failures.join(" | "));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("successful --kind chibiPlayer intake records the kind in the manifest", async () => {
  const { root, manifestPath } = makeSandbox();
  const src = mkdtempSync(path.join(tmpdir(), "asset-forge-chibi-"));
  try {
    // good.glb is 1.8u; scale it into the chibiPlayer 0.9-1.2u range.
    const io = new NodeIO();
    const doc = await io.read(fx("good.glb"));
    for (const node of doc.getRoot().listScenes()[0].listChildren()) {
      node.setScale(node.getScale().map((v) => v * 0.58));
    }
    const glb = path.join(src, "good.glb");
    await io.write(glb, doc);
    const r = await intake(glb, {
      key: KEY,
      license: LICENSE,
      root,
      kind: "chibiPlayer",
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true, (r.failures ?? []).join(" | "));
    assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).entries[KEY].kind, "chibiPlayer");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

test("unknown --kind errors out with zero side effects", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const before = readFileSync(manifestPath, "utf8");
    const r = await intake(fx("good.glb"), {
      key: KEY,
      license: LICENSE,
      root,
      kind: "nope",
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /unknown kind "nope"/.test(f)));
    assert.equal(readFileSync(manifestPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- F-174 pull-only studio intake --------------------------------------------
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defaultAnimsFor, rowFromReport } from "../intake.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const STUDIO_RECORD = JSON.parse(readFileSync(
  new URL("../../../scripts/tests/fixtures/studio/sergeant-asset-record.json", import.meta.url), "utf8")).asset;
// Not under tests/fixtures/: atelier/asset-forge/.gitignore ignores fixtures/.
const REPORT_PATH = fileURLToPath(new URL("./studio-report.fixture.json", import.meta.url));
const REPORT = JSON.parse(readFileSync(REPORT_PATH, "utf8"));

// Record route → `record`, media route → the bytes of good.glb. `calls` logs every URL.
function studioDouble(record, calls = []) {
  const body = readFileSync(fx("good.glb"));
  return async (url) => {
    calls.push(String(url));
    // Route by pathname: the real mediaUrl carries a signed ?exp=…&sig=… query.
    return new URL(String(url)).pathname.endsWith("/media")
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify({ asset: record }), { status: 200 });
  };
}
const goodRecord = () => ({ ...STUDIO_RECORD, mediaUrl: `${STUDIO_RECORD.mediaUrl}?exp=1893456000&sig=deadbeefcafe`, sha256: sha(readFileSync(fx("good.glb"))), tags: ["tripo", "mixamo", "t-1"] });
const studio = (record, over = {}) => ({ assetId: "a-1", tag: "t-1", token: "t", fetchImpl: studioDouble(record), ...over });
// Capture console.log while `fn` runs (the .import reminder is a console line, not an action).
async function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => { lines.push(a.join(" ")); };
  try { return { value: await fn(), lines }; } finally { console.log = orig; }
}

test("studio: bytes whose sha256 differs from the Asset Studio record are refused with zero side effects", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  try {
    // The committed fixture record says 7f1c54c3…; the double serves good.glb, so the hash cannot match.
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio({ ...STUDIO_RECORD, tags: ["t-1"] }),
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /sha256: [0-9a-f]{64} != recorded 7f1c54c3/);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.equal(existsSync(path.join(root, "game-client/studio-cache")), false);
    assert.equal(existsSync(path.join(root, "game-client/assets/characters/good.glb")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: a tag the asset does not carry is refused before any download", async () => {
  const { root } = makeSandbox();
  const calls = [];
  try {
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb",
      studio: studio(goodRecord(), { tag: "p-other", fetchImpl: studioDouble(goodRecord(), calls) }),
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /tag p-other not in asset a-1 tags/);
    assert.equal(calls.filter((u) => new URL(u).pathname.endsWith("/media")).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: a matching sha writes a pull-only entry, caches the bytes, copies nothing into assets/, prints no .import reminder, and reports time + credits", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const rec = goodRecord();
    const { cost } = rowFromReport(REPORT, "npc-fixture-ok");
    const { value: r, lines } = await captureLog(() => intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio(rec, { cost }), driftGate: async () => ({ ok: true }),
    }));
    assert.equal(r.ok, true, r.failures?.join());
    const e = JSON.parse(readFileSync(manifestPath, "utf8")).entries["npc:x"];
    assert.equal(e.scene, `res://studio-cache/${rec.sha256}.glb`);
    assert.equal(e.license, "studio-private");
    assert.deepEqual(e.pull, { from: "asset-studio", assetStudioAsset: "a-1", tag: "t-1", sha256: rec.sha256 });
    assert.deepEqual(e.gen, { model: "tripo", provider: "tripo", rig: "mixamo", clips: "mixamo" });
    assert.ok(existsSync(path.join(root, `game-client/studio-cache/${rec.sha256}.glb`)));
    assert.equal(existsSync(path.join(root, "game-client/assets/characters/good.glb")), false);
    assert.equal(lines.some((l) => /Commit the Godot \.import sidecar/.test(l)), false, "pull mode commits nothing");
    assert.equal(typeof r.seconds, "number");
    assert.deepEqual(r.credits, { spent: 35, est: 40 });
    assert.match(r.actions.at(-1), /^intake: done in \d+\.\d s · credits spent 35 \/ est 40 \(batch fixture total\) · gen 209\.4 s$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio without a batch report: the done line says credits n/a", async () => {
  const { root } = makeSandbox();
  try {
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio(goodRecord()), driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true, r.failures?.join());
    assert.equal(r.credits, null);
    assert.match(r.actions.at(-1), /^intake: done in \d+\.\d s · credits n\/a \(no batch report\)$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: a forced failure after the pull restores the manifest and NEVER deletes the verified cache file", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  try {
    const rec = goodRecord();
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio(rec), driftGate: async () => ({ ok: false }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /drift-gate: failed/);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    const cached = path.join(root, `game-client/studio-cache/${rec.sha256}.glb`);
    assert.ok(existsSync(cached), "rollback must not rmSync the content-addressed cache file");
    assert.equal(sha(readFileSync(cached)), rec.sha256, "and must not change its bytes");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio dry-run: reads the record and checks the tag, never downloads, writes nothing", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  const calls = [];
  try {
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", dryRun: true,
      studio: studio(goodRecord(), { fetchImpl: studioDouble(goodRecord(), calls) }),
      driftGate: async () => { throw new Error("dry-run must not run the gate"); },
    });
    assert.equal(r.ok, true, r.failures?.join());
    assert.equal(calls.length, 1, calls.join());
    assert.ok(!new URL(calls[0]).pathname.endsWith("/media"));
    assert.ok(r.actions.some((a) => /^pull \(planned\): a-1 tag t-1 sha256 [0-9a-f]{64}/.test(a)));
    assert.ok(r.actions.some((a) => /^manifest \(planned\): write pull-only entries\["npc:x"\] \(license studio-private\)$/.test(a)));
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.equal(existsSync(path.join(root, "game-client/studio-cache")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: --dest-name is required (the cache file is named by sha256)", async () => {
  const { root } = makeSandbox();
  try {
    const r = await intake(null, { key: "npc:x", root, studio: studio(goodRecord()), driftGate: async () => ({ ok: true }) });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /studio: --dest-name is required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("copy mode keeps its .import reminder and ends with the plain timing line", async () => {
  const { root } = makeSandbox();
  try {
    const { value: r, lines } = await captureLog(() => intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, driftGate: async () => ({ ok: true }),
    }));
    assert.equal(r.ok, true, r.failures?.join());
    assert.ok(lines.some((l) => /Commit the Godot \.import sidecar/.test(l)));
    assert.match(r.actions.at(-1), /^intake: done in \d+\.\d s$/);
    assert.equal("credits" in r, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rowFromReport: a PASS row gives asset, tag and the batch cost; a missing or failed slug throws naming it", () => {
  assert.deepEqual(rowFromReport(REPORT, "npc-fixture-ok"), {
    assetId: "a-1", tag: "t-1", cost: { batch: "fixture", creditsSpent: 35, creditsEst: 40, genSeconds: 209.4 },
  });
  assert.throws(() => rowFromReport(REPORT, "npc-nope"), /slug npc-nope not in report/);
  assert.throws(() => rowFromReport(REPORT, "npc-fixture-failed"), /slug npc-fixture-failed status FAIL, need PASS/);
});

test("defaultAnimsFor: pipelineCharacter gets the standard pipeline map; other kinds get none", () => {
  const cfg = JSON.parse(readFileSync(new URL("../forge.config.json", import.meta.url), "utf8"));
  const map = defaultAnimsFor("pipelineCharacter", cfg);
  assert.deepEqual(map.attack, ["attack", "attack_2", "attack_3"]);
  assert.equal(map.combat_idle, "block_idle");
  for (const clips of Object.values(map)) for (const c of [clips].flat()) assert.ok(cfg.pipelineClips.includes(c), c);
  assert.equal(cfg.pipelineClips.length, 12);
  assert.equal(defaultAnimsFor("character", cfg), null);
});

test("anims: optional state keys are rejected for character, list values must be non-empty strings", async () => {
  const { root } = makeSandbox();
  try {
    const opt = await intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, anims: { idle: "idle", block: "block" },
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(opt.ok, false);
    assert.match(opt.failures.join(), /unknown state\(s\) block/);
    const emptyList = await intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, anims: { attack: [] },
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(emptyList.ok, false);
    assert.match(emptyList.failures.join(), /anims: 'attack' must be a clip name or a non-empty list/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: --from-report without --slug exits 1 with the usage line", () => {
  const r = spawnSync("node", [fileURLToPath(new URL("../intake.mjs", import.meta.url)),
    "--key", "npc:x", "--from-report", REPORT_PATH], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--from-report <report\.json> --slug <slug>/);
});

test("anims: a typo'd state key for pipelineCharacter (combat_idel) is rejected by intake", async () => {
  const { root } = makeSandbox();
  try {
    const r = await intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, kind: "pipelineCharacter",
      anims: { idle: "idle", combat_idel: "block_idle" },
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /unknown state\(s\) combat_idel/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fix2: copy mode refuses a source inside game-client/studio-cache (direct, ../ and symlink)", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  try {
    const cache = path.join(root, "game-client/studio-cache");
    mkdirSync(cache, { recursive: true });
    const inCache = path.join(cache, "a.glb");
    copyFileSync(fx("good.glb"), inCache);
    const link = path.join(root, "innocent.glb");
    symlinkSync(inCache, link);
    for (const src of [inCache, path.join(cache, "..", "studio-cache", "a.glb"), link]) {
      const r = await intake(src, { key: "npc:x", root, driftGate: async () => ({ ok: true }) });
      assert.equal(r.ok, false, src);
      assert.match(r.failures.join(), /refusing to copy a studio-cache asset into game-client\/assets — use --from-report \(pull-only\)/);
    }
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.equal(existsSync(path.join(root, "game-client/assets/characters/a.glb")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fix5: --dest-name must be a bare [a-z0-9_]+.glb name", async () => {
  const { root } = makeSandbox();
  try {
    for (const bad of ["../evil.glb", "a/b.glb", "/abs.glb", "Bad-Name.glb", "x.png", ".glb", "a b.glb"]) {
      const r = await intake(fx("good.glb"), { key: "npc:x", root, destName: bad, driftGate: async () => ({ ok: true }) });
      assert.equal(r.ok, false, bad);
      assert.match(r.failures.join(), /dest-name/, bad);
    }
    const s = await intake(null, { key: "npc:x", root, destName: "../evil.glb", studio: studio(goodRecord()), driftGate: async () => ({ ok: true }) });
    assert.equal(s.ok, false);
    assert.match(s.failures.join(), /dest-name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
