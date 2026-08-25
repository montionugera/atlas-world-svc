import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
test("story.json is gone; per-kind files exist", () => {
  assert.equal(existsSync(join(ROOT, "content/story/story.json")), false);
  for (const f of ["acts","regions","factions","characters","arcs","quests","events","dialogue"])
    assert.ok(existsSync(join(ROOT, `content/story/${f}.json`)), `${f}.json missing`);
});
test("gate on migrated content: the only failures are Plan D Task 11's pre-re-home geography orphans", () => {
  // Plan D Task 11 made content/world/resolved/ the gate's only geography
  // source; until Plan E movement 2 re-homes the committed records onto the
  // generated region ids, every legacy record orphans LOUDLY. Pin that exact
  // set — any OTHER failure is a regression this test still catches.
  let out;
  try {
    out = execFileSync(process.execPath, [join(ROOT,"scripts/check_content.mjs")], { encoding:"utf8" });
  } catch (e) { out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
  assert.match(out, /[1-9]\d* nodes, [1-9]\d* failures/);
  for (const line of out.split("\n").filter((l) => l.startsWith("FAIL ")))
    assert.match(line, /not in content\/world\/resolved#(zones|towns)|has no record in content\/zones\//);
});
