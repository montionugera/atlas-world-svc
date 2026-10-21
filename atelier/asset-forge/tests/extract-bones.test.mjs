import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLERIC = path.resolve(FORGE, "../../game-client/assets/characters/cleric.glb");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

test("extract-bones --allow-extras writes parents, allowExtras and S3 allow-lists", (t) => {
  if (!existsSync(CLERIC)) return t.skip("cleric.glb missing");
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "extract-bones-")), "core.json");
  execFileSync("node", [path.join(FORGE, "extract-bones.mjs"), CLERIC, out, "--allow-extras"], { stdio: "pipe" });
  const ref = readJson(out);
  assert.equal(ref.allowExtras, true);
  assert.equal(ref.joints.length, 23);
  assert.equal(ref.parents.root, null);
  assert.equal(ref.parents.hips, "root");
  assert.ok(ref.secParents.includes("head"));
  assert.ok(ref.sleeveParents.includes("upperarm.l"));
  assert.ok(ref.propParents.includes("handslot.r"));
});

test("extract-bones without the flag omits allowExtras", (t) => {
  if (!existsSync(CLERIC)) return t.skip("cleric.glb missing");
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "extract-bones-")), "plain.json");
  execFileSync("node", [path.join(FORGE, "extract-bones.mjs"), CLERIC, out], { stdio: "pipe" });
  const ref = readJson(out);
  assert.equal(ref.allowExtras, undefined);
  assert.ok(ref.parents);
});

test("committed kaykit-core reference: 23 joints = kaykit-adventurer minus 18 helpers, listed after legacy refs", () => {
  const core = readJson(path.join(FORGE, "rig-reference/kaykit-core.bones.json"));
  const adv = readJson(path.join(FORGE, "rig-reference/kaykit-adventurer.bones.json"));
  const helpers = adv.joints.filter((n) => /^IK-|IK\.|^control-/.test(n));
  assert.equal(helpers.length, 18);
  assert.deepEqual(core.joints, adv.joints.filter((n) => !helpers.includes(n)));
  assert.equal(core.joints.length, 23);
  assert.equal(core.allowExtras, true);
  for (const n of [...core.secParents, ...core.sleeveParents, ...core.propParents]) {
    assert.ok(core.joints.includes(n), `${n} is not a core joint`);
  }
  const cfg = readJson(path.join(FORGE, "forge.config.json"));
  assert.deepEqual(cfg.rigReference.slice(-1), ["rig-reference/kaykit-core.bones.json"]);
  assert.equal(cfg.rigReference.length, 3);
});
