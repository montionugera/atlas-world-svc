#!/usr/bin/env node
// Content gate (F-005): content/characters/*.md ↔ schema ↔ asset keys ↔ manifest.
// Spec: docs/superpowers/specs/2026-07-19-content-pipeline-design.md
// Discipline mirrors scripts/check_asset_manifest.mjs: warns allowed at exit 0,
// any hard failure exits 1, --require-complete escalates coverage warns.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { STORY_FILES, loadStory, readJson, compileSchema } from "./lib/story.mjs";

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

// F-012: loadStory() (reads all 7 per-kind story files under
// `${contentRoot}/story/` into one global id→node map) now lives in
// scripts/lib/story.mjs, shared with gen_story_graph.mjs — see that file for
// the full loader contract (missing-file vs unparsable vs schema-invalid,
// duplicate-id semantics, `rawByKind` vs `byKind`).

// F-012 Task 2: whole-graph cross-reference resolution. `story` is the
// {nodes, byKind} shape returned by loadStory(); `assetKeyIds` is the Set of
// ids from asset-keys.json. Every edge below FAILs on a dangling/wrong-kind
// target, except the `mob:*` pseudo-ref quest.objectives[].targetId, which
// stays WARN until I-019's mob-types.json can hard-check it (mirrors the map
// mobType check's discipline). The sibling `mob:*` pseudo-ref
// faction.mobFamily[] gets the same WARN treatment, but that check lives in
// checkStory(), not here.
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

  // Narrative System v2: unlockedBy — id prefix IS the semantics (quest-* =
  // completed, event-* = fired, act-* = reached). Schema already prefix-locks
  // the pattern; resolution + kind check here is defense in depth.
  const UNLOCK_KINDS = { quest: ["quest"], event: ["event"], act: ["act"] };
  const resolveUnlocks = (label, node) => {
    for (const uid of node.unlockedBy ?? [])
      resolve(label, "unlockedBy", uid, UNLOCK_KINDS[uid.split("-")[0]] ?? ["quest", "event", "act"]);
  };

  for (const q of byKind.get("quest")) {
    const label = `story/${STORY_FILES.quest}#${q.id}`;
    resolve(label, "giver", q.giver, ["character"]);
    resolve(label, "arcId", q.arcId, ["arc"]);
    resolveUnlocks(label, q);
    resolve(label, "faction", q.faction, ["faction"]);
    resolve(label, "region", q.region, ["region"]);
    for (const obj of q.objectives) {
      if (obj.targetId.startsWith("mob:") && !assetKeyIds.has(obj.targetId))
        warn(`${label}: objectives targetId "${obj.targetId}" not in asset-keys.json`);
    }
  }

  for (const a of byKind.get("arc")) {
    const label = `story/${STORY_FILES.arc}#${a.id}`;
    for (const qid of a.questIds) resolve(label, "questIds", qid, ["quest"]);
    resolve(label, "actId", a.actId, ["act"]);
  }

  for (const c of byKind.get("character")) {
    const label = `story/${STORY_FILES.character}#${c.id}`;
    resolve(label, "faction", c.faction, ["faction"]);
    resolve(label, "region", c.region, ["region"]);
    if (c.assetKey !== undefined && !assetKeyIds.has(c.assetKey))
      fail(`${label}: assetKey "${c.assetKey}" not in asset-keys.json`);
    resolve(label, "diedAt", c.diedAt, ["event"]);
    if (c.diedAt !== undefined && (c.status ?? "alive") === "alive")
      fail(`${label}: diedAt "${c.diedAt}" set but status is "alive"`);
  }

  for (const l of byKind.get("lore")) {
    const label = `story/${STORY_FILES.lore}#${l.id}`;
    if (!nodes.has(l.anchor))
      fail(`${label}: anchor "${l.anchor}" does not resolve to any story node`);
  }

  for (const e of byKind.get("event")) {
    const label = `story/${STORY_FILES.event}#${e.id}`;
    for (const iid of e.involves) {
      if (!nodes.has(iid)) fail(`${label}: involves "${iid}" does not resolve to any story node`);
    }
    resolve(label, "triggeredBy", e.triggeredBy, ["quest"]);
    resolveUnlocks(label, e);
  }

  for (const d of byKind.get("dialogue")) {
    const label = `story/${STORY_FILES.dialogue}#${d.id}`;
    resolve(label, "speaker", d.speaker, ["character"]);
    resolve(label, "context", d.context, ["quest", "event"]);
    resolveUnlocks(label, d);
  }

  for (const f of byKind.get("faction")) {
    const label = `story/${STORY_FILES.faction}#${f.id}`;
    for (const rel of f.relationships ?? [])
      resolve(label, "relationships.factionId", rel.factionId, ["faction"]);
  }
}

// Group `items` by `keyFn(item)`; return only the groups with 2+ members, as
// [key, items[]] pairs — used by the act.order / event.timelineOrder
// duplicate-value checks below.
function findDuplicateGroups(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].filter(([, group]) => group.length > 1);
}

// Single pass over the union building a targetId -> Set<sourceKind> index of
// every cross-node edge (the same edge set resolveStoryRefs walks). Built
// ONCE and reused by both orphan checks below, rather than re-scanning the
// graph per kind.
function buildReverseRefIndex(byKind) {
  const index = new Map();
  const addRef = (targetId, sourceKind) => {
    if (targetId === undefined) return;
    if (!index.has(targetId)) index.set(targetId, new Set());
    index.get(targetId).add(sourceKind);
  };

  for (const q of byKind.get("quest")) {
    addRef(q.giver, "quest");
    addRef(q.arcId, "quest");
    for (const uid of q.unlockedBy ?? []) addRef(uid, "quest");
    addRef(q.faction, "quest");
    addRef(q.region, "quest");
  }
  for (const a of byKind.get("arc")) {
    for (const qid of a.questIds) addRef(qid, "arc");
    addRef(a.actId, "arc");
  }
  for (const c of byKind.get("character")) {
    addRef(c.faction, "character");
    addRef(c.region, "character");
    addRef(c.diedAt, "character");
  }
  for (const l of byKind.get("lore")) addRef(l.anchor, "lore");
  for (const e of byKind.get("event")) {
    for (const iid of e.involves) addRef(iid, "event");
    addRef(e.triggeredBy, "event");
    for (const uid of e.unlockedBy ?? []) addRef(uid, "event");
  }
  for (const d of byKind.get("dialogue")) {
    addRef(d.speaker, "dialogue");
    addRef(d.context, "dialogue");
    for (const uid of d.unlockedBy ?? []) addRef(uid, "dialogue");
  }
  for (const f of byKind.get("faction")) {
    for (const rel of f.relationships ?? []) addRef(rel.factionId, "faction");
  }
  return index;
}

// Narrative System v2: acts are the story spine — orders must be unique and
// contiguous 1..N so "act reached" (unlockedBy act-*) is well-defined.
function checkActOrdering(story, fail) {
  const acts = story.byKind.get("act");
  for (const [order, group] of findDuplicateGroups(acts, (a) => a.order))
    fail(`story/${STORY_FILES.act}: duplicate order ${order} used by acts ${group.map((a) => `"${a.id}"`).join(", ")}`);
  const sorted = [...new Set(acts.map((a) => a.order))].sort((x, y) => x - y);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      fail(`story/${STORY_FILES.act}: act orders [${acts.map((a) => a.order).join(", ")}] are not contiguous 1..${acts.length}`);
      break;
    }
  }
}

// A quest is statically reachable when every quest-* id it is unlocked by
// resolves and is itself reachable. event-*/act-* unlocks are runtime
// conditions, not statically walkable — ignored here (assertUnlockDag still
// covers cycles through events). A cycle or dangling quest dep => unreachable.
function buildQuestReachability(quests) {
  const questById = new Map(quests.map((q) => [q.id, q]));
  const memo = new Map();
  const visiting = new Set();
  const reachable = (q) => {
    if (memo.has(q.id)) return memo.get(q.id);
    if (visiting.has(q.id)) return false;
    visiting.add(q.id);
    const ok = (q.unlockedBy ?? [])
      .filter((id) => id.startsWith("quest-"))
      .every((id) => questById.get(id) !== undefined && reachable(questById.get(id)));
    visiting.delete(q.id);
    memo.set(q.id, ok);
    return ok;
  };
  return reachable;
}

// Narrative System v2: hard FAIL on any cycle in the unlockedBy graph.
// Graph nodes are quests/events/dialogue; edges are unlockedBy entries that
// resolve to a quest or event (act-* refs are sinks — acts have no
// unlockedBy — and dialogue ids can never appear in unlockedBy, so dialogue
// nodes have out-edges only). Out-degree is now unbounded (array), so DFS
// walks every successor. Dangling refs (already FAILed by resolveStoryRefs)
// are skipped, never crashed on or misreported as cycles.
function assertUnlockDag(story, fail) {
  const { nodes, byKind } = story;
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map();

  const visit = (node, stack) => {
    color.set(node.id, GREY);
    stack.push(node.id);
    for (const uid of node.unlockedBy ?? []) {
      const target = nodes.get(uid);
      if (!target || !["quest", "event"].includes(target.kind)) continue;
      const targetColor = color.get(target.id) ?? WHITE;
      if (targetColor === GREY) {
        const cycleStart = stack.indexOf(target.id);
        fail(`story: unlockedBy cycle: ${[...stack.slice(cycleStart), target.id].join(" -> ")}`);
      } else if (targetColor === WHITE) visit(target, stack);
    }
    stack.pop();
    color.set(node.id, BLACK);
  };

  for (const kind of ["quest", "event", "dialogue"])
    for (const n of byKind.get(kind))
      if ((color.get(n.id) ?? WHITE) === WHITE) visit(n, []);
}

// F-012 Task 3: completeness FAILs + orphan/reachability WARNs, run after
// resolveStoryRefs so every message from both layers is visible together —
// including for the arc/quest completeness rules below, which structurally
// overlap with schema `required`/`minItems` (a quest with 0 objectives or an
// arc with 0 questIds is ALSO a schema violation, and a schema-invalid entry
// never reaches `byKind`). Those two rules therefore run against
// `rawByKind` (every parsed entry, valid or not) so our clear-message FAIL
// still surfaces even though the schema layer already excluded the node from
// `byKind`/`nodes` — defense in depth, not a replacement for the schema gate.
//
// `requireComplete` escalates the orphan-character, orphan-faction, and
// unreachable-quest WARNs to FAILs (mirrors the existing character-sheet
// coverage escalation in checkCharacters). The triggeredBy/act-order WARN is
// a graph *consistency* check, not a coverage/completeness one, so it is
// deliberately NOT escalated by --require-complete.
function checkStoryCoherence(story, fail, warn, requireComplete) {
  const { nodes, byKind, rawByKind } = story;
  const escalate = (msg) => (requireComplete ? fail(msg) : warn(msg));

  // --- completeness FAILs (raw entries — see comment above) -----------------

  for (const q of rawByKind.get("quest") ?? []) {
    const label = `story/${STORY_FILES.quest}#${q?.id ?? "?"}`;
    if (!Array.isArray(q?.objectives) || q.objectives.length === 0)
      fail(`${label}: quest "${q?.id ?? "?"}" has 0 objectives`);
    if (!q?.giver) fail(`${label}: quest "${q?.id ?? "?"}" is missing giver`);
    if (!q?.arcId) fail(`${label}: quest "${q?.id ?? "?"}" is missing arcId`);
  }

  for (const a of rawByKind.get("arc") ?? []) {
    const label = `story/${STORY_FILES.arc}#${a?.id ?? "?"}`;
    if (!Array.isArray(a?.questIds) || a.questIds.length === 0)
      fail(`${label}: arc "${a?.id ?? "?"}" has no quests (0 questIds)`);
  }

  // --- duplicate-value FAILs (schema-valid nodes — no minItems overlap) -----

  // Narrative System v2: multiple arcs may legally share one act (parallel
  // storylines) — the old duplicate-arc.act FAIL is deliberately removed.
  // Act order uniqueness/contiguity is now enforced by checkActOrdering().

  for (const [order, events] of findDuplicateGroups(byKind.get("event"), (e) => e.timelineOrder))
    fail(`story/${STORY_FILES.event}: duplicate timelineOrder ${order} used by events ${events.map((e) => `"${e.id}"`).join(", ")}`);

  // --- orphan WARNs (reverse-ref index, built once) --------------------------

  const refIndex = buildReverseRefIndex(byKind);

  for (const c of byKind.get("character")) {
    const sources = refIndex.get(c.id) ?? new Set();
    if (!["quest", "faction", "event", "dialogue"].some((k) => sources.has(k)))
      escalate(`story/${STORY_FILES.character}#${c.id}: character "${c.id}" is referenced by no quest, faction, event, or dialogue (orphan)`);
  }

  for (const f of byKind.get("faction")) {
    const sources = refIndex.get(f.id) ?? new Set();
    if (!["quest", "character", "event"].some((k) => sources.has(k)))
      escalate(`story/${STORY_FILES.faction}#${f.id}: faction "${f.id}" is referenced by no quest, character, or event (orphan)`);
  }

  // --- reachability WARN ------------------------------------------------------

  const reachable = buildQuestReachability(byKind.get("quest"));
  for (const q of byKind.get("quest")) {
    if (!reachable(q))
      escalate(`story/${STORY_FILES.quest}#${q.id}: quest "${q.id}" is unreachable from any no-unlockedBy start quest`);
  }

  // --- event.triggeredBy vs act ordering WARN (never escalated) -------------

  for (const e of byKind.get("event")) {
    if (e.triggeredBy === undefined) continue;
    const quest = nodes.get(e.triggeredBy);
    if (!quest || quest.kind !== "quest") continue; // dangling/wrong-kind already FAILed by resolveStoryRefs
    const arc = nodes.get(quest.arcId);
    if (!arc || arc.kind !== "arc") continue; // dangling arcId already FAILed elsewhere
    const act = nodes.get(arc.actId);
    if (!act || act.kind !== "act") continue; // dangling actId already FAILed by resolveStoryRefs
    if (act.order > e.timelineOrder)
      warn(`story/${STORY_FILES.event}#${e.id}: triggeredBy quest "${quest.id}"'s act "${act.id}" order ${act.order} is later than event timelineOrder ${e.timelineOrder}`);
  }

  // --- lore.thread size WARN (never escalated — coverage-of-a-mystery,
  // deliberately outside --require-complete, matching the triggeredBy WARN's
  // reasoning) ----------------------------------------------------------------

  const byThread = new Map();
  for (const l of byKind.get("lore")) {
    if (!byThread.has(l.thread)) byThread.set(l.thread, []);
    byThread.get(l.thread).push(l);
  }
  for (const [thread, frags] of byThread)
    if (frags.length < 2)
      warn(`story/${STORY_FILES.lore}#${frags[0].id}: thread "${thread}" has only 1 fragment — a thread of one isn't a mystery`);
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
  const { nodes, byKind, rawByKind, anyFilePresent } = loadStory(opts.contentRoot, fail);

  const keysDoc = readJson(opts.keys, "asset-keys", fail);
  const assetKeyIds = new Set((keysDoc?.keys ?? []).map((k) => k.id));
  for (const entry of byKind.get("faction")) {
    for (const mk of entry.mobFamily) {
      if (!assetKeyIds.has(mk))
        warn(`story/${STORY_FILES.faction}#${entry.id}: mobFamily key "${mk}" not in asset-keys.json`);
    }
  }

  const story = { nodes, byKind };
  resolveStoryRefs(story, assetKeyIds, fail, warn);
  checkActOrdering(story, fail);
  assertUnlockDag(story, fail);
  checkStoryCoherence({ ...story, rawByKind }, fail, warn, opts.requireComplete);

  return { count: nodes.size, ids: anyFilePresent ? new Set(nodes.keys()) : null };
}

function checkCharacters(opts, storyIds = null) {
  const keysDoc = readJson(opts.keys, "asset-keys", fail);
  const manifestDoc = readJson(opts.manifest, "manifest", fail);
  const validate = compileSchema(join(opts.contentRoot, "schemas/character.schema.json"), "character schema", fail);
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

  const validate = compileSchema(join(opts.contentRoot, "schemas/map.schema.json"), "map schema", fail);
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
