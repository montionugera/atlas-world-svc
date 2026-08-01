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
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { intakeArt } from "../intake-art.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "../intake-art.mjs");

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

// ---------- F-024: rich-metadata fields (description, tags, source, gen) ----------

test("happy path with all rich-metadata fields writes them into the entry", async () => {
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

  const gen = {
    model: "z_image_turbo_bf16",
    steps: 24,
    cfg: 3,
    seed: 12345,
    width: 1280,
    height: 832,
  };

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    description: "A lean grey wolf, mid-stride on a frost-cracked road.",
    tags: ["cluster-1", "coastal", "mob"],
    source: "docs/worldbuilding/A1-geography-cluster1.md#A1-ART-05",
    gen,
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, true, JSON.stringify(res.failures));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.entries["art:mob-wolf"], {
    group: "mob",
    title: "Wolf",
    file: "concept/new.png",
    note: "Z-Image Turbo, local generation",
    description: "A lean grey wolf, mid-stride on a frost-cracked road.",
    tags: ["cluster-1", "coastal", "mob"],
    source: "docs/worldbuilding/A1-geography-cluster1.md#A1-ART-05",
    gen,
  });
});

test("validation failure (empty description) aborts with zero side effects", async () => {
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
    description: "   ",
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

test("validation failure (tags not an array) aborts with zero side effects", async () => {
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
    tags: "cluster-1,coastal", // must be an array, not a comma string
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

test("validation failure (gen not an object) aborts with zero side effects", async () => {
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
    gen: "z_image_turbo_bf16",
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

test("validation failure (gen.width not positive) aborts with zero side effects", async () => {
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
    gen: { model: "z_image_turbo_bf16", width: 0, height: 832 },
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: true }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before);
  assert.equal(existsSync(join(root, "concept/new.png")), false);
});

// ---------- F-024: CLI bare-flag guard (this codebase's four-time-repeated bug) ----------
// Each of these spawns the real CLI as a subprocess so the *actual* argv
// parsing + usage-error path is exercised, not just the programmatic
// intakeArt() API. A bare flag or malformed --gen must exit non-zero AND
// leave the sandboxed manifest byte-for-byte untouched.

function cliFixture() {
  const dir = mkdtempSync(join(tmpdir(), "artintake-cli-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));
  return { dir, root, manifestPath, before, src };
}

function runCli(args) {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

test("CLI: a bare --tags (no value, end of argv) exits non-zero and writes nothing", () => {
  const f = cliFixture();
  const r = runCli([
    "--src",
    f.src,
    "--id",
    "art:mob-wolf",
    "--group",
    "mob",
    "--title",
    "Wolf",
    "--note",
    "Z-Image Turbo, local generation",
    "--root",
    f.root,
    "--manifest-path",
    f.manifestPath,
    "--tags",
  ]);
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(f.manifestPath, "utf8"), f.before);
  assert.equal(existsSync(join(f.root, "concept/new.png")), false);
});

test("CLI: a bare --tags followed by another flag exits non-zero and writes nothing", () => {
  const f = cliFixture();
  const r = runCli([
    "--src",
    f.src,
    "--id",
    "art:mob-wolf",
    "--group",
    "mob",
    "--title",
    "Wolf",
    "--tags",
    "--note",
    "Z-Image Turbo, local generation",
    "--root",
    f.root,
    "--manifest-path",
    f.manifestPath,
  ]);
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(f.manifestPath, "utf8"), f.before);
  assert.equal(existsSync(join(f.root, "concept/new.png")), false);
});

test("CLI: --tags= (empty value) exits non-zero and writes nothing", () => {
  const f = cliFixture();
  const r = runCli([
    "--src",
    f.src,
    "--id",
    "art:mob-wolf",
    "--group",
    "mob",
    "--title",
    "Wolf",
    "--note",
    "Z-Image Turbo, local generation",
    "--root",
    f.root,
    "--manifest-path",
    f.manifestPath,
    "--tags=",
  ]);
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(f.manifestPath, "utf8"), f.before);
  assert.equal(existsSync(join(f.root, "concept/new.png")), false);
});

test("CLI: a bare --gen exits non-zero and writes nothing", () => {
  const f = cliFixture();
  const r = runCli([
    "--src",
    f.src,
    "--id",
    "art:mob-wolf",
    "--group",
    "mob",
    "--title",
    "Wolf",
    "--note",
    "Z-Image Turbo, local generation",
    "--root",
    f.root,
    "--manifest-path",
    f.manifestPath,
    "--gen",
  ]);
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(f.manifestPath, "utf8"), f.before);
  assert.equal(existsSync(join(f.root, "concept/new.png")), false);
});

test("CLI: malformed --gen JSON exits non-zero and writes nothing", () => {
  const f = cliFixture();
  const r = runCli([
    "--src",
    f.src,
    "--id",
    "art:mob-wolf",
    "--group",
    "mob",
    "--title",
    "Wolf",
    "--note",
    "Z-Image Turbo, local generation",
    "--root",
    f.root,
    "--manifest-path",
    f.manifestPath,
    "--gen",
    "{not valid json",
  ]);
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(f.manifestPath, "utf8"), f.before);
  assert.equal(existsSync(join(f.root, "concept/new.png")), false);
});

// This CLI run's --root/--manifest-path point at the sandbox, but
// intake-art.mjs's defaultDriftGateRunner only overrides --art-manifest and
// --art-root on the spawned gate — --art-groups/--manifest/--keys etc. still
// resolve to the REAL repo (by design: the group registry is a fixed,
// non-sandboxable contract). The real art-groups.json's expectedCounts
// (race:8, class:64) therefore fail against this single-entry sandbox
// regardless of these new fields, and intakeArt rolls the write back — so
// this test asserts the CLI got PAST field parsing/validation (the
// "validate" and "manifest: wrote" actions appear in stdout) and that the
// rollback correctly restored the sandbox, rather than asserting exit 0.
test("CLI: valid --gen JSON + --tags + --description + --source parse and pass field validation", () => {
  const f = cliFixture();
  const r = runCli([
    "--src",
    f.src,
    "--id",
    "art:mob-wolf",
    "--group",
    "mob",
    "--title",
    "Wolf",
    "--note",
    "Z-Image Turbo, local generation",
    "--description",
    "A lean grey wolf, mid-stride on a frost-cracked road.",
    "--tags",
    "cluster-1, coastal , mob",
    "--source",
    "docs/worldbuilding/A1-geography-cluster1.md#A1-ART-05",
    "--gen",
    '{"model":"z_image_turbo_bf16","steps":24,"cfg":3,"seed":12345,"width":1280,"height":832}',
    "--root",
    f.root,
    "--manifest-path",
    f.manifestPath,
  ]);
  assert.match(r.stdout, /validate: art:mob-wolf \(mob\) OK/);
  assert.match(r.stdout, /manifest: wrote entries\["art:mob-wolf"\]/);
  // Rolled back by the real gate's unrelated race/class count policy —
  // proves the rollback net still closes over the new fields correctly.
  assert.equal(readFileSync(f.manifestPath, "utf8"), f.before);
});
