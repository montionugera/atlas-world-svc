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
import { checkSpawnPairing } from "./lib/spawn-pairing.mjs";
import { checkBestiarySheet } from "./lib/bestiary-sheet.mjs";
// F-040: the town-plan geometry the T-rules need. Pure, no I/O — see the
// module header for why it cannot live inside this file.
import { roadPolygon, polyRectOverlap } from "./lib/town-geometry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = {
    contentRoot: join(ROOT, "content"),
    keys: join(ROOT, "colyseus-server/generated/asset-keys.json"),
    manifest: join(ROOT, "game-client/assets/manifest.json"),
    mobTypes: join(ROOT, "colyseus-server/generated/mob-types.json"),
    spawnAreas: join(ROOT, "colyseus-server/generated/spawn-areas.json"),
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
    else if (a === "--mob-types") opts.mobTypes = resolve(takeValue(a, ++i));
    else if (a === "--spawn-areas") opts.spawnAreas = resolve(takeValue(a, ++i));
    else if (a === "--require-complete") opts.requireComplete = true;
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return opts;
}

// F-013: load the codegen-emitted valid mob type id set. Missing, unparseable,
// or shape-invalid (`mobTypes` not a string array) is ONE hard FAIL and
// returns null — callers skip their mob checks so the single loader failure
// isn't multiplied per ref, and the checks can never silently pass. This
// deliberately does NOT mirror the story/bible soft-skip: the artifact is
// committed and CI-refreshed, so absence means broken setup.
function loadMobTypes(path) {
  // `!doc` can't distinguish "readJson recorded a FAIL" from "the file parsed
  // to a JSON-falsy value (null/false/0/"")" — the latter must be ONE
  // shape-invalid FAIL, never a silent skip, so check the failure count.
  const before = failures.length;
  const doc = readJson(path, "mob-types", fail);
  if (failures.length > before) return null; // readJson already recorded the FAIL
  if (!doc || !Array.isArray(doc.mobTypes) || !doc.mobTypes.every((t) => typeof t === "string")) {
    fail(`mob-types: ${path} is shape-invalid — expected { mobTypes: string[] }`);
    return null;
  }
  return new Set([...doc.mobTypes].sort()); // sorted so FAIL messages list ids deterministically
}

// I-059: the design roster, read ONLY to resolve placement references. The
// roster itself is not validated here — content/bestiary/README.md keeps it a
// design backlog. Same failure-count discipline as loadMobTypes: a recorded
// FAIL and a parsed-but-falsy document are different things.
function loadBestiaryDesigns(path) {
  const before = failures.length;
  const doc = readJson(path, "bestiary", fail);
  if (failures.length > before) return null;
  if (!Array.isArray(doc)) {
    fail(`bestiary: ${path} is shape-invalid — expected a top-level array`);
    return null;
  }
  const byId = new Map();
  for (const d of doc) {
    if (!d || typeof d.id !== "string") continue; // roster shape is not this gate's business
    byId.set(d.id, d);
  }
  return byId;
}

// I-059: zone records from the Cartographer's geography. levelBand is the
// authority for a placement file's routeBand (G8) — the band is asserted
// across files, never retyped from prose.
function loadGeographyZones(path) {
  const before = failures.length;
  const doc = readJson(path, "geography", fail);
  if (failures.length > before) return null;
  if (!doc || !Array.isArray(doc.zones)) {
    fail(`geography: ${path} is shape-invalid — expected { zones: [...] }`);
    return null;
  }
  const byId = new Map();
  for (const z of doc.zones) {
    if (!z || typeof z.id !== "string") continue;
    byId.set(z.id, z);
  }
  return byId;
}

// F-040 T1: town records from the Cartographer's geography. The geography is
// the authority on which towns exist and where they are; a town plan asserts
// against it and the geography is NEVER written back (design §9). Same
// failure-count discipline as loadGeographyZones — readJson cannot tell a
// recorded FAIL from a file holding literal `null`.
function loadGeographyTowns(path) {
  const before = failures.length;
  const doc = readJson(path, "geography", fail);
  if (failures.length > before) return null;
  if (!doc || !Array.isArray(doc.towns)) {
    fail(`geography: ${path} is shape-invalid — expected { towns: [...] }`);
    return null;
  }
  const byId = new Map();
  for (const t of doc.towns) {
    if (!t || typeof t.id !== "string") continue; // town record shape is not this gate's business
    byId.set(t.id, t);
  }
  return byId;
}

const failures = [];
const warnings = [];
// I-060 Z5: hazards authored vs hazards the runtime can express. Module-level
// alongside failures/warnings because finish() prints the ratio — design §7
// makes that count the only signal of how much of the authored world the
// engine can express, so it must never be swallowed into the warning total.
let zoneHazardsTotal = 0;
let zoneHazardsUnmapped = 0;
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
  const mobTypes = loadMobTypes(opts.mobTypes);
  const story = checkStory(opts, mobTypes);
  const sheetCount = checkCharacters(opts, story.ids);
  const mapCount = checkMaps(opts, mobTypes);
  const placementCount = checkBestiaryPlacement(opts);
  const zoneCount = checkZoneContent(opts);
  const townCount = checkTownPlan(opts);
  return finish(sheetCount, mapCount, story.count, placementCount, zoneCount, townCount);
}

// F-012: loadStory() (reads all 7 per-kind story files under
// `${contentRoot}/story/` into one global id→node map) now lives in
// scripts/lib/story.mjs, shared with gen_story_graph.mjs — see that file for
// the full loader contract (missing-file vs unparsable vs schema-invalid,
// duplicate-id semantics, `rawByKind` vs `byKind`).

// F-012 Task 2: whole-graph cross-reference resolution. `story` is the
// {nodes, byKind} shape returned by loadStory(); `assetKeyIds` is the Set of
// ids from asset-keys.json. Every edge below FAILs on a dangling/wrong-kind
// target, including (since F-013) the mob:* pseudo-refs: quest
// .objectives[].targetId and (in checkStory) faction.mobFamily[] hard-FAIL
// against the codegen-emitted mob-types.json (spawnable), while keeping the
// softer asset-keys WARN (renderable coverage).
//
// Target-KIND matters, not just id existence — e.g. quest.giver must resolve
// to a *character* node, not merely to any existing id — with the single
// exception of event.involves[], which may point at a node of any kind.
// In practice most edges are prefix-locked by their target schema's `id`
// pattern (only faction.schema.json mints `faction-*` ids, etc.), so a
// wrong-kind hit is mostly reachable only on the two kind-agnostic-pattern
// fields (event.involves, dialogue.context); the check still runs uniformly
// for every edge as defense in depth.
function resolveStoryRefs(story, assetKeyIds, mobTypes, fail, warn) {
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
      if (!obj.targetId.startsWith("mob:")) {
        // F-013: quest.schema.json leaves targetId free-form (minLength: 1),
        // so a prefixless typo on a MOB_KILLED objective would silently skip
        // every mob check below — close the escape hatch. Keyed on the
        // objective type so future non-mob objective types stay legal.
        if (obj.type === "MOB_KILLED")
          fail(`${label}: objectives targetId "${obj.targetId}" (type MOB_KILLED) must be a mob:<id> ref`);
        continue;
      }
      if (!assetKeyIds.has(obj.targetId))
        warn(`${label}: objectives targetId "${obj.targetId}" not in asset-keys.json`);
      // F-013: hard spawnability check (see mobFamily note in checkStory).
      if (mobTypes && !mobTypes.has(obj.targetId.slice(4)))
        fail(`${label}: objectives targetId "${obj.targetId}" is not a server mob id (valid: ${[...mobTypes].join(", ")})`);
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
// against the per-kind union: faction mobFamily → real asset key (asset-keys
// membership stays a WARN — renderable coverage; F-013 adds the hard FAIL
// against mob-types.json — spawnable),
// resolveStoryRefs() for the whole-graph edge set (Task 2), and (in
// checkCharacters) character sheets' links.story → a real story node id
// (FAIL, unchanged).
//
// A content root with none of the 7 story files present at all is a soft skip
// (ids=null): the character→story check simply can't run, mirroring how a
// missing bible.md downgrades region checks. Once at least one story file
// exists, ids is a real (possibly empty) Set and the check runs for real.
function checkStory(opts, mobTypes) {
  const { nodes, byKind, rawByKind, anyFilePresent } = loadStory(opts.contentRoot, fail);

  const keysDoc = readJson(opts.keys, "asset-keys", fail);
  const assetKeyIds = new Set((keysDoc?.keys ?? []).map((k) => k.id));
  for (const entry of byKind.get("faction")) {
    for (const mk of entry.mobFamily) {
      if (!assetKeyIds.has(mk))
        warn(`story/${STORY_FILES.faction}#${entry.id}: mobFamily key "${mk}" not in asset-keys.json`);
      // F-013: strip the mob: prefix and hard-check spawnability. The
      // asset-keys WARN above stays — it now means "renderable coverage";
      // this FAIL means "actually spawnable".
      if (mobTypes && mk.startsWith("mob:") && !mobTypes.has(mk.slice(4)))
        fail(`story/${STORY_FILES.faction}#${entry.id}: mobFamily "${mk}" is not a server mob id (valid: ${[...mobTypes].join(", ")})`);
    }
  }

  const story = { nodes, byKind };
  resolveStoryRefs(story, assetKeyIds, mobTypes, fail, warn);
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

  // F-031 (G-BESTIARY-SHEET): the design roster and the runtime element map.
  // Both are OPTIONAL here — a content root with no bestiary/ dir simply has
  // no sheet that could be bound to a design (mirrors the maps soft-skip), and
  // an unreadable mob-types.json has already been hard-FAILed by loadMobTypes.
  const bestiaryPath = join(opts.contentRoot, "bestiary/bestiary.json");
  const bestiaryById = existsSync(bestiaryPath)
    ? (loadBestiaryDesigns(bestiaryPath) ?? new Map())
    : new Map();
  const mobElements = readJson(opts.mobTypes, "mob-types", () => {})?.elements ?? {};

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

    // (1b) G-BESTIARY-SHEET (F-031) — only sheets whose id IS a bestiary
    // design id. The six legacy archetype sheets (mob-aggressive-brute etc.)
    // are behaviour archetypes, not species, and are deliberately untouched.
    const design = bestiaryById.get(fm.id);
    if (design) checkBestiarySheet(fm, design, mobElements, fail);

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

function checkMaps(opts, mobTypes) {
  // Maps are OPTIONAL content — a content root without a maps/ dir is valid
  // (mirrors the story.json soft-skip). Skip BEFORE touching map.schema.json,
  // since a root with no maps/ also has no map schema and readJson would else
  // record a spurious "schema unreadable" failure.
  const dir = join(opts.contentRoot, "maps");
  if (!existsSync(dir)) return 0;

  const validate = compileSchema(join(opts.contentRoot, "schemas/map.schema.json"), "map schema", fail);
  if (!validate) return 0;

  const bibleRegions = bibleRegionIds(opts.contentRoot);

  // F-031: the RUNTIME spawn table, for G-SPAWN-PAIR below. Same discipline as
  // loadMobTypes — a recorded FAIL or a shape-invalid document yields null and
  // the pairing check is skipped, so one loader failure isn't multiplied per
  // area and the rule can never silently pass.
  const spawnBefore = failures.length;
  const spawnDoc = readJson(opts.spawnAreas, "spawn-areas", fail);
  let spawnAreas = null;
  if (failures.length === spawnBefore) {
    if (!spawnDoc || !Array.isArray(spawnDoc.areas))
      fail(`spawn-areas: ${opts.spawnAreas} is shape-invalid — expected { areas: [...] }`);
    else spawnAreas = spawnDoc.areas;
  }

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

    // (4) mobType cross-check — hard FAIL against the codegen-emitted
    // colyseus-server/generated/mob-types.json (F-013). mobTypes === null
    // means the artifact itself already FAILed in loadMobTypes; skip here so
    // that one failure isn't multiplied per area.
    if (mobTypes) {
      for (const area of fm.mobSpawnAreas ?? []) {
        if (!mobTypes.has(area.mobType))
          fail(`${label}: mobType "${area.mobType}" (area "${area.id}") is not a server mob id (valid: ${[...mobTypes].join(", ")})`);
      }
    }

    // (4b) G-SPAWN-PAIR (F-031) — bind this authored table to the RUNTIME one
    // (colyseus-server/src/config/mapConfig.ts, via its codegen artifact).
    // Identity + population only; geometry deliberately unchecked. See
    // scripts/lib/spawn-pairing.mjs for why, and for the LEGACY_UNPAIRED list.
    if (spawnAreas) checkSpawnPairing(fm.mobSpawnAreas ?? [], spawnAreas, fail);

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

// I-059: zone placement gate. Placement is OPTIONAL content — a root with no
// bestiary/ dir, or none matching placement-*.json, skips (mirrors the maps
// soft-skip). Once a file exists it is checked STRICTLY, because the file is
// complete for its zone by construction: "every design placed exactly once"
// (G4) is a FAIL, not a warning, and that completeness is the point.
function checkBestiaryPlacement(opts) {
  const dir = join(opts.contentRoot, "bestiary");
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => /^placement-.+\.json$/.test(f)).sort();
  if (!files.length) return 0;

  const validate = compileSchema(
    join(opts.contentRoot, "schemas/bestiary-placement.schema.json"),
    "bestiary-placement schema", fail);
  if (!validate) return 0;

  // Both are REQUIRED once a placement file exists: every rule below is a
  // cross-file assertion against one of them.
  const designs = loadBestiaryDesigns(join(dir, "bestiary.json"));
  const zones = loadGeographyZones(join(opts.contentRoot, "maps/cluster1-geography.json"));
  if (!designs || !zones) return 0;

  let count = 0;
  for (const file of files) {
    const label = `bestiary/${file}`;
    const before = failures.length;
    const doc = readJson(join(dir, file), label, fail);
    if (failures.length > before) continue;

    if (!validate(doc)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream rules assume a valid shape
    }

    // G1 — the zone exists in the Cartographer's geography
    const zone = zones.get(doc.zone);
    if (!zone) {
      fail(`${label}: zone "${doc.zone}" not in cluster1-geography.json#zones`);
      continue; // every remaining rule is relative to the zone
    }

    // G8 — the route band is the geography's band, asserted across files
    // rather than retyped from prose.
    const geoBand = Array.isArray(zone.levelBand) ? zone.levelBand : null;
    if (!geoBand || geoBand.length !== 2)
      fail(`${label}: zone "${doc.zone}" has no two-element levelBand in the geography`);
    else if (doc.routeBand[0] !== geoBand[0] || doc.routeBand[1] !== geoBand[1])
      fail(`${label}: routeBand [${doc.routeBand}] != geography levelBand [${geoBand}] for zone "${doc.zone}"`);

    // G7 — tiers must ascend, be contiguous, and not overlap. A gap or an
    // overlap means some level has no tier, or two.
    const tiers = doc.depthTiers;
    const seenTierIds = new Set();
    for (const t of tiers) {
      if (seenTierIds.has(t.id)) fail(`${label}: duplicate depthTier id "${t.id}"`);
      seenTierIds.add(t.id);
      if (t.bandCeil < t.bandFloor)
        fail(`${label}: depthTier "${t.id}" bandCeil ${t.bandCeil} < bandFloor ${t.bandFloor}`);
    }
    for (let i = 1; i < tiers.length; i++)
      if (tiers[i].bandFloor !== tiers[i - 1].bandCeil + 1)
        fail(`${label}: depthTiers "${tiers[i - 1].id}" -> "${tiers[i].id}" not contiguous (${tiers[i - 1].bandCeil} -> ${tiers[i].bandFloor})`);

    // G2 — bestiaryRegion is a region key the roster actually uses
    const zoneDesigns = [...designs.values()].filter((d) => d.region === doc.bestiaryRegion);
    if (!zoneDesigns.length)
      fail(`${label}: bestiaryRegion "${doc.bestiaryRegion}" matches no design in bestiary.json`);

    for (const p of doc.placements) {
      // G3 — the named design exists
      const design = designs.get(p.design);
      if (!design) {
        fail(`${label}: design "${p.design}" not in bestiary.json`);
        continue;
      }
      // and it belongs to this zone's region
      if (design.region !== doc.bestiaryRegion)
        fail(`${label}: design "${p.design}" has region "${design.region}", not "${doc.bestiaryRegion}"`);

      // G5 — the tier is one this file declares
      const tier = tiers.find((t) => t.id === p.tier);
      if (!tier) {
        fail(`${label}: design "${p.design}" tier "${p.tier}" is not a declared depthTier`);
        continue;
      }

      // G6 — the design's band must OVERLAP its tier. Bands are 10 wide and
      // tier edges do not fall on multiples of 10, so straddling is normal and
      // legal; only a fully disjoint pair is an error.
      const [bandLo, bandHi] = String(design.levelBand).split("-").map(Number);
      if (!Number.isFinite(bandLo) || !Number.isFinite(bandHi))
        fail(`${label}: design "${p.design}" has unparseable levelBand "${design.levelBand}"`);
      else if (bandHi < tier.bandFloor || bandLo > tier.bandCeil)
        fail(`${label}: design "${p.design}" band ${design.levelBand} is disjoint from tier "${p.tier}" (${tier.bandFloor}-${tier.bandCeil})`);
    }

    // G4 — completeness. This is what makes the file trustworthy: the roster
    // is the authority on which designs belong to this zone, and every one of
    // them must appear here exactly once. Missing = the zone is not placed;
    // duplicated = two locations claim the same design.
    for (const [design, group] of findDuplicateGroups(doc.placements, (p) => p.design))
      fail(`${label}: design "${design}" placed ${group.length} times`);

    const placed = new Set(doc.placements.map((p) => p.design));
    for (const d of zoneDesigns)
      if (!placed.has(d.id))
        fail(`${label}: design "${d.id}" (region "${doc.bestiaryRegion}") is not placed`);

    count++;
  }
  return count;
}

// I-060: L2 zone content. `kind` is a closed enum drawn from what canon already
// says cluster 1 lives on (design §6); `effect` is the seven runtime zoneHazards
// types, whose source of truth is
// content/schemas/map.schema.json #/properties/zoneHazards/items/properties/type/enum
// (declared there; NOT read by colyseus-server — see design §2 item 3). Restated here deliberately:
// this gate must not depend on a map schema the content root may not ship. A
// test asserts the two lists are equal so the copy cannot drift silently.
const ZONE_RESOURCE_KINDS = ["crop", "timber", "ore", "fuel", "stone", "water", "forage", "salvage"];
const ZONE_HAZARD_EFFECTS = ["freeze", "stun", "burn", "poison", "regen", "heal", "damage"];
const ZONE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// I-060: the zone-content gate, rules Z1-Z7 (design §7). Zone content is
// OPTIONAL content — a root with no zones/ dir, or none matching zone-*.json,
// skips silently (mirrors checkBestiaryPlacement's soft-skip; without it every
// fixture in check_content.test.mjs and bestiary-placement.test.mjs would take
// ten Z2 FAILs). Once ONE file exists the whole cluster is checked STRICTLY:
// Z2 asserts every zone in the geography has exactly one record, so a
// half-finished pass cannot go green. That is what bounds the per-zone cost.
//
// Two passes. Z1/Z3/Z4/Z5/Z7 are per-record and run in pass 1; Z2 and Z6 are
// cross-file — "this landmark name is taken" and "this zone is missing" are
// only answerable once every record is in hand — so pass 1 collects the
// accepted records and pass 2 checks them against each other.
//
// The schema is deliberately SHAPE-ONLY (see zone-content.schema.json's own
// description): because a schema-invalid doc `continue`s past every rule
// below, any constraint duplicated in the schema would make its Z-rule
// unreachable dead code. The floors, the kebab pattern and both enums
// therefore live here and nowhere else.
function checkZoneContent(opts) {
  const dir = join(opts.contentRoot, "zones");
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => /^zone-.+\.json$/.test(f)).sort();
  if (!files.length) return 0;

  // Skip BEFORE touching the schema: a content root that never adopted zone
  // content must not FAIL with "zone-content schema: cannot read/parse".
  const validate = compileSchema(
    join(opts.contentRoot, "schemas/zone-content.schema.json"),
    "zone-content schema", fail);
  if (!validate) return 0;

  // REQUIRED once a zone file exists: Z1 and Z2 are both assertions against
  // the Cartographer's geography, which is the authority on which zones exist.
  const zones = loadGeographyZones(join(opts.contentRoot, "maps/cluster1-geography.json"));
  if (!zones) return 0;

  const records = []; // { label, file, doc } for every valid record naming a real zone

  for (const file of files) {
    const label = `zones/${file}`;
    // readJson cannot distinguish "recorded a FAIL" from "parsed to a
    // JSON-falsy value" — a file holding literal `null` parses fine — so the
    // failure count, not the return value, is what says whether to continue.
    const before = failures.length;
    const doc = readJson(join(dir, file), label, fail);
    if (failures.length > before) continue;

    if (!validate(doc)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream rules assume a valid shape
    }

    // Z1 — the zone exists in the Cartographer's geography. This is also the
    // "no orphans" half of Z2. Unlike checkBestiaryPlacement's G1 this does
    // NOT continue: Z3/Z4/Z5/Z7 are purely intra-record, so bailing here would
    // hide real defects behind one typo. The orphan is FAILed and simply not
    // pushed into `records`, which withholds it from Z2, Z6 and the count.
    const known = zones.has(doc.zone);
    if (!known) fail(`${label}: zone "${doc.zone}" not in cluster1-geography.json#zones`);

    // Z3 — floors (design D4). Owned here, not by the schema: Ajv would emit
    // "/hazards must NOT have fewer than 2 items" and would reject the doc
    // before any other Z-rule could speak.
    for (const field of ["hazards", "resources", "landmarks"]) {
      if (doc[field].length < 2)
        fail(`${label}: zone "${doc.zone}" has ${doc[field].length} ${field}, needs at least 2`);
    }
    if (doc.reasonToGo.trim() === "")
      fail(`${label}: zone "${doc.zone}" has an empty reasonToGo`);

    // Z4 — ids kebab-case and unique WITHIN their own array. Uniqueness across
    // sibling ids is not expressible in draft-07 (uniqueItems compares whole
    // objects and would miss two hazards sharing an id but differing by one
    // word of description), so this rule owns it. "Within the array", not
    // within the file: one id string may legally appear in all three arrays.
    for (const [field, noun] of [["hazards", "hazard"], ["resources", "resource"], ["landmarks", "landmark"]]) {
      const arr = doc[field];
      for (const item of arr)
        if (!ZONE_ID_RE.test(item.id))
          fail(`${label}: ${noun} id "${item.id}" is not kebab-case`);
      for (const [id, group] of findDuplicateGroups(arr, (i) => i.id))
        fail(`${label}: duplicate ${noun} id "${id}" (${group.length} entries)`);
    }

    // Z5 — the optional `effect` binds an authored hazard to a runtime type.
    // A bad value is a FAIL; an ABSENT one is only a WARN (design D3), because
    // the Ashvale Front's defining hazard is an absence the engine cannot
    // express. That WARN is the accepted blind spot: a zone can be
    // content-complete with zero implementable hazards, so the ratio is
    // counted here and printed by finish() rather than swallowed.
    for (const h of doc.hazards) {
      zoneHazardsTotal++;
      if (h.effect === undefined) {
        zoneHazardsUnmapped++;
        warn(`${label}: hazard "${h.id}" has no effect — authored but not expressible at runtime`);
      } else if (!ZONE_HAZARD_EFFECTS.includes(h.effect)) {
        fail(`${label}: hazard "${h.id}" effect "${h.effect}" is not a runtime zoneHazards type (valid: ${ZONE_HAZARD_EFFECTS.join(", ")})`);
      }
    }

    // Z7 — resource kinds come from the closed enum.
    for (const r of doc.resources) {
      if (!ZONE_RESOURCE_KINDS.includes(r.kind))
        fail(`${label}: resource "${r.id}" kind "${r.kind}" is not a resource kind (valid: ${ZONE_RESOURCE_KINDS.join(", ")})`);
    }

    if (known) records.push({ label, file, doc });
  }

  // --- pass 2: the cross-file rules -----------------------------------------

  // Z2 — completeness, the direct analogue of the placement gate's G4. The
  // geography is the authority; every zone it declares must have exactly one
  // record. Missing = the pass is half-finished; duplicated = two files claim
  // the same ground. (An orphan was already FAILed by Z1 and is not here.)
  for (const [zone, group] of findDuplicateGroups(records, (r) => r.doc.zone))
    fail(`zones: zone "${zone}" has ${group.length} records (${group.map((r) => r.file).sort().join(", ")})`);

  // Iterates the geography, NOT the files: the whole point of Z2 is the zone
  // that was never written.
  const covered = new Set(records.map((r) => r.doc.zone));
  for (const id of zones.keys())
    if (!covered.has(id)) fail(`zones: geography zone "${id}" has no record in content/zones/`);

  // Z6 — distinctiveness (design D4/C5). Terrain is too coarse an axis to keep
  // ten zones apart — three of them are "river-country" — so identity is
  // enforced here rather than left to taste. Names compare trimmed and
  // case-insensitively: "The Adits" and "the adits" are the same landmark to a
  // player. Only a name spanning two DIFFERENT zones fires; a zone repeating a
  // name inside its own list is deliberately not covered by any Z-rule.
  const landmarkUses = [];
  for (const r of records)
    for (const l of r.doc.landmarks)
      landmarkUses.push({ zone: r.doc.zone, name: l.name, key: l.name.trim().toLowerCase() });
  for (const [, group] of findDuplicateGroups(landmarkUses, (u) => u.key)) {
    const shared = [...new Set(group.map((u) => u.zone))].sort();
    if (shared.length > 1)
      fail(`zones: landmark name "${group[0].name.trim()}" appears in zones ${shared.map((z) => `"${z}"`).join(", ")}`);
  }

  // Compared as a SET: deduped and sorted, so {stone,ore} is {ore,stone} and a
  // zone listing two resources of one kind has a one-element set.
  const kindSets = records.map((r) => ({
    zone: r.doc.zone,
    key: [...new Set(r.doc.resources.map((x) => x.kind))].sort().join(", "),
  }));
  for (const [key, group] of findDuplicateGroups(kindSets, (s) => s.key))
    fail(`zones: resource-kind set (${key}) is shared by zones ${group.map((s) => s.zone).sort().map((z) => `"${z}"`).join(", ")}`);

  return records.length;
}

// --- F-040: the town-plan navigability gate, T1–T7 --------------------------
//
// The scale contract (design §3), MEASURED not invented: largest mob radius 5
// → a cart road a mob can use must clear 12 world units; player radius 1.3 → a
// player-only alley must clear 4; D1's ten-second crossing puts a town's extent
// between 150 and 260.
//
// These floors live HERE and not in town-plan.schema.json, for exactly the
// reason zone-content.schema.json stays shape-only: a schema-invalid document
// `continue`s past every T-rule below, so a floor duplicated into the schema
// would make its T-rule unreachable dead code whose deletion nothing notices.
// Keyed by `roads[].kind` so the choice of floor is data-driven rather than a
// magic number (design §2).
const TOWN_ROAD_WIDTH_FLOORS = { cart: 12, foot: 4 };
const TOWN_EXTENT_MIN = 150;
const TOWN_EXTENT_MAX = 260;

// T5's "touches" tolerance, in world units. A footprint whose edge sits within
// this distance of the road's swept edge counts as opening onto it.
//
// INVENTED, DESIGN-OPEN — neither the design nor A1 §6 says how close is
// "opens onto". It cannot be zero-tolerance equality (authored coordinates
// would have to be bit-exact) and it cannot be an overlap test, because T4
// forbids the footprint overlapping the road at all: the two rules would
// contradict each other. Half a unit is under a third of a player diameter, so
// nothing that passes T5 leaves a gap a body could stand in.
const TOWN_ENTRANCE_TOUCH = 0.5;

function normalizeTownRect(rect) {
  const [ax, ay, bx, by] = rect;
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

// T5's touch test: grow the footprint by the tolerance and ask whether it now
// shares positive area with any of the road's swept quads. polyRectOverlap is
// strict (touching is NOT overlapping), so an exactly-abutting footprint only
// registers because of the growth — which is the whole point.
function footprintTouchesRoad(rect, quads) {
  const [x0, y0, x1, y1] = normalizeTownRect(rect);
  const grown = [
    x0 - TOWN_ENTRANCE_TOUCH, y0 - TOWN_ENTRANCE_TOUCH,
    x1 + TOWN_ENTRANCE_TOUCH, y1 + TOWN_ENTRANCE_TOUCH,
  ];
  return quads.some((q) => polyRectOverlap(q, grown));
}

// T1/T2/T3/T5. Mirrors checkZoneContent's structure exactly: soft-skip, compile,
// load the geography, then one pass that FAILs a schema-invalid record and
// `continue`s rather than letting a malformed shape reach the rules.
function checkTownPlan(opts) {
  const dir = join(opts.contentRoot, "towns");
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => /^town-.+\.json$/.test(f)).sort();
  if (!files.length) return 0;

  // Skip BEFORE touching the schema: every fixture in check_content.test.mjs
  // and bestiary-placement.test.mjs has a content root that never adopted town
  // plans, and those roots must not FAIL with "town-plan schema: cannot
  // read/parse".
  const validate = compileSchema(
    join(opts.contentRoot, "schemas/town-plan.schema.json"),
    "town-plan schema", fail);
  if (!validate) return 0;

  // REQUIRED once a town plan exists: T1 is an assertion against the
  // Cartographer's geography, which is the authority on which towns exist.
  const towns = loadGeographyTowns(join(opts.contentRoot, "maps/cluster1-geography.json"));
  if (!towns) return 0;

  const records = []; // { label, file, doc, roadQuads } for every valid plan naming a real town

  for (const file of files) {
    const label = `towns/${file}`;
    // Failure count, not the return value: a file holding literal `null`
    // parses fine and must not be mistaken for a recorded FAIL.
    const before = failures.length;
    const doc = readJson(join(dir, file), label, fail);
    if (failures.length > before) continue;

    if (!validate(doc)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream rules assume a valid shape
    }

    // T1 — the town exists in the Cartographer's geography. Like Z1 this does
    // NOT continue: T2/T3/T5 are purely intra-record, so bailing here would
    // hide real defects behind one typo. The orphan is FAILed and withheld
    // from `records`, and so from the count.
    const known = towns.has(doc.town);
    if (!known) fail(`${label}: town "${doc.town}" not in cluster1-geography.json#towns`);

    // T2 — extent within D1's 150–260 on BOTH axes. Inclusive: a town sitting
    // exactly on either endpoint is legal, which is what lets the fixture sit
    // on the boundary with no slack.
    for (const axis of ["width", "height"]) {
      const v = doc.extent[axis];
      if (v < TOWN_EXTENT_MIN || v > TOWN_EXTENT_MAX)
        fail(`${label}: extent ${axis} ${v} is outside ${TOWN_EXTENT_MIN}-${TOWN_EXTENT_MAX} world units`);
    }

    // T3 — every road clears its kind's floor (design §3). The floor is chosen
    // by `kind`, so a road authored as `cart` is held to the mob-passable
    // width whether or not a mob is ever routed down it.
    const roadById = new Map();
    const roadQuads = new Map();
    for (const road of doc.roads) {
      roadById.set(road.id, road);
      const floor = TOWN_ROAD_WIDTH_FLOORS[road.kind];
      if (road.width < floor)
        fail(`${label}: road "${road.id}" (kind "${road.kind}") is ${road.width} wide, needs at least ${floor}`);
      // The schema is shape-only, so `width` may be 0/negative and `points`
      // may repeat — both make roadPolygon throw. Swallow it here and let T5
      // report it against the footprint that depended on it; the gate must
      // never die with a stack trace on authored content.
      try { roadQuads.set(road.id, roadPolygon(road.points, road.width)); }
      catch { /* not sweepable — T5 reports it if anything opens onto it */ }
    }

    // T5 — `entranceOn` names a real road AND the footprint touches it.
    // `entranceOn` is optional (a ruin opens onto nothing), so an absent one is
    // not a defect; a present one that points nowhere is.
    for (const fp of doc.footprints) {
      if (fp.entranceOn === undefined) continue;
      if (!roadById.has(fp.entranceOn)) {
        fail(`${label}: footprint "${fp.id}" entranceOn "${fp.entranceOn}" names no road in this plan`);
        continue;
      }
      const quads = roadQuads.get(fp.entranceOn);
      if (!quads) {
        fail(`${label}: footprint "${fp.id}" opens onto road "${fp.entranceOn}", which has no swept area (degenerate width or centreline)`);
        continue;
      }
      if (!footprintTouchesRoad(fp.rect, quads))
        fail(`${label}: footprint "${fp.id}" does not touch road "${fp.entranceOn}" it opens onto (within ${TOWN_ENTRANCE_TOUCH} units)`);
    }

    // ===== SEAM: T4 / T6 / T7 go here ======================================
    // T4 (no footprint overlaps a road's swept area, no two footprints
    // overlap), T6 (the walkable area is ONE connected region by flood fill)
    // and T7 (exactly one firstSight landmark, reachable from the town edge)
    // are the geometry rules and are owned by a separate task. They belong in
    // this same per-record loop, after T5. `roadQuads` above already holds
    // each road's swept convex quads keyed by road id — reuse it rather than
    // re-sweeping. walkableGrid/floodFillRegions/cellIndexAt for T6/T7 come
    // from ./lib/town-geometry.mjs, which this file already imports from.
    // =======================================================================

    if (known) records.push({ label, file, doc, roadQuads });
  }

  // ===== SEAM: cross-file town rules, if any, go here =====================
  // checkZoneContent runs a second pass over `records` for its cross-file
  // rules (Z2 completeness, Z6 distinctiveness). T1–T7 are all intra-record,
  // so there is nothing here yet; `records` is built the same way so a later
  // cross-town rule has somewhere to live.
  // =======================================================================

  return records.length;
}

function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0, zoneCount = 0, townCount = 0) {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  // I-060 design §7: Z5's WARN is an accepted blind spot, so the ratio it
  // measures is printed as its own line. The generic warning total conflates
  // it with character-coverage and story-orphan warns and is not that signal.
  //
  // GUARDED. A content root with no zone content has no ratio to report, and
  // `0 of 0` would print a measurement of a thing that was never measured onto
  // every fixture in check_content.test.mjs and bestiary-placement.test.mjs.
  // That is the opposite of the discipline the rest of this codebase keeps —
  // season1.mjs's buildRows returns `actual: null`, never 0, when nothing is
  // countable. Three tests pin this (ABSENT on both soft-skip fixtures,
  // PRESENT on the ten-record fixture), so the guard cannot be removed or
  // inverted silently.
  if (zoneCount > 0 || zoneHazardsTotal > 0)
    console.log(`zone-content: ${zoneHazardsUnmapped} of ${zoneHazardsTotal} hazards have no runtime effect`);
  console.log(`content-gate: ${sheetCount} sheets, ${mapCount} maps, ${storyCount} story, ${placementCount} placements, ${zoneCount} zones, ${townCount} towns, ${failures.length} failures, ${warnings.length} warnings`);
  process.exit(failures.length ? 1 : 0);
}

main();
