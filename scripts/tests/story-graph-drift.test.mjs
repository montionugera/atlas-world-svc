// F-012 Task 5: story-graph drift gate. Proves both directions:
//  - green: `gen_story_graph.mjs --check` exits 0 against the real,
//    committed content/ tree and the committed docs/story/story-graph.md.
//  - red: pointed at a temp CONTENT_ROOT with the real story files copied in
//    and then mutated (a new region node added), `--check` still compares
//    against the SAME committed docs/story/story-graph.md and must exit 1 —
//    proving the gate actually detects drift, not just "the file exists".
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GENERATOR = join(ROOT, "scripts/gen_story_graph.mjs");

function runCheck(env = {}) {
  try {
    const out = execFileSync(process.execPath, [GENERATOR, "--check"], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("--check exits 0 against the real, committed content and story-graph.md", () => {
  const r = runCheck();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /is in sync/);
});

test("generated graph groups arcs and quests into act subgraphs and carries v2 edges", () => {
  const md = readFileSync(join(ROOT, "docs/story/story-graph.md"), "utf8");
  assert.match(md, /subgraph sg_n_act_1\["Act 1 — Small Lives"\]/);
  assert.match(md, /subgraph sg_n_act_2\["Act 2 — The War Comes Home"\]/);
  assert.match(md, /-->\|unlockedBy\|/);
  assert.match(md, /-->\|actId\|/);
  assert.match(md, /-->\|anchor\|/);
  assert.match(md, /-->\|diedAt\|/);
  assert.doesNotMatch(md, /-->\|prereq\|/);
});

test("--check exits 1 when CONTENT_ROOT's story content has drifted from the committed graph", () => {
  const dir = mkdtempSync(join(tmpdir(), "story-graph-drift-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentDir, { recursive: true });
  cpSync(join(ROOT, "content/story"), join(contentDir, "story"), { recursive: true });
  cpSync(join(ROOT, "content/schemas"), join(contentDir, "schemas"), { recursive: true });

  // Mutate: add a new, schema-valid region node the committed graph doesn't
  // know about. loadStory() will load it fine (schema-valid) but it isn't
  // in the committed docs/story/story-graph.md, so the regenerated markdown
  // must differ.
  const regionsPath = join(contentDir, "story/regions.json");
  const regions = JSON.parse(readFileSync(regionsPath, "utf8"));
  regions.push({
    id: "region-drift-test",
    kind: "region",
    title: "Drift Test Region",
    summary: "Only exists to prove the drift gate goes red.",
    dangerTier: "safe",
    links: [],
  });
  writeFileSync(regionsPath, JSON.stringify(regions, null, 2));

  const r = runCheck({ CONTENT_ROOT: contentDir });
  assert.equal(r.code, 1);
  assert.match(r.out, /out of date/);
});
