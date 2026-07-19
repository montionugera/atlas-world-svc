#!/usr/bin/env node
// Content gate (F-005): content/characters/*.md ↔ schema ↔ asset keys ↔ manifest.
// Spec: docs/superpowers/specs/2026-07-19-content-pipeline-design.md
// Discipline mirrors scripts/check_asset_manifest.mjs: warns allowed at exit 0,
// any hard failure exits 1, --require-complete escalates coverage warns.
import { readFileSync, readdirSync } from "node:fs";
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

function main() {
  const opts = parseArgs(process.argv);
  const keysDoc = readJson(opts.keys, "asset-keys");
  const manifestDoc = readJson(opts.manifest, "manifest");
  const schema = readJson(join(opts.contentRoot, "schemas/character.schema.json"), "character schema");
  if (!keysDoc || !manifestDoc || !schema) return finish();

  const keyKinds = new Map(keysDoc.keys.map((k) => [k.id, k.kind]));
  const entries = manifestDoc.entries ?? {};
  const AjvClass = Ajv.default ?? Ajv;
  const validate = new AjvClass({ allErrors: true }).compile(schema);

  const dir = join(opts.contentRoot, "characters");
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort();
  } catch (e) { fail(`characters dir unreadable: ${dir}: ${e.message}`); }

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

  return finish(files.length);
}

function finish(sheetCount = 0) {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`content-gate: ${sheetCount} sheets, ${failures.length} failures, ${warnings.length} warnings`);
  process.exit(failures.length ? 1 : 0);
}

main();
