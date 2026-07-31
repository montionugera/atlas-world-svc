import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { intakeArt } from "../intake-art.mjs";

test("a failing gate rolls back to the exact prior bytes and leaves no PNG", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    driftGateRunner: async () => ({
      ok: false,
      output: "synthetic gate failure",
    }),
  });

  assert.equal(res.ok, false);
  assert.equal(
    readFileSync(manifestPath, "utf8"),
    before,
    "manifest not restored",
  );
  assert.equal(
    existsSync(join(root, "concept/new.png")),
    false,
    "copied PNG not removed",
  );
});

test("validation failure (bad id prefix) aborts with zero side effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "mob-wolf", // missing required "art:" prefix
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

test("validation failure (unknown group) aborts with zero side effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "not-a-real-group",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

test("validation failure (missing note) aborts with zero side effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "", // provenance required
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

// Exercises the OTHER branch of rollback(): destExisted === true ->
// writeFileSync(destPath, destBackup) — restore, not delete. The prior
// rollback test above only ever hits destExisted === false (rmSync), since
// its destination starts empty.
//
// Note on "distinctive bytes different from the source PNG": intakeArt's own
// validate step (see intake-art.mjs's destination-conflict check, just
// before the manifest snapshot) rejects any call where a file ALREADY sits
// at the destination with content that differs from `src` — that is a
// deliberate, reviewer-approved guard against silently clobbering an
// unrelated image, and it fires before copy/gate/rollback are ever reached.
// So a pre-existing file with content genuinely different from `src` can
// never reach this test's gate-failure/rollback path at all (it aborts at
// validation, with the destination untouched and rollback() never called) —
// there is no way to legitimately construct that scenario through the
// public intakeArt() API. The only reachable "destExisted === true" case is
// therefore the idempotent re-intake: the same bytes already sit at the
// destination (e.g. a prior successful intake, or a hand-placed duplicate),
// and THIS call's gate fails. That is exactly what is exercised below, using
// a long, distinctive byte pattern (not the bare PNG-signature bytes the
// other tests use) so a bug that zeroes, truncates, or otherwise corrupts
// the restored buffer is still clearly visible in the assertion.
test("a failing gate on a pre-existing destination restores it, not deletes it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);

  const DISTINCTIVE = Buffer.from(
    "PRE-EXISTING-CONCEPT-ART-BYTES-MUST-SURVIVE-A-GATE-FAILURE-89504e47",
  );
  const src = join(dir, "new.png");
  writeFileSync(src, DISTINCTIVE);
  // Pre-populate the destination with the SAME bytes so the front-door
  // "destination already has a different file" validation check allows the
  // call through to copy/gate/rollback (see the comment above).
  const destPath = join(root, "concept/new.png");
  writeFileSync(destPath, DISTINCTIVE);

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    driftGateRunner: async () => ({
      ok: false,
      output: "synthetic gate failure",
    }),
  });

  assert.equal(res.ok, false);
  assert.equal(
    readFileSync(manifestPath, "utf8"),
    before,
    "manifest not restored",
  );
  assert.equal(
    existsSync(destPath),
    true,
    "pre-existing destination file was deleted instead of restored",
  );
  assert.deepEqual(
    readFileSync(destPath),
    DISTINCTIVE,
    "pre-existing destination bytes were not restored exactly",
  );
});

test("happy path (synthetic passing gate) copies the file and writes the entry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n",
  );
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, true);
  assert.equal(res.id, "art:mob-wolf");
  assert.ok(existsSync(join(root, "concept/new.png")));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.entries["art:mob-wolf"], {
    group: "mob",
    title: "Wolf",
    file: "concept/new.png",
    note: "Z-Image Turbo, local generation",
  });
});

// Regression test for the "silent false green" finding: with NO
// driftGateRunner override, defaultDriftGateRunner must actually gate the
// SANDBOXED root/manifestPath this call wrote to — not the real repo's
// art-manifest.json. We prove that by planting an orphan image in the
// sandbox art root (a file with no manifest entry). The real gate's
// assertArtCoverage (guard M in scripts/check_asset_manifest.mjs) fails on
// any unclaimed image under the art root it was pointed at. If the runner
// silently validated the real repo's manifest instead (the bug this test
// guards against), the sandbox orphan would never be seen and the gate
// would report a false pass.
test("default (real) drift-gate genuinely validates the sandboxed root — an orphan image in the sandbox fails the gate and rolls back", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);

  // Orphan: a PNG already sitting in the sandbox concept/ dir that no
  // manifest entry claims. Only the sandbox gate (pointed at THIS root) can
  // see it — the real repo's art root has no such file.
  writeFileSync(
    join(root, "concept/orphan.png"),
    Buffer.from("89504e470d0a1a0a", "hex"),
  );

  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    // No driftGateRunner override — exercises the real
    // defaultDriftGateRunner, which spawns the real
    // scripts/check_asset_manifest.mjs against this sandbox.
  });

  assert.equal(
    res.ok,
    false,
    "expected the real gate to fail on the sandbox's orphan image",
  );
  assert.equal(
    readFileSync(manifestPath, "utf8"),
    before,
    "manifest not restored after gate failure",
  );
  assert.equal(
    existsSync(join(root, "concept/new.png")),
    false,
    "copied PNG not rolled back after gate failure",
  );
  // The orphan itself is untouched by intake — it was never intake's file to
  // manage — but it must still be present, proving the gate actually looked
  // at this sandbox (rather than, say, some other run wiping the dir).
  assert.equal(existsSync(join(root, "concept/orphan.png")), true);
});
