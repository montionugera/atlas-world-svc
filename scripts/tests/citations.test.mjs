import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonSections, resolveCanonCite, scanCitations, checkCitations, CITE_SCOPE }
  from "../lib/citations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANON = readFileSync(join(ROOT, "content/story/canon.md"), "utf8");

const FAKE_CANON = [
  "# Title",
  "",
  "## 1. World chronology",
  "text",
  "",
  "## 4. Geography & trade logic",
  "text",
  "",
  "### How news travels (the Bellfaith, three layers, two speeds)",
  "text",
  "",
  "## 6. Contradiction rule",
  "",
  "### 6.1 Keyspace register",
  "text",
].join("\n");

function scratch(files) {
  const dir = mkdtempSync(join(tmpdir(), "cite-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, "utf8");
  }
  return dir;
}

test("canonSections indexes H2 numbers and their H3 children", () => {
  const s = canonSections({ text: FAKE_CANON });
  assert.equal(s.size, 3);
  assert.equal(s.get(4).heading, "Geography & trade logic");
  assert.deepEqual(s.get(4).subheadings,
    ["How news travels (the Bellfaith, three layers, two speeds)"]);
  assert.deepEqual(s.get(6).subheadings, ["6.1 Keyspace register"]);
});

test("resolveCanonCite matches an H2 title, an H3 title, and a numbered H3 minus its prefix", () => {
  const s = canonSections({ text: FAKE_CANON });
  assert.ok(resolveCanonCite({ sections: s, section: 4, heading: "Geography & trade logic" }));
  assert.ok(resolveCanonCite({ sections: s, section: 4,
    heading: "How news travels (the Bellfaith, three layers, two speeds)" }));
  assert.ok(resolveCanonCite({ sections: s, section: 6, heading: "Keyspace register" }));
  assert.equal(resolveCanonCite({ sections: s, section: 4, heading: "The bramble road" }), null);
  assert.equal(resolveCanonCite({ sections: s, section: 9, heading: "anything" }), null);
});

test("G-CITE fails a line citation with the remedy in the message", () => {
  const dir = scratch({
    "content/story/canon.md": FAKE_CANON,
    "docs/worldbuilding/A9-test.md": 'Millcross is the hub (`canon.md:173-174`).\n',
  });
  const out = checkCitations({ repoRoot: dir, canonText: FAKE_CANON,
    files: ["docs/worldbuilding/A9-test.md"] });
  assert.equal(out.length, 1);
  assert.match(out[0],
    /^G-CITE: docs\/worldbuilding\/A9-test\.md:1 cites canon\.md:173-174 — line citations rot on insert; cite the section$/);
});

test("G-CITE fails a section citation that does not resolve", () => {
  const dir = scratch({
    "content/story/canon.md": FAKE_CANON,
    "docs/worldbuilding/A9-test.md": 'See `canon.md §4 "The bramble road"`.\n',
  });
  const out = checkCitations({ repoRoot: dir, canonText: FAKE_CANON,
    files: ["docs/worldbuilding/A9-test.md"] });
  assert.deepEqual(out,
    ['G-CITE: docs/worldbuilding/A9-test.md cites canon.md §4 "The bramble road" which does not resolve']);
});

test("G-CITE passes a resolving section citation", () => {
  const dir = scratch({
    "content/story/canon.md": FAKE_CANON,
    "docs/worldbuilding/A9-test.md": 'See `canon.md §4 "Geography & trade logic"`.\n',
  });
  assert.deepEqual(checkCitations({ repoRoot: dir, canonText: FAKE_CANON,
    files: ["docs/worldbuilding/A9-test.md"] }), []);
});

test("CITE_SCOPE excludes dated records — rewriting one would falsify it (E-C8)", () => {
  assert.deepEqual([...CITE_SCOPE].sort(),
    ["content/", "docs/worldbuilding/"]);
  assert.ok(!CITE_SCOPE.some((p) => p.startsWith("docs/superpowers")));
  assert.ok(!CITE_SCOPE.some((p) => p.startsWith(".claude")));
});

test("the live corpus carries no canon.md line citations", () => {
  const files = scanCitations({ files: [] }); // signature smoke — real sweep below
  assert.ok(files);
  const out = checkCitations({ repoRoot: ROOT, canonText: CANON, files: null });
  assert.deepEqual(out, [], `G-CITE failures in the live corpus:\n${out.join("\n")}`);
});
