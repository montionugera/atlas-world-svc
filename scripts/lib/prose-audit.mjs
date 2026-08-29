// Plan E Task 15 (F-051 completion Task 1) — prose reconciliation to the
// redrawn world (seed 7c9e4a2f8b1d6e03, 36 spine nodes, 47 settlements, ZERO
// tower nodes — down from the old world's 44 nodes / six named towns / a
// 27-tower relay chain).
//
// Three checks, each pure over text/JSON so they can run as both a gate rule
// (check_content.mjs) and a fixture-driven unit test:
//
// 1. checkAmendedPending — the corpus must carry zero `AMENDED-PENDING`
//    markers (I-095's re-voice-deferred flag). A marker left in place is a
//    known-stale sentence nobody has fixed yet, not a passing state.
// 2. checkTowerRelayAssertions — content/story/*.json must carry zero
//    "tower"/"relay" occurrences. The redrawn world has no tower spine nodes
//    at all, so any surviving occurrence is either the retired relay-chain
//    infrastructure or a homonym that needs a different word — the gate
//    cannot tell the two apart and does not try; a human re-voices the prose
//    and the corpus goes to zero.
// 3. checkLegacyLandmarkCitations — every landmark in the ten legacy
//    (PLACEHOLDER-exempt) zone records must cite a `source` document that (a)
//    exists and (b) actually contains the landmark's name. Scoped to the
//    legacy ten deliberately: the other 30 derived records all cite the
//    generated `A4-zone-allocation.md#5`, which is minted from the same
//    landmark names by construction and cannot drift from them the way a
//    hand-authored citation can.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const SWEEP_EXT = new Set([".md", ".json"]);

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SWEEP_EXT.has(name.slice(name.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

// Same scope Step 1's re-measurement command swept: content/ and
// docs/worldbuilding/, repo-relative and sorted.
export const AMENDED_SCOPE = Object.freeze(["content/", "docs/worldbuilding/"]);

export function amendedFiles({ repoRoot }) {
  const out = [];
  for (const prefix of AMENDED_SCOPE) {
    const dir = join(repoRoot, prefix);
    if (!existsSync(dir)) continue; // soft-skip: fixture roots carry neither
    walk(dir, out);
  }
  return out.map((f) => relative(repoRoot, f)).sort();
}

/**
 * G-AMENDED. `files` null = sweep AMENDED_SCOPE under repoRoot. Pure text
 * search — the marker is a literal string, never a regex the corpus could
 * accidentally satisfy some other way.
 */
export function checkAmendedPending({ repoRoot, files = null }) {
  const rels = files ?? amendedFiles({ repoRoot });
  const problems = [];
  for (const rel of rels) {
    const full = join(repoRoot, rel);
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      problems.push(`G-AMENDED: ${rel} is unreadable — fix the file or remove it from the sweep`);
      continue;
    }
    const rows = text.split("\n");
    for (let i = 0; i < rows.length; i++)
      if (rows[i].includes("AMENDED-PENDING"))
        problems.push(`G-AMENDED: ${rel}:${i + 1} still carries an AMENDED-PENDING marker — re-voice it`);
  }
  return problems;
}

// The four content/story/*.json files the redraw's tower/relay audit found
// occurrences in (lore.json 12, quests.json 9, events.json 2, dialogue.json
// 1 — 24 total, case-insensitive). Swept by pattern, not by this fixed list,
// so a FIFTH file picking up the word later still gets caught.
export function towerRelayFiles({ repoRoot }) {
  const dir = join(repoRoot, "content/story");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => `content/story/${f}`)
    .sort();
}

const TOWER_RELAY_RE = /tower|relay/i;

/** G-TOWER-RELAY. `files` null = sweep every content/story/*.json. */
export function checkTowerRelayAssertions({ repoRoot, files = null }) {
  const rels = files ?? towerRelayFiles({ repoRoot });
  const problems = [];
  for (const rel of rels) {
    const full = join(repoRoot, rel);
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      problems.push(`G-TOWER-RELAY: ${rel} is unreadable — fix the file or remove it from the sweep`);
      continue;
    }
    const rows = text.split("\n");
    for (let i = 0; i < rows.length; i++)
      if (TOWER_RELAY_RE.test(rows[i]))
        problems.push(`G-TOWER-RELAY: ${rel}:${i + 1} still says "tower" or "relay" — the redrawn world has zero tower nodes`);
  }
  return problems;
}

// Whole-name, case-insensitive substring containment — the SAME standard
// scripts/tests/zone-content.test.mjs's own "every landmark source is a real
// file..." test already pins as a number for the legacy ten (was 14, now 0
// after this task). Kept identical deliberately: a looser word-level rule
// here would pass citations that test still fails, which is worse than no
// gate rule at all — two mechanisms disagreeing about the same ten records.
function carries(text, name) {
  return text.toLowerCase().includes(name.trim().toLowerCase());
}

/**
 * G-LM-CITE. Every landmark in the legacy ten's zone records: `source` must
 * name a file that exists, and that file's text must contain the landmark's
 * whole `name` (trimmed, case-insensitive) as a substring.
 *
 * `legacyZones` is the ten zone slugs (Task 9's A4 §2 set); passed in rather
 * than re-derived so this module stays independent of zone-allocation.mjs's
 * reserved.json read (the same "one problem, one place" split check_content.mjs
 * already keeps between loaders).
 */
export function checkLegacyLandmarkCitations({ repoRoot, contentRoot, legacyZones }) {
  const problems = [];
  const dir = join(contentRoot, "zones");
  if (!existsSync(dir)) return problems;
  const legacy = new Set(legacyZones);
  for (const file of readdirSync(dir).filter((f) => /^zone-.+\.json$/.test(f)).sort()) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue; // shape failures are check_content.mjs's own job, not this rule's
    }
    if (!doc || typeof doc.zone !== "string" || !legacy.has(doc.zone)) continue;
    if (!Array.isArray(doc.landmarks)) continue;
    for (const lm of doc.landmarks) {
      if (!lm || typeof lm.source !== "string" || typeof lm.name !== "string") continue;
      const relPath = lm.source.split("#")[0];
      const full = join(repoRoot, relPath);
      if (!existsSync(full)) {
        problems.push(`G-LM-CITE: zones/${file} landmark "${lm.id}" cites "${relPath}", which does not exist`);
        continue;
      }
      if (!carries(readFileSync(full, "utf8"), lm.name))
        problems.push(`G-LM-CITE: zones/${file} landmark "${lm.id}" ("${lm.name}") cites "${relPath}", which does not carry the name`);
    }
  }
  return problems;
}
