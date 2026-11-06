import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function testPlan(entry) {
  const plan = join(mkdtempSync(join(tmpdir(), "pc-plan-")), "plan.sh");
  writeFileSync(plan, `GROUP_ORDER="godot"\nGROUP_godot=("${entry}")\nSERIAL_PLAN=("${entry}")\n`);
  return plan;
}
function gate(plan, extra = {}) {
  return spawnSync("bash", [join(ROOT, "scripts/precheck.sh"), "--no-install"], {
    cwd: ROOT, encoding: "utf8", timeout: 60000,
    env: {
      ...process.env, ATLAS_PRECHECK_TEST_MODE: "1", ATLAS_PRECHECK_TEST_PLAN: plan, PRECHECK_FULL: "1",
      STUDIO_TOKEN: "t", ATLAS_STUDIO_URL: "http://127.0.0.1:9",
      ATLAS_STUDIO_CACHE_DIR: mkdtempSync(join(tmpdir(), "pc-cache-")), ATLAS_SKIP_STUDIO: "", ...extra,
    },
  });
}
function select(paths) {
  const r = spawnSync("bash", [join(ROOT, "scripts/precheck.sh"), "--print-pipeline-char-selector"], {
    cwd: ROOT, input: `${paths.join("\n")}\n`, encoding: "utf8", timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}

test("runs for game-client, asset-forge, the gate's own files, its tests, fixtures and ledgers", () => {
  for (const p of [
    "game-client/assets/manifest.json", "game-client/src/World/AnimationController.cs", "game-client/export_presets.cfg",
    "atelier/asset-forge/validate.mjs", "atelier/asset-forge/tests/studio-report.fixture.json",
    "scripts/check_asset_manifest.mjs", "scripts/bake_thumbnails.mjs",
    "scripts/lib/anim-clips.mjs", "scripts/godot-verify.sh", "scripts/precheck.sh",
    "scripts/studio-pull.mjs", "scripts/lib/studio-pull.mjs", "scripts/lib/studio-token.mjs",
    "scripts/lib/pull-entry.mjs", "scripts/lib/license-policy.mjs", "scripts/lib/thumbkey.mjs",
    "content/generated/asset-keys.json",
    "scripts/tests/studio-pull.test.mjs", "scripts/tests/pull-entry.test.mjs", "scripts/tests/godot-verify.test.mjs",
    "scripts/tests/anim-clips.test.mjs", "scripts/tests/precheck-pipeline-char.test.mjs",
    "scripts/tests/bake-thumbnails-pull.test.mjs",
    "scripts/tests/fixtures/studio/sergeant-asset-record.json", "scripts/tests/fixtures/studio/pull-manifest.json",
    ".gitignore", ".github/workflows/ci.yml", "content/asset-taxonomy.json", "art-source/LICENSES.md",
  ]) assert.equal(select([p]), "RUN", p);
});

test("skips unrelated paths", () => {
  assert.equal(select(["docs/x.md", "server-rs/src/main.rs", "atelier/art-forge/a.mjs", "nakama/src/x.ts"]), "SKIP");
});

test("cold cache + unreachable studio: the studio step FAILS loudly (exit 1)", () => {
  const r = gate(testPlan("studio|studio_pull_required"));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /Asset Studio unreachable and the cache is cold/);
  assert.match(r.stdout, /Gate 1 never skips pull-only checks/);
});

test("ATLAS_SKIP_STUDIO=1 in local Gate 1 FAILS the section (exit 1), it never turns into SKIP", () => {
  const r = gate(testPlan("pipeline char|pipeline_char_section"), { ATLAS_SKIP_STUDIO: "1" });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /studio skip not allowed in Gate 1/);
  assert.match(r.stdout, /pipeline char — FAIL/);
  assert.doesNotMatch(r.stdout, /pipeline char — (PASS|SKIP)/);
});

test("ci.yml: the manifest-gate step sets ATLAS_SKIP_STUDIO=1 and prints a visible ::warning:: line", () => {
  const y = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const start = y.indexOf("- name: Asset manifest drift-gate");
  const end = y.indexOf("node scripts/check_asset_manifest.mjs", start);
  assert.ok(start >= 0 && end > start, "manifest-gate step not found");
  const step = y.slice(start, end);
  assert.match(step, /ATLAS_SKIP_STUDIO: "1"/);
  assert.match(step, /echo "::warning[^"]*::[^"]*NOT verified/);
});

test("the section is in the serial plan and exactly one group", () => {
  const r = spawnSync("bash", [join(ROOT, "scripts/precheck.sh"), "--print-plan"], { cwd: ROOT, encoding: "utf8", timeout: 10000 });
  const rows = r.stdout.split("\n").filter((l) => l.includes("pipeline_char_section"));
  assert.equal(rows.filter((l) => l.startsWith("serial\t")).length, 1, r.stdout);
  assert.equal(rows.filter((l) => l.startsWith("godot\t")).length, 1, r.stdout);
});
