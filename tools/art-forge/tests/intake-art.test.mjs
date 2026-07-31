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
