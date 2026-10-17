// Shared story-graph loader (F-012 Task 5): extracted out of check_content.mjs
// so the content gate and gen_story_graph.mjs read the exact same 7-file
// union with identical schema validation and duplicate-id semantics — one
// loader, no drift between "what the gate accepts" and "what the visualizer
// draws". Plain ESM, no deps beyond what scripts/package.json already has
// (js-yaml is not needed here; ajv is, for schema compilation).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

const AjvClass = Ajv.default ?? Ajv;

// F-012: the story graph is 7 per-kind files (one global id-space, kind-prefixed
// ids) instead of the old single story.json. STORY_KINDS / STORY_FILES / STORY_SCHEMAS
// are the interface the content gate and gen_story_graph.mjs both build on.
export const STORY_KINDS = ["act", "region", "faction", "character", "arc", "quest", "event", "dialogue", "lore"];
export const STORY_FILES = {
  act: "acts.json",
  region: "regions.json",
  faction: "factions.json",
  character: "characters.json",
  arc: "arcs.json",
  quest: "quests.json",
  event: "events.json",
  dialogue: "dialogue.json",
  lore: "lore.json",
};
// story-character.schema.json (not character.schema.json) — that name is already
// taken by the F-005 markdown character-SHEET schema (content/characters/*.md),
// a different document. See content/schemas/story-character.schema.json header.
export const STORY_SCHEMAS = {
  act: "act.schema.json",
  region: "region.schema.json",
  faction: "faction.schema.json",
  character: "story-character.schema.json",
  arc: "arc.schema.json",
  quest: "quest.schema.json",
  event: "event.schema.json",
  dialogue: "dialogue.schema.json",
  lore: "lore.schema.json",
};

// Read+parse a JSON file, reporting `${label}: cannot read/parse ${path}: ...`
// via `fail` on failure. Returns null on failure (caller must guard).
export function readJson(path, label, fail) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { fail(`${label}: cannot read/parse ${path}: ${e.message}`); return null; }
}

// Compile a schema file to an Ajv validator, or null if it can't be read.
//
// `refs` is an optional list of schema FILE PATHS to register with this Ajv
// instance before compiling, so a cross-file `$ref` resolves by `$id`. Each
// schema is compiled standalone (one fresh Ajv per call), which is why a
// `$ref` cannot otherwise resolve at all: Plan C's
// content/schemas/fabric-file.schema.json refers to
// landform-instance.schema.json, and inlining a second copy of that record
// shape is the "two enumerations of one language" defect this repo has been
// bitten by five times. A ref that cannot be read is reported through the same
// `fail` and the compile is abandoned, because a validator missing half its
// vocabulary silently accepts what it cannot see.
export function compileSchema(path, label, fail, refs = []) {
  const schema = readJson(path, label, fail);
  if (!schema) return null;
  const ajv = new AjvClass({ allErrors: true });
  for (const refPath of refs) {
    const ref = readJson(refPath, `${label} $ref`, fail);
    if (!ref) return null;
    ajv.addSchema(ref);
  }
  return ajv.compile(schema);
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
// Interface consumed by the coherence gate (check_content.mjs) and
// gen_story_graph.mjs. `rawByKind` is the pre-schema-filter twin of `byKind`:
// every entry that parsed as JSON for that kind's file, valid or not.
// checkStoryCoherence's completeness FAILs need it — a quest with 0
// objectives or an arc with 0 questIds is *also* a schema minItems
// violation, so a schema-invalid entry never reaches `byKind`/`nodes`.
// Running the completeness check against raw entries (defensive field
// access only, no ref-following) is what makes our own clear-message FAIL
// surface alongside — not instead of — the generic schema error.
export function loadStory(contentRoot, fail) {
  const nodes = new Map(); // id -> node, union across all 7 files
  const byKind = new Map(); // kind -> node[], schema-valid only
  const rawByKind = new Map(); // kind -> node[], every parsed entry regardless of schema validity
  const sourceFile = new Map(); // id -> filename, for duplicate-id messages
  let anyFilePresent = false;

  for (const kind of STORY_KINDS) {
    const file = STORY_FILES[kind];
    byKind.set(kind, []);
    rawByKind.set(kind, []);

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
    rawByKind.set(kind, arr);

    const validate = compileSchema(join(contentRoot, "schemas", STORY_SCHEMAS[kind]), `${kind} schema`, fail);
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

  return { nodes, byKind, rawByKind, anyFilePresent };
}
