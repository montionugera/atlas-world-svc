// Narrative System v2 Task 1: act-* kind + arc.actId. Same synthetic-root
// pattern as story-refs.test.mjs.
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
  const dir = mkdtempSync(join(tmpdir(), "story-acts-"));
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

const ACT1 = { id: "act-1", kind: "act", title: "Act One", summary: "s", links: [], order: 1, theme: "foothold" };
const ACT2 = { id: "act-2", kind: "act", title: "Act Two", summary: "s", links: [], order: 2, theme: "silence" };
const REGION = { id: "region-town", kind: "region", title: "T", summary: "s", links: [], dangerTier: "safe" };
const FACTION = { id: "faction-a", kind: "faction", title: "A", summary: "s", links: [], disposition: "friendly", mobFamily: [], relationships: [] };
const CHARACTER = { id: "char-npc", kind: "character", title: "N", summary: "s", links: [], role: "npc", faction: "faction-a", region: "region-town" };
const QUEST = { id: "quest-x", kind: "quest", title: "X", summary: "s", links: [], narrative: { description: "d", offerText: "o", completeText: "c" }, giver: "char-npc", arcId: "arc-a", objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }] };
const ARC = { id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], actId: "act-1", questIds: ["quest-x"] };
const BASE = { acts: [ACT1], regions: [REGION], factions: [FACTION], characters: [CHARACTER], arcs: [ARC], quests: [QUEST] };

test("green: arc.actId resolving to an act node passes", () => {
  const { code, out } = runGate(fixture(clone(BASE)));
  assert.equal(code, 0, out);
});

test("red: dangling arc.actId FAILs", () => {
  const files = clone(BASE);
  files.arcs[0].actId = "act-missing";
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /actId "act-missing" does not resolve/);
});

test("red: non-contiguous act orders FAIL", () => {
  const files = clone(BASE);
  files.acts = [ACT1, { ...clone(ACT2), order: 3 }];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /act orders .* not contiguous/);
});

test("red: duplicate act order FAILs", () => {
  const files = clone(BASE);
  files.acts = [ACT1, { ...clone(ACT2), order: 1 }];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /duplicate order 1/);
});

test("green: two arcs sharing one act is allowed (parallel storylines)", () => {
  const files = clone(BASE);
  files.quests.push({ ...clone(QUEST), id: "quest-y", arcId: "arc-b" });
  files.arcs.push({ ...clone(ARC), id: "arc-b", questIds: ["quest-y"] });
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
});

test("red: old integer arc.act field is schema-rejected", () => {
  const files = clone(BASE);
  delete files.arcs[0].actId;
  files.arcs[0].act = 1;
  const { code } = runGate(fixture(files));
  assert.equal(code, 1);
});
