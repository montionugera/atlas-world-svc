// Narrative System v2 Task 3: character fates (status/diedAt) + lore-*
// fragments. Same synthetic-root pattern as story-unlocks.test.mjs.
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
  events = [], dialogue = [], lore = [], keys = KEYS, manifest = MANIFEST,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "story-fates-lore-"));
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
const REGION = { id: "region-town", kind: "region", title: "T", summary: "s", links: [], dangerTier: "safe", spineId: "n-town" };
const FACTION = { id: "faction-a", kind: "faction", title: "A", summary: "s", links: [], disposition: "friendly", mobFamily: [], relationships: [] };
const CHARACTER = { id: "char-npc", kind: "character", title: "N", summary: "s", links: [], role: "npc", faction: "faction-a", region: "region-town" };
const QUEST = { id: "quest-x", kind: "quest", title: "X", summary: "s", links: [], narrative: { description: "d", offerText: "o", completeText: "c" }, giver: "char-npc", arcId: "arc-a", objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }] };
const ARC = { id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], actId: "act-1", questIds: ["quest-x"] };
const BASE = { acts: [ACT1], regions: [REGION], factions: [FACTION], characters: [CHARACTER], arcs: [ARC], quests: [QUEST] };

const EVENT = { id: "event-e", kind: "event", title: "E", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc"] };

const LORE_A = { id: "lore-oath", kind: "lore", title: "Oath", summary: "s", links: [], body: "Hold, though the hall is empty.", anchor: "faction-a", thread: "the-first-claim" };
const LORE_B = { id: "lore-stone", kind: "lore", title: "Stone", summary: "s", links: [], body: "CLAIMED.", anchor: "region-town", thread: "the-first-claim" };

test("green: dead character with diedAt -> real event passes", () => {
  const files = clone(BASE);
  files.events = [clone(EVENT)];
  files.characters[0] = { ...clone(CHARACTER), status: "dead", diedAt: "event-e" };
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
});

test("red: diedAt with status alive FAILs", () => {
  const files = clone(BASE);
  files.events = [clone(EVENT)];
  files.characters[0] = { ...clone(CHARACTER), diedAt: "event-e" }; // status defaults alive
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /diedAt "event-e" set but status is "alive"/);
});

test("red: dangling diedAt FAILs", () => {
  const files = clone(BASE);
  files.characters[0] = { ...clone(CHARACTER), status: "dead", diedAt: "event-ghost" };
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /diedAt "event-ghost" does not resolve/);
});

test("green: two lore fragments on one thread pass with no thread WARN", () => {
  const files = clone(BASE);
  files.lore = [LORE_A, LORE_B];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /thread/);
});

test("red: dangling lore.anchor FAILs", () => {
  const files = clone(BASE);
  files.lore = [{ ...clone(LORE_A), anchor: "region-ghost" }, clone(LORE_B)];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /anchor "region-ghost" does not resolve/);
});

test("warn: singleton thread WARNs but exits 0", () => {
  const files = clone(BASE);
  files.lore = [clone(LORE_A)];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
  assert.match(out, /WARN .*thread "the-first-claim" has only 1 fragment/);
});
