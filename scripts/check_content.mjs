#!/usr/bin/env node
// Content gate (F-005): content/characters/*.md ↔ schema ↔ asset keys ↔ manifest.
// Spec: docs/superpowers/specs/2026-07-19-content-pipeline-design.md
// Discipline mirrors scripts/check_asset_manifest.mjs: warns allowed at exit 0,
// any hard failure exits 1, --require-complete escalates coverage warns.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = {
    contentRoot: join(ROOT, "content"),
    keys: join(ROOT, "colyseus-server/generated/asset-keys.json"),
    manifest: join(ROOT, "game-client/assets/manifest.json"),
    requireComplete: false,
  };
  const takeValue = (name, i) => {
    const v = argv[i];
    if (v === undefined) { console.error(`missing value for ${name}`); process.exit(2); }
    return v;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--content-root") opts.contentRoot = resolve(takeValue(a, ++i));
    else if (a === "--keys") opts.keys = resolve(takeValue(a, ++i));
    else if (a === "--manifest") opts.manifest = resolve(takeValue(a, ++i));
    else if (a === "--require-complete") opts.requireComplete = true;
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return opts;
}

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { fail(`${label}: cannot read/parse ${path}: ${e.message}`); return null; }
}

// Frontmatter split: file must start with "---\n"; frontmatter ends at next "\n---\n".
function splitFrontmatter(raw, file) {
  if (!raw.startsWith("---\n")) { fail(`${file}: missing YAML frontmatter block`); return null; }
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) { fail(`${file}: unterminated frontmatter block`); return null; }
  let fm;
  try { fm = yaml.load(raw.slice(4, end)); }
  catch (e) { fail(`${file}: frontmatter YAML parse error: ${e.message}`); return null; }
  return { fm, body: raw.slice(end + 5) };
}

function sectionText(body, heading) {
  const re = new RegExp(`^## ${heading}\\s*$`, "m");
  const m = re.exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

// F-012: the story graph is 7 per-kind files (one global id-space, kind-prefixed
// ids) instead of the old single story.json. STORY_KINDS / STORY_FILES / STORY_SCHEMAS
// are the interface Tasks 2-4 (coherence gate) and gen_story_graph.mjs build on.
const STORY_KINDS = ["region", "faction", "character", "arc", "quest", "event", "dialogue"];
const STORY_FILES = {
  region: "regions.json",
  faction: "factions.json",
  character: "characters.json",
  arc: "arcs.json",
  quest: "quests.json",
  event: "events.json",
  dialogue: "dialogue.json",
};
// story-character.schema.json (not character.schema.json) — that name is already
// taken by the F-005 markdown character-SHEET schema (content/characters/*.md),
// a different document. See content/schemas/story-character.schema.json header.
const STORY_SCHEMAS = {
  region: "region.schema.json",
  faction: "faction.schema.json",
  character: "story-character.schema.json",
  arc: "arc.schema.json",
  quest: "quest.schema.json",
  event: "event.schema.json",
  dialogue: "dialogue.schema.json",
};

const AjvClass = Ajv.default ?? Ajv;

// Compile a schema file to an Ajv validator, or null if it can't be read.
function compileSchema(path, label) {
  const schema = readJson(path, label);
  if (!schema) return null;
  return new AjvClass({ allErrors: true }).compile(schema);
}

// List *.md content files in a dir, ignoring _-prefixed (templates/fixtures).
function listContentFiles(dir, label) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort();
  } catch (e) { fail(`${label} dir unreadable: ${dir}: ${e.message}`); return []; }
}

function main() {
  const opts = parseArgs(process.argv);
  const story = checkStory(opts);
  const sheetCount = checkCharacters(opts, story.ids);
  const mapCount = checkMaps(opts);
  return finish(sheetCount, mapCount, story.count);
}

// F-012: read all 7 per-kind story files under `${contentRoot}/story/` (each a
// flat JSON array of same-kind nodes) into one global id→node map, validating
// each node against its kind's schema on the way in. Plain JSON reads only —
// no TS/@atlas import, same discipline as asset-keys.json.
//
// A kind whose file is missing on disk contributes an empty array for that
// kind — not a failure (a content root can legitimately not have events yet).
// A file that IS present but unparsable JSON, not a JSON array, or containing
// a schema-invalid node is a hard FAIL. A duplicate id across ANY two files
// (even two different kinds) is a hard FAIL — the id-space is global, and
// kind-prefixed ids (region- faction- char- arc- quest- event- dlg-) make a
// collision a clear authoring bug rather than an intentional kind switch.
//
// Interface consumed by Tasks 2-4 (coherence gate) and gen_story_graph.mjs.
function loadStory(contentRoot) {
  const nodes = new Map(); // id -> node, union across all 7 files
  const byKind = new Map(); // kind -> node[]
  const sourceFile = new Map(); // id -> filename, for duplicate-id messages
  let anyFilePresent = false;

  for (const kind of STORY_KINDS) {
    const file = STORY_FILES[kind];
    byKind.set(kind, []);

    let raw;
    try { raw = readFileSync(join(contentRoot, "story", file), "utf8"); }
    catch { continue; } // this kind's file is absent → empty, not a failure
    anyFilePresent = true;

    let arr;
    try { arr = JSON.parse(raw); }
    catch (e) { fail(`story/${file}: cannot parse: ${e.message}`); continue; }
    if (!Array.isArray(arr)) {
      fail(`story/${file}: expected a JSON array of ${kind} nodes, got ${typeof arr}`);
      continue;
    }

    const validate = compileSchema(join(contentRoot, "schemas", STORY_SCHEMAS[kind]), `${kind} schema`);
    if (!validate) continue;

    const kindNodes = [];
    for (const entry of arr) {
      const label = `story/${file}#${entry?.id ?? "?"}`;
      if (!validate(entry)) {
        for (const err of validate.errors)
          fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
        continue; // downstream checks assume a valid shape
      }
      if (nodes.has(entry.id)) {
        fail(`${label}: duplicate story id "${entry.id}" (already defined in story/${sourceFile.get(entry.id)})`);
        continue;
      }
      nodes.set(entry.id, entry);
      sourceFile.set(entry.id, file);
      kindNodes.push(entry);
    }
    byKind.set(kind, kindNodes);
  }

  return { nodes, byKind, anyFilePresent };
}

// F-012 Task 2: whole-graph cross-reference resolution. `story` is the
// {nodes, byKind} shape returned by loadStory(); `assetKeyIds` is the Set of
// ids from asset-keys.json. Every edge below FAILs on a dangling/wrong-kind
// target, except the two `mob:*` pseudo-refs (quest.objectives[].targetId,
// faction.mobFamily[]) which stay WARN until I-019's mob-types.json can
// hard-check them (mirrors the map mobType check's discipline).
//
// Target-KIND matters, not just id existence — e.g. quest.giver must resolve
// to a *character* node, not merely to any existing id — with the single
// exception of event.involves[], which may point at a node of any kind.
// In practice most edges are prefix-locked by their target schema's `id`
// pattern (only faction.schema.json mints `faction-*` ids, etc.), so a
// wrong-kind hit is mostly reachable only on the two kind-agnostic-pattern
// fields (event.involves, dialogue.context); the check still runs uniformly
// for every edge as defense in depth.
function resolveStoryRefs(story, assetKeyIds, fail, warn) {
  const { nodes, byKind } = story;

  // Resolve `id` (a single-value edge field) against `expectedKinds`. Absent
  // (undefined) values are skipped — the field is optional at that node.
  const resolve = (label, field, id, expectedKinds) => {
    if (id === undefined) return;
    const target = nodes.get(id);
    if (!target) {
      fail(`${label}: ${field} "${id}" does not resolve to any story node`);
      return;
    }
    if (!expectedKinds.includes(target.kind))
      fail(`${label}: ${field} "${id}" resolves to a ${target.kind} node, not ${expectedKinds.join("|")}`);
  };

  for (const q of byKind.get("quest")) {
    const label = `story/${STORY_FILES.quest}#${q.id}`;
    resolve(label, "giver", q.giver, ["character"]);
    resolve(label, "arcId", q.arcId, ["arc"]);
    resolve(label, "prereq", q.prereq, ["quest"]);
    for (const obj of q.objectives) {
      if (obj.targetId.startsWith("mob:") && !assetKeyIds.has(obj.targetId))
        warn(`${label}: objectives targetId "${obj.targetId}" not in asset-keys.json`);
    }
  }

  for (const a of byKind.get("arc")) {
    const label = `story/${STORY_FILES.arc}#${a.id}`;
    for (const qid of a.questIds) resolve(label, "questIds", qid, ["quest"]);
  }

  for (const c of byKind.get("character")) {
    const label = `story/${STORY_FILES.character}#${c.id}`;
    resolve(label, "faction", c.faction, ["faction"]);
    resolve(label, "region", c.region, ["region"]);
    if (c.assetKey !== undefined && !assetKeyIds.has(c.assetKey))
      fail(`${label}: assetKey "${c.assetKey}" not in asset-keys.json`);
  }

  for (const e of byKind.get("event")) {
    const label = `story/${STORY_FILES.event}#${e.id}`;
    for (const iid of e.involves) {
      if (!nodes.has(iid)) fail(`${label}: involves "${iid}" does not resolve to any story node`);
    }
    resolve(label, "triggeredBy", e.triggeredBy, ["quest"]);
  }

  for (const d of byKind.get("dialogue")) {
    const label = `story/${STORY_FILES.dialogue}#${d.id}`;
    resolve(label, "speaker", d.speaker, ["character"]);
    resolve(label, "context", d.context, ["quest", "event"]);
  }

  for (const f of byKind.get("faction")) {
    const label = `story/${STORY_FILES.faction}#${f.id}`;
    for (const rel of f.relationships ?? [])
      resolve(label, "relationships.factionId", rel.factionId, ["faction"]);
  }
}

// Story-graph checks preserved from the pre-F-012 single-file gate, re-run
// against the per-kind union: faction mobFamily → real asset key (WARN — this
// stays a WARN, matching the map mobType check, until I-019's mob-types.json
// lands and can hard-check it; see epic-story-pipeline-design.md §2 notes),
// resolveStoryRefs() for the whole-graph edge set (Task 2), and (in
// checkCharacters) character sheets' links.story → a real story node id
// (FAIL, unchanged).
//
// A content root with none of the 7 story files present at all is a soft skip
// (ids=null): the character→story check simply can't run, mirroring how a
// missing bible.md downgrades region checks. Once at least one story file
// exists, ids is a real (possibly empty) Set and the check runs for real.
function checkStory(opts) {
  const { nodes, byKind, anyFilePresent } = loadStory(opts.contentRoot);

  const keysDoc = readJson(opts.keys, "asset-keys");
  const assetKeyIds = new Set((keysDoc?.keys ?? []).map((k) => k.id));
  for (const entry of byKind.get("faction")) {
    for (const mk of entry.mobFamily) {
      if (!assetKeyIds.has(mk))
        warn(`story/${STORY_FILES.faction}#${entry.id}: mobFamily key "${mk}" not in asset-keys.json`);
    }
  }

  resolveStoryRefs({ nodes, byKind }, assetKeyIds, fail, warn);

  return { count: nodes.size, ids: anyFilePresent ? new Set(nodes.keys()) : null };
}

function checkCharacters(opts, storyIds = null) {
  const keysDoc = readJson(opts.keys, "asset-keys");
  const manifestDoc = readJson(opts.manifest, "manifest");
  const validate = compileSchema(join(opts.contentRoot, "schemas/character.schema.json"), "character schema");
  if (!keysDoc || !manifestDoc || !validate) return 0;

  const keyKinds = new Map(keysDoc.keys.map((k) => [k.id, k.kind]));
  const entries = manifestDoc.entries ?? {};

  const dir = join(opts.contentRoot, "characters");
  const files = listContentFiles(dir, "characters");

  const sheetedKeys = new Set();
  for (const file of files) {
    const label = `characters/${file}`;
    const raw = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
    const parsed = splitFrontmatter(raw, label);
    if (!parsed) continue;
    const { fm, body } = parsed;

    // (1) schema
    if (!validate(fm)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream checks assume a valid shape
    }
    // id = filename slug
    if (fm.id !== basename(file, ".md"))
      fail(`${label}: id "${fm.id}" != filename slug "${basename(file, ".md")}"`);

    // (2) forward link-check
    const kind = keyKinds.get(fm.assetKey);
    if (kind === undefined) fail(`${label}: assetKey "${fm.assetKey}" not in asset-keys.json`);
    else if (kind !== "character") fail(`${label}: assetKey "${fm.assetKey}" is kind "${kind}", not character`);
    else {
      if (sheetedKeys.has(fm.assetKey)) fail(`${label}: duplicate sheet for assetKey "${fm.assetKey}"`);
      sheetedKeys.add(fm.assetKey);
      if (fm.status === "forged" || fm.status === "shipped") {
        const entry = entries[fm.assetKey];
        if (!entry) fail(`${label}: status ${fm.status} but "${fm.assetKey}" missing from manifest`);
        else if (entry.tier !== fm.tier)
          fail(`${label}: tier "${fm.tier}" != manifest tier "${entry.tier}" for "${fm.assetKey}"`);
      }
    }

    // (4b) character → story integrity: every links.story id must resolve to a
    // real node id in the union of the 7 story/*.json files (F-012). Skipped
    // only when none of those files exist (storyIds === null); when at least
    // one is present, a dangling ref is a hard FAIL.
    if (storyIds && Array.isArray(fm.links?.story)) {
      for (const sid of fm.links.story) {
        if (!storyIds.has(sid))
          fail(`${label}: links.story "${sid}" does not resolve to a story node id`);
      }
    }

    // (4) structure
    const lore = sectionText(body, "Lore");
    const brief = sectionText(body, "Visual Brief");
    if (lore === null) warn(`${label}: missing "## Lore" heading`);
    if (brief === null) warn(`${label}: missing "## Visual Brief" heading`);
    else if (fm.status === "concept" && brief === "")
      warn(`${label}: empty Visual Brief on a concept sheet — cannot be forged`);
  }

  // (3) reverse link-check / coverage
  for (const [id, kind] of keyKinds) {
    if (kind !== "character" || sheetedKeys.has(id)) continue;
    const msg = `coverage: character key "${id}" has no sheet`;
    opts.requireComplete ? fail(msg) : warn(msg);
  }

  return files.length;
}

// Parse `(region-xxx)` heading anchors out of the world bible for coverage.
function bibleRegionIds(contentRoot) {
  const path = join(contentRoot, "story/bible.md");
  const ids = new Set();
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch { return ids; } // no bible → every region link is an unverified WARN
  for (const m of raw.matchAll(/\((region-[a-z0-9]+(?:-[a-z0-9]+)*)\)/g)) ids.add(m[1]);
  return ids;
}

function checkMaps(opts) {
  // Maps are OPTIONAL content — a content root without a maps/ dir is valid
  // (mirrors the story.json soft-skip). Skip BEFORE touching map.schema.json,
  // since a root with no maps/ also has no map schema and readJson would else
  // record a spurious "schema unreadable" failure.
  const dir = join(opts.contentRoot, "maps");
  if (!existsSync(dir)) return 0;

  const validate = compileSchema(join(opts.contentRoot, "schemas/map.schema.json"), "map schema");
  if (!validate) return 0;

  const bibleRegions = bibleRegionIds(opts.contentRoot);
  const files = listContentFiles(dir, "maps");

  for (const file of files) {
    const label = `maps/${file}`;
    const raw = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
    const parsed = splitFrontmatter(raw, label);
    if (!parsed) continue;
    const { fm } = parsed;

    // (1) schema — a violation invalidates every downstream shape assumption.
    if (!validate(fm)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue;
    }
    // id = filename slug
    if (fm.id !== basename(file, ".md"))
      fail(`${label}: id "${fm.id}" != filename slug "${basename(file, ".md")}"`);

    // (2) regions: unique ids, bounds inside world dims
    const regionIds = new Set();
    for (const r of fm.regions) {
      if (regionIds.has(r.id)) fail(`${label}: duplicate region id "${r.id}"`);
      regionIds.add(r.id);
      const b = r.bounds;
      if (b.x < 0 || b.y < 0 || b.x + b.width > fm.world.width || b.y + b.height > fm.world.height)
        fail(`${label}: region "${r.id}" bounds ${b.x},${b.y} ${b.width}x${b.height} exceed world ${fm.world.width}x${fm.world.height}`);
    }

    // (3) regionId cross-refs must resolve to a declared region in this file
    for (const area of fm.mobSpawnAreas ?? []) {
      if (area.regionId !== undefined && !regionIds.has(area.regionId))
        fail(`${label}: mobSpawnArea "${area.id}" regionId "${area.regionId}" is not a declared region`);
    }
    for (const hz of fm.zoneHazards ?? []) {
      if (hz.regionId !== undefined && !regionIds.has(hz.regionId))
        fail(`${label}: zoneHazard ${hz.type}@${hz.x},${hz.y} regionId "${hz.regionId}" is not a declared region`);
    }

    // (3b) geometry must lie within the world — negative or out-of-world
    // positions are unambiguous authoring bugs (a spawn/hazard the runtime
    // could never place). Region bounds are checked above; this covers the
    // point/rect placements the region check doesn't.
    const w = fm.world;
    const inWorld = (x, y) => x >= 0 && y >= 0 && x <= w.width && y <= w.height;
    if (!inWorld(fm.playerSpawn.x, fm.playerSpawn.y))
      fail(`${label}: playerSpawn ${fm.playerSpawn.x},${fm.playerSpawn.y} is outside world ${w.width}x${w.height}`);
    for (const area of fm.mobSpawnAreas ?? []) {
      if (area.x < 0 || area.y < 0 || area.x + area.width > w.width || area.y + area.height > w.height)
        fail(`${label}: mobSpawnArea "${area.id}" ${area.x},${area.y} ${area.width}x${area.height} exceeds world ${w.width}x${w.height}`);
    }
    for (const hz of fm.zoneHazards ?? []) {
      if (!inWorld(hz.x, hz.y))
        fail(`${label}: zoneHazard ${hz.type}@${hz.x},${hz.y} is outside world ${w.width}x${w.height}`);
    }

    // (4) mobType cross-check — WARN only. This repo-root ESM gate cannot import
    // the server TS mob ids, and hardcoding them here would silently drift.
    // A generated content/schemas/mob-types.json (registry-binding follow-up,
    // emitted from colyseus-server mob definitions) would upgrade this to FAIL.
    for (const area of fm.mobSpawnAreas ?? [])
      warn(`${label}: mobType "${area.mobType}" (area "${area.id}") unverified — no generated mob-types.json to check against`);

    // (5) bible coverage — region-looking links/ids should anchor to a bible
    //     `(region-xxx)` heading. Coverage only: WARN, never FAIL.
    const regionRefs = new Set([...(fm.links ?? []), ...fm.regions.map((r) => r.id)]);
    for (const ref of regionRefs) {
      if (!ref.startsWith("region-")) continue;
      if (!bibleRegions.has(ref)) warn(`${label}: region ref "${ref}" has no (${ref}) heading in bible.md`);
    }
  }

  return files.length;
}

function finish(sheetCount = 0, mapCount = 0, storyCount = 0) {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`content-gate: ${sheetCount} sheets, ${mapCount} maps, ${storyCount} story, ${failures.length} failures, ${warnings.length} warnings`);
  process.exit(failures.length ? 1 : 0);
}

main();
