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
test("gate is green on migrated content", () => {
  const out = execFileSync(process.execPath, [join(ROOT,"scripts/check_content.mjs")], { encoding:"utf8" });
  assert.match(out, /[1-9]\d* nodes, 0 failures/);
});
