// Narrative System v2 Task 2: unlockedBy DAG cycle check (assertUnlockDag),
// replaces story-prereq-dag.test.mjs (F-012 Task 4's assertQuestPrereqDag).
// FAIL: any cycle in the unlockedBy graph (quest/event/dialogue nodes),
// naming the cycle members (including a self-unlockedBy, the degenerate
// 1-node cycle). Unlike the old prereq field, `unlockedBy` is an ARRAY
// (out-degree unbounded), so the classic "diamond" (two paths converging)
// as well as multi-target divergence are both exercised below.
// Mirrors the fixture()/runGate() pattern in story-unlocks.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");

const STORY_SCHEMAS = [
  "act.schema.json",
  "region.schema.json",
  "faction.schema.json",
  "story-character.schema.json",
  "arc.schema.json",
  "quest.schema.json",
  "event.schema.json",
  "dialogue.schema.json",
  "lore.schema.json",
  "character.schema.json", // checkCharacters() also runs; needed even with no sheets
];

// Empty on purpose: the F-005 character-SHEET coverage check (unrelated to
// this task) would otherwise emit its own WARN/FAIL noise for every key
// here, since none of these fixtures ever author a content/characters/*.md
// sheet — that would cross-contaminate the WARN/FAIL counts these tests
// assert on.
const KEYS = { version: 1, keys: [] };
const MANIFEST = { version: 2, entries: {} };

// "aggressive" because every fixture QUEST's objective targets "mob:aggressive".
const MOB_TYPES_FIXTURE = { version: 1, mobTypes: ["aggressive"] };

function fixture({
  acts = [], regions = [], factions = [], characters = [], arcs = [], quests = [],
  events = [], dialogue = [], lore = [], keys = KEYS, manifest = MANIFEST,
  mobTypes = MOB_TYPES_FIXTURE,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "story-unlock-dag-"));
  mkdirSync(join(dir, "content/story"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  mkdirSync(join(dir, "content/characters"), { recursive: true }); // empty is fine, avoids "dir unreadable"
  for (const schema of STORY_SCHEMAS)
    cpSync(join(ROOT, "content/schemas", schema), join(dir, "content/schemas", schema));

  const files = { acts, regions, factions, characters, arcs, quests, events, dialogue, lore };
  for (const [name, arr] of Object.entries(files))
    writeFileSync(join(dir, `content/story/${name}.json`), JSON.stringify(arr));

  writeFileSync(join(dir, "keys.json"), JSON.stringify(keys));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  if (mobTypes !== null)
    writeFileSync(join(dir, "mob-types.json"), JSON.stringify(mobTypes));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      "--mob-types", join(dir, "mob-types.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o));

const q = (id, extra = {}) => ({
  id, kind: "quest", title: id, summary: "s", links: [],
  narrative: { description: "d", offerText: "o", completeText: "c" },
  giver: "char-g", arcId: "arc-a",
  objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }],
  ...extra,
});
const CHAR_G = { id: "char-g", kind: "character", title: "G", summary: "s", links: [], role: "npc" };
const ACT_1 = { id: "act-1", kind: "act", title: "Act One", summary: "s", links: [], order: 1, theme: "foothold" };
const ARC_A = (questIds) => ({ id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], actId: "act-1", questIds });

const QUEST = q("quest-x");
const EVENT = { id: "event-e", kind: "event", title: "E", summary: "s", links: [], timelineOrder: 1, involves: ["char-g"] };
const BASE = { acts: [ACT_1], characters: [CHAR_G], arcs: [ARC_A(["quest-x"])], quests: [QUEST] };

// --- Step 1: the brief's verbatim failing tests ------------------------------

test("red: unlockedBy cycle FAILs naming the cycle", () => {
  const files = clone(BASE);
  files.quests = [
    { ...clone(QUEST), id: "quest-a", unlockedBy: ["quest-b"] },
    { ...clone(QUEST), id: "quest-b", unlockedBy: ["quest-a"] },
  ];
  files.arcs[0].questIds = ["quest-a", "quest-b"];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /unlockedBy cycle: quest-[ab] -> quest-[ba] -> quest-[ab]/);
});

test("red: cross-kind cycle quest->event->quest FAILs", () => {
  const files = clone(BASE);
  files.events = [{ ...clone(EVENT), unlockedBy: ["quest-x"] }];
  files.quests[0].unlockedBy = ["event-e"];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /unlockedBy cycle/);
});

// --- ported: self-cycle, 3-node, valid chain, convergence, chain-into-cycle,
// dangling (from story-prereq-dag.test.mjs, F-012 Task 4) --------------------

test("a self-unlockedBy (1-node cycle) is a hard fail", () => {
  const dir = fixture({
    acts: [ACT_1],
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1"])],
    quests: [q("quest-1", { unlockedBy: ["quest-1"] })],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /unlockedBy cycle.*quest-1/i);
});

test("a 3-node cycle is a hard fail naming all members", () => {
  const dir = fixture({
    acts: [ACT_1],
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1", "quest-2", "quest-3"])],
    quests: [
      q("quest-1", { unlockedBy: ["quest-2"] }),
      q("quest-2", { unlockedBy: ["quest-3"] }),
      q("quest-3", { unlockedBy: ["quest-1"] }),
    ],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /unlockedBy cycle/i);
  assert.match(r.out, /quest-1/);
  assert.match(r.out, /quest-2/);
  assert.match(r.out, /quest-3/);
});

test("a valid no-cycle unlockedBy chain passes the DAG check", () => {
  // quest-3 -> quest-2 -> quest-1 -> null: a straight chain, no cycle.
  const dir = fixture({
    acts: [ACT_1],
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1", "quest-2", "quest-3"])],
    quests: [
      q("quest-1"),
      q("quest-2", { unlockedBy: ["quest-1"] }),
      q("quest-3", { unlockedBy: ["quest-2"] }),
    ],
  });
  const r = runGate(dir);
  // exit 0: no cycle FAIL, no orphan/unreachable WARN either — every quest
  // in this fixture is referenced by the arc and reachable from quest-1.
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.doesNotMatch(r.out, /cycle/i);
});

test("two quests converging on the same unlockedBy target (in-degree 2) passes — not a cycle", () => {
  const dir = fixture({
    acts: [ACT_1],
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1", "quest-2", "quest-3"])],
    quests: [
      q("quest-1"),
      q("quest-2", { unlockedBy: ["quest-1"] }),
      q("quest-3", { unlockedBy: ["quest-1"] }),
    ],
  });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.doesNotMatch(r.out, /cycle/i);
});

test("a chain leading into a cycle (a -> b -> c -> b) names only the cycle members", () => {
  // quest-a.unlockedBy = [quest-b], quest-b.unlockedBy = [quest-c],
  // quest-c.unlockedBy = [quest-b]: a chain that leads INTO a 2-node cycle
  // (b <-> c). The cycle must NOT include quest-a in its FAIL message — only
  // b and c should appear in the cycle line.
  const dir = fixture({
    acts: [ACT_1],
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-a", "quest-b", "quest-c"])],
    quests: [
      q("quest-a", { unlockedBy: ["quest-b"] }),
      q("quest-b", { unlockedBy: ["quest-c"] }),
      q("quest-c", { unlockedBy: ["quest-b"] }),
    ],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /unlockedBy cycle/i);
  assert.match(r.out, /quest-b/);
  assert.match(r.out, /quest-c/);
  // Extract the cycle line and verify it does NOT contain quest-a
  const cycleLine = r.out.split("\n").find(line => /unlockedBy cycle/i.test(line));
  assert(cycleLine, "cycle line should exist in output");
  assert(!cycleLine.includes("quest-a"), `cycle line should not include quest-a: ${cycleLine}`);
});

test("a dangling unlockedBy does not crash the DAG check (already FAILs via resolveStoryRefs)", () => {
  const dir = fixture({
    acts: [ACT_1],
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1"])],
    quests: [q("quest-1", { unlockedBy: ["quest-ghost"] })],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /unlockedBy.*"quest-ghost".*does not resolve/i);
  // the dangling ref is a resolveStoryRefs FAIL, not a cycle FAIL — the DAG
  // check must not throw or misreport it as a cycle.
  assert.doesNotMatch(r.out, /cycle/i);
});
