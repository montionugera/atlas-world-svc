// F-012 Task 4: quest prereq DAG cycle check (assertQuestPrereqDag), wired
// into checkStory() in scripts/check_content.mjs after resolveStoryRefs().
// FAIL: any cycle in the quest.prereq graph, naming the cycle members
// (including a self-prereq, the degenerate 1-node cycle).
// `quest.prereq` is a SINGULAR optional string per quest.schema.json — the
// prereq graph is a functional graph (out-degree <= 1), so the classic
// "diamond" (two paths converging on one prereq) DAG case from the brief's
// quality gate can't arise here: a quest can only ever point at ONE prereq,
// never two. Two quests sharing the SAME prereq (convergence, in-degree > 1)
// is still exercised below and must PASS — that's the closest analogue this
// schema allows to a diamond.
// Mirrors the fixture()/runGate() pattern in story-coherence.test.mjs.
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
  "region.schema.json",
  "faction.schema.json",
  "story-character.schema.json",
  "arc.schema.json",
  "quest.schema.json",
  "event.schema.json",
  "dialogue.schema.json",
  "character.schema.json", // checkCharacters() also runs; needed even with no sheets
];

// Empty on purpose: the F-005 character-SHEET coverage check (unrelated to
// this task) would otherwise emit its own WARN/FAIL noise for every key
// here, since none of these fixtures ever author a content/characters/*.md
// sheet — that would cross-contaminate the WARN/FAIL counts these tests
// assert on.
const KEYS = { version: 1, keys: [] };
const MANIFEST = { version: 2, entries: {} };

function fixture({
  regions = [], factions = [], characters = [], arcs = [], quests = [],
  events = [], dialogue = [], keys = KEYS, manifest = MANIFEST,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "story-prereq-dag-"));
  mkdirSync(join(dir, "content/story"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  mkdirSync(join(dir, "content/characters"), { recursive: true }); // empty is fine, avoids "dir unreadable"
  for (const schema of STORY_SCHEMAS)
    cpSync(join(ROOT, "content/schemas", schema), join(dir, "content/schemas", schema));

  const files = { regions, factions, characters, arcs, quests, events, dialogue };
  for (const [name, arr] of Object.entries(files))
    writeFileSync(join(dir, `content/story/${name}.json`), JSON.stringify(arr));

  writeFileSync(join(dir, "keys.json"), JSON.stringify(keys));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

// --- Step 1: the brief's verbatim failing test ------------------------------

test("a prereq cycle is a hard fail", () => {
  const q = (id, prereq) => ({ id, kind:"quest", title:id, summary:"s", links:[],
    narrative:{description:"d",offerText:"o",completeText:"c"}, giver:"char-g", arcId:"arc-a",
    prereq, objectives:[{type:"MOB_KILLED",targetId:"mob:aggressive",count:1}] });
  const dir = fixture({
    characters:[{id:"char-g",kind:"character",title:"G",summary:"s",links:[],role:"npc"}],
    arcs:[{id:"arc-a",kind:"arc",title:"A",summary:"s",links:[],act:1,questIds:["quest-1","quest-2"]}],
    quests:[ q("quest-1","quest-2"), q("quest-2","quest-1") ] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /cycle.*quest-1.*quest-2|quest-2.*quest-1/i);
});

// --- additional fixtures: self-cycle, valid chain, dangling, convergence ----

const q = (id, extra = {}) => ({
  id, kind: "quest", title: id, summary: "s", links: [],
  narrative: { description: "d", offerText: "o", completeText: "c" },
  giver: "char-g", arcId: "arc-a",
  objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }],
  ...extra,
});
const CHAR_G = { id: "char-g", kind: "character", title: "G", summary: "s", links: [], role: "npc" };
const ARC_A = (questIds) => ({ id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], act: 1, questIds });

test("a self-prereq (1-node cycle) is a hard fail", () => {
  const dir = fixture({
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1"])],
    quests: [q("quest-1", { prereq: "quest-1" })],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /cycle.*quest-1/i);
});

test("a 3-node cycle is a hard fail naming all members", () => {
  const dir = fixture({
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1", "quest-2", "quest-3"])],
    quests: [
      q("quest-1", { prereq: "quest-2" }),
      q("quest-2", { prereq: "quest-3" }),
      q("quest-3", { prereq: "quest-1" }),
    ],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /cycle/i);
  assert.match(r.out, /quest-1/);
  assert.match(r.out, /quest-2/);
  assert.match(r.out, /quest-3/);
});

test("a valid no-cycle prereq chain passes the DAG check", () => {
  // quest-3 -> quest-2 -> quest-1 -> null: a straight chain, no cycle.
  const dir = fixture({
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1", "quest-2", "quest-3"])],
    quests: [
      q("quest-1"),
      q("quest-2", { prereq: "quest-1" }),
      q("quest-3", { prereq: "quest-2" }),
    ],
  });
  const r = runGate(dir);
  // exit 0: no cycle FAIL, no orphan/unreachable WARN either — every quest
  // in this fixture is referenced by the arc and reachable from quest-1.
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.doesNotMatch(r.out, /cycle/i);
});

test("two quests converging on the same prereq (in-degree 2) passes — not a cycle", () => {
  // quest-2.prereq -> quest-1 AND quest-3.prereq -> quest-1: valid, since
  // prereq is a SINGULAR field (out-degree <= 1 always), this is the closest
  // analogue to a "diamond" the schema allows — convergence, not divergence.
  const dir = fixture({
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1", "quest-2", "quest-3"])],
    quests: [
      q("quest-1"),
      q("quest-2", { prereq: "quest-1" }),
      q("quest-3", { prereq: "quest-1" }),
    ],
  });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.doesNotMatch(r.out, /cycle/i);
});

test("a dangling prereq does not crash the DAG check (already FAILs via resolveStoryRefs)", () => {
  const dir = fixture({
    characters: [CHAR_G],
    arcs: [ARC_A(["quest-1"])],
    quests: [q("quest-1", { prereq: "quest-ghost" })],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /prereq.*"quest-ghost".*does not resolve/i);
  // the dangling ref is a resolveStoryRefs FAIL, not a cycle FAIL — the DAG
  // check must not throw or misreport it as a cycle.
  assert.doesNotMatch(r.out, /cycle/i);
});
