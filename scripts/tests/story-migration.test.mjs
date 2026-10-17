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
test("gate on migrated content: zero failures now that Task 15/R-B closed the last legacy orphan", () => {
  // Plan D Task 11 made content/world/resolved/ the gate's only geography
  // source, and every legacy record orphaned LOUDLY until re-homed. Task 9/14
  // re-homed the zone and town records; R-B (owner ruling, 2026-08-29) closed
  // the last one, bestiary/placement-thornveil.json's un-re-homable join, as
  // a committed exemption rather than a silenced FAIL. Any FAIL line here —
  // of any shape — is a regression this test still catches.
  let out, code = 0;
  try {
    out = execFileSync(process.execPath, [join(ROOT,"scripts/check_content.mjs")], { encoding:"utf8" });
  } catch (e) { out = `${e.stdout ?? ""}${e.stderr ?? ""}`; code = e.status; }
  assert.equal(code, 0, out);
  assert.match(out, /\d+ nodes, 0 failures/, out);
  assert.doesNotMatch(out, /^FAIL /m);
});
