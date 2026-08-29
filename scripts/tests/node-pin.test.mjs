// scripts/tests/node-pin.test.mjs — the determinism pin, world-fill Plan C R5.
//
// THE PIN IS TWO NUMBERS, NOT ONE, AND THE PLAN SAID OTHERWISE.
//
// The plan's Step 4 justifies `nodeMajor: 18` with "ci.yml:33 already pins
// node-version: 18 to match colyseus-server/Dockerfile", and its acceptance
// criterion 14 asks for ".release.json carries nodeMajor, ci.yml reads it, and
// colyseus-server/Dockerfile agrees". Measured: the Dockerfile has said
// `FROM node:22-alpine` since release 1.2 (commit 3cf96e7) and ci.yml's own
// comment claiming a match was stale. The two cannot be made to agree inside
// Plan C either: every Plan C commit must leave
// `git diff plan-c-base -- colyseus-server/` EMPTY, so the Dockerfile cannot
// move, and moving CI to 22 would discard every byte-determinism measurement
// this programme has taken on Node 18.
//
// They are also genuinely different jobs. `nodeMajor` is the Node that runs
// the map tooling and the byte comparisons — the pin determinism is contracted
// against. `runtimeNodeMajor` is the game-server deployment image, which never
// runs mapforge. So BOTH are recorded in .release.json and each is joined to
// its own consumer here: the divergence is deliberate, and neither number can
// move in silence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const release = () => JSON.parse(readFileSync(join(ROOT, ".release.json"), "utf8"));
const ci = () => readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

test(".release.json pins the Node major", () => {
  const r = release();
  assert.equal(typeof r.nodeMajor, "number");
  assert.ok(r.nodeMajor >= 18);
});

test("ci.yml reads the Node major from .release.json instead of hard-coding it", () => {
  const text = ci();
  assert.ok(!/^\s*node-version:\s*\d+\s*$/m.test(text),
    "ci.yml still hard-codes a node-version — the pin must come from .release.json");
  assert.match(text, /nodeMajor/, "ci.yml never mentions nodeMajor");
  assert.match(text, /node-version:\s*\$\{\{\s*steps\.nodepin\.outputs\.major\s*\}\}/,
    "ci.yml does not set node-version from the step that read the pin");
});

// The workflow reads the pin with grep, because there is no Node yet at that
// point in the job. A grep is a text match against a file this test can also
// read, so the extraction is DRIVEN here rather than trusted: `"nodeMajorWhy"`
// and `"runtimeNodeMajor"` sit in the same file and either could be matched by
// a sloppier pattern.
test("the pattern ci.yml greps with extracts exactly the pin, not a neighbouring key", () => {
  const step = /MAJOR="\$\(grep -o '([^']+)' \.release\.json \| grep -o '([^']+)'\)"/.exec(ci());
  assert.ok(step, "the nodepin step no longer reads .release.json with the two-grep form this test drives");
  const [, outer, inner] = step;
  const raw = readFileSync(join(ROOT, ".release.json"), "utf8");
  // POSIX [[:space:]] -> JS \s; the rest of both patterns is plain ERE.
  const toJs = (p) => new RegExp(p.replaceAll("[[:space:]]", "\\s"), "g");
  const hits = raw.match(toJs(outer)) ?? [];
  assert.equal(hits.length, 1, `the outer grep matched ${hits.length} times: ${JSON.stringify(hits)}`);
  const num = (hits[0].match(toJs(inner)) ?? []).filter((x) => x !== "")[0];
  assert.equal(Number(num), release().nodeMajor);
});

test("the Dockerfile's node major agrees with the RUNTIME pin, and is recorded", () => {
  const r = release();
  assert.equal(typeof r.runtimeNodeMajor, "number",
    ".release.json does not record the deployment image's Node major");
  const df = readFileSync(join(ROOT, "colyseus-server/Dockerfile"), "utf8");
  const majors = [...df.matchAll(/FROM\s+node:(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(majors.length > 0, "no FROM node:<major> in colyseus-server/Dockerfile");
  for (const m of majors)
    assert.equal(m, r.runtimeNodeMajor,
      "the Dockerfile and .release.json disagree on the deployment Node major — determinism is a VERSION-PINNED contract");
});

test("the two pins are recorded as deliberately different, with the reason", () => {
  const r = release();
  assert.equal(typeof r.nodeMajorWhy, "string");
  assert.ok(r.nodeMajorWhy.length > 120, "the pin carries no stated reason");
  // If someone ever makes the two agree, this line is what tells them to
  // delete the second key and simplify the join rather than leave a
  // distinction that no longer distinguishes anything.
  if (r.nodeMajor === r.runtimeNodeMajor)
    assert.fail("nodeMajor and runtimeNodeMajor are now equal — collapse them to one key and simplify this suite");
});
