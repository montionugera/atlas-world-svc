import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeWorldDigest, checkWorldDigest, WORLD_DIGEST_INPUTS }
  from "../lib/world-digest.mjs";

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "wdig-"));
  mkdirSync(join(dir, "content/spine/nodes"), { recursive: true });
  writeFileSync(join(dir, "content/spine/nodes/n-a.json"), '{"id":"n-a"}\n');
  return dir;
}

test("the input list is the committed three layers, in this order", () => {
  assert.deepEqual([...WORLD_DIGEST_INPUTS],
    ["content/world/fabric", "content/world/resolved", "content/spine/nodes"]);
});

test("an absent input is recorded as absent, not skipped", () => {
  const dir = scratch();
  const d = computeWorldDigest({ repoRoot: dir });
  assert.equal(d.inputs["content/world/fabric"], "absent");
  assert.equal(d.inputs["content/world/resolved"], "absent");
  assert.match(d.inputs["content/spine/nodes"], /^sha256:[0-9a-f]{64}$/);
  assert.match(d.digest, /^sha256:[0-9a-f]{64}$/);
});

test("the digest is stable across two computations of the same tree", () => {
  const dir = scratch();
  assert.deepEqual(computeWorldDigest({ repoRoot: dir }), computeWorldDigest({ repoRoot: dir }));
});

test("a byte change in one layer moves that layer's digest and the whole", () => {
  const dir = scratch();
  const before = computeWorldDigest({ repoRoot: dir });
  writeFileSync(join(dir, "content/spine/nodes/n-a.json"), '{"id":"n-b"}\n');
  const after = computeWorldDigest({ repoRoot: dir });
  assert.notEqual(before.inputs["content/spine/nodes"], after.inputs["content/spine/nodes"]);
  assert.notEqual(before.digest, after.digest);
  assert.equal(before.inputs["content/world/fabric"], after.inputs["content/world/fabric"]);
});

test("a file APPEARING in a previously absent layer is a digest change", () => {
  const dir = scratch();
  const before = computeWorldDigest({ repoRoot: dir });
  mkdirSync(join(dir, "content/world/fabric"), { recursive: true });
  writeFileSync(join(dir, "content/world/fabric/continent-01.json"), "{}\n");
  const after = computeWorldDigest({ repoRoot: dir });
  assert.equal(before.inputs["content/world/fabric"], "absent");
  assert.match(after.inputs["content/world/fabric"], /^sha256:/);
  assert.notEqual(before.digest, after.digest);
});

test("renaming a file changes the digest — path is hashed, not just bytes", () => {
  const dir = scratch();
  const before = computeWorldDigest({ repoRoot: dir });
  rmSync(join(dir, "content/spine/nodes/n-a.json"));
  writeFileSync(join(dir, "content/spine/nodes/n-z.json"), '{"id":"n-a"}\n');
  assert.notEqual(before.digest, computeWorldDigest({ repoRoot: dir }).digest);
});

test("checkWorldDigest names the layer that moved, not just the whole", () => {
  const a = { version: 1, inputs: { x: "sha256:1", y: "sha256:2" }, digest: "sha256:aa" };
  const b = { version: 1, inputs: { x: "sha256:1", y: "sha256:3" }, digest: "sha256:bb" };
  const out = checkWorldDigest({ committed: a, computed: b });
  assert.equal(out.length, 2);
  assert.match(out[0], /^G-WORLD-DIGEST: input "y" is sha256:3 != committed sha256:2$/);
  assert.match(out[1], /^G-WORLD-DIGEST: world digest sha256:bb != committed sha256:aa/);
});

test("a matching digest yields no problems", () => {
  const a = { version: 1, inputs: { x: "sha256:1" }, digest: "sha256:aa" };
  assert.deepEqual(checkWorldDigest({ committed: a, computed: a }), []);
});
