#!/usr/bin/env node
// Plan D — mint and reconcile the machine-owned half of the civil layer.
//
//   node tools/mapforge/scaffold-civil.mjs --bound     [--dry-run]
//   node tools/mapforge/scaffold-civil.mjs --dungeons  [--dry-run]
//
// SET RECONCILIATION, NEVER APPEND. Every named handle in every ledger gets
// exactly one bound record; every bound record whose handle has left the
// ledger is DELETED. Running it twice is a no-op, which is what makes a
// re-seed a one-command operation rather than a merge.
//
// It never touches a human sentence: a record whose `prose` is "authored"
// keeps its title and its lore verbatim, and only its binding FACTS (handle
// type, size band) are refreshed from the ledger.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mintName, registerOf, titleStem, phonemeDistance, syllableCount } from "./lib/name-gen.mjs";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listJson = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort() : []);

// Form diversity is a GATE REQUIREMENT, not decoration: gNames' G-NAME-PROSODY
// floor demands >=10% "X of Y" forms and its syllable-share ceiling fails a
// continent of uniform trochees. 1 in 4 titles takes the of-form — comfortably
// over the floor, deterministic in the handle.
const formOf = (handle) => (parseInt(handle.slice(-2), 16) % 4 === 0 ? "of-form" : "stem-classifier");

// Two titles trip G-NAME-SOUND when they sit within 2 phonemes AND within one
// syllable of each other — which same-classifier titles on similar stems do
// ("Kellmark Confluence" / "Weldmark Confluence"). So a candidate stem is
// rejected if any stem already in play for the continent is that close, using
// the exact pair test gNames applies.
function stemCollides({ stem, stems }) {
  const syl = syllableCount({ name: stem });
  return [...stems].some((s) =>
    phonemeDistance({ a: stem, b: s }) < 3 && Math.abs(syllableCount({ name: s }) - syl) <= 1);
}

// Attempt index is part of name-gen's hash, so pushing a rejected draw into
// `used` and re-drawing advances deterministically.
function mintDistinctStem({ register, form, classifier, stream, used, reserved, stems }) {
  let cand = null;
  for (let i = 0; i < 64; i++) {
    cand = mintName({ register, form, classifier, stream, used, reserved });
    if (!stems.has(titleStem(cand)) && !stemCollides({ stem: titleStem(cand), stems })) return cand;
    used.add(cand);
  }
  return cand; // in-band best effort; never reached at this scale
}

// The declared band is deliberately WIDER than the measured size: it is a
// statement about what the prose can survive, not a copy of today's number.
// Half to double, clamped into the lexicon's own range for the type. The hi
// fallback keeps lo < hi even when the measured size sits at or above the
// lexicon ceiling — a band that declares nothing would gate nothing.
function bandFor({ sizeKm, lexRow }) {
  const lo = Math.max(lexRow?.sizeKm?.[0] ?? 0.01, Math.round(sizeKm * 50) / 100);
  const hi = Math.min(lexRow?.sizeKm?.[1] ?? sizeKm * 4, Math.round(sizeKm * 200) / 100);
  return [lo, hi > lo ? hi : Math.round(lo * 200) / 100];
}

export function scaffoldBound({ repoRoot, dryRun = false }) {
  const contentRoot = join(repoRoot, "content");
  const out = { written: [], deleted: [], kept: [], problems: [] };

  const lexicon = new Map();
  const lexPath = join(contentRoot, "world/lexicon/landforms.json");
  if (!existsSync(lexPath)) { out.problems.push("scaffold: content/world/lexicon/landforms.json is missing"); return out; }
  for (const row of readJson(lexPath)) lexicon.set(row.id, row);

  const registers = readJson(join(contentRoot, "world/names/registers.json"));
  const classifiers = readJson(join(contentRoot, "world/names/classifiers.json"));
  const reserved = new Set(readJson(join(contentRoot, "world/names/reserved.json")).names);

  // Named instances are the 336: unnamed instances are TEXTURE and get no
  // record at all — giving them one is how you get 1,400 identical dots by a
  // different route.
  const named = [];
  for (const f of listJson(join(contentRoot, "world/fabric")))
    for (const inst of readJson(join(contentRoot, "world/fabric", f)).instances ?? [])
      if (inst.named && inst.handle) named.push(inst);

  const ledgerHandles = new Map();
  for (const f of listJson(join(contentRoot, "world/handles")))
    for (const h of readJson(join(contentRoot, "world/handles", f)).handles ?? [])
      ledgerHandles.set(h.handle, h);

  const boundDir = join(contentRoot, "world/civil/bound");
  const existing = new Map();
  for (const f of listJson(boundDir)) existing.set(f, readJson(join(boundDir, f)));

  const globalUsed = new Set([...existing.values()].map((d) => d.title));
  const usedStems = new Map(); // continent -> Set of register stems already in play
  for (const d of existing.values()) {
    const cont = d.bind?.handle?.slice(0, 3);
    if (!cont || typeof d.title !== "string") continue;
    if (!usedStems.has(cont)) usedStems.set(cont, new Set());
    usedStems.get(cont).add(titleStem(d.title));
  }
  const wanted = new Set();

  for (const inst of named.sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0))) {
    const h = ledgerHandles.get(inst.handle);
    if (!h) { out.problems.push(`scaffold: instance ${inst.id} names handle "${inst.handle}" which no ledger carries`); continue; }
    const lexRow = lexicon.get(inst.type);
    const group = inst.handle.split("/")[1];
    const continent = inst.handle.slice(0, 3);
    const regId = registerOf({ continent, registers });
    const reg = registers.registers[regId];
    const legal = [...(classifiers.byGroup[group] ?? []), ...(classifiers.overrides?.[regId]?.[group] ?? [])];
    const classifier = legal.length ? legal[parseInt(inst.handle.slice(-2), 16) % legal.length] : null;
    if (!usedStems.has(continent)) usedStems.set(continent, new Set());
    const stems = usedStems.get(continent);

    // Deterministic file name from the HANDLE, so a re-seed that keeps a
    // handle keeps its file and its diff is one line, not a rename.
    const file = `c-lm-${continent}-${group}-${inst.handle.slice(-4)}.json`;
    wanted.add(file);
    const prior = existing.get(file);
    const keepProse = prior?.prose === "authored";

    // FIXPOINT, NOT DRIFT: an existing record keeps its title whatever its
    // prose mode. Minting afresh every run while seeding `used` from existing
    // titles would walk the name forward once per run — the minter's own
    // output becoming its own collision. Excluding the record's OWN title
    // from the used-set before the draw makes attempt 0 resolve to the same
    // name it already carries, so run two is byte-identical to run one.
    const usedForThis = new Set(globalUsed);
    if (prior?.title) usedForThis.delete(prior.title);
    let title;
    if (keepProse || prior?.title) {
      title = prior.title;
    } else {
      title = mintDistinctStem({ register: reg, form: formOf(inst.handle), classifier, stream: `bound:${inst.handle}`, used: usedForThis, reserved, stems });
      stems.add(titleStem(title));
    }
    globalUsed.add(title);

    const doc = {
      id: `c-lm-${continent}-${group}-${inst.handle.slice(-4)}`,
      kind: "landmark",
      tier: "bound",
      title,
      bind: { handle: inst.handle, expect: { type: inst.type, sizeKm: bandFor({ sizeKm: h.sizeKm, lexRow }) } },
      networkAnchor: keepProse ? (prior.networkAnchor ?? false) : false,
      prose: keepProse ? "authored" : "frontier",
      properties: keepProse ? (prior.properties ?? []) : [],
      lore: keepProse ? prior.lore : {
        note: lexRow?.gloss ?? "An unremarked mark on the chart.",
        labelAnchor: "north",
        source: "content/world/lexicon/landforms.json#" + inst.type + ".gloss",
      },
      resolution: null,
    };
    const bytes = JSON.stringify(doc, null, 2) + "\n";
    const unchanged = prior && JSON.stringify(prior, null, 2) + "\n" === bytes;
    if (unchanged) { out.kept.push(file); continue; }
    out.written.push(file);
    if (!dryRun) { mkdirSync(boundDir, { recursive: true }); writeFileSync(join(boundDir, file), bytes); }
  }

  for (const file of existing.keys())
    if (!wanted.has(file)) { out.deleted.push(file); if (!dryRun) rmSync(join(boundDir, file)); }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  const repoRoot = new URL("../..", import.meta.url).pathname;
  if (process.argv.includes("--bound")) {
    const r = scaffoldBound({ repoRoot, dryRun });
    for (const p of r.problems) console.log(`PROBLEM ${p}`);
    console.log(`scaffold-bound: ${r.written.length} written, ${r.kept.length} unchanged, ${r.deleted.length} deleted${dryRun ? " (dry run)" : ""}`);
    process.exit(r.problems.length ? 1 : 0);
  }
  console.error("usage: scaffold-civil.mjs --bound | --dungeons [--dry-run]");
  process.exit(2);
}
