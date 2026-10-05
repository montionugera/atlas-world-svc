import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotSet, createSnapshots, SNAPSHOT_DIRS } from "../lib/snapshots.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

// A temp "mini repo": every real snapshot-set file, copied in, plus the one
// marker createRepo's assertRepoRoot needs, PLUS content/spine/roots.json —
// an INPUT collectOutputs needs (not an output, so snapshotSet never copies
// it on its own) and whose absence is exactly Batch F round 1 finding B/I1:
// without it, collectOutputs(MINI) used to fail and the bug being fixed here
// (errors/skip coalescing to "no outputs") hid derived.json + the two spine
// mirrors from every test below. Never the real repo root — see the batch
// brief's safety note: restore() deletes files, and this suite exercises
// restore().
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
  mkdirSync(join(MINI, "content/spine"), { recursive: true });
  writeFileSync(join(MINI, "content/spine/roots.json"), readFileSync(join(REPO, "content/spine/roots.json")));
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

test("MINI's own snapshotSet includes derived.json + the two spine mirrors (proves the roots.json fixture fix)", () => {
  const files = snapshotSet({ repoRoot: MINI });
  const hasColyseus = existsSync(join(REPO, "colyseus-server/src/config"));
  const expected = ["content/spine/derived.json", "content/maps/atlas-frontier.md"];
  if (hasColyseus) expected.push("colyseus-server/src/config/generated/mapDimensions.ts");
  for (const w of expected)
    assert.ok(files.includes(w), `MINI's snapshotSet is missing ${w} — the roots.json fixture is incomplete`);
});

test("create -> mutate + foreign file + delete -> restore repairs bytes and removes the foreign file", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-store-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
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
  assert.equal(result.restored, snap.files.length);
  assert.ok(result.deleted >= 1);

  for (const f of snap.files) assert.equal(sha256Hex(readFileSync(join(MINI, f.path))), f.sha256, `${f.path} mismatch after restore`);
  assert.equal(existsSync(join(MINI, foreign)), false, "foreign file survived restore");
});

test("keep:3 — prune() removes only the oldest of four", async (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-prune-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
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

test("prune() defaults to keep:3 when not specified (m6)", async (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-defaultkeep-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir }); // no `keep` — must default to 3
  for (let i = 0; i < 4; i++) {
    store.create({ seed: `${i}dddddddddddddd0` });
    await new Promise((r) => setTimeout(r, 5));
  }
  store.prune();
  assert.equal(store.list().length, 3);
});

test("restore of an unknown id throws", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-unknown-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  assert.throws(() => store.restore({ id: "no-such-snapshot" }), /unknown snapshot id/);
});

test("assertSafeId rejects path-like ids (/, \\, ..) for both restore() and get() (m1.ii)", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-safeid-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  for (const bad of ["../x", "a/b", "a\\b", "..", ""]) {
    assert.throws(() => store.restore({ id: bad }), /invalid snapshot id/, `restore accepted ${JSON.stringify(bad)}`);
    assert.throws(() => store.get(bad), /invalid snapshot id/, `get accepted ${JSON.stringify(bad)}`);
  }
});

test("restore refuses a snapshot.json entry whose path resolves outside the repo root, before touching the live tree (I2 containment)", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-guard-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const snap = store.create({ seed: "guardguardguardg" });

  // Hand-tamper the on-disk meta the way a corrupted/malicious store would —
  // an entry whose path escapes repoRoot via "..". This targets the
  // copy-back (restore) containment guard specifically, which — unlike the
  // delete-phase guard — has no defense from directory-listing construction.
  const metaPath = join(snapDir, snap.id, "snapshot.json");
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const victimRel = meta.files[0].path;
  const victimBefore = readFileSync(join(MINI, victimRel));
  meta.files.push({ path: "../evil-outside-the-repo.txt", sha256: sha256Hex(Buffer.from("evil")) });
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  assert.throws(() => store.restore({ id: snap.id }), /resolves outside the repo root/);
  // Pre-flight ran before any rmSync/copy — the live tree must be untouched.
  assert.deepEqual(readFileSync(join(MINI, victimRel)), victimBefore, "live tree mutated despite pre-flight failure");
  assert.equal(existsSync(join(MINI, "..", "evil-outside-the-repo.txt")), false, "escaped write actually landed on disk");
});

test("restore refuses when the snapshot STORE is corrupt (bytes don't match the recorded sha256), before touching the live tree (I2 / m1.iii)", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-corrupt-store-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const snap = store.create({ seed: "corruptedcorrupt" });

  const fabricFile = snap.files.map((f) => f.path).find((p) => p.startsWith("content/world/fabric/") && p.endsWith(".json"));
  assert.ok(fabricFile, "no fabric file in the snapshot");
  // Corrupt the STORE's copy, not the live tree.
  writeFileSync(join(snapDir, snap.id, fabricFile), "CORRUPT BYTES");

  const liveBefore = readFileSync(join(MINI, fabricFile));
  assert.throws(() => store.restore({ id: snap.id }), /snapshot store is corrupt/);
  assert.deepEqual(readFileSync(join(MINI, fabricFile)), liveBefore, "live tree mutated despite pre-flight failure");
});

test("a corrupt snapshot.json surfaces via list() as { id, corrupt: true }, prune() removes it, and get() throws distinctly from 'unknown id' (I3/m3)", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-metacorrupt-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const good = store.create({ seed: "gooooooooooooood" });
  const bad = store.create({ seed: "baaaaaaaaaaaaaad" });
  writeFileSync(join(snapDir, bad.id, "snapshot.json"), "{ not valid json");

  const rows = store.list();
  assert.deepEqual(rows.find((r) => r.id === bad.id), { id: bad.id, corrupt: true });
  assert.ok(rows.find((r) => r.id === good.id && !r.corrupt), "the good snapshot should still list normally");

  assert.throws(() => store.get(bad.id), /corrupt/i);
  assert.throws(() => store.get(bad.id), (e) => !/unknown snapshot id/.test(e.message), "corrupt must not read as 'unknown id'");

  const removed = store.prune();
  assert.ok(removed.includes(bad.id), "prune() did not remove the corrupt snapshot");
  assert.equal(existsSync(join(snapDir, bad.id)), false, "corrupt snapshot dir was not removed from disk");
});

test("an orphan snapshot dir with no snapshot.json (create() died mid-copy) is treated as corrupt and prune()d (Batch F rereview R1)", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-orphan-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const good = store.create({ seed: "goodgoodgoodgood" });

  // Simulate create() dying after copying files but before writing
  // snapshot.json (the realistic trigger is disk-full) — a bare directory
  // under the store with no meta at all.
  const orphanId = "2020-01-01T00-00-00.000Z-orphan";
  mkdirSync(join(snapDir, orphanId), { recursive: true });
  writeFileSync(join(snapDir, orphanId, "some-copied-file.json"), "{}");

  const rows = store.list();
  assert.deepEqual(rows.find((r) => r.id === orphanId), { id: orphanId, corrupt: true },
    "orphan dir did not surface via list() as corrupt");
  assert.ok(rows.find((r) => r.id === good.id && !r.corrupt), "the good snapshot should still list normally");

  const removed = store.prune();
  assert.ok(removed.includes(orphanId), "prune() did not remove the orphan dir");
  assert.equal(existsSync(join(snapDir, orphanId)), false, "orphan snapshot dir was not removed from disk");
});

test("restore unlinks a DANGLING symlink at dst before copying, instead of writing the target outside the repo (Batch F rereview R2)", (t) => {
  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-dangling-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: MINI, dir: snapDir, keep: 3 });
  const snap = store.create({ seed: "dangledangledang" });

  const victimRel = snap.files[0].path;
  const dst = join(MINI, victimRel);
  const outsideDir = mkdtempSync(join(tmpdir(), "mb-snap-outside-"));
  t.after(() => rmSync(outsideDir, { recursive: true, force: true }));
  const outsideTarget = join(outsideDir, "target.txt");
  rmSync(dst); // remove the real file so a symlink can take its place
  symlinkSync(outsideTarget, dst); // dangling: outsideTarget does not exist
  assert.equal(existsSync(dst), false, "precondition: existsSync must report false for a dangling symlink");
  assert.ok(lstatSync(dst).isSymbolicLink(), "precondition: dst must be a symlink before restore");

  store.restore({ id: snap.id });

  assert.equal(existsSync(outsideTarget), false, "restore wrote the dangling symlink's target outside the repo");
  assert.equal(lstatSync(dst).isSymbolicLink(), false, "dst is still a symlink after restore");
  assert.equal(sha256Hex(readFileSync(dst)), snap.files[0].sha256, "restored file content mismatch");
});

test("create() throws when content/spine/roots.json is missing, instead of silently shrinking the snapshot set (I1/finding B)", (t) => {
  const NOROOTS = mkdtempSync(join(tmpdir(), "mb-snap-noroots-"));
  t.after(() => rmSync(NOROOTS, { recursive: true, force: true }));
  cpSync(MINI, NOROOTS, { recursive: true });
  rmSync(join(NOROOTS, "content/spine/roots.json"));

  const snapDir = mkdtempSync(join(tmpdir(), "mb-snap-noroots-store-"));
  t.after(() => rmSync(snapDir, { recursive: true, force: true }));
  const store = createSnapshots({ repoRoot: NOROOTS, dir: snapDir, keep: 3 });
  assert.throws(() => store.create({ seed: "norootsnoroots00" }), /spine-emit/);
  // and directly at the snapshotSet level, which is what create() calls:
  assert.throws(() => snapshotSet({ repoRoot: NOROOTS }), /spine-emit/);
});

test("SNAPSHOT_DIRS names exactly the owned directories", () => {
  assert.deepEqual([...SNAPSHOT_DIRS].sort(), [
    "content/world/fabric", "content/world/handles", "content/world/resolved",
    "content/spine/nodes", "game-client/assets/art/maps",
  ].sort());
});
