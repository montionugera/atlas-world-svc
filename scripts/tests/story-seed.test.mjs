// F-012 Task 7: the seed multi-arc epic is the end-to-end proof that the
// whole story-graph pipeline (schema -> refs -> prereq DAG -> coherence ->
// static graph) is fully wired and fully satisfied by real content/story/*.json
// data, not just by scripts/tests/ fixtures. Before this task, the real tree
// has 4 orphan WARNs (2 characters, 2 factions under-referenced) which
// --require-complete escalates to FAILs — this test is written FIRST and is
// expected to fail until the seed epic (Task 7 Step 3) closes every orphan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Run a node script against the real (committed) content tree and report
// {status, output} instead of throwing on non-zero exit, so a FAIL shows the
// gate's own WARN/FAIL lines in the assertion message rather than just "exit 1".
function run(scriptRelPath, args = []) {
  try {
    const output = execFileSync(process.execPath, [join(ROOT, scriptRelPath), ...args], {
      encoding: "utf8",
      cwd: ROOT,
    });
    return { status: 0, output };
  } catch (e) {
    return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("content gate is green on the real tree (no --require-complete)", () => {
  const { status, output } = run("scripts/check_content.mjs");
  assert.equal(status, 0, `expected exit 0, got ${status}:\n${output}`);
  assert.match(output, /0 failures/);
});

test("content gate is green with --require-complete: the seed epic closes every orphan", () => {
  const { status, output } = run("scripts/check_content.mjs", ["--require-complete"]);
  assert.equal(status, 0, `expected exit 0, got ${status}:\n${output}`);
  assert.match(output, /0 failures/);
});

test("docs/story/story-graph.md is in sync with the seed epic (no drift)", () => {
  const { status, output } = run("scripts/gen_story_graph.mjs", ["--check"]);
  assert.equal(status, 0, `expected exit 0, got ${status}:\n${output}`);
});

test("the seed epic exercises every kind and every prereq/edge shape (2 arcs, valid cross-arc chain)", () => {
  const readStory = (f) => JSON.parse(readFileSync(join(ROOT, `content/story/${f}`), "utf8"));
  const arcs = readStory("arcs.json");
  const quests = readStory("quests.json");
  const events = readStory("events.json");
  const dialogue = readStory("dialogue.json");

  assert.equal(arcs.length, 2, "expected 2 arcs total");
  assert.equal(new Set(arcs.map((a) => a.act)).size, arcs.length, "arc.act values must be unique");
  assert.ok(quests.length >= 4, "expected at least 4 quests total");
  assert.ok(events.length >= 2, "expected at least 2 events (events.json was empty before Task 7)");
  assert.ok(dialogue.length >= 2, "expected at least 2 dialogue nodes (dialogue.json was empty before Task 7)");

  // A quest whose arcId belongs to the second (highest-act) arc must have a
  // prereq chain reaching back into the first arc — proves the "valid prereq
  // chain across the 2 arcs" requirement, not just two disconnected arcs.
  const questById = new Map(quests.map((q) => [q.id, q]));
  const arcById = new Map(arcs.map((a) => [a.id, a]));
  const secondArc = [...arcs].sort((a, b) => b.act - a.act)[0];
  const crossArcQuest = quests.find((q) => q.arcId === secondArc.id && q.prereq);
  assert.ok(crossArcQuest, "expected at least one quest in the later arc with a prereq");

  let cur = crossArcQuest;
  let reachedOtherArc = false;
  const seen = new Set();
  while (cur.prereq) {
    assert.ok(!seen.has(cur.id), `prereq cycle at ${cur.id}`);
    seen.add(cur.id);
    cur = questById.get(cur.prereq);
    assert.ok(cur, "prereq must resolve to a real quest");
    if (cur.arcId !== crossArcQuest.arcId) reachedOtherArc = true;
  }
  assert.ok(reachedOtherArc, "expected the later-arc quest's prereq chain to reach into the other arc");

  // event.triggeredBy and dialogue.context together exercise both allowed
  // dialogue.context target kinds (quest and event).
  assert.ok(events.some((e) => e.triggeredBy), "expected at least one event.triggeredBy");
  const contextKinds = new Set(
    dialogue.map((d) => (d.context?.startsWith("event-") ? "event" : d.context?.startsWith("quest-") ? "quest" : undefined))
  );
  assert.ok(contextKinds.has("quest"), "expected a dialogue.context pointing at a quest");
  assert.ok(contextKinds.has("event"), "expected a dialogue.context pointing at an event");
});
