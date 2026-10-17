// G-CITE — citation integrity for content/story/canon.md (spec §9.6, R14).
//
// Fifth occurrence of rot-on-insert. canon.md is 522 lines and one insertion
// in §1 silently invalidates every `canon.md:<digits>` below it. The line form
// is banned; the section form is checked for resolution.
//
// SCOPE IS DELIBERATELY NARROW (plan E-C8). Dated records — anything under
// docs/superpowers/ or .claude/ — are design artifacts of a moment. Rewriting
// their citations would falsify the record of what was true when they were
// written. Only LIVE lore is swept.
//
// Never throws: every problem is a returned string, matching the gate contract
// in scripts/lib/spine.mjs's header.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const CITE_SCOPE = Object.freeze(["content/", "docs/worldbuilding/"]);

const SWEEP_EXT = new Set([".md", ".json"]);
const LINE_RE = /`canon\.md:(\d+)(?:-(\d+))?`/g;
const SECTION_RE = /`canon\.md §(\d+) "([^"]+)"`/g;

const norm = (s) => s.trim().toLowerCase();
// A numbered H3 ("6.1 Keyspace register") must match on its bare title too.
const stripNum = (s) => s.replace(/^\d+(?:\.\d+)*\s+/, "");

/** Index canon.md's H2 sections and the H3 headings inside each. */
export function canonSections({ text }) {
  const sections = new Map();
  let current = null;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const h2 = /^## (\d+)\.\s+(.+?)\s*$/.exec(lines[i]);
    if (h2) {
      current = { n: Number(h2[1]), heading: h2[2], line: i + 1, subheadings: [] };
      sections.set(current.n, current);
      continue;
    }
    if (/^## /.test(lines[i])) { current = null; continue; }
    const h3 = /^### (.+?)\s*$/.exec(lines[i]);
    if (h3 && current) current.subheadings.push(h3[1]);
  }
  return sections;
}

/** null when the section number is unknown or no heading in it matches. */
export function resolveCanonCite({ sections, section, heading }) {
  const s = sections.get(section);
  if (!s) return null;
  const want = norm(heading);
  if (norm(s.heading) === want) return s;
  for (const sub of s.subheadings)
    if (norm(sub) === want || norm(stripNum(sub)) === want) return s;
  return null;
}

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SWEEP_EXT.has(name.slice(name.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

/** Every in-scope file under repoRoot, repo-relative and sorted. */
export function citeFiles({ repoRoot }) {
  const out = [];
  for (const prefix of CITE_SCOPE) {
    const dir = join(repoRoot, prefix);
    if (!existsSync(dir)) continue; // soft-skip: fixture roots carry neither
    walk(dir, out);
  }
  return out.map((f) => relative(repoRoot, f)).sort();
}

/** Both citation forms with their 1-based line numbers. Pure over text. */
export function scanCitations({ files }) {
  const line = [], section = [];
  for (const { path, text } of files ?? []) {
    const rows = text.split("\n");
    for (let i = 0; i < rows.length; i++) {
      for (const m of rows[i].matchAll(LINE_RE))
        line.push({ file: path, line: i + 1, text: m[0].replaceAll("`", "") });
      for (const m of rows[i].matchAll(SECTION_RE))
        section.push({ file: path, line: i + 1, section: Number(m[1]), heading: m[2] });
    }
  }
  return { line, section };
}

/** G-CITE. `files` null = sweep CITE_SCOPE under repoRoot. */
export function checkCitations({ repoRoot, canonText, files = null }) {
  const rels = files ?? citeFiles({ repoRoot });
  const loaded = [];
  const unreadable = [];
  for (const rel of rels) {
    const full = join(repoRoot, rel);
    // An unreadable file becomes a reported problem, never a throw — an
    // uncaught error would skip finish() and silently drop every FAIL
    // recorded before it.
    try {
      loaded.push({ path: rel, text: readFileSync(full, "utf8") });
    } catch {
      unreadable.push(rel);
    }
  }
  const { line, section } = scanCitations({ files: loaded });
  const sections = canonSections({ text: canonText });
  const problems = unreadable.map(
    (rel) => `G-CITE: ${rel} is unreadable — fix the file or remove it from the sweep`,
  );
  for (const c of line)
    problems.push(`G-CITE: ${c.file}:${c.line} cites ${c.text} — line citations rot on insert; cite the section`);
  for (const c of section)
    if (!resolveCanonCite({ sections, section: c.section, heading: c.heading }))
      problems.push(`G-CITE: ${c.file} cites canon.md §${c.section} "${c.heading}" which does not resolve`);
  return problems;
}
