// Plan A Task 10 — the checksum lock that replaces five byte comparisons.
//
// The honest cost of a checksum is that it says THAT something changed, not
// WHAT. unifiedDiff is the mitigation and it ships here, in the same file, so
// the two can never separate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeLock,
  checkLock,
  unifiedDiff,
  GENERATOR_VERSION,
} from "../lib/render-lock.mjs";
import { SHEETS } from "../../tools/mapforge/render-sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCK_PATH = join(ROOT, "content/world/render-lock.json");
const CLI = join(ROOT, "scripts/check_render_lock.mjs");
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

test("computeLock hashes every sheet's BUILT bytes, keyed by repo-relative outSvg", () => {
  const lock = computeLock({ repoRoot: ROOT, sheets: SHEETS });
  assert.equal(lock.version, 2);
  assert.deepEqual(lock.generator, {
    name: "mapforge",
    version: GENERATOR_VERSION,
  });
  for (const sheet of Object.values(SHEETS)) {
    const got = lock.artifacts[sheet.outSvg];
    assert.match(
      got ?? "",
      /^sha256:[0-9a-f]{64}$/,
      `no lock entry for ${sheet.outSvg}`,
    );
    assert.equal(got, sha(sheet.build({ repoRoot: ROOT }).svg));
  }
});

test("computeLock hashes extraPaths from DISK (the growth point for Plan C's fabric)", () => {
  const dir = mkdtempSync(join(tmpdir(), "lock-extra-"));
  try {
    writeFileSync(join(dir, "thing.json"), "hello\n");
    const lock = computeLock({
      repoRoot: dir,
      sheets: {},
      extraPaths: ["thing.json"],
    });
    assert.equal(lock.artifacts["thing.json"], sha("hello\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the committed lock matches what the sheets build right now", () => {
  const committed = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  const computed = computeLock({ repoRoot: ROOT, sheets: SHEETS });
  assert.deepEqual(
    checkLock({
      committed: committed.artifacts,
      computed: computed.artifacts,
    }),
    { drift: [], missing: [], extra: [] },
  );
});

test("checkLock separates drift, missing and extra — three different mistakes", () => {
  const r = checkLock({
    committed: { a: "sha256:1", b: "sha256:2", gone: "sha256:3" },
    computed: { a: "sha256:1", b: "sha256:CHANGED", added: "sha256:4" },
  });
  assert.deepEqual(r, { drift: ["b"], missing: ["gone"], extra: ["added"] });
});

test("unifiedDiff shows the changed region with a hunk header and respects maxLines", () => {
  const a = ["one", "two", "three", "four", "five"].join("\n");
  const b = ["one", "two", "THREE", "four", "five"].join("\n");
  const d = unifiedDiff({ a, b });
  assert.match(d, /^@@ -3,1 \+3,1 @@$/m);
  assert.match(d, /^-three$/m);
  assert.match(d, /^\+THREE$/m);
});

test("unifiedDiff on identical input is the empty string", () => {
  assert.equal(unifiedDiff({ a: "x\ny\n", b: "x\ny\n" }), "");
});

test("unifiedDiff truncates and says so", () => {
  const a = Array.from({ length: 500 }, (_, i) => `a${i}`).join("\n");
  const b = Array.from({ length: 500 }, (_, i) => `b${i}`).join("\n");
  const d = unifiedDiff({ a, b, maxLines: 10 });
  assert.ok(d.split("\n").length <= 12, `diff is ${d.split("\n").length} lines`);
  assert.match(d, /truncated/);
});

test("unifiedDiff survives an empty side, a strict prefix and a missing trailing newline", () => {
  // (d) from the Task 10 reviewer brief, pinned as a test rather than a claim.
  const full = "alpha\nbeta\ngamma\n";
  assert.match(unifiedDiff({ a: "", b: full }), /^@@ -1,0 \+1,3 @@$/m);
  assert.match(unifiedDiff({ a: full, b: "" }), /^@@ -1,3 \+1,0 @@$/m);
  // a is a strict prefix of b: no trailing newline on the short side.
  const d = unifiedDiff({ a: "alpha\nbeta", b: "alpha\nbeta\ngamma" });
  assert.match(d, /^@@ -3,0 \+3,1 @@$/m);
  assert.match(d, /^\+gamma$/m);
  assert.equal(
    unifiedDiff({ a: "alpha\nbeta", b: "alpha\nbeta" }),
    "",
    "no trailing newline must not manufacture a diff",
  );
});

test("the CLI --check exits 0 today and 1 on a tampered lock", () => {
  execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" }); // throws on non-zero
  const original = readFileSync(LOCK_PATH, "utf8");
  try {
    const doc = JSON.parse(original);
    const firstKey = Object.keys(doc.artifacts)[0];
    doc.artifacts[firstKey] = "sha256:" + "0".repeat(64);
    writeFileSync(LOCK_PATH, JSON.stringify(doc, null, 2) + "\n");
    let failed = false,
      out = "";
    try {
      execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" });
    } catch (e) {
      failed = true;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    assert.ok(failed, "--check exited 0 on a tampered lock");
    assert.match(
      out,
      /G-RENDER-LOCK: .+ sha256 sha256:[0-9a-f]{64} != locked sha256:0{64}/,
    );
  } finally {
    writeFileSync(LOCK_PATH, original);
  }
});

test("the CLI --check catches a STALE committed svg, not just a stale lock", () => {
  const svgPath = join(ROOT, SHEETS.cluster1.outSvg);
  const original = readFileSync(svgPath, "utf8");
  try {
    writeFileSync(svgPath, original.slice(0, Math.floor(original.length / 2)));
    let failed = false,
      out = "";
    try {
      execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" });
    } catch (e) {
      failed = true;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    assert.ok(failed, "--check exited 0 on a truncated committed svg");
    assert.match(
      out,
      /@@ /,
      "no unified diff was printed — the checksum's whole mitigation",
    );
  } finally {
    // Self-healing: restore from the file we read, never `git checkout --`,
    // which is exactly the parity.test.mjs footgun this plan removes.
    writeFileSync(svgPath, original);
  }
});
