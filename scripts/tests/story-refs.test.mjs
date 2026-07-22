// F-012 Task 2: whole-graph reference resolution (resolveStoryRefs), wired
// into checkStory() inside scripts/check_content.mjs. Builds synthetic
// content roots under content/story/*.json + content/schemas/*.schema.json
// and runs the real gate binary against them, mirroring the fixture()/
// runGate() pattern in check_content.test.mjs.
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

const KEYS = {
  version: 1,
  keys: [
    { id: "npc", kind: "character" },
    { id: "player", kind: "character" },
    { id: "mob:aggressive", kind: "character" },
  ],
};
const MANIFEST = { version: 2, entries: {} };

function fixture({
  acts = [], regions = [], factions = [], characters = [], arcs = [], quests = [],
  events = [], dialogue = [], keys = KEYS, manifest = MANIFEST,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "story-refs-"));
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

const clone = (o) => JSON.parse(JSON.stringify(o));

const REGION = { id: "region-town", kind: "region", title: "Town", summary: "s", links: [], dangerTier: "safe" };
const FACTION_A = { id: "faction-a", kind: "faction", title: "A", summary: "s", links: [], disposition: "friendly", mobFamily: [], relationships: [] };
const FACTION_B = { id: "faction-b", kind: "faction", title: "B", summary: "s", links: [], disposition: "hostile", mobFamily: [], relationships: [{ factionId: "faction-a", stance: "rival" }] };
const CHARACTER = { id: "char-npc", kind: "character", title: "NPC", summary: "s", links: [], role: "npc", faction: "faction-a", region: "region-town", assetKey: "npc" };
const ACT_1 = { id: "act-1", kind: "act", title: "Act One", summary: "s", links: [], order: 1, theme: "foothold" };
const ARC = { id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], actId: "act-1", questIds: ["quest-x"] };
const QUEST = {
  id: "quest-x", kind: "quest", title: "X", summary: "s", links: [],
  narrative: { description: "d", offerText: "o", completeText: "c" },
  giver: "char-npc", arcId: "arc-a",
  objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }],
};
const EVENT = { id: "event-a", kind: "event", title: "E", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc", "faction-a"] };
const DIALOGUE = { id: "dlg-a", kind: "dialogue", title: "D", summary: "s", links: [], speaker: "char-npc", lines: ["hi"], context: "quest-x" };

// --- Step 1: the brief's verbatim failing test -----------------------------

test("dangling quest.giver is a hard fail", () => {
  const dir = fixture({ quests:[{ id:"quest-x", kind:"quest", title:"X", summary:"s", links:[],
    narrative:{description:"d",offerText:"o",completeText:"c"}, giver:"char-nope",
    arcId:"arc-a", objectives:[{type:"MOB_KILLED",targetId:"mob:aggressive",count:1}] }],
    acts:[ACT_1],
    arcs:[{id:"arc-a",kind:"arc",title:"A",summary:"s",links:[],actId:"act-1",questIds:["quest-x"]}] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*giver.*char-nope/);
});

// --- green: the whole graph resolves clean ---------------------------------

test("fully valid graph resolves clean", () => {
  const dir = fixture({
    acts: [ACT_1], regions: [REGION], factions: [FACTION_A, FACTION_B], characters: [CHARACTER],
    arcs: [ARC], quests: [QUEST], events: [EVENT], dialogue: [DIALOGUE],
  });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
});

test("event.involves may resolve to any node kind, not just character", () => {
  const event = { ...EVENT, involves: ["region-town", "faction-a"] };
  const dir = fixture({ regions: [REGION], factions: [FACTION_A], events: [event] });
  const r = runGate(dir);
  assert.equal(r.code, 0);
});

test("dialogue.context may resolve to a quest or an event", () => {
  const dlgToEvent = { ...DIALOGUE, id: "dlg-b", context: "event-a" };
  const dir = fixture({
    acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], regions: [REGION],
    arcs: [ARC], quests: [QUEST], events: [{ ...EVENT, involves: ["char-npc"] }],
    dialogue: [DIALOGUE, dlgToEvent],
  });
  const r = runGate(dir);
  assert.equal(r.code, 0);
});

// --- red: one per edge kind --------------------------------------------------

test("dangling quest.arcId is a hard fail", () => {
  const quest = { ...QUEST, arcId: "arc-nope" };
  const dir = fixture({ characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*arcId.*arc-nope/);
});

test("dangling quest.prereq is a hard fail", () => {
  const quest = { ...QUEST, prereq: "quest-nope" };
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*prereq.*quest-nope/);
});

test("dangling quest.faction is a hard fail", () => {
  const quest = { ...QUEST, faction: "faction-nope" };
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*faction.*faction-nope/);
});

test("dangling quest.region is a hard fail", () => {
  const quest = { ...QUEST, region: "region-nope" };
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*region.*region-nope/);
});

test("dangling arc.questIds entry is a hard fail", () => {
  const arc = { ...ARC, questIds: ["quest-nope"] };
  const dir = fixture({ acts: [ACT_1], arcs: [arc] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /arc-a.*questIds.*quest-nope/);
});

test("dangling character.faction is a hard fail", () => {
  const character = { ...CHARACTER, faction: "faction-nope" };
  const dir = fixture({ characters: [character], regions: [REGION] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /char-npc.*faction.*faction-nope/);
});

test("dangling character.region is a hard fail", () => {
  const character = { ...CHARACTER, region: "region-nope" };
  const dir = fixture({ characters: [character], factions: [FACTION_A] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /char-npc.*region.*region-nope/);
});

test("dangling event.involves entry is a hard fail", () => {
  const event = { ...EVENT, involves: ["char-nope"] };
  const dir = fixture({ events: [event] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /event-a.*involves.*char-nope/);
});

test("dangling event.triggeredBy is a hard fail", () => {
  const event = { ...EVENT, involves: ["char-npc"], triggeredBy: "quest-nope" };
  const dir = fixture({ characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], events: [event] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /event-a.*triggeredBy.*quest-nope/);
});

test("dangling dialogue.speaker is a hard fail", () => {
  const dlg = { ...DIALOGUE, speaker: "char-nope" };
  delete dlg.context;
  const dir = fixture({ dialogue: [dlg] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /dlg-a.*speaker.*char-nope/);
});

test("dangling dialogue.context is a hard fail", () => {
  const dlg = { ...DIALOGUE, context: "quest-nope" };
  const dir = fixture({ characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], dialogue: [dlg] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /dlg-a.*context.*quest-nope/);
});

test("dialogue.context resolving to a non quest|event kind is a hard fail (wrong kind)", () => {
  const dlg = { ...DIALOGUE, context: "arc-a" };
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], arcs: [ARC], quests: [QUEST], dialogue: [dlg] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /dlg-a.*context.*"arc-a".*resolves to a arc node, not quest\|event/);
});

test("dangling faction.relationships[].factionId is a hard fail", () => {
  const faction = { ...FACTION_B, relationships: [{ factionId: "faction-nope", stance: "rival" }] };
  const dir = fixture({ factions: [faction] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /faction-b.*relationships\.factionId.*faction-nope/);
});

test("character.assetKey not in asset-keys.json is a hard fail", () => {
  const character = { ...CHARACTER, assetKey: "mob:nope" };
  const dir = fixture({ characters: [character], factions: [FACTION_A], regions: [REGION] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /char-npc.*assetKey.*mob:nope/);
});

// --- warn (not fail) for the two mob:* pseudo-refs deferred to I-019 -------

test("quest.objectives[].targetId of form mob:* not in asset-keys.json is a warn, not a fail", () => {
  const quest = { ...QUEST, objectives: [{ type: "MOB_KILLED", targetId: "mob:nope", count: 1 }] };
  const dir = fixture({ acts: [ACT_1], characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*quest-x.*objectives targetId.*mob:nope/);
});

test("faction.mobFamily[] not in asset-keys.json is a warn, not a fail", () => {
  const faction = { ...FACTION_A, mobFamily: ["mob:nope"] };
  const dir = fixture({ factions: [faction] });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*mobFamily key "mob:nope"/);
});
