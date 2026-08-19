#!/usr/bin/env node
// Content gate (F-005): content/characters/*.md ↔ schema ↔ asset keys ↔ manifest.
// Spec: docs/superpowers/specs/2026-07-19-content-pipeline-design.md
// Discipline mirrors scripts/check_asset_manifest.mjs: warns allowed at exit 0,
// any hard failure exits 1, --require-complete escalates coverage warns.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { STORY_FILES, loadStory, readJson, compileSchema } from "./lib/story.mjs";
import { checkSpawnPairing } from "./lib/spawn-pairing.mjs";
// Plan A Task 6: the ONE geography join authority. Replaces three direct
// reads of content/maps/cluster1-geography.json.
import { loadPlaces } from "./lib/places.mjs";
import { checkBestiarySheet } from "./lib/bestiary-sheet.mjs";
// F-040: the town-plan geometry the T-rules need. Pure, no I/O — see the
// module header for why it cannot live inside this file.
import {
  roadPolygon,
  polyRectOverlap,
  rectsOverlap,
  walkableGrid,
  floodFillRegions,
  cellIndexAt,
} from "./lib/town-geometry.mjs";
// F-041: the tier-spine gates. ALL pure logic lives in lib/spine.mjs.
// Plan A Task 13: this file used to end in a bare `main();`, so importing it
// ran the whole gate and called process.exit() — that is why gate tests
// spawned it. It now ends in an `import.meta.url` entry guard and exports
// `runSpineGateInProcess`, so `--only=spine` fixture runs are in-process.
// The full sweep still spawns (see that export's header for why).
import { loadSpine, buildTree, TIER_DEPTH, depthLegal, BIOMES, ID_RE, SEED_RE, shoelaceArea, selfIntersects, pointInPolygon, deriveInterior, deriveNode, resolveToRoot, rollupComposition, KM_TO_U, exactIntersectionArea, ringStructureProblem, ringVertexCount, placementArea, townFrameErrors, townCompErrors, terrainKindErrors, readTownPlans, planForNode, FRAME_EPS, checkRuntime, LIVE_MAP_IDS, checkSpawnFit, checkSpawnIdStable, checkPlayspaceAliases, checkSpineComplete, flattenSpawnAreas, parseRuntimeSpawnRects, spawnGeometryReportLines } from "./lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Plan A Task 4 — G-VERTEX-BUDGET. Every cost in the map lane is linear or
// worse in ring vertex count and nothing constrained it before this. The
// EFFECTIVE cap is min(load-budget.maxRingPoints, VERTEX_CAP[tier]) — the
// global term is the loader's ceiling, the per-tier term is the geometry
// gate's. Landform instances are NOT spine nodes (they are Plan C's fabric
// records) so their 40-vertex cap is not enforced here and must not be
// pretended into this table.
//
// COVERAGE NOTE (review fix). With the committed budget the global term is
// the tighter of the two for every tier — maxRingPoints 160 vs rows of 200
// and 800, so min() returns 160 everywhere and this table binds NOTHING
// today. Deleting it flipped no test when that was measured (74/74 still
// passed). It is a forward contract for the redraw, when maxRingPoints
// rises; the pair of tests named "G-VERTEX-BUDGET: the PER-TIER cap binds
// …" in scripts/tests/spine-gates.test.mjs is what proves the tier term is
// live — one 208-vertex ring under a global cap of 300, red as a region
// (200) and green as a continent (800). Do not delete this table without
// deleting those tests, and do not delete those tests at all.
const VERTEX_CAP = Object.freeze({
  world: 800, playroot: 800, continent: 800, ocean: 800, sea: 800,
  playspace: 800, fixture: 200, region: 200, town: 200, site: 200,
});

// Plan A Task 13, review finding 2. parseArgs' three bad-argument exits were
// `console.error(...) + process.exit(2)`, which is right for a CLI and fatal
// in-process: process.exit is uncatchable, so it skips runSpineGateInProcess'
// `finally` (leaving console swapped) and takes the whole test runner with it.
// Measured on a 5-test probe file: `node --test` reports the exit as ONE
// synthetic "test failed" with no exit code and no offending flag, and the
// tests that had ALREADY PASSED are erased from the totals (5 tests -> 1
// reported). Exit is 1, so CI notices — but "the count shrank" instead of "a
// test went red" is the same silent-shrink shape that bit this task at Step 2.
//
// So: exit when this file IS the CLI entry (byte-identical to before), throw
// an ArgError when it is not. The predicate is the SAME one the entry guard at
// the bottom of this file uses. runSpineGateInProcess turns an ArgError into
// `{code: 2, out}` — the exit code and the message a spawn produces.
class ArgError extends Error {}
const isCliEntry = () => Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
function argFail(message) {
  if (isCliEntry()) { console.error(message); process.exit(2); }
  throw new ArgError(message);
}

function parseArgs(argv) {
  const opts = {
    contentRoot: join(ROOT, "content"),
    keys: join(ROOT, "colyseus-server/generated/asset-keys.json"),
    manifest: join(ROOT, "game-client/assets/manifest.json"),
    mobTypes: join(ROOT, "colyseus-server/generated/mob-types.json"),
    spawnAreas: join(ROOT, "colyseus-server/generated/spawn-areas.json"),
    artManifest: join(ROOT, "game-client/assets/art/art-manifest.json"),
    requireComplete: false,
    only: null,
  };
  const takeValue = (name, i) => {
    const v = argv[i];
    if (v === undefined) argFail(`missing value for ${name}`);
    return v;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--content-root") opts.contentRoot = resolve(takeValue(a, ++i));
    else if (a === "--keys") opts.keys = resolve(takeValue(a, ++i));
    else if (a === "--manifest") opts.manifest = resolve(takeValue(a, ++i));
    else if (a === "--mob-types") opts.mobTypes = resolve(takeValue(a, ++i));
    else if (a === "--spawn-areas") opts.spawnAreas = resolve(takeValue(a, ++i));
    else if (a === "--art-manifest") opts.artManifest = resolve(takeValue(a, ++i));
    else if (a === "--require-complete") opts.requireComplete = true;
    else if (a === "--only" || a.startsWith("--only=")) {
      opts.only = a.startsWith("--only=") ? a.slice("--only=".length) : takeValue(a, ++i);
      if (opts.only !== "spine") argFail(`unsupported --only value: ${opts.only} (only "spine" exists)`);
    }
    else argFail(`unknown arg: ${a}`);
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

// Plan A Task 6 — the ONE geography document, resolved once per content root.
//
// Review finding (c), decided deliberately rather than left to chance:
// loadGeographyZones runs TWICE per full gate run (bestiary placement at the
// G-rules, zone content at the Z-rules) and loadGeographyTowns once more, and
// before this task each call re-read the same file. Re-pointing them at
// loadPlaces would have turned that into three full spine loads + joins, and —
// the part that actually bites — would have pushed the SAME problem onto
// `failures` once per call, so one broken geography would print as two or
// three identical FAIL lines. Memoise per content root: the gate is a
// single-shot process reading a frozen tree, so one resolve per root is
// correct as well as cheap, and each problem is reported exactly once.
//
// The prefix is applied ONLY when loadPlaces has not already applied it.
// loadPlaces' own disk-facing problems are contractually prefixed
// "geography: " (pinned by scripts/tests/places.test.mjs:121), while
// resolveWorld's are prefixed "resolveWorld: " / "sheet: " and need the
// context. Prefixing unconditionally — as the plan text spells it — would
// print "geography: geography: <path> is shape-invalid". DEVIATION FROM PLAN,
// cosmetic only: every fixture assertion is /geography: .* is shape-invalid/,
// which both spellings satisfy.
const placesByRoot = new Map();
function placesDoc(contentRoot) {
  if (!placesByRoot.has(contentRoot)) {
    const { doc, problems } = loadPlaces({ contentRoot });
    for (const p of problems) fail(p.startsWith("geography: ") ? p : `geography: ${p}`);
    // The Risk A2 backstop, and the plan's Step 8(a) acceptance criterion.
    // All three joins `return 0` on a null doc, so a null doc carrying NO
    // problem is the one input that zeroes every count while the gate still
    // exits 0 — checking nothing, reporting nothing, and looking green.
    // Measured with loadPlaces stubbed to `{doc: null, problems: []}`: exit 0,
    // `0 placements, 0 zones, 0 towns, 0 failures`.
    //
    // loadPlaces holds the other half of this contract today (every one of its
    // null-doc returns pushes a problem), so this is unreachable from inside
    // the current library. That is exactly why it is worth one line here: it
    // turns a cross-module promise that nothing enforces into a local
    // invariant that cannot be broken silently by a later edit to places.mjs.
    if (!doc && problems.length === 0)
      fail(`geography: ${contentRoot} resolved to no document and reported no problem`);
    placesByRoot.set(contentRoot, doc ?? null);
  }
  return placesByRoot.get(contentRoot);
}

// I-059: zone records from the Cartographer's geography. levelBand is the
// authority for a placement file's routeBand (G8) — the band is asserted
// across files, never retyped from prose.
//
// Plan A Task 6: the SOURCE moved from the legacy content/maps/
// cluster1-geography.json mirror to scripts/lib/places.mjs, which resolves
// the same document from content/spine/ and falls back to the mirror file for
// content roots that ship one but no spine. `contentRoot` is now the content
// ROOT, not a file path. The failure messages downstream still name
// "cluster1-geography.json#zones" verbatim — ~10 fixture tests regex them and
// the mirror is still the concept even after the file is gone.
function loadGeographyZones(contentRoot) {
  const doc = placesDoc(contentRoot);
  if (!doc) return null;
  if (!Array.isArray(doc.zones)) {
    fail(`geography: ${contentRoot} is shape-invalid — expected { zones: [...] }`);
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
// against it and the geography is NEVER written back (design §9).
//
// Plan A Task 6: same re-home as loadGeographyZones — `contentRoot`, not a
// file path, and the document comes from placesDoc()'s single resolve.
function loadGeographyTowns(contentRoot) {
  const doc = placesDoc(contentRoot);
  if (!doc) return null;
  if (!Array.isArray(doc.towns)) {
    fail(`geography: ${contentRoot} is shape-invalid — expected { towns: [...] }`);
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
  // `placesByRoot` is run-scoped state, not process-scoped state — the same
  // category as `failures` and `warnings`. Clearing it here is a no-op for a
  // spawned run, and that is the point: it gives the memo an invalidation path
  // that exists rather than one that is merely unnecessary today.
  //
  // Task 13 adds `runSpineGateInProcess`, which resets `failures`, `warnings`,
  // `zoneHazardsTotal` and `zoneHazardsUnmapped` and calls `checkSpine`
  // directly. TASK 13, READ THIS: that entry MUST reset `placesByRoot` too —
  // unconditionally, not "only if it is ever widened to the full sweep".
  //
  // This comment used to say `--only=spine` never reaches placesDoc, which was
  // true when it was written and was falsified by Task 9 in the same plan.
  // checkSpine (:1954) calls checkSpineExternalAliases, whose second
  // resolution path calls resolvedWorld() -> placesDoc() whenever a slug misses
  // the spine. Measured on a fixture with n-rooktide renamed to n-rooktide-town:
  // `--only=spine` printed `FAIL spine-alias: bestiary.json region "rooktide":
  // …` — a message only reachable AFTER placesDoc() has run. Today's real
  // content never misses, so the memo stays empty on a green run; a red one
  // fills it. Without the reset, a second in-process `--only=spine` run gets
  // run one's geography document and re-reports none of its problems.
  placesByRoot.clear();
  const opts = parseArgs(process.argv);
  if (opts.only === "spine") {
    // Gate 1 fast path (--only=spine): structural spine gates only (~1 s),
    // not the whole content sweep. finish() still owns exit-code semantics.
    // G-RUNTIME (F-041 P4) needs the mob-type set too, so load it here —
    // same loader, same null-on-failure discipline as the full sweep below.
    const mobTypes = loadMobTypes(opts.mobTypes);
    const nodeCount = checkSpine(opts, mobTypes);
    return finish(0, 0, 0, 0, 0, 0, nodeCount);
  }
  const mobTypes = loadMobTypes(opts.mobTypes);
  const story = checkStory(opts, mobTypes);
  const sheetCount = checkCharacters(opts, story.ids);
  const mapCount = checkMaps(opts, mobTypes);
  const placementCount = checkBestiaryPlacement(opts);
  const zoneCount = checkZoneContent(opts);
  const townCount = checkTownPlan(opts);
  const nodeCount = checkSpine(opts, mobTypes);
  return finish(sheetCount, mapCount, story.count, placementCount, zoneCount, townCount, nodeCount);
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
  const zones = loadGeographyZones(opts.contentRoot);
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
  const zones = loadGeographyZones(opts.contentRoot);
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

// T7's "reachable from the town edge": does this flood-fill region include at
// least one cell on the grid's border?
//
// The town edge is where a traveller arrives from — A1 §6's Millcross has no
// wall and its roads run off the map at the extent, so "reachable" can only mean
// "connected to the outside world". Scanning the four borders is enough: a
// region that touches the extent anywhere is enterable, and one that touches it
// nowhere is enclosed by buildings no matter how large it is.
function townRegionTouchesEdge(grid, labels, region) {
  const { cols, rows } = grid;
  for (let c = 0; c < cols; c++) {
    if (labels[c] === region) return true;
    if (labels[(rows - 1) * cols + c] === region) return true;
  }
  for (let r = 0; r < rows; r++) {
    if (labels[r * cols] === region) return true;
    if (labels[r * cols + (cols - 1)] === region) return true;
  }
  return false;
}

// The ONE read of content/towns/*.json. Two consumers need the same list —
// checkTownPlan (the T-rules) and checkSpine (the G-TOWN-* gates) — and before
// this was shared each read its own copy, so an unparsable plan earned TWO
// identical FAIL lines and checkSpine consumed plans NO schema had ever seen
// (a plan missing footprints[0].rect crashed townCompErrors, and an uncaught
// throw skips finish(), silently dropping every FAIL recorded before it).
//
// Returns the ONE `plans` shape documented in lib/spine.mjs (planForNode):
// [{ file, doc }], schema-VALID docs only. Memoised per content root because
// the gate is one-shot per root — `--only=spine` calls this without
// checkTownPlan ever running, and the full sweep calls it from both.
let townPlansCache = null;
function loadTownPlans(opts) {
  if (townPlansCache && townPlansCache.root === opts.contentRoot) return townPlansCache.plans;
  const { plans: raw, unreadable } = readTownPlans({ contentRoot: opts.contentRoot });
  const plans = [];
  // Soft-skip BEFORE touching the schema: every fixture in
  // check_content.test.mjs and bestiary-placement.test.mjs has a content root
  // that never adopted town plans, and those roots must not FAIL with
  // "town-plan schema: cannot read/parse".
  if (raw.length || unreadable.length) {
    for (const u of unreadable) fail(`${u.file}: cannot read/parse ${u.path}: ${u.message}`);
    const validate = compileSchema(
      join(opts.contentRoot, "schemas/town-plan.schema.json"),
      "town-plan schema", fail);
    if (validate) {
      for (const { file, doc } of raw) {
        if (!validate(doc)) {
          for (const err of validate.errors)
            fail(`${file}: schema ${err.instancePath || "/"} ${err.message}`);
          continue; // downstream rules and gates assume a valid shape
        }
        plans.push({ file, doc });
      }
    }
  }
  townPlansCache = { root: opts.contentRoot, plans };
  return plans;
}

// T1/T2/T3/T5. Mirrors checkZoneContent's structure exactly: soft-skip, compile,
// load the geography, then one pass over the SCHEMA-VALID plans (loadTownPlans
// above already FAILed and dropped the malformed ones, so no rule below ever
// sees a bad shape).
function checkTownPlan(opts) {
  const plans = loadTownPlans(opts);
  if (!plans.length) return 0;

  // REQUIRED once a town plan exists: T1 is an assertion against the
  // Cartographer's geography, which is the authority on which towns exist.
  const towns = loadGeographyTowns(opts.contentRoot);
  if (!towns) return 0;

  const records = []; // { label, file, doc, roadQuads } for every valid plan naming a real town

  for (const { file: label, doc } of plans) {
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

    // T4 — no footprint overlaps a road's swept area, and no two footprints
    // overlap each other. Both halves are one rule because both describe the
    // same defect: authored mass sitting where the plan says there is passage.
    //
    // Strictly positive-area, via the same polyRectOverlap/rectsOverlap T5
    // uses. Touching is NOT overlapping, which is what lets T5 demand a
    // footprint ABUT the road it opens onto while T4 forbids it entering the
    // road — the two rules would contradict each other under a loose test.
    //
    // A road with no swept area (degenerate width or centreline) is absent from
    // `roadQuads` and so cannot be overlapped; T3 already FAILed its width and
    // T5 reports anything that opens onto it.
    for (const fp of doc.footprints) {
      for (const [roadId, quads] of roadQuads) {
        if (quads.some((q) => polyRectOverlap(q, fp.rect)))
          fail(`${label}: footprint "${fp.id}" overlaps the swept area of road "${roadId}"`);
      }
    }
    for (let i = 0; i < doc.footprints.length; i++) {
      for (let j = i + 1; j < doc.footprints.length; j++) {
        const a = doc.footprints[i];
        const b = doc.footprints[j];
        if (rectsOverlap(a.rect, b.rect))
          fail(`${label}: footprints "${a.id}" and "${b.id}" overlap`);
      }
    }

    // The walkable grid T6 and T7 both read. Built once per plan.
    //
    // A shape-only schema lets `extent` be zero or negative, which makes
    // walkableGrid throw. T2 has already FAILed that document, so swallow the
    // throw and skip the two rules rather than die with a stack trace on
    // authored content — there is no walkable area to measure either way.
    let grid = null;
    try {
      grid = walkableGrid(doc);
    } catch {
      /* degenerate extent — T2 owns the report; T6/T7 have nothing to measure */
    }

    if (grid) {
      const { count, labels, sizes } = floodFillRegions(grid);

      // T6 — THE LOAD-BEARING RULE. The walkable area must be exactly ONE
      // connected region. Two regions means a sealed courtyard or an island:
      // a place the plan draws as open ground that a body of player radius can
      // never actually reach. That is the failure this whole feature exists to
      // prevent, and it is invisible to the eye on a rendered map.
      //
      // Zero regions (every cell blocked) is caught by the same !== 1.
      if (count !== 1) {
        const detail = count === 0
          ? "no walkable cell at all"
          : `region sizes ${sizes.join(", ")} cells`;
        fail(`${label}: walkable area is ${count} disconnected regions (${detail}), must be exactly 1 — a sealed courtyard or an island is unreachable`);
      }

      // T7 — exactly ONE landmark is the firstSight, and it is reachable from
      // the town edge. `firstSight` is the thing a traveller sees on arrival,
      // so zero of them leaves the arrival undefined and two of them contradict
      // each other; neither count is a matter of taste.
      const firstSights = doc.landmarks.filter((l) => l.firstSight === true);
      if (firstSights.length !== 1)
        fail(`${label}: ${firstSights.length} landmarks are marked firstSight, must be exactly 1`);

      // Reachability is asked of every candidate, not just of a lone survivor:
      // a plan with two firstSights has two things to check, and reporting only
      // the count would hide an unreachable one behind the count FAIL.
      for (const lm of firstSights) {
        const idx = cellIndexAt(grid, lm.at);
        if (idx < 0) {
          fail(`${label}: firstSight landmark "${lm.id}" at [${lm.at.join(", ")}] lies outside the town extent`);
          continue;
        }
        if (!grid.walkable[idx]) {
          fail(`${label}: firstSight landmark "${lm.id}" at [${lm.at.join(", ")}] stands on blocked ground — no body of radius ${grid.playerRadius} fits there`);
          continue;
        }
        if (!townRegionTouchesEdge(grid, labels, labels[idx]))
          fail(`${label}: firstSight landmark "${lm.id}" at [${lm.at.join(", ")}] is not reachable from the town edge — it sits in a walkable region enclosed by footprints`);
      }
    }

    if (known) records.push({ label, doc, roadQuads });
  }

  // ===== SEAM: cross-file town rules, if any, go here =====================
  // checkZoneContent runs a second pass over `records` for its cross-file
  // rules (Z2 completeness, Z6 distinctiveness). T1–T7 are all intra-record,
  // so there is nothing here yet; `records` is built the same way so a later
  // cross-town rule has somewhere to live.
  // =======================================================================

  return records.length;
}

// F-041 Phase 5 — G-ALIAS (story half). Every content/story/regions.json
// record must name the spine node it stands on (spineId), the reference
// must resolve, and no two regions may claim the same node. Prints each
// record's resolved tier ("spine-alias: region-millcross → n-millcross
// (town)") so the story keyspace's tier contradiction is visible in gate
// output rather than in someone's memory (research §8 G-ALIAS). `report`
// is `warn` while region.schema.json keeps spineId optional, and `fail`
// once it is required — that flip is this phase's deliberate red.
// Self-contained: does its own loadSpine so it cannot depend on
// checkSpine's internals; a content root without spine/ (every story-test
// fixture) soft-skips, the same discipline checkSpine itself keeps. A
// schema-invalid record missing spineId reports here AND as a schema FAIL
// — uniform defense in depth, same as resolveStoryRefs states above.
function checkSpineStoryAlias({ opts, report }) {
  const spine = loadSpine({ contentRoot: opts.contentRoot });
  if (!spine.present) return; // no spine table in this content root
  const regionsPath = join(opts.contentRoot, "story", "regions.json");
  if (!existsSync(regionsPath)) return; // no story in this content root
  const before = failures.length;
  const doc = readJson(regionsPath, "spine-alias", fail);
  if (failures.length > before || !Array.isArray(doc)) return;
  const byId = new Map(spine.nodes.map((n) => [n.id, n]));
  const claimed = new Map(); // spineId -> region id (unique per node)
  for (const r of doc) {
    if (!r || typeof r.id !== "string") continue; // record shape is checkStory's business
    if (typeof r.spineId !== "string") {
      report(`spine-alias: story/regions.json#${r.id}: missing spineId`);
      continue;
    }
    const node = byId.get(r.spineId);
    if (!node) {
      report(`spine-alias: story/regions.json#${r.id}: spineId "${r.spineId}" does not resolve to a spine node`);
      continue;
    }
    if (claimed.has(r.spineId)) {
      report(`spine-alias: story/regions.json#${r.id}: spineId "${r.spineId}" already claimed by ${claimed.get(r.spineId)}`);
      continue;
    }
    claimed.set(r.spineId, r.id);
    console.log(`spine-alias: ${r.id} → ${r.spineId} (${node.tier})`);
  }
}

// F-041 Phase 5 — G-ALIAS (external-reference sweep). Spec: "G-ALIAS
// sweeps every external spatial reference … and prints each record's
// resolved tier." The story-regions half lives above; this function sweeps
// the other five sources. Resolution rules (documented HERE, nowhere else;
// enumerated against the real content on 2026-08-09):
//   1. content/zones/zone-*.json  — `spineId` is OPTIONAL (contract §1,
//      Task 3.3): absent is legal and swept over silently; present must
//      resolve to a spine node.
//   2. content/towns/town-*.json  — `spineId` REQUIRED since Phase 3; must
//      resolve. The sweep line prints HERE — G-TOWN-FRAME joins the
//      geometry but never prints the "<file> → <node> (<tier>)" line.
//   3. content/bestiary/bestiary.json[].region and placement-*.json `zone`
//      — bare slugs ("millcross", "thornveil", …); rule: `n-<slug>` must
//      be a spine node (any tier). bestiary.json prints one line per
//      DISTINCT slug with a row count, not one per mob row (116 rows,
//      9 distinct regions).
//   4. content/characters/*.md links.story `region-*` ids — two-step join:
//      the story regions record with that id, then its spineId. A region
//      record with a missing or dangling spineId reports here per
//      character file (defense in depth with the story half above).
//   5. art-manifest `art:town-<slug>` keys — rule: exactly one of
//      [n-<slug>, n-<slug>-town] with tier "town" wins; the "-town" suffix
//      is Phase 1's zone/town id-collision escape (art:town-cindervast →
//      n-cindervast-town, because n-cindervast is the tier-region zone).
// Same report-severity contract as checkSpineStoryAlias: `warn` in this
// task, `fail` after the Task 5.2 flip. Same soft-skip: a content root
// without spine/ (every pre-F-041 fixture) returns immediately.
function checkSpineExternalAliases({ opts, report }) {
  const spine = loadSpine({ contentRoot: opts.contentRoot });
  if (!spine.present) return;
  const byId = new Map(spine.nodes.map((n) => [n.id, n]));
  const say = (label, node) => console.log(`spine-alias: ${label} → ${node.id} (${node.tier})`);
  const slugNode = (slug) => byId.get(`n-${slug}`) ?? null;
  const townNode = (slug) =>
    [byId.get(`n-${slug}`), byId.get(`n-${slug}-town`)].find((n) => n && n.tier === "town") ?? null;

  // Plan A Task 9 (X4): the SECOND resolution path. The spine lookup above
  // stays PRIMARY — on today's content all 35 printed records resolve through
  // it, byte-identically, and nothing below ever runs. Plan E's 36-node trunk
  // moves the region and town tiers out of content/spine/nodes/ entirely; at
  // that point the resolved world document is the only place a zone or town
  // slug exists, and this path is what stops those references going red in the
  // redraw commit.
  //
  // DEVIATION FROM PLAN, deliberate, and it is the plan's own Step 7 remedy
  // taken up front. The plan spells this `const world = loadPlaces({...}).doc`
  // evaluated eagerly at the top of the sweep. Two measured reasons not to:
  //   (b)/(c) cost — loadPlaces() is a full spine load + tree build + join, and
  //       this function already did its own loadSpine(). Eager, it is a fourth
  //       resolve per gate run and a second spine parse inside this function
  //       alone. Routed through the memoised placesDoc() and called ONLY when a
  //       slug misses the spine, today's real content never resolves the world
  //       here at all: `--only=spine` measured 0.55/0.61/0.62 s before and
  //       0.56/0.55/0.62 s after, with both runs' stdout byte-identical —
  //       versus a resolve Gate 1 would pay on every run for a path that
  //       never fires.
  //   correctness — loadPlaces() REPORTS on a root it cannot resolve
  //       ("has neither a resolvable spine nor maps/cluster1-geography.json"),
  //       and placesDoc() turns every such problem into a FAIL. ~45 minimal
  //       spine fixtures have a spine and no mirror and no subjects descriptor;
  //       resolving eagerly would have handed every one of them a brand-new
  //       geography FAIL for a document the fixture never claimed to carry.
  //       Lazily, they never reach it, because none of their slugs miss.
  // The memo is placesDoc's, so a full run shares ONE resolve with the three
  // joins and one problem is reported once, not four times.
  //
  // Severity, reviewed and left as-is deliberately. placesDoc() routes the
  // world document's OWN problems through the module-level fail(), not through
  // this function's injected `report`. That asymmetry is the intended one:
  // `report` grades the severity of an ALIAS RECORD (is a dangling slug a warn
  // or a fail — the Phase 5 flip), while an unresolvable world document is
  // content corruption whose severity is not this sweep's to downgrade. The
  // three other joins that call placesDoc already hard-fail on it, so a full
  // run reports it as FAIL no matter what this caller asked for; making it
  // follow `report` would mean a `--only=spine` run alone could demote it. The
  // single call site passes fail (:1954), so nothing observes the difference
  // today either way.
  let resolvedWorldSets = null;
  const resolvedWorld = () => {
    if (!resolvedWorldSets) {
      const doc = placesDoc(opts.contentRoot);
      const ids = (rows) =>
        new Set((Array.isArray(rows) ? rows : []).map((r) => r?.id).filter((s) => typeof s === "string"));
      resolvedWorldSets = { zones: ids(doc?.zones), towns: ids(doc?.towns) };
    }
    return resolvedWorldSets;
  };
  const sayResolved = (label, slug, kind) => console.log(`spine-alias: ${label} → ${slug} (resolved-${kind})`);

  // Task 9 review finding, MAJOR, fixed here. The fallback must mirror the
  // PRIMARY lookup's tier-agnosticism or it does not deliver this task.
  // `slugNode` is `byId.get("n-"+slug)` — it accepts a node of ANY tier, and
  // on today's content 5 of the 9 bestiary region slugs (millcross, embervale,
  // gildmark, norhollow, rooktide — 48 of the 116 rows) resolve to TOWN-tier
  // nodes, not region-tier ones. The resolved world keeps the two tiers in
  // DISJOINT arrays (measured on content/: zones = meltwash-terrace,
  // millcross-ford, rooktide-reach, thornveil, emberdown, gildmark-head,
  // hollowmarch, ashvale-front, northern-icefield, cindervast; towns =
  // millcross, gildmark, embervale, norhollow, rooktide, cindervast — only
  // cindervast is in both). A zones-ONLY fallback therefore left those 48
  // references red in exactly the Plan E redraw this task exists to survive,
  // while printing `nor "millcross" (resolved world) exists` — a claim that is
  // factually false. Reproduced before the fix by renaming n-rooktide ->
  // n-rooktide-town (lore.geoId "rooktide", the Plan E shape): loadPlaces
  // resolved 0 problems with "rooktide" in towns, and the gate still printed
  // `FAIL spine-alias: bestiary.json region "rooktide": neither n-rooktide
  // (spine) nor "rooktide" (resolved world) exists`.
  // Zones are consulted FIRST so the printed kind names the narrower tier when
  // a slug is in both (cindervast today). The art:town-* site below stays
  // towns-ONLY on purpose: ITS primary (`townNode`) is tier-restricted too,
  // and widening it would let a zone satisfy a town key.
  const resolvedKind = (slug) => {
    const w = resolvedWorld();
    return w.zones.has(slug) ? "zone" : w.towns.has(slug) ? "town" : null;
  };

  // (1) zone content (spineId optional) + (2) town plans (spineId required)
  for (const [dir, required] of [["zones", false], ["towns", true]]) {
    const d = join(opts.contentRoot, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((n) => n.endsWith(".json")).sort()) {
      const before = failures.length;
      const doc = readJson(join(d, f), `spine-alias ${dir}/${f}`, fail);
      if (failures.length > before || !doc) continue;
      if (typeof doc.spineId !== "string") {
        if (required) report(`spine-alias: ${dir}/${f}: missing spineId`);
        continue;
      }
      const node = byId.get(doc.spineId);
      if (!node) {
        report(`spine-alias: ${dir}/${f}: spineId "${doc.spineId}" does not resolve to a spine node`);
        continue;
      }
      say(`${dir}/${f}`, node);
    }
  }

  // (3) bestiary regions (distinct, counted) + placement zones
  const bdir = join(opts.contentRoot, "bestiary");
  if (existsSync(bdir)) {
    const rows = readJson(join(bdir, "bestiary.json"), "spine-alias bestiary", () => {});
    if (Array.isArray(rows)) {
      const counts = new Map();
      for (const m of rows)
        if (m && typeof m.region === "string") counts.set(m.region, (counts.get(m.region) ?? 0) + 1);
      for (const [slug, n] of [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const node = slugNode(slug);
        if (node) { say(`bestiary.json region "${slug}" ×${n}`, node); continue; }
        const kind = resolvedKind(slug);
        if (kind) { sayResolved(`bestiary.json region "${slug}" ×${n}`, slug, kind); continue; }
        report(`spine-alias: bestiary.json region "${slug}": neither n-${slug} (spine) nor "${slug}" (resolved world) exists`);
      }
    }
    for (const f of readdirSync(bdir).filter((n) => n.startsWith("placement-") && n.endsWith(".json")).sort()) {
      const doc = readJson(join(bdir, f), `spine-alias bestiary/${f}`, fail);
      const slug = doc && typeof doc.zone === "string" ? doc.zone : null;
      if (!slug) continue;
      const node = slugNode(slug);
      if (node) { say(`bestiary/${f}`, node); continue; }
      const kind = resolvedKind(slug);
      if (kind) { sayResolved(`bestiary/${f}`, slug, kind); continue; }
      report(`spine-alias: bestiary/${f}: zone "${slug}": neither n-${slug} (spine) nor "${slug}" (resolved world) exists`);
    }
  }

  // (4) characters links.story region-* → story regions record → spineId
  const regionsPath = join(opts.contentRoot, "story", "regions.json");
  const regionRecords = existsSync(regionsPath) ? readJson(regionsPath, "spine-alias regions", () => {}) : null;
  const spineIdOfRegion = new Map(
    (Array.isArray(regionRecords) ? regionRecords : []).map((r) => [r?.id, r?.spineId]),
  );
  const charDir = join(opts.contentRoot, "characters");
  if (existsSync(charDir)) {
    for (const f of listContentFiles(charDir, "characters")) {
      const parsed = splitFrontmatter(readFileSync(join(charDir, f), "utf8").replace(/\r\n/g, "\n"), `characters/${f}`);
      const storyLinks = Array.isArray(parsed?.fm?.links?.story) ? parsed.fm.links.story : [];
      for (const sid of storyLinks.filter((s) => typeof s === "string" && s.startsWith("region-"))) {
        const spineId = spineIdOfRegion.get(sid);
        const node = typeof spineId === "string" ? byId.get(spineId) : null;
        if (!node) {
          report(`spine-alias: characters/${f}: links.story "${sid}" has no resolving spineId in story/regions.json`);
          continue;
        }
        say(`characters/${f} ${sid}`, node);
      }
    }
  }

  // (5) art:town-* manifest keys. Unlike (1)-(4), this reads opts.artManifest
  // — a path OUTSIDE opts.contentRoot that defaults to the REAL committed
  // art-manifest.json regardless of which content root is under test. That
  // default is only meaningful paired with the REAL content root (the six
  // real town ids it lists). Any other content root — every one of
  // spine-gates.test.mjs's ~45 minimal structural fixtures included — would
  // otherwise always FAIL this the moment report is `fail`, a false red
  // about content the fixture never claimed to carry. Soft-skip precisely
  // that false-positive pairing (default manifest + non-real content root);
  // an explicit `--art-manifest` override (the Task 5.2 HC-2 test) or the
  // real content root (production, and the Task 5.2 alias-copy fixtures,
  // which clone the full real content/ tree) still run the check. Found
  // while running Task 5.2's flip: pre-existing gate tests ("base spine
  // fixture is green", G-COMP-REPORT ×2, "P3 fixture scaffolding") went
  // newly red with no in-plan explanation.
  const usingDefaultArtManifest = opts.artManifest === join(ROOT, "game-client/assets/art/art-manifest.json");
  const contentRootIsRealTree = opts.contentRoot === join(ROOT, "content");
  if (!usingDefaultArtManifest || contentRootIsRealTree) {
    const artDoc = readJson(opts.artManifest, "spine-alias art-manifest", fail);
    for (const key of Object.keys(artDoc?.entries ?? {}).filter((k) => k.startsWith("art:town-")).sort()) {
      const slug = key.slice("art:town-".length);
      const node = townNode(slug);
      if (node) { say(`art-manifest ${key}`, node); continue; }
      if (resolvedWorld().towns.has(slug)) { sayResolved(`art-manifest ${key}`, slug, "town"); continue; }
      report(`spine-alias: art-manifest ${key}: neither a town-tier spine node n-${slug} / n-${slug}-town nor "${slug}" (resolved world) exists`);
    }
  }
}

// ═══════════════════════ SPINE (F-041 Phase 0) ══════════════════════════
// The tier-spine node table: content/spine/nodes/<id>.json, a flat table
// joined on parentId. Phase 0 wires the structural gates G-ID, G-PARENT,
// G-TREE, G-DEPTH, G-POLY, G-SEED, G-COMP-SUM. Geometry/derivation gates
// (G-CONTAIN, G-FRAME, …) land in Phase 1. Returns the valid-node count
// (finish() starts printing it in Phase 6).
function checkSpine(opts, mobTypes) {
  // Soft-skip BEFORE compiling the schema: a content root with no spine/ is
  // valid (mirrors the maps/ soft-skip) and must not record a spurious
  // "schema unreadable" failure — every pre-existing gate fixture depends on
  // this ordering.
  if (!existsSync(join(opts.contentRoot, "spine"))) return 0;

  const validate = compileSchema(join(opts.contentRoot, "schemas/spine-node.schema.json"), "spine-node schema", fail);
  if (!validate) return 0;

  const spine = loadSpine({ contentRoot: opts.contentRoot });
  for (const e of spine.errors) fail(`spine: ${e}`);

  // F-041 P3: the town plans, SCHEMA-VALIDATED (loadTownPlans owns the read,
  // the schema and the FAIL lines; memoised, so a full sweep shares one read
  // with checkTownPlan and `--only=spine` — which never runs checkTownPlan —
  // still validates before consuming). Loaded HERE, above gSpineFrames,
  // because G-FRAME's town arrow needs the plan: research §3.2 makes the plan
  // the authority on a town's interior.size/originInParent, and a gate that
  // reads plan: null can never object to a drifted plan extent.
  //
  // JOIN CAVEAT — the two join keys are UNLINKED today. A plan carries
  // `town` (joined to content/maps/cluster1-geography.json#towns by T1) and
  // `spineId` (joined to this node table by G-TOWN-FRAME). Nothing checks the
  // two name the SAME place: they agree only transitively, because
  // anchor.geographyAt is byte-identical to the geography town's `at` and to
  // the node's placement.anchor. Swap one plan's `spineId` for another town's
  // node id and both joins still resolve — G-TOWN-FRAME catches it only
  // because the anchors then disagree. G-ALIAS (Phase 5) is the gate that
  // makes the identity explicit; until it lands, do not treat plan.town and
  // plan.spineId as verified-equivalent handles on the same town.
  const townPlans = loadTownPlans(opts);

  const seenIds = new Map();   // G-ID: node ids AND feature ids, ONE case-sensitive namespace
  const seenSeeds = new Map(); // G-SEED: seed.value → first owner
  const validNodes = [];

  for (const node of spine.nodes) {
    const label = `spine/nodes/${node.file}`;
    if (!validate(node)) {
      for (const err of validate.errors) fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream gates assume a valid shape
    }
    validNodes.push(node);

    // G-ID — id === filename stem, keyspace regex, global uniqueness.
    const stem = node.file.replace(/\.json$/, "");
    if (node.id !== stem) fail(`G-ID: ${label}: id "${node.id}" !== filename stem "${stem}"`);
    if (!ID_RE.test(node.id)) fail(`G-ID: ${label}: id "${node.id}" does not match ^n-[a-z0-9]+(-[a-z0-9]+)*$`);
    if (seenIds.has(node.id)) fail(`G-ID: duplicate id "${node.id}" in ${label} (first seen in ${seenIds.get(node.id)})`);
    else seenIds.set(node.id, label);
    for (const f of node.features ?? []) {
      if (typeof f?.id !== "string") continue;
      if (seenIds.has(f.id)) fail(`G-ID: duplicate id "${f.id}" (feature in ${label}, first seen in ${seenIds.get(f.id)})`);
      else seenIds.set(f.id, label);
    }

    // G-PARENT (per-node half) — parentId null iff depth 0.
    const depth = TIER_DEPTH[node.tier];
    if ((node.parentId === null) !== (depth === 0))
      fail(`G-PARENT: ${node.id} (${node.tier}, depth ${depth}) has parentId ${JSON.stringify(node.parentId)} — parentId must be null iff depth 0`);

    // G-POLY — polygon rings: >= 3 points, OPEN ring, no repeated consecutive
    // point, strictly POSITIVE signed shoelace (abs() nowhere — a negative
    // area is a winding failure, not a magnitude), no self-intersection.
    if (node.placement?.shape === "polygon") {
      const pts = node.placement.points ?? [];
      if (pts.length < 3) fail(`G-POLY: ${node.id}: polygon has ${pts.length} points (need >= 3)`);
      else {
        const [fx, fy] = pts[0];
        const [lx, ly] = pts[pts.length - 1];
        if (fx === lx && fy === ly) fail(`G-POLY: ${node.id}: ring is closed (last point repeats first) — author OPEN rings`);
        for (let i = 1; i < pts.length; i++)
          if (pts[i][0] === pts[i - 1][0] && pts[i][1] === pts[i - 1][1])
            fail(`G-POLY: ${node.id}: repeated consecutive point at index ${i}`);
        const area = shoelaceArea({ points: pts });
        if (!(area > 0)) fail(`G-POLY: ${node.id}: signed shoelace area ${area} is not strictly positive — ring is wound backwards`);
        if (selfIntersects({ points: pts })) fail(`G-POLY: ${node.id}: polygon self-intersects`);
      }
    }

    // G-RING-SIMPLE — STRICT ring simplicity, once per placement, here in the
    // node sweep. Deliberately NOT folded into G-POLY: spine-gates.test.mjs
    // pins that the untriangulable-ring fixture produces no `G-POLY: n-r2`
    // line, because G-POLY's selfIntersects() tests PROPER crossings only and
    // that gap is precisely what this rule covers.
    //
    // Why a SEPARATE per-ring rule rather than the per-pair collector that
    // gSpineOverlapRollup already wires up: that collector sits at stage 3 of
    // exactIntersectionArea, reached only after a bbox overlap AND a failed
    // ringsDisjoint(). A node with no sibling, or with a sibling its ring
    // simply does not touch, was never examined — the gate printed nothing and
    // exited 0 on a ring the kernel refuses. Both hold today: an only-child
    // n-r with ring [[20,20],[80,20],[80,60],[50,20],[20,60]] passed clean,
    // and so did a non-meeting sibling pair. Detection was an accident of two
    // rings meeting, and correct tiling — the goal state of the world-fill
    // programme — makes that accident rarer. The pair-path collector stays as
    // a backstop; it costs nothing.
    //
    // The check is NOT hoisted into the pair loop, on purpose: any candidate
    // filter in front of that loop would then be able to swallow the report.
    if (node.placement?.shape === "polygon") {
      const ringProblem = ringStructureProblem({ points: node.placement.points ?? [] });
      if (ringProblem)
        fail(`G-RING-SIMPLE: ${node.id}: ${ringProblem} — ear clipping cannot triangulate it, so G-OVERLAP would silently report 0 or over-report a doubly-wound lobe`);
    }

    // G-RECT — a rect with a non-positive extent is the last placement shape
    // the two overlap kernels disagree about: {w:-10,h:-10} builds a
    // POSITIVELY wound ring over [-10,0]², so exactIntersectionArea reports a
    // real 25 where the grid sampler reports 0. Nothing else checks the sign —
    // the schema types w/h as bare `number` with no minimum.
    if (node.placement?.shape === "rect") {
      const r = node.placement.rect ?? {};
      if (!(r.w > 0 && r.h > 0))
        fail(`G-RECT: ${node.id}: rect extent w=${JSON.stringify(r.w)} h=${JSON.stringify(r.h)} — both must be strictly positive (a negative extent winds the ring the wrong way and the two area kernels disagree)`);
    }

    // G-SEED — literal 16-hex, globally unique (copy-paste node creation must
    // mint a fresh seed), integer epoch >= 0, why non-empty IFF epoch > 0.
    const seed = node.seed;
    if (!SEED_RE.test(seed.value)) fail(`G-SEED: ${node.id}: seed.value "${seed.value}" is not 16 lowercase hex chars`);
    else if (seenSeeds.has(seed.value)) fail(`G-SEED: duplicate seed.value "${seed.value}" on ${node.id} and ${seenSeeds.get(seed.value)} — two places would generate identically forever`);
    else seenSeeds.set(seed.value, node.id);
    if (!Number.isInteger(seed.epoch) || seed.epoch < 0)
      fail(`G-SEED: ${node.id}: seed.epoch ${JSON.stringify(seed.epoch)} must be an integer >= 0`);
    const hasWhy = typeof seed.why === "string" && seed.why.trim() !== "";
    if (seed.epoch > 0 && !hasWhy) fail(`G-SEED: ${node.id}: epoch ${seed.epoch} > 0 requires a non-empty seed.why`);
    if (seed.epoch === 0 && hasWhy) fail(`G-SEED: ${node.id}: seed.why must be null while epoch is 0 — it documents a reroll that never happened`);

    // G-COMP-SUM — sum 100 ± 0.5, keys ∈ BIOMES, no zero/negative values
    // (omit the key instead of writing 0, so diffs stay honest).
    let compSum = 0;
    for (const [b, v] of Object.entries(node.composition ?? {})) {
      if (!BIOMES.includes(b)) fail(`G-COMP-SUM: ${node.id}: composition key "${b}" is not a biome (${BIOMES.join(" ")})`);
      if (typeof v !== "number" || !(v > 0)) fail(`G-COMP-SUM: ${node.id}: composition.${b} = ${JSON.stringify(v)} — values must be numbers > 0 (omit the key instead of 0)`);
      else compSum += v;
    }
    if (Math.abs(compSum - 100) > 0.5) fail(`G-COMP-SUM: ${node.id}: composition sums to ${compSum} — must be 100 ± 0.5`);
  }

  // G-PARENT (table half) — every declared root must exist as a node …
  for (const r of spine.roots)
    if (!validNodes.some((n) => n.id === r)) fail(`G-PARENT: roots.json lists ${r} but no such node exists`);

  // … and buildTree reports the reverse (a depth-0 node roots.json omits),
  // plus dangling parents, cycles and orphan islands.
  const tree = buildTree({ nodes: validNodes, rootIds: spine.roots });
  for (const e of tree.errors) fail(e.startsWith("root ") ? `G-PARENT: ${e}` : `G-TREE: ${e}`);

  // G-DEPTH — child depth === parent depth + 1, the rule that kills
  // "region means three things" permanently.
  for (const n of validNodes) {
    if (n.parentId === null) continue;
    const parent = tree.byId.get(n.parentId);
    if (!parent) continue; // dangling — already a G-TREE failure
    if (!depthLegal({ parentTier: parent.tier, childTier: n.tier }))
      fail(`G-DEPTH: ${n.id} (${n.tier}, depth ${TIER_DEPTH[n.tier]}) under ${parent.id} (${parent.tier}, depth ${TIER_DEPTH[parent.tier]}) — child depth must be parent depth + 1`);
  }

  // F-041 Phase 1: G-CONTAIN + G-ANCHOR. Boundary-touching points count as
  // inside (tolerance 0.01 parent units) — the sheet's ice edge and south rim
  // put real vertices exactly on the continent outline. Mirrors checkTownPlan/
  // checkZoneContent's discipline: walk the SCHEMA-VALIDATED list, never the
  // raw loadSpine() one — a schema-invalid node already got its clean FAIL
  // line above and `continue`d out of validNodes; reaching into its missing
  // `placement` here would crash instead of reporting.
  gSpineGeometry({ nodes: validNodes, tree, fail });

  // F-041 Phase 1: G-FRAME, G-SCALE, G-DERIVED-DRIFT, G-PROVENANCE. Same
  // validNodes discipline as gSpineGeometry above. P3: `plans` activates
  // G-FRAME's reversed town arrow and G-DERIVED-DRIFT's rollupVerdict.
  gSpineFrames({ nodes: validNodes, tree, plans: townPlans, fail });

  // F-041 Phase 1 Task 1.8: G-FROZEN lands BEFORE G-NET/G-CANON-LEG — the
  // leg gate's both-endpoints-frozen dependency means nothing without it.
  // Same validNodes discipline; edges have no schema so spine.edges is
  // passed through as-is (nothing to filter against).
  gSpineFrozen({ nodes: validNodes, tree, fail });
  gSpineNet({ nodes: validNodes, edges: spine.edges, tree, fail });

  // F-041 Phase 1 Task 1.10: G-LOAD-BUDGET + G-COMP-REPORT. Both PRINT on
  // every run that reaches this point (spine/ present, schema compiles).
  gSpineBudgets({ spine, tree, plans: townPlans, contentRoot: opts.contentRoot, fail });

  // F-041 Phase 1 Task 1.11 reported this as WARN until the two authoring
  // debts (8 measured overlap pairs, the n-cluster1 union identity) were
  // paid off in Task 1.12. Task 1.13 flips `report` from `warn` to `fail` —
  // the world is disjoint now, so G-OVERLAP + G-COMP-ROLLUP are enforced.
  gSpineOverlapRollup({ tree, report: fail });

  // F-043 Task 4: G-ATLAS-ROLLUP — every world-tier root that has claimed
  // its water (interstitialUnsurveyed false) must roll up CHECKED and
  // within ±2 pp of its committed composition on every committed biome.
  // Fixed ±2pp, independent of compositionTolerance — tighter than
  // G-COMP-ROLLUP's per-node tolerance (default 3.0, ceiling 5.0) above,
  // by design: this is the world-level pin, not the general per-node rule.
  // The interstitialUnsurveyed guard means the rule self-activates the
  // moment a world root claims its water — dormant (never reported) until
  // then, so it never breaks mid-branch on a not-yet-surveyed world.
  for (const node of validNodes) {
    if (node.tier !== "world" || node.interstitialUnsurveyed || !tree.depthOf.has(node.id)) continue;
    const d = deriveNode({ tree, id: node.id, plans: townPlans });
    if (d.rollupVerdict !== "CHECKED")
      fail(`G-ATLAS-ROLLUP: ${node.id}: rollupVerdict ${d.rollupVerdict} — world coverage must reach CHECKED (>= 60% claimed)`);
    for (const [b, v] of Object.entries(node.composition ?? {})) {
      const got = d.computedComposition[b] ?? 0;
      if (Math.abs(got - v) > 2)
        fail(`G-ATLAS-ROLLUP: ${node.id}: ${b} rolls up to ${got.toFixed(2)} vs committed ${v} (tolerance ±2 pp)`);
    }
  }

  // ── F-041 P3: town plans join the spine on plan.spineId (G-TOWN-FRAME) ──
  // `townPlans` is the schema-VALID list loaded at the top of this function —
  // a plan missing footprints[0].rect earns its own clean schema FAIL there
  // and never reaches townCompErrors' normRect (which would TypeError, skip
  // finish(), and swallow every FAIL recorded before it).
  for (const e of townFrameErrors({ tree, plans: townPlans })) fail(`G-TOWN-FRAME: ${e}`);
  for (const e of townCompErrors({ tree, plans: townPlans })) fail(`G-TOWN-COMP: ${e}`);
  // validNodes, not spine.nodes: a schema-invalid node already earned its
  // clean FAIL above, and reporting a fabricated G-TERRAINKIND line on top of
  // it (composition is missing, so every implied biome reads 0%) is noise
  // about a defect the author cannot act on. Same discipline as every gate
  // above — one identifier, one list.
  for (const e of terrainKindErrors({ nodes: validNodes })) fail(`G-TERRAINKIND: ${e}`);

  // F-041 P4 — G-RUNTIME (HC-5: mapIds is string[], never a scalar).
  // Live-map resolution only when the tree actually carries runtime map
  // nodes — minimal fixture roots (Phase 1/3, runtime.mapIds: [] everywhere)
  // must stay green (conflict note #5).
  const hasMapNodes = [...tree.byId.values()].some(
    (n) => Array.isArray(n.runtime?.mapIds) && n.runtime.mapIds.length > 0,
  );
  for (const e of checkRuntime({
    tree,
    mobTypes,
    liveMapIds: hasMapNodes ? LIVE_MAP_IDS : [],
  }).errors) fail(e);

  // F-041 P4 — G-SPAWN-FIT: the first geometric check these rects have ever had
  for (const e of checkSpawnFit({ tree }).errors) fail(e);

  // F-041 P4 — G-SPAWN-ID-STABLE: pin against the committed union of both
  // worlds' spawn ids (8 LEGACY_UNPAIRED + 3 F-031). Reads the runtime
  // artifact; never writes it (HC-1). Soft-skip when the content root has
  // no frozen file — Phase 1/3 minimal fixture roots don't carry the pin
  // (conflict note #5); the real root and the Phase-4 overlay fixtures do.
  const frozenPath = join(opts.contentRoot, "spine/frozen-spawn-ids.json");
  if (existsSync(frozenPath)) {
    const frozenIds = readJson(frozenPath, "frozen-spawn-ids", fail) ?? [];
    const spawnDocForSpine = readJson(opts.spawnAreas, "spawn-areas(spine)", fail);
    const runtimeIds = Array.isArray(spawnDocForSpine?.areas) ? spawnDocForSpine.areas.map((a) => a.id) : [];
    for (const e of checkSpawnIdStable({ tree, frozenIds, runtimeIds }).errors) fail(e);
  }

  // F-041 P4 — G-ALIAS (playspace half): map region ids and representsNodeId
  // resolve, tiers printed. Soft-skip when the map mirror is absent — fixture
  // content roots without maps/ must not fail.
  const frontierPath = join(opts.contentRoot, "maps/atlas-frontier.md");
  if (existsSync(frontierPath)) {
    const raw = readFileSync(frontierPath, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const fm = fmMatch ? yaml.load(fmMatch[1]) : null;
    const regionIds = [
      ...(fm?.regions ?? []).map((r) => r.id),
      ...(fm?.zoneHazards ?? []).map((h) => h.regionId),
      ...(fm?.mobSpawnAreas ?? []).map((a) => a.regionId),
      ...(fm?.links ?? []),
    ].filter(Boolean);
    const alias = checkPlayspaceAliases({ tree, regionIds });
    for (const e of alias.errors) fail(e);
    for (const l of alias.lines) console.log(l);
  }

  // F-041 P4 — G-SPINE-COMPLETE (both trees; escalates only under the flag)
  const complete = checkSpineComplete({ tree });
  for (const w of complete.warns) warn(w);
  if (opts.requireComplete) for (const e of complete.errors) fail(e);
  else for (const e of complete.errors) warn(e);

  // F-041 P4 Task 4.9 — informational authored-vs-runtime geometry report
  // (never FAIL). console.log only, no fail(), no warn(); degrades
  // gracefully if the server file is unreadable.
  try {
    const mcSource = readFileSync(join(ROOT, "colyseus-server/src/config/mapConfig.ts"), "utf8");
    const { rects } = parseRuntimeSpawnRects({ source: mcSource });
    const { areas } = flattenSpawnAreas({ tree });
    for (const line of spawnGeometryReportLines({ areas, runtimeRects: rects })) console.log(line);
  } catch {
    console.log("spawn-geometry: mapConfig.ts unreadable — report skipped (informational only)");
  }

  checkSpineStoryAlias({ opts, report: fail }); // flipped from `warn` — Phase 5 deliberate red
  checkSpineExternalAliases({ opts, report: fail }); // flipped from `warn` — Phase 5 deliberate red

  return validNodes.length;
}

const CONTAIN_TOL = 0.01;
function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function ringOf(placement) {
  if (placement.shape === "polygon") return placement.points;
  if (placement.shape === "rect") {
    const { x, y, w, h } = placement.rect;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  return null; // point
}
function insideWithTol(pt, ring) {
  if (pointInPolygon({ point: pt, points: ring })) return true;
  for (let i = 0; i < ring.length; i++)
    if (distToSegment(pt, ring[i], ring[(i + 1) % ring.length]) <= CONTAIN_TOL) return true;
  return false;
}
function gSpineGeometry({ nodes, tree, fail }) {
  for (const node of nodes) {
    const ring = ringOf(node.placement);
    // G-ANCHOR: anchor present, inside own placement.
    const a = node.placement.anchor;
    if (!Array.isArray(a) || a.length !== 2)
      fail(`spine: G-ANCHOR ${node.id}: placement.anchor missing`);
    else if (node.placement.shape === "point") {
      if (a[0] !== node.placement.at[0] || a[1] !== node.placement.at[1])
        fail(`spine: G-ANCHOR ${node.id}: point anchor must equal at`);
    } else if (!insideWithTol(a, ring))
      fail(`spine: G-ANCHOR ${node.id}: anchor [${a.join(", ")}] outside placement`);
    // G-CONTAIN: child vertices + edge midpoints inside parent placement.
    // Frame rule: a per=1 child placement continues the parent grid, so its
    // points compare against the parent ring directly — no rebasing.
    if (node.parentId) {
      const parent = tree.byId.get(node.parentId);
      const pRing = parent && ringOf(parent.placement);
      if (pRing) {
        const pts = node.placement.shape === "point" ? [node.placement.at] : ringOf(node.placement);
        const samples = [...pts];
        if (pts.length > 1)
          for (let i = 0; i < pts.length; i++) {
            const q = pts[(i + 1) % pts.length];
            samples.push([(pts[i][0] + q[0]) / 2, (pts[i][1] + q[1]) / 2]);
          }
        for (const pt of samples)
          if (!insideWithTol(pt, pRing)) {
            fail(`spine: G-CONTAIN ${node.id}: placement point [${pt.join(", ")}] outside parent ${parent.id}`);
            break;
          }
      }
    }
    // G-CONTAIN, feature half: features drawn inside this node's own placement.
    // Frame rule: at perParentUnit === 1 a node's interior CONTINUES the parent
    // grid, so feature coordinates are already parent-frame — identity. The
    // rebased mapping (originInParent + p / per) applies only across a scale
    // boundary (per ≠ 1; none exist until Phase 4).
    for (const f of node.features ?? []) {
      if (f.offSheet || !ring) continue;
      const local = f.kind === "point" ? [f.at] : f.points;
      // `interior` is schema-optional (spine-node.schema.json: {"type":"object"},
      // no required sub-fields) — a node authored without it but WITH features
      // must still get a clean skip here, not a TypeError.
      if (!node.interior) continue;
      const per = node.interior.perParentUnit, o = node.interior.originInParent;
      for (const p of local) {
        const inParentFrame = per === 1 ? p : [o[0] + p[0] / per, o[1] + p[1] / per];
        if (!insideWithTol(inParentFrame, ring)) {
          fail(`spine: G-CONTAIN ${node.id}: feature ${f.id} point [${p.join(", ")}] outside placement`);
          break;
        }
      }
    }
  }
}

// F-041 Phase 1: G-FRAME, G-SCALE, G-DERIVED-DRIFT, G-PROVENANCE. Walks the
// SCHEMA-VALIDATED node list (validNodes), never raw spine.nodes — the
// same discipline gSpineGeometry follows above, and the fix Task 1.6
// established for this exact class of bug.
//
// Two guards beyond a literal transcription of the brief, both required to
// avoid crashing/hanging the PRE-EXISTING Phase-0 structural-gate fixtures
// (g-id-duplicate-id, g-tree-cycle, etc.), whose nodes predate F-041 and
// carry no `interior`/`provenance`/`derived` at all:
//   - `interior`/`provenance` are schema-OPTIONAL — bare `node.interior.x`
//     would TypeError on those fixtures; guarded with `if (node.interior)`
//     / `if (p)` instead.
//   - G-DERIVED-DRIFT's deriveNode() resolves absoluteAnchorRoot via
//     composeToRoot(), which walks the FULL ancestor chain to root and
//     LOOPS FOREVER on a cyclic parentId chain (g-tree-cycle fixture) —
//     already a G-TREE failure on its own. Guarded on tree.depthOf.has(id):
//     only nodes BFS-reached from a root (i.e. acyclic) are safe to
//     recompute — mirrors check_spine_emit.mjs's own bail-before-derive on
//     tree.errors.
function gSpineFrames({ nodes, tree, plans, fail }) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // The reversed town arrow divides and subtracts authored decimals, so a
  // CORRECT 220 comes back as 220.00000000000003 — JSON.stringify equality is
  // the wrong comparator for it. Only the town arrow gets the tolerance; the
  // bbox arrow stays byte-exact, because the derive-writer produces those
  // bytes and G-DERIVED-DRIFT byte-compares them.
  const near = (a, b) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) <= FRAME_EPS);
  for (const node of nodes) {
    // G-FRAME: interior.size/originInParent derived from bbox(placement) —
    // EXCEPT a town with a spineId-linked plan, where research §3.2 reverses
    // the arrow and the PLAN is the authority (size = plan.extent). With
    // plan: null this branch was unreachable and a drifted plan extent
    // changed nothing; the join is live now.
    if (node.interior) {
      const d = deriveInterior({ node, plan: planForNode({ plans, id: node.id }) });
      const same = d.from === "plan" ? near : eq;
      if (!same(node.interior.originInParent, d.originInParent))
        fail(`spine: G-FRAME ${node.id}: interior.originInParent [${node.interior.originInParent.join(", ")}] != derived [${d.originInParent.join(", ")}]`);
      if (!same(node.interior.size, d.size))
        fail(`spine: G-FRAME ${node.id}: interior.size [${node.interior.size.join(", ")}] != derived [${d.size.join(", ")}] (${d.from === "plan" ? "the town plan's extent is the authority — research §3.2" : "bbox(placement) × perParentUnit"})`);
      // G-SCALE: units differ from parent ⇒ perParentUnit ≠ 1, drawn from the
      // pinned constant. NO area identity — HC-3.
      if (node.parentId) {
        const parent = tree.byId.get(node.parentId);
        if (parent && parent.interior && node.interior.units !== parent.interior.units) {
          if (node.interior.perParentUnit === 1)
            fail(`spine: G-SCALE ${node.id}: units ${node.interior.units} under ${parent.interior.units} parent but perParentUnit 1`);
          else if (node.interior.perParentUnit !== KM_TO_U)
            fail(`spine: G-SCALE ${node.id}: perParentUnit ${node.interior.perParentUnit} is not the pinned km→u constant ${KM_TO_U}`);
        }
      }
    }
    // G-DERIVED-DRIFT: recomputation reproduces the committed block.
    if (tree.depthOf.has(node.id) && !eq(node.derived, deriveNode({ tree, id: node.id, plans })))
      fail(`spine: G-DERIVED-DRIFT ${node.id}: committed derived block does not match recomputation`);
    // G-PROVENANCE: generated ⇒ pinned generator. (Reproduce-check activates
    // with the first real generator; none exists in 1.8.)
    const p = node.provenance;
    if (p && p.authored === "generated" && (!p.generator || typeof p.generator.name !== "string" || typeof p.generator.version !== "string"))
      fail(`spine: G-PROVENANCE ${node.id}: authored "generated" requires generator {name, version}`);
  }
}

// F-041 Phase 1 Task 1.8: G-FROZEN — transitive freeze + byte-checked
// absoluteAnchor. A node's composed anchor is its placement.anchor (which
// lives in the PARENT's interior frame — same frame-continuation rule
// gSpineGeometry's G-CONTAIN relies on) resolved up through the parent's own
// chain to root; a root's composed anchor is its own anchor (no parent frame
// to resolve through).
function composedAnchor({ tree, node }) {
  return node.parentId === null
    ? node.placement.anchor
    : resolveToRoot({ tree, id: node.parentId, point: node.placement.anchor });
}
// Walks the SCHEMA-VALIDATED node list (validNodes), same discipline as
// gSpineGeometry/gSpineFrames. composedAnchor() resolves through
// composeToRoot(), which — like deriveNode()'s composeToRoot call in
// gSpineFrames — has no cycle detection and LOOPS FOREVER on a cyclic
// parentId chain. Guarded the same way Task 1.7 established: only nodes
// BFS-reached from a root (tree.depthOf.has(id)) are safe to recompute; a
// cyclic/orphan island already carries its own G-TREE failure.
function gSpineFrozen({ nodes, tree, fail }) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const node of nodes) {
    if (!node.frozen) {
      if (node.absoluteAnchor !== undefined)
        fail(`spine: G-FROZEN ${node.id}: absoluteAnchor on an unfrozen node`);
      continue;
    }
    if (node.parentId) {
      const parent = tree.byId.get(node.parentId);
      if (parent && !parent.frozen) fail(`spine: G-FROZEN ${node.id}: frozen but ancestor ${parent.id} is not`);
    }
    if (node.absoluteAnchor === undefined) {
      fail(`spine: G-FROZEN ${node.id}: frozen without absoluteAnchor`);
      continue;
    }
    if (!tree.depthOf.has(node.id)) continue; // cyclic/orphan — already a G-TREE failure, don't hang
    const composed = composedAnchor({ tree, node });
    if (!eq(node.absoluteAnchor, composed))
      fail(`spine: G-FROZEN ${node.id}: absoluteAnchor [${node.absoluteAnchor.join(", ")}] != composed [${composed.join(", ")}]`);
  }
}

// F-041 Phase 1 Task 1.8: G-NET (endpoint resolution + road-end proximity)
// and G-CANON-LEG (±8% straight-line + frozen endpoints + relay hop ≤ 10).
// `edges` is spine.edges — edges have no schema to validate against, unlike
// nodes, so there is no "validEdges" list to filter through.
function gSpineNet({ nodes, edges, tree, fail }) {
  const featOwner = new Map(); // feature id -> owning node
  for (const n of nodes) for (const f of n.features ?? []) featOwner.set(f.id, n);
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  if (edgeById.size !== edges.length) fail(`spine: G-NET duplicate edge ids`);
  const rootPoint = (ref, label) => {
    if (ref.node) {
      const n = tree.byId.get(ref.node);
      if (!n) { fail(`spine: G-NET ${label}: endpoint node "${ref.node}" does not resolve`); return null; }
      if (!tree.depthOf.has(n.id)) return null; // cyclic/orphan — already a G-TREE failure
      return composedAnchor({ tree, node: n });
    }
    if (ref.feature) {
      const owner = featOwner.get(ref.feature);
      if (!owner) { fail(`spine: G-NET ${label}: endpoint feature "${ref.feature}" does not resolve`); return null; }
      const f = owner.features.find((x) => x.id === ref.feature);
      if (f.offSheet) return "offsheet";
      if (!tree.depthOf.has(owner.id)) return null; // cyclic/orphan — already a G-TREE failure
      return resolveToRoot({ tree, id: owner.id, point: f.at ?? f.points[0] });
    }
    if (ref.edge !== undefined) {
      const target = edgeById.get(ref.edge);
      if (!target) { fail(`spine: G-NET ${label}: endpoint edge "${ref.edge}" does not resolve`); return null; }
      if (!Number.isInteger(ref.atIndex) || !target.points?.[ref.atIndex])
        fail(`spine: G-NET ${label}: atIndex ${ref.atIndex} out of range on ${ref.edge}`);
      return "edge-ref"; // proximity rule skipped by contract
    }
    fail(`spine: G-NET ${label}: endpoint is not {node}|{feature}|{edge, atIndex}`);
    return null;
  };
  for (const e of edges) {
    const ends = [rootPoint(e.from, e.id), rootPoint(e.to, e.id)];
    for (const v of e.via ?? []) rootPoint(v, e.id);
    if (e.kind === "road" && e.points?.length) {
      // Edge points are authored in sheet km == root km under the per=1
      // identity frame rule; road ends must sit within 1 root unit.
      const tips = [e.points[0], e.points[e.points.length - 1]];
      ends.forEach((end, i) => {
        if (!Array.isArray(end)) return; // unresolved / offsheet / edge-ref
        const d = Math.hypot(tips[i][0] - end[0], tips[i][1] - end[1]);
        if (d > 1) fail(`spine: G-NET ${e.id}: road end [${tips[i].join(", ")}] is ${d.toFixed(2)} from its endpoint anchor`);
      });
    }
    if (e.kind === "leg") {
      for (const ref of [e.from, e.to]) {
        const n = ref.node && tree.byId.get(ref.node);
        if (n && !n.frozen) fail(`spine: G-CANON-LEG ${e.id}: endpoint ${n.id} is not frozen`);
      }
      if (Array.isArray(ends[0]) && Array.isArray(ends[1])) {
        const d = Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]);
        const s = e.attrs.straightKm;
        if (Math.abs(d - s) / s > 0.08)
          fail(`spine: G-CANON-LEG ${e.id}: straight-line ${d.toFixed(1)} vs straightKm ${s} breaks ±8%`);
      }
    }
    if (e.kind === "relay") {
      // F-045 Task 2 (spec §2.2): relay sight-line 10km -> 2km, ÷5 with the
      // world (S=0.2). The old 10km bound was already lenient pre-rescale
      // and became meaningless once the world shrank (hops fell to
      // ~1.6-1.7km and trivially passed); this keeps the gate meaningful
      // at the new 400x400 scale.
      const RELAY_HOP_MAX_KM = 2;
      const chain = [e.from, ...(e.via ?? []), e.to].map((r) => rootPoint(r, e.id));
      for (let i = 1; i < chain.length; i++) {
        if (!Array.isArray(chain[i - 1]) || !Array.isArray(chain[i])) continue;
        const hop = Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]);
        if (hop > RELAY_HOP_MAX_KM) fail(`spine: G-CANON-LEG ${e.id}: relay hop ${i} is ${hop.toFixed(1)} km > ${RELAY_HOP_MAX_KM}`);
      }
    }
  }
}

// F-041 Phase 1 Task 1.10: G-LOAD-BUDGET + G-COMP-REPORT. Both PRINT on
// every run; the budgets in content/spine/*.json are the committed caps —
// raising one is a reviewed commit, never a code change.
//
// Two deliberate departures from a literal transcription of the brief:
//   - the per-node coverage-report loop walks `tree.byId.values()` (the
//     schema-VALID node set the tree was built from), never raw
//     `spine.nodes` — the same validNodes discipline gSpineGeometry/
//     gSpineFrames/gSpineFrozen/gSpineNet already follow. A schema-invalid
//     node (e.g. the G-SCHEMA-MISSING-PLACEMENT fixture) already earned its
//     clean FAIL and `continue`d out of validNodes; rollupComposition()
//     reads `node.placement` unconditionally and would crash on it.
//   - `spine.budgets.load` / `.coverage` are schema-optional (loadSpine:
//     "a MISSING budget file is null-not-error here — G-LOAD-BUDGET owns
//     failing on it"). The Phase-0 structural-gate fixtures
//     (g-id-duplicate-id, g-tree-cycle, etc.) ship no budget files at all,
//     so destructuring `spine.budgets.load` unguarded would throw and
//     swallow every FAIL those tests assert on (finish() never runs to
//     print them). A missing budget file is its own clean FAIL instead.
function gSpineBudgets({ spine, tree, plans, contentRoot, fail }) {
  const dir = join(contentRoot, "spine");
  let bytes = 0;
  (function walkDir(d) {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walkDir(join(d, f.name));
      else if (f.name.endsWith(".json")) bytes += statSync(join(d, f.name)).size;
    }
  })(dir);

  // Plan A Task 4: three terms, not one. A global node count is the wrong
  // proxy — 96 nodes with <= 3 siblings each cost ~30 pairs; 48 nodes all
  // under ONE parent cost 1,128 while passing maxNodes: 48. The quadratic
  // term is Σ_parents C(children, 2), and after Task 2 the per-pair constant
  // is dominated by ring vertex count. All three PRINT on every run, the
  // G-COMP-REPORT discipline, so drift is visible before it is a failure.
  // Walks tree.byId.values() (the schema-VALID set), never raw spine.nodes —
  // the same discipline the rest of this function follows.
  let maxKids = 0, maxRing = 0;
  for (const node of tree.byId.values()) {
    const kids = (tree.childrenOf.get(node.id) ?? []).length;
    if (kids > maxKids) maxKids = kids;
    const v = ringVertexCount({ placement: node.placement });
    if (v > maxRing) maxRing = v;
  }

  if (!spine.budgets.load) {
    fail(`spine: G-LOAD-BUDGET: spine/load-budget.json is missing`);
  } else {
    const { maxNodes, maxBytes, maxChildrenPerParent, maxRingPoints } = spine.budgets.load;
    // Review fix: the report line runs BEFORE the typeof guards below, so a
    // budget file missing a term used to print the literal `undefined` in the
    // one artifact an operator reads. A missing term reports as `n/a`; a
    // present term is unchanged, which is what the three regexes pin.
    const shown = (t) => (typeof t === "number" ? t : "n/a");
    console.log(`spine-load: ${spine.nodes.length} nodes, ${bytes} bytes, max children ${maxKids}/${shown(maxChildrenPerParent)}, max ring ${maxRing}/${shown(maxRingPoints)} (budget ${shown(maxNodes)} nodes, ${shown(maxBytes)} bytes)`);
    if (spine.nodes.length > maxNodes) fail(`spine: G-LOAD-BUDGET: ${spine.nodes.length} nodes > budget ${maxNodes}`);
    if (bytes > maxBytes) fail(`spine: G-LOAD-BUDGET: ${bytes} bytes > budget ${maxBytes}`);
    // The two new terms. A MISSING term is not a silent pass: an old budget
    // file that predates this task would otherwise disable both governors
    // exactly when a redraw needs them most.
    //
    // Message-prefix divergence, recorded as a DECISION rather than left to
    // look like an accident: the file-level failures above carry the `spine: `
    // prefix, the two PER-NODE failures below deliberately do not. The plan's
    // Task 4 Interfaces block gives those two strings verbatim without it and
    // later plans assert on them character-for-character, so the prefix stays
    // off. Nothing greps the prefix (`grep -rn 'spine: G-' scripts/*.sh
    // .github/workflows/*.yml` -> no matches), so this is log-shape only.
    if (typeof maxChildrenPerParent !== "number")
      fail(`spine: G-LOAD-BUDGET: spine/load-budget.json has no maxChildrenPerParent`);
    else
      for (const node of tree.byId.values()) {
        const kids = (tree.childrenOf.get(node.id) ?? []).length;
        if (kids > maxChildrenPerParent)
          fail(`G-LOAD-BUDGET: ${node.id} has ${kids} children > budget ${maxChildrenPerParent} — the pairwise overlap check is quadratic in siblings (${(kids * (kids - 1)) / 2} pairs); introduce an intermediate node rather than raising the cap`);
      }
    if (typeof maxRingPoints !== "number")
      fail(`spine: G-LOAD-BUDGET: spine/load-budget.json has no maxRingPoints`);
    else
      for (const node of tree.byId.values()) {
        const cap = Math.min(maxRingPoints, VERTEX_CAP[node.tier] ?? maxRingPoints);
        const v = ringVertexCount({ placement: node.placement });
        if (v > cap)
          fail(`G-VERTEX-BUDGET: ${node.id} ring has ${v} vertices > ${cap} for tier ${node.tier}`);
      }
  }

  const totals = { CHECKED: 0, ASSERTED: 0, UNCHECKED: 0 };
  for (const node of tree.byId.values()) {
    const r = rollupComposition({ tree, id: node.id, plans });
    totals[r.verdict]++;
    console.log(`spine-comp: ${node.id} coverage=${r.coveragePct.toFixed(1)}% verdict=${r.verdict}`);
  }
  console.log(`spine-comp: totals CHECKED=${totals.CHECKED} ASSERTED=${totals.ASSERTED} UNCHECKED=${totals.UNCHECKED}`);

  if (!spine.budgets.coverage)
    fail(`spine: G-COMP-REPORT: spine/coverage-budget.json is missing`);
  else if (totals.UNCHECKED > spine.budgets.coverage.maxUnchecked)
    fail(`spine: G-COMP-REPORT: ${totals.UNCHECKED} UNCHECKED nodes > budget ${spine.budgets.coverage.maxUnchecked}`);
}

// F-041 Phase 1: G-OVERLAP + G-COMP-ROLLUP. `report` is warn until the two
// authoring debts are paid (Task 1.12), then flipped to fail (Task 1.13) —
// that flip changes only the argument at the call site above, not this body.
//
// One deliberate departure from a literal transcription of the brief: walks
// `tree.byId.values()` (the schema-VALID node set the tree was built from),
// never raw `spine.nodes` — the same validNodes discipline gSpineGeometry/
// gSpineFrames/gSpineFrozen/gSpineNet/gSpineBudgets already follow. A
// schema-invalid node has no entry in `tree.byId`, so treating it as
// `parent` here (`parent.interior.units`, `rollupComposition({ tree, id })`
// which does `tree.byId.get(id).placement`) would throw on `undefined`
// instead of reporting — and an uncaught throw skips `finish()`, silently
// dropping every FAIL recorded before it. `spine` is dropped from the
// signature since nothing else in this function needs it. `parent.interior`
// is also read optionally (`?.`) — schema doesn't require it — mirroring
// gSpineFrames' `if (node.interior)` guard, even though every committed
// node ships one today.
function gSpineOverlapRollup({ tree, report }) {
  // Plan A Task 2 review fix (MAJOR). exactIntersectionArea returns 0 both for
  // "genuinely disjoint" and for "this ring could not be triangulated", and
  // only the injected `problems` collector separates the two
  // (lib/geometry.mjs:340-346). G-POLY does NOT close that gap: it rejects
  // PROPER self-crossing only (via selfIntersects/properCross), so a ring that
  // self-TOUCHES — a vertex sitting on a non-adjacent edge — passes G-POLY
  // clean while the kernel refuses it. The retired lattice sampler needed no
  // triangulation and reported such a ring loudly; without this collector the
  // swap would turn that loud FAIL into a silent pass. Reproduced:
  // R = [[10,8],[8,4],[2,7],[1,0],[8,4],[9,7]] vs the square [1,0][6,0][6,8][1,8]
  // — G-POLY green (shoelace +21.5, selfIntersects false), grid 20.75, exact 0.
  // Reported once per node id, not once per sibling pair.
  const untriangulable = new Set();
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    // Plan A Task 3 review fix (MAJOR): the bbox bucket index this task wired
    // in here is UNWIRED again, and the plain i<j walk restored. It is not a
    // style preference, it is a measurement. buildBBoxIndex's confirmation
    // predicate (lib/geometry.mjs) and exactIntersectionArea's stage-1 bbox
    // reject differ only on ZERO-EXTENT boxes, which no spine placement has —
    // so on real data "the index skipped it" and "stage 1 would have returned
    // 0" are the same set, measured: 133 pairs, 105 index-skips, 105 stage-1
    // rejects, 0 disagreements. The index therefore cannot save a single
    // ringsDisjoint or triangulation call that stage 1 does not already save
    // for free; it only replaces an inline comparison with a bucket build, a
    // Map lookup and a Set allocation, and leaves exactIntersectionArea
    // recomputing both bboxes anyway. Benchmarked here over the real 6 parents
    // / 133 pairs (500 runs x 6 alternating trials, 50 warmup rounds): plain
    // 0.3848 ms/run vs indexed 0.4768 ms/run — 1.239x SLOWER, sums
    // bit-identical (0.11905015776303106), 105 of 133 pairs index-skipped.
    //
    // CORRECTION to an earlier revision of this comment, which justified the
    // unwiring with "maxChildrenPerParent is 24, so this loop can never exceed
    // 276 pairs and the index can never pay". That clause is measurably FALSE
    // and it is false in the direction that would mislead Plans C/D, which
    // inherit this library. Re-measured here (median of 7 alternating trials,
    // ring vertices quantised to 0.01 like committed content, sums equal in
    // every row):
    //
    //   24 children, 160-pt rings, DISJOINT : plain 1.147 ms  indexed 0.106 ms  10.77x FASTER indexed
    //   24 children,  40-pt rings, DISJOINT : plain 0.285 ms  indexed 0.055 ms   5.17x FASTER indexed
    //   16 children,   8-pt rings, DISJOINT : plain 0.026 ms  indexed 0.021 ms   1.22x FASTER indexed
    //   12 children,   8-pt rings, DISJOINT : plain 0.015 ms  indexed 0.020 ms   0.74x — index LOSES
    //   24 children, 160-pt rings, NESTED   : plain 994.9 ms  indexed 980.4 ms   1.01x — a wash
    //   24 children,  40-pt rings, NESTED   : plain 70.05 ms  indexed 71.28 ms   0.98x — index LOSES
    //
    // The governing variable is DISJOINTNESS, not n: the index pays iff most
    // children are disjoint, because then most pairs can be skipped; when
    // every child is nested inside its neighbours nothing is skippable and the
    // bucket build is pure overhead. A threshold on n would be a threshold on
    // the wrong variable. Today's spine loses because its largest group
    // (n-cluster1, 12 children, ~8-point rings) sits right at the measured
    // crossover and n-atlas is half-nested — the exception, not the rule, and
    // correct tiling is the goal state this programme is building toward.
    //
    // The DECISION to unwire still stands, on the honest reason: even in the
    // budget-ceiling row where the index wins 10.77x, the absolute saving is
    // 1.04 ms against a 761 ms gate lane — 0.14% — in exchange for a permanent
    // false-negative surface, since any future drift between the index's
    // confirmation predicate and exactIntersectionArea's stage-1 reject
    // silently blinds G-OVERLAP. Sub-millisecond savings do not buy that.
    // buildBBoxIndex stays exported and tested for Plan C/D, where 1,740
    // landform instances make the same trade at a scale where it can pay.
    //
    // The i<j walk order is load-bearing regardless of kernel: it is what makes
    // the G-OVERLAP message order a function of the data alone, which
    // scripts/tests/spine-gates.test.mjs pins at :403 and :410 (two literals)
    // and again at the five-child ordering fixture at the end of that file.
    let pairSum = 0;
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        // Plan A Task 2: exact clipping replaces lattice sampling. Measured on
        // the committed 133 sibling pairs: 3,038 ms -> 19.7 ms, verdict
        // identical on all 133, max deviation 0.0027 km². The per-parent `cell`
        // constant is no longer read here at all — SPINE_CELL_KM /
        // SPINE_CELL_U remain the town-geometry sampler's constants, exported
        // from lib/spine.mjs, but check_content.mjs no longer needs either.
        const problems = [];
        const inter = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement, problems });
        // The "ring a" / "ring b" prefixes are the collector's pinned contract
        // (scripts/tests/geometry-exact.test.mjs:293), not an incidental string.
        for (const p of problems) {
          const bad = p.startsWith("ring b") ? kids[j] : kids[i];
          if (untriangulable.has(bad.id)) continue;
          untriangulable.add(bad.id);
          report(`spine: G-OVERLAP ${bad.id}: ${p.replace(/^ring [ab] is /, "")}`);
        }
        pairSum += inter;
        const limit = 0.005 * Math.min(placementArea({ placement: kids[i].placement }),
                                       placementArea({ placement: kids[j].placement }));
        if (inter > limit)
          report(`spine: G-OVERLAP ${kids[i].id} ∩ ${kids[j].id}: ${inter.toFixed(1)} over limit ${limit.toFixed(1)}`);
      }
    }
    if (kids.length >= 2) {
      // F-043 perf: gridUnionArea() over ALL children scans the parent's full
      // bbox lattice — O(area/cell²), ~5 min for the 2000x2000km world root.
      // By inclusion-exclusion, Σareas − union = Σpairwise − Σtriple + …, so
      // pairSum (already accumulated above) is exact when no three children
      // share an overlap point, and only ever OVER-reports otherwise — a
      // genuine triple overlap still trips the pairwise G-OVERLAP check above
      // at its own tolerance, so this never masks a real double-count.
      const A = placementArea({ placement: parent.placement });
      if (pairSum > 0.005 * A)
        report(`spine: G-OVERLAP ${parent.id}: children double-count ${pairSum.toFixed(1)} (limit ${(0.005 * A).toFixed(1)})`);
    }
    // G-COMP-ROLLUP — nodes with ≥ 1 child only (preamble note 3).
    if ((tree.childrenOf.get(parent.id) ?? []).length === 0) {
      if (parent.interstitial)
        report(`spine: G-COMP-ROLLUP ${parent.id}: interstitial on a childless node`);
      continue;
    }
    const r = rollupComposition({ tree, id: parent.id });
    const U = r.unclaimedPct / 100;
    if (U > 0.005 && !parent.interstitial && !parent.interstitialUnsurveyed)
      report(`spine: G-COMP-ROLLUP ${parent.id}: unclaimed ${r.unclaimedPct.toFixed(1)}% but no interstitial`);
    if (U <= 0.005 && parent.interstitial)
      report(`spine: G-COMP-ROLLUP ${parent.id}: interstitial forbidden at U ≤ 0.005`);
    const tol = parent.compositionTolerance ?? 3.0;
    if (tol > 5.0) report(`spine: G-COMP-ROLLUP ${parent.id}: tolerance ${tol} over ceiling 5.0`);
    if (parent.compositionTolerance !== null && !parent.toleranceWhy)
      report(`spine: G-COMP-ROLLUP ${parent.id}: compositionTolerance without toleranceWhy`);
    let l1 = 0;
    for (const [k, delta] of Object.entries(r.perKeyDelta)) {
      l1 += Math.abs(delta);
      if (Math.abs(delta) > tol)
        report(`spine: G-COMP-ROLLUP ${parent.id}: ${k} off by ${delta.toFixed(1)} pp (tol ${tol})`);
    }
    if (l1 > 8.0) report(`spine: G-COMP-ROLLUP ${parent.id}: L1 ${l1.toFixed(1)} pp > 8.0`);
  }
}

// Plan A Task 13: the summary lines, extracted so the in-process entry below
// emits BYTE-IDENTICAL output to a spawn. Duplicating this format string in
// two places is exactly the drift the gate's own tests would then stop
// catching, so there is one copy and both callers use it.
export function summaryLines({ sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0,
                               zoneCount = 0, townCount = 0, nodeCount = 0 }) {
  const lines = [];
  for (const w of warnings) lines.push(`WARN  ${w}`);
  for (const f of failures) lines.push(`FAIL  ${f}`);
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
    lines.push(`zone-content: ${zoneHazardsUnmapped} of ${zoneHazardsTotal} hazards have no runtime effect`);
  lines.push(`content-gate: ${sheetCount} sheets, ${mapCount} maps, ${storyCount} story, ${placementCount} placements, ${zoneCount} zones, ${townCount} towns, ${nodeCount} nodes, ${failures.length} failures, ${warnings.length} warnings`);
  return lines;
}

function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0, zoneCount = 0, townCount = 0, nodeCount = 0) {
  for (const line of summaryLines({ sheetCount, mapCount, storyCount, placementCount, zoneCount, townCount, nodeCount }))
    console.log(line);
  process.exit(failures.length ? 1 : 0);
}

// Plan A Task 13 — the in-process entry, for the gate's own test suite.
//
// scripts/tests/spine-gates.test.mjs spawned check_content.mjs ~60 times at
// ~0.4 s of Node startup + ajv compile each; the suite cost 93.3 s of a
// 108 s content lane when this plan was written. This runs the SAME
// checkSpine() against the SAME parsed options and returns the SAME
// {code, out} a spawn produces.
//
// --only=spine ONLY. The full sweep mutates far more module state (the story
// loader, the character/manifest sweeps) and resetting it safely is not worth
// the risk; runAliasGate, runContentGate and runEmit stay as spawns.
//
// console is captured rather than threaded through a collector because every
// gate helper already writes with console.log and rewriting ~40 call sites to
// take an injected sink would be a far larger diff for the same result. The
// swap is restored in a `finally`, so a throw inside checkSpine cannot leave
// the test runner's console broken.
//
// The capture cannot swallow an unrelated test's output, and the reason is
// stronger than the runner's concurrency setting: this function is entirely
// SYNCHRONOUS, and every one of its ~60 callers is a synchronous test body
// (`grep -c "async () =>" scripts/tests/spine-gates.test.mjs` -> 0; the file's
// only `await` is a top-level module import). A synchronous call cannot yield,
// so nothing can run between the swap and the `finally` that restores it —
// true whatever `--test-concurrency` is, and `node --test` runs each FILE in
// its own process anyway. If a future test in this file becomes `async`, that
// argument lapses and the capture must move to an explicit sink.
//
// EVERY module-level mutable binding in this file is reset here. There are
// SIX, not the four the plan's risk A7 names — the enumeration below is the
// contract, and `no-leak: …` in spine-gates.test.mjs pins the ones a run can
// actually observe:
//   1. `failures`   (:225)  — reset; the exit code and every FAIL line read it
//   2. `warnings`   (:226)  — reset; every WARN line reads it
//   3. `zoneHazardsTotal`   (:231) — reset; summaryLines' guard reads it
//   4. `zoneHazardsUnmapped`(:232) — reset; the ratio line reads it
//   5. `townPlansCache`     (:1255) — reset. It IS keyed by content root, so
//      cross-root reuse is already impossible; the leak it carries is
//      SAME-root re-entry, where the memo short-circuits before the
//      `cannot read/parse` + schema FAILs are pushed, so a second run against
//      one root would print fewer failures than a spawn.
//   6. `placesByRoot`       (:154) — reset, for exactly the same reason, and
//      because main() already clears it (see the note there: checkSpine ->
//      checkSpineExternalAliases -> placesDoc is reachable under --only=spine
//      whenever an alias misses the spine).
// There is NO seventh. An independent review checked the whole transitive
// local-import closure — lib/story.mjs, spawn-pairing, places, bestiary-sheet,
// town-geometry, spine, geometry — for module-level reassignment, container
// mutation and property assignment, and found zero mutable module state in any
// of them. lib/story.mjs's `compileSchema` (:51-55) holds nothing to reset: it
// constructs a fresh `new AjvClass(...).compile(schema)` on EVERY call, with no
// cache and no memo. (An earlier draft of this comment claimed it had a
// path-keyed ajv cache that was deliberately left alone. It does not. The
// conclusion "not state" was right; the stated reason was invented, and the
// cost claim that came with it was wrong too — the in-process path still pays
// full ajv compile per run, so ALL of this task's measured speed-up is saved
// Node startup, none of it schema reuse. A real memo here is unclaimed work,
// not a thing this task did.)
export function runSpineGateInProcess({ argv }) {
  failures.length = 0;
  warnings.length = 0;
  zoneHazardsTotal = 0;
  zoneHazardsUnmapped = 0;
  townPlansCache = null;
  placesByRoot.clear();
  const captured = [];
  const realLog = console.log, realError = console.error;
  console.log = (...a) => captured.push(a.join(" "));
  console.error = (...a) => captured.push(a.join(" "));
  try {
    const opts = parseArgs(["node", "check_content.mjs", ...argv]);
    if (opts.only !== "spine")
      throw new Error("runSpineGateInProcess supports --only=spine only");
    const mobTypes = loadMobTypes(opts.mobTypes);
    const nodeCount = checkSpine(opts, mobTypes);
    captured.push(...summaryLines({ nodeCount }));
    return { code: failures.length ? 1 : 0, out: captured.join("\n") + "\n" };
  } catch (e) {
    // Gate functions never throw by contract; if one does, surface it the way
    // a spawn would (non-zero exit, the message on the output) rather than
    // taking down the test runner.
    captured.push(`check-content: ${e.stack ?? e.message}`);
    return { code: 1, out: captured.join("\n") + "\n" };
  } finally {
    console.log = realLog;
    console.error = realError;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
