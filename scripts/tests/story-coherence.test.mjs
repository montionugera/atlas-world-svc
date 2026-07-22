// F-012 Task 3: story coherence rules (checkStoryCoherence), wired into
// checkStory() after resolveStoryRefs() inside scripts/check_content.mjs.
// FAIL: quest with 0 objectives / missing giver / missing arcId; arc with 0
// questIds; duplicate event.timelineOrder. (Narrative System v2: duplicate
// arc.act is no longer a FAIL — multiple arcs may share one act; act order
// uniqueness/contiguity is covered by story-acts.test.mjs instead.)
// WARN (escalated by --require-complete): orphan character, orphan faction,
// unreachable quest. WARN (never escalated): event.triggeredBy quest whose
// act order is later than the event's timelineOrder.
// Mirrors the fixture()/runGate() pattern in story-refs.test.mjs.
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
  "character.schema.json", // checkCharacters() also runs; needed even with no sheets
];

// Empty on purpose: the F-005 character-SHEET coverage check (unrelated to
// story coherence) would otherwise emit its own WARN/FAIL noise for every key
// here, since none of these fixtures ever author a content/characters/*.md
// sheet — that would cross-contaminate the WARN/FAIL counts these tests
// assert on.
const KEYS = { version: 1, keys: [] };
const MANIFEST = { version: 2, entries: {} };

function fixture({
  acts = [], regions = [], factions = [], characters = [], arcs = [], quests = [],
  events = [], dialogue = [], keys = KEYS, manifest = MANIFEST,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "story-coherence-"));
  mkdirSync(join(dir, "content/story"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  mkdirSync(join(dir, "content/characters"), { recursive: true }); // empty is fine, avoids "dir unreadable"
  for (const schema of STORY_SCHEMAS)
    cpSync(join(ROOT, "content/schemas", schema), join(dir, "content/schemas", schema));

  const files = { acts, regions, factions, characters, arcs, quests, events, dialogue };
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

const REGION = { id: "region-town", kind: "region", title: "Town", summary: "s", links: [], dangerTier: "safe" };
const FACTION_A = { id: "faction-a", kind: "faction", title: "A", summary: "s", links: [], disposition: "friendly", mobFamily: [], relationships: [] };
// No region/assetKey: keeps fixtures that only need a valid quest.giver from
// having to also carry a regions:[REGION] / keys entry along for the ride.
const CHARACTER = { id: "char-npc", kind: "character", title: "NPC", summary: "s", links: [], role: "npc", faction: "faction-a" };
const ACT_1 = { id: "act-1", kind: "act", title: "Act One", summary: "s", links: [], order: 1, theme: "foothold" };
const ACT_2 = { id: "act-2", kind: "act", title: "Act Two", summary: "s", links: [], order: 2, theme: "silence" };
const ARC = { id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], actId: "act-1", questIds: ["quest-x"] };
const QUEST = {
  id: "quest-x", kind: "quest", title: "X", summary: "s", links: [],
  narrative: { description: "d", offerText: "o", completeText: "c" },
  giver: "char-npc", arcId: "arc-a",
  objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }],
};

// --- Step 1: the brief's verbatim failing tests -----------------------------

test("an arc with no quests is a hard fail", () => {
  const dir = fixture({ acts:[ACT_1], arcs:[{id:"arc-empty",kind:"arc",title:"E",summary:"s",links:[],actId:"act-1",questIds:[]}] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /arc-empty.*no quest/i);
});
test("an orphan character is a warning, not a fail", () => {
  const dir = fixture({ characters:[{id:"char-lonely",kind:"character",title:"L",summary:"s",links:[],role:"npc"}] });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*char-lonely/);
});

// --- green: a fully coherent graph is clean ---------------------------------

test("a fully coherent graph has no coherence FAILs or WARNs", () => {
  const dir = fixture({
    acts: [ACT_1], regions: [REGION], factions: [FACTION_A], characters: [CHARACTER],
    arcs: [ARC], quests: [QUEST],
  });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
  // Only the pre-existing (Task 2) mob:* pseudo-ref WARN is expected here —
  // none of THIS task's coherence WARNs (orphan/unreachable/duplicate/etc).
  assert.doesNotMatch(r.out, /orphan|unreachable|duplicate|triggeredBy/i);
});

// --- red: completeness FAILs, one per rule ----------------------------------

test("a quest with 0 objectives is a hard fail", () => {
  const quest = { ...QUEST, objectives: [] };
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*0 objectives/);
});

test("a quest missing giver is a hard fail", () => {
  const quest = { ...QUEST, arcId: "arc-a", objectives: QUEST.objectives };
  delete quest.giver;
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*missing giver/);
});

test("a quest missing arcId is a hard fail", () => {
  const quest = { ...QUEST };
  delete quest.arcId;
  const dir = fixture({ characters: [CHARACTER], factions: [FACTION_A], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*missing arcId/);
});

// Narrative System v2: multiple arcs sharing one act is now legal (parallel
// storylines) — the old duplicate-arc.act FAIL is removed. Act order
// uniqueness/contiguity coverage moved to scripts/tests/story-acts.test.mjs.

test("duplicate event.timelineOrder is a hard fail", () => {
  const eventA = { id: "event-a", kind: "event", title: "A", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc"] };
  const eventB = { id: "event-b", kind: "event", title: "B", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc"] };
  const dir = fixture({ characters: [CHARACTER], factions: [FACTION_A], events: [eventA, eventB] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /duplicate.*timelineOrder.*1/i);
});

// --- warn (not fail): orphan faction, unreachable quest ---------------------

test("a faction referenced by nothing is a warning, not a fail", () => {
  const dir = fixture({ factions: [FACTION_A] });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*faction-a/);
});

test("a quest unreachable from a no-prereq start emits an unreachable warning (alongside the F-012 Task 4 cycle fail, since this fixture is also a cycle)", () => {
  // quest-mid.prereq -> quest-y, quest-y.prereq -> quest-mid: a 2-cycle, no
  // start reachable from either (both refs resolve fine, so resolveStoryRefs
  // stays clean). F-012 Task 4: a prereq cycle is ALSO now a hard FAIL
  // (assertQuestPrereqDag) — the two checks are independent and both fire on
  // this same fixture, so this is no longer a WARN-only (exit 0) case. The
  // unreachable WARN still fires alongside the cycle FAIL (Task 4 does not
  // suppress it) — asserting both here documents that interplay.
  const arcB = { ...ARC, id: "arc-b", questIds: ["quest-mid", "quest-y"] };
  const questMid = { ...QUEST, id: "quest-mid", arcId: "arc-b", prereq: "quest-y" };
  const questY = { ...QUEST, id: "quest-y", arcId: "arc-b", prereq: "quest-mid" };
  const dir = fixture({
    acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A],
    arcs: [arcB], quests: [questMid, questY],
  });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*cycle/i);
  assert.match(r.out, /WARN.*unreachable/i);
});

test("event.triggeredBy quest whose act order is later than the event's timelineOrder is a warning", () => {
  const lateArc = { ...ARC, id: "arc-late", actId: "act-2", questIds: ["quest-x"] };
  const quest = { ...QUEST, arcId: "arc-late" };
  const event = { id: "event-early", kind: "event", title: "E", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc"], triggeredBy: "quest-x" };
  const dir = fixture({
    acts: [ACT_1, ACT_2], characters: [CHARACTER], factions: [FACTION_A],
    arcs: [lateArc], quests: [quest], events: [event],
  });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*event-early.*triggeredBy.*quest-x.*act/i);
});

// --- --require-complete escalates orphan/reachability WARNs -----------------

test("--require-complete escalates orphan character to a fail", () => {
  const dir = fixture({ characters:[{id:"char-lonely",kind:"character",title:"L",summary:"s",links:[],role:"npc"}] });
  const r = runGate(dir, ["--require-complete"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*char-lonely/);
});

test("--require-complete escalates orphan faction to a fail", () => {
  const dir = fixture({ factions: [FACTION_A] });
  const r = runGate(dir, ["--require-complete"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*faction-a/);
});

test("--require-complete escalates unreachable quest to a fail", () => {
  const arcB = { ...ARC, id: "arc-b", questIds: ["quest-mid", "quest-y"] };
  const questMid = { ...QUEST, id: "quest-mid", arcId: "arc-b", prereq: "quest-y" };
  const questY = { ...QUEST, id: "quest-y", arcId: "arc-b", prereq: "quest-mid" };
  const dir = fixture({
    acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A],
    arcs: [arcB], quests: [questMid, questY],
  });
  const r = runGate(dir, ["--require-complete"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*unreachable/i);
});

test("--require-complete does NOT escalate the triggeredBy act-order warning", () => {
  const lateArc = { ...ARC, id: "arc-late", actId: "act-2", questIds: ["quest-x"] };
  const quest = { ...QUEST, arcId: "arc-late" };
  const event = { id: "event-early", kind: "event", title: "E", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc"], triggeredBy: "quest-x" };
  const dir = fixture({
    acts: [ACT_1, ACT_2], characters: [CHARACTER], factions: [FACTION_A],
    arcs: [lateArc], quests: [quest], events: [event],
  });
  const r = runGate(dir, ["--require-complete"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*event-early.*triggeredBy/i);
});
