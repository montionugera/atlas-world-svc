// F-039 — Environment-render parity gate. Mirrors maps-index.test.mjs (mapforge
// sheets) and world-index.test.mjs (civil layer) for the third artifact type:
// art-forge environment renders under tools/art-forge/out/env/.
//
// env-index.json (committed, sibling to this test) is the storybook's OWN
// registry of those renders. The owner rule — every produced artifact must be
// observable in a review surface (2026-08-15) — is made mechanical here: a
// render dropped into out/env/ without a row reds this suite. That closes the
// gap the town-canon reviewer flagged in
// docs/worldbuilding/reviews/2026-08-30-millcross-dev-roll-verdict.md
// (open question 2: "Wire art-forge env renders into the storybook before the
// next roll").
//
// Unlike the map thumbs, env renders are NEVER committed
// (tools/art-forge/.gitignore ignores out/), so this gate is existence-based:
// it enforces full parity wherever the renders exist and passes vacuously in a
// checkout (e.g. CI) that has none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const ENV_DIR = join(REPO_ROOT, "tools/art-forge/out/env");
const RUN_LOG_PATH = join(REPO_ROOT, "tools/art-forge/runs/A1-ART-02.json");
const index = JSON.parse(
  readFileSync(join(HERE, "..", "env-index.json"), "utf8"),
);
const rows = index.renders;

// The run log is JSONL: line 1 is the header, every later line an event.
// type:"render" events carry the recipe actually used; `out` is relative to
// tools/art-forge/. Re-renders of the same path overwrite: last event wins.
function runLogRendersByOut() {
  const byOut = new Map();
  for (const line of readFileSync(RUN_LOG_PATH, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    const event = JSON.parse(line);
    if (event.type !== "render") continue;
    byOut.set("tools/art-forge/" + event.out, event);
  }
  return byOut;
}

test("env-index.json exists and is well-formed", () => {
  assert.equal(index.version, 1);
  assert.ok(Array.isArray(rows), "index.renders must be an array");
  assert.ok(rows.length > 0, "index.renders must not be empty");
  const ids = new Set();
  for (const row of rows) {
    assert.equal(
      typeof row.id,
      "string",
      `${row.id}: every render row needs an id`,
    );
    assert.ok(!ids.has(row.id), `duplicate env-index row id "${row.id}"`);
    ids.add(row.id);
    assert.equal(
      row.file,
      `tools/art-forge/out/env/${row.id}.png`,
      `${row.id}: .file must be the repo-relative out/env path for the id`,
    );
    assert.ok(
      typeof row.roll === "string" && row.roll.length > 0,
      `${row.id}: every render row needs a roll grouping`,
    );
    assert.ok(
      row.provenance === "run-log" || row.provenance === "filename",
      `${row.id}: provenance must be "run-log" or "filename"`,
    );
  }
});

test("every render under tools/art-forge/out/env/ has a row — a render cannot hide", () => {
  if (!existsSync(ENV_DIR)) return; // CI checkout without renders: nothing to enforce
  const onDisk = readdirSync(ENV_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""))
    .sort();
  const indexed = rows.map((r) => r.id).sort();
  assert.deepEqual(
    indexed,
    onDisk,
    "env-index.json and tools/art-forge/out/env/ drift — a render exists " +
      "that is not observable in the storybook (or the index outlives its " +
      "files). Add the missing row, or drop the stale one.",
  );
});

test("every indexed render file exists on disk", () => {
  for (const row of rows) {
    assert.ok(
      existsSync(join(REPO_ROOT, row.file)),
      `${row.file} is indexed but does not exist on disk`,
    );
  }
});

test("seed and strength in the index match the render filename", () => {
  // Filenames are the render intake's own metadata (the dev-roll verdict's
  // "Rail changes" § notes parameters are "currently only recoverable from
  // filenames"), so the filename is a second provenance source the index
  // must agree with — this catches transcription errors in the hand-written
  // rows. `A1-ART-02-[variant-]seed<N>[-s<strength>].png`.
  for (const row of rows) {
    const match = row.id.match(/-seed(\d+)(?:-s(\d+(?:\.\d+)?))?$/);
    assert.ok(match, `${row.id}: filename does not carry a seed`);
    assert.equal(
      row.seed,
      Number(match[1]),
      `${row.id}: index seed ${row.seed} != filename seed ${match[1]}`,
    );
    assert.equal(
      row.strength,
      match[2] === undefined ? null : Number(match[2]),
      `${row.id}: index strength ${row.strength} != filename strength ` +
        `${match[2] === undefined ? "absent" : match[2]}`,
    );
  }
});

test("provenance matches the A1-ART-02 run log exactly", () => {
  const log = runLogRendersByOut();
  for (const row of rows) {
    const event = log.get(row.file);
    if (event) {
      assert.equal(
        row.provenance,
        "run-log",
        `${row.id}: the run log records this render, so provenance must be "run-log"`,
      );
      assert.equal(
        row.briefHash,
        event.briefHash,
        `${row.id}: briefHash disagrees with the run log`,
      );
      assert.equal(
        row.seed,
        event.seed,
        `${row.id}: seed disagrees with the run log`,
      );
      assert.equal(
        row.control,
        event.control,
        `${row.id}: control disagrees with the run log`,
      );
      assert.equal(
        row.strength,
        event.strength,
        `${row.id}: strength disagrees with the run log`,
      );
    } else {
      assert.equal(
        row.provenance,
        "filename",
        `${row.id}: no run-log entry, so provenance must be "filename"`,
      );
      assert.equal(
        row.briefHash,
        null,
        `${row.id}: briefHash must be null when the run log has no entry for it`,
      );
    }
  }
});

test("review links are verdict-sheet paths, and reviewed renders carry a note", () => {
  for (const row of rows) {
    assert.ok(
      Array.isArray(row.reviews),
      `${row.id}: reviews must be an array`,
    );
    for (const review of row.reviews) {
      assert.ok(
        review.startsWith("docs/worldbuilding/reviews/"),
        `${row.id}: review link "${review}" must point into docs/worldbuilding/reviews/`,
      );
    }
    if (row.reviews.length > 0) {
      assert.ok(
        typeof row.note === "string" && row.note.length > 20,
        `${row.id}: a render with a verdict beside it needs a note saying what the verdict was`,
      );
    }
  }
});

test("the A1-ART-02 dev rolls are wired to their verdict sheets", () => {
  // The acceptance criterion of the reviewer's ask, pinned: the dev roll the
  // 2026-08-30 verdict judged must be observable here, and so must the CURRENT
  // roll lineage's verdict. The s040/v3/v4 pins retired 2026-08-30: those
  // depth-path cells were superseded by the colour-anchor path and their files
  // left disk (the parity gate then required their rows dropped) — the sheets
  // stay committed in docs/worldbuilding/reviews/ and the run ledger holds the
  // provenance chain. The live anchor lineage's sheet is pinned in their place
  // so the next roll cannot land unwired.
  const reviewed = new Set(rows.flatMap((r) => r.reviews));
  assert.ok(
    reviewed.has(
      "docs/worldbuilding/reviews/2026-08-30-millcross-dev-roll-verdict.md",
    ),
    "no render row links the 2026-08-30-millcross-dev-roll-verdict.md verdict",
  );
  assert.ok(
    reviewed.has(
      "docs/worldbuilding/reviews/2026-08-30-millcross-anchor-v6-roll-verdict.md",
    ),
    "no render row links the pending 2026-08-30-millcross-anchor-v6-roll-verdict.md verdict",
  );
  const dev030 = rows.filter((r) => r.roll === "dev-0.30");
  assert.equal(
    dev030.length,
    3,
    "the dev-0.30 roll must index its three seed cells",
  );
});
