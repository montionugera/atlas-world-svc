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
  // Handles may be 4-6 hex but the file name keeps only the LAST 4, so two
  // distinct handles in one group can collapse onto one file and silently
  // overwrite each other's record. Map every minted name back to its handle
  // and refuse the run if a second handle lands on an already-owned name.
  const fileOwner = new Map();

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
    const owner = fileOwner.get(file);
    if (owner && owner !== inst.handle)
      throw new Error(`bound-record filename collision: handles "${owner}" and "${inst.handle}" share the last-4 hex "${inst.handle.slice(-4)}" and would both write ${file}; rename one handle (6-hex handles collide on a 4-hex suffix).`);
    fileOwner.set(file, inst.handle);
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

export function scaffoldDungeons({ repoRoot, dryRun = false }) {
  const contentRoot = join(repoRoot, "content");
  const out = { written: [], deleted: [], kept: [], problems: [] };
  const lexPath = join(contentRoot, "world/lexicon/landforms.json");
  if (!existsSync(lexPath)) { out.problems.push("scaffold: content/world/lexicon/landforms.json is missing"); return out; }
  const lexicon = new Map();
  for (const row of readJson(lexPath)) lexicon.set(row.id, row);

  // ERRATUM (plan §Task 6): the plan's draft matched family.entranceTypes
  // against every capable LEDGER handle. Plan C's committed anchor pass emits
  // a dungeonAnchors row for exactly the quota it could anchor — and Plan D's
  // G-DUNGEON-REACH fails any dungeon whose handle has no row. So the
  // candidate pool here is anchored-capable handles only, further filtered by
  // hopsToSettlement <= 2 and a member-band / host-region-band overlap, which
  // is what makes G-BAND hold by construction rather than by luck.
  const anchors = new Map();
  const regionBand = new Map();
  for (const f of listJson(join(contentRoot, "world/fabric"))) {
    const doc = readJson(join(contentRoot, "world/fabric", f));
    for (const a of doc.dungeonAnchors ?? []) anchors.set(a.handle, a);
    for (const r of doc.regions ?? []) regionBand.set(r.id, r.levelBand ?? null);
  }

  const claimedByBound = new Set();
  for (const f of listJson(join(contentRoot, "world/civil/bound")))
    claimedByBound.add(readJson(join(contentRoot, "world/civil/bound", f))?.bind?.handle);

  const overlaps = ([lo, hi], [rlo, rhi]) => lo <= rhi && rlo <= hi;

  // Handles already carried by committed dungeon files are TAKEN, not
  // re-selectable: without this, a re-run after bespoke records land would
  // hand a family member a handle a bespoke dungeon already binds. Family
  // MEMBER files are exempt here — their slots re-claim their own handles
  // during matching (see pinning below), and an unclaimed member handle must
  // stay available to its family rather than block every candidate.
  const dungDir = join(contentRoot, "dungeons");
  const famDir = join(dungDir, "families");
  const taken = new Set();
  for (const f of listJson(dungDir)) {
    const d = readJson(join(dungDir, f));
    if (d?.family === null && d?.bind?.handle) taken.add(d.bind.handle);
  }

  const eligible = [];
  for (const f of listJson(join(contentRoot, "world/handles")))
    for (const h of readJson(join(contentRoot, "world/handles", f)).handles ?? []) {
      const anchor = anchors.get(h.handle);
      if (!lexicon.get(h.type)?.dungeonCapable) continue;
      if (!anchor || anchor.hopsToSettlement === null || anchor.hopsToSettlement > 2) continue;
      const band = regionBand.get(h.region);
      if (!band) continue;
      eligible.push({ ...h, regionBand: band, boundClaimed: claimedByBound.has(h.handle) });
    }
  // Unclaimed handles first: an entrance sharing a handle with a named
  // landmark is legal but wasteful, so sharing happens only under supply
  // pressure (18 of the 60 anchors are claimed by bound records).
  eligible.sort((a, b) => (a.boundClaimed - b.boundClaimed) ||
    (b.sizeKm - a.sizeKm) || (a.contentHash < b.contentHash ? -1 : 1));

  const findEligible = ({ types, levelBand }) =>
    eligible.filter((c) => !taken.has(c.handle) && types.includes(c.type) &&
      (!levelBand || overlaps(levelBand, c.regionBand)));

  if (process.argv.includes("--list-free") && import.meta.url === `file://${process.argv[1]}`) {
    const groups = new Map();
    for (const c of eligible)
      if (!taken.has(c.handle))
        groups.set(`${c.handle.slice(0, 3)} ${c.type}`, [...(groups.get(`${c.handle.slice(0, 3)} ${c.type}`) ?? []), c]);
    for (const [g, cs] of [...groups.entries()].sort())
      console.log(`${g}: ${cs.map((c) => `${c.handle}(${c.boundClaimed ? "bound-claimed" : "free"})`).join(" ")}`);
    return { ...out, problems: [] };
  }

  // Members are MATCHED, not picked greedily: the band ladder narrows onto
  // fewer handles as the index rises, and a first-free walk can strand a late
  // member on a handle an early one should have left. Augmenting-path
  // matching over (member index x eligible handle), both iterated in
  // deterministic order, places all eight whenever ANY assignment exists.
  // A PRIOR member file pins its slot: if dungeon-<family>-<index>.json
  // already binds an eligible handle it keeps it, which is what makes a
  // second run report 24 unchanged instead of reshuffling the corpus.
  function matchMembers({ family }) {
    const slots = [];
    for (let index = 0; index < 8; index++) {
      const band = [family.levelBand.base + family.levelBand.step * index,
                    family.levelBand.base + family.levelBand.step * index + family.levelBand.span];
      slots.push({ index, band, cands: findEligible({ types: family.entranceTypes, levelBand: band }) });
    }
    const owner = new Map();   // slot index -> handle
    const heldBy = new Map();  // handle -> slot index
    for (const slot of slots) {
      const priorFile = join(dungDir, `dungeon-${family.id.replace(/^family-/, "")}-${slot.index}.json`);
      if (!existsSync(priorFile)) continue;
      const ph = readJson(priorFile)?.bind?.handle;
      if (!ph || taken.has(ph)) continue;
      const still = slot.cands.find((c) => c.handle === ph);
      if (!still) continue;
      taken.add(ph);
      owner.set(slot.index, ph);
      heldBy.set(ph, slot.index);
    }
    const pinned = new Set(owner.keys());
    const trySlot = (slot, seenHandles) => {
      for (const h of slot.cands) {
        if (seenHandles.has(h.handle)) continue;
        seenHandles.add(h.handle);
        const prev = heldBy.get(h.handle);
        if (prev === undefined || (!pinned.has(prev) && trySlot(slots.find((s) => s.index === prev), seenHandles))) {
          const prior = owner.get(slot.index);
          if (prior !== undefined) heldBy.delete(prior);
          owner.set(slot.index, h.handle);
          heldBy.set(h.handle, slot.index);
          return true;
        }
      }
      return false;
    };
    for (const slot of slots) {
      if (owner.has(slot.index)) continue; // pinned prior: nothing to match
      if (!trySlot(slot, new Set()))
        out.problems.push(`scaffold: ${family.id} member ${slot.index} has no free dungeonCapable anchored handle within hops 2`);
    }
    return slots.map((s) => ({ ...s, handle: owner.get(s.index) })).filter((s) => s.handle !== undefined);
  }

  for (const ff of listJson(famDir)) {
    const family = readJson(join(famDir, ff));
    for (const { index, band, handle } of matchMembers({ family })) {
      taken.add(handle);
      const h = eligible.find((c) => c.handle === handle);
      const file = `dungeon-${family.id.replace(/^family-/, "")}-${index}.json`;
      const prior = existsSync(join(dungDir, file)) ? readJson(join(dungDir, file)) : null;
      const doc = {
        id: file.replace(/\.json$/, ""),
        title: prior?.title ?? `${family.title} ${index + 1}`,
        family: family.id, familyIndex: index,
        bind: { handle }, entranceType: h.type,
        floors: family.floors, levelBand: band,
        hazards: family.hazards, spineId: null,
      };
      const bytes = JSON.stringify(doc, null, 2) + "\n";
      if (prior && JSON.stringify(prior, null, 2) + "\n" === bytes) { out.kept.push(file); continue; }
      out.written.push(file);
      if (!dryRun) { mkdirSync(dungDir, { recursive: true }); writeFileSync(join(dungDir, file), bytes); }
    }
  }
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
  if (process.argv.includes("--dungeons") || process.argv.includes("--list-free")) {
    const r = scaffoldDungeons({ repoRoot, dryRun });
    for (const p of r.problems) console.log(`PROBLEM ${p}`);
    console.log(`scaffold-dungeons: ${r.written.length} written, ${r.kept.length} unchanged${dryRun ? " (dry run)" : ""}`);
    process.exit(r.problems.length ? 1 : 0);
  }
  console.error("usage: scaffold-civil.mjs --bound | --dungeons [--dry-run] | --dungeons --list-free");
  process.exit(2);
}
