import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotSet, createSnapshots, SNAPSHOT_DIRS } from "../lib/snapshots.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

// A temp "mini repo": every real snapshot-set file, copied in, plus the one
// marker createRepo's assertRepoRoot needs. Never the real repo root — see
// the batch brief's safety note: restore() deletes files, and this suite
// exercises restore().
let MINI = null;
before(() => {
  MINI = mkdtempSync(join(tmpdir(), "mb-snap-mini-"));
  mkdirSync(join(MINI, "atelier/mapforge"), { recursive: true });
  writeFileSync(join(MINI, "atelier/mapforge/generate-world.mjs"), "");
  for (const rel of snapshotSet({ repoRoot: REPO })) {
    const dst = join(MINI, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(join(REPO, rel)));
  }
});
after(() => { if (MINI) rmSync(MINI, { recursive: true, force: true }); });

test("snapshotSet on the real repo names the known families and every path exists", () => {
  const files = snapshotSet({ repoRoot: REPO });
  const want = [
    "content/world/fabric/world.json",
    "content/spine/edges.json",
    "content/spine/derived.json",
    "content/world/render-lock.json",
    "atelier/asset-storybook/maps-index.json",
  ];
  for (const w of want) assert.ok(files.includes(w), `missing ${w}`);
  assert.ok(files.some((f) => /^game-client\/assets\/art\/maps\/.*\.svg$/.test(f)), "no maps svg found");
  for (const f of files) assert.ok(existsSync(join(REPO, f)), `${f} does not exist`);
  // sorted, unique
  assert.deepEqual(files, [...new Set(files)].sort());
});

test("create -> mutate + foreign file + delete -> restore repairs bytes and removes the foreign file", () => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-store-"));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const snap = store.create({ seed: "aaaaaaaaaaaaaaaa" });
  assert.match(snap.id, /^.+-aaaaaaaaaaaaaaaa$/);
  assert.ok(snap.files.length > 0);
  for (const f of snap.files) assert.equal(f.sha256, sha256Hex(readFileSync(join(MINI, f.path))));

  const fabricFile = snap.files.map((f) => f.path).find((p) => p.startsWith("content/world/fabric/") && p.endsWith(".json"));
  assert.ok(fabricFile, "no fabric file in the snapshot");
  writeFileSync(join(MINI, fabricFile), "MUTATED");

  const foreign = "content/spine/nodes/n-ZZZ-foreign.json";
  writeFileSync(join(MINI, foreign), "{}");

  const svgFile = snap.files.map((f) => f.path).find((p) => p.startsWith("game-client/assets/art/maps/") && p.endsWith(".svg"));
  assert.ok(svgFile, "no maps svg in the snapshot");
  rmSync(join(MINI, svgFile));

  const result = store.restore({ id: snap.id });
  assert.ok(result.restored >= snap.files.length);
  assert.ok(result.deleted >= 1);

  for (const f of snap.files) assert.equal(sha256Hex(readFileSync(join(MINI, f.path))), f.sha256, `${f.path} mismatch after restore`);
  assert.equal(existsSync(join(MINI, foreign)), false, "foreign file survived restore");
});

test("keep:3 — prune() removes only the oldest of four", async () => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-prune-"));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const ids = [];
  for (let i = 0; i < 4; i++) {
    ids.push(store.create({ seed: `${i}bbbbbbbbbbbbbbb` }).id);
    await new Promise((r) => setTimeout(r, 5)); // distinct ISO timestamps
  }
  const removed = store.prune();
  assert.deepEqual(removed, [ids[0]]);
  assert.equal(store.list().length, 3);
  assert.equal(store.get(ids[0]), null);
  for (const id of ids.slice(1)) assert.ok(store.get(id));
});

test("restore of an unknown id throws", () => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-unknown-"));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  assert.throws(() => store.restore({ id: "no-such-snapshot" }), /unknown snapshot id/);
});

test("SNAPSHOT_DIRS names exactly the owned directories", () => {
  assert.deepEqual([...SNAPSHOT_DIRS].sort(), [
    "content/world/fabric", "content/world/handles", "content/world/resolved",
    "content/spine/nodes", "game-client/assets/art/maps",
  ].sort());
});
