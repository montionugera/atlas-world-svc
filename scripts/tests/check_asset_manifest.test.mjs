import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_asset_manifest.mjs");

// A 1x1 PNG — real payload, so the LFS-pointer check has something valid to pass.
const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100" +
    "05fe02fea7b3a4e50000000049454e44ae426082",
  "hex",
);

const GROUPS = {
  version: 1,
  groups: [
    { id: "cast", label: "Cast" },
    { id: "race", label: "Races" },
    { id: "mob", label: "Mobs" },
  ],
  expectedCounts: { race: 2 },
};

// Builds a self-contained fixture tree and returns the flag set that points the
// gate at it. Only the art source varies per test; the other four sources are
// minimal-but-valid so the gate reaches the art code path.
function fixture({ entries, groups = GROUPS, files = ["a.png", "b.png"] }) {
  const dir = mkdtempSync(join(tmpdir(), "artgate-"));
  const artRoot = join(dir, "art");
  mkdirSync(join(artRoot, "concept"), { recursive: true });
  for (const f of files) writeFileSync(join(artRoot, "concept", f), PNG_1X1);

  writeFileSync(join(dir, "art-groups.json"), JSON.stringify(groups));
  writeFileSync(
    join(dir, "art-manifest.json"),
    JSON.stringify({ version: 1, entries }),
  );
  writeFileSync(
    join(dir, "keys.json"),
    JSON.stringify({ version: 1, keys: [] }),
  );
  writeFileSync(
    join(dir, "render-spec.json"),
    JSON.stringify({
      version: 1,
      renderers: { image: { sceneLoadable: false, require: [] } },
      kindDefaultRender: {},
      extRender: { ".png": "image" },
      codegenReservedNamespaces: ["mob:", "item:"],
    }),
  );
  for (const n of ["manifest", "audio", "catalog", "music"])
    writeFileSync(
      join(dir, `${n}.json`),
      JSON.stringify({ version: 1, entries: {} }),
    );

  return { dir, artRoot };
}

function runGate({ dir, artRoot }) {
  try {
    const stdout = execFileSync(
      "node",
      [
        GATE,
        "--keys",
        join(dir, "keys.json"),
        "--render-spec",
        join(dir, "render-spec.json"),
        "--manifest",
        join(dir, "manifest.json"),
        "--audio-manifest",
        join(dir, "audio.json"),
        "--catalog-manifest",
        join(dir, "catalog.json"),
        "--music-manifest",
        join(dir, "music.json"),
        "--art-manifest",
        join(dir, "art-manifest.json"),
        "--art-groups",
        join(dir, "art-groups.json"),
        "--art-root",
        artRoot,
        "--game-client",
        dir,
      ],
      { encoding: "utf8" },
    );
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || "" };
  }
}

const ok = (over = {}) => ({
  group: "cast",
  title: "A",
  note: "Z-Image Turbo, local generation",
  file: "concept/a.png",
  ...over,
});

test("healthy art manifest passes", () => {
  const f = fixture({
    entries: {
      "art:cast-a": ok(),
      "art:cast-b": ok({ file: "concept/b.png", title: "B" }),
    },
    groups: { ...GROUPS, expectedCounts: {} },
  });
  const r = runGate(f);
  assert.equal(r.code, 0, r.stdout);
});

test("entry pointing at a missing file fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ file: "concept/nope.png" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /art:cast-a.*file not found/);
});

test("undeclared group fails", () => {
  const f = fixture({
    entries: { "art:zzz-a": ok({ group: "zzz" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /not declared in art-groups\.json/);
});

test("missing note fails — provenance is required", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ note: "" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /missing note/);
});

test("absolute or res:// file path fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ file: "res://concept/a.png" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /must be a relative path/);
});

test("a Git LFS pointer stub fails instead of passing as an image", () => {
  const f = fixture({
    entries: { "art:cast-a": ok() },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  // Overwrite the real PNG with what a fresh clone without `git lfs pull` has.
  writeFileSync(
    join(f.artRoot, "concept/a.png"),
    "version https://git-lfs.github.com/spec/v1\noid sha256:deadbeef\nsize 12345\n",
  );
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Git LFS pointer/);
});

test("an image on disk with no manifest entry fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok() }, // b.png exists on disk but is unclaimed
    groups: { ...GROUPS, expectedCounts: {} },
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /no manifest entry.*b\.png/);
});

test("a group short of its expected count fails", () => {
  const f = fixture({
    entries: {
      "art:race-a": ok({ group: "race" }),
      "art:race-b": ok({ group: "race", file: "concept/b.png" }),
      "art:race-c": ok({ group: "race", file: "concept/c.png" }),
    },
    groups: { ...GROUPS, expectedCounts: { race: 8 } },
    files: ["a.png", "b.png", "c.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /group "race": expected 8 entries, found 3/);
});

// ---------- F-024: optional rich-metadata fields ----------
// (description, tags, source, gen) — all optional, validated when present.

const GEN = {
  model: "z_image_turbo_bf16",
  steps: 24,
  cfg: 3,
  seed: 12345,
  denoise: 0.8,
  width: 1280,
  height: 832,
};

test("a rich entry with description/tags/source/gen all valid passes", () => {
  const f = fixture({
    entries: {
      "art:cast-a": ok({
        description: "A weathered crossroads figure in a wide-brimmed coat.",
        tags: ["cluster-1", "coastal", "port"],
        source: "docs/worldbuilding/A1-geography-cluster1.md#A1-ART-05",
        gen: GEN,
      }),
    },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 0, r.stdout);
});

test("existing entries with none of the optional fields still pass (backward compat)", () => {
  const f = fixture({
    entries: { "art:cast-a": ok() },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 0, r.stdout);
});

test("empty description fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ description: "   " }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /description must be a non-empty string/);
});

test("empty source fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ source: "" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /source must be a non-empty string/);
});

test("tags as a comma string instead of an array fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ tags: "cluster-1,coastal" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tags must be a non-empty array of non-empty strings/);
});

test("tags array containing an empty string fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ tags: ["cluster-1", ""] }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tags must be a non-empty array of non-empty strings/);
});

test("empty tags array fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ tags: [] }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tags must be a non-empty array of non-empty strings/);
});

test("gen as a non-object (string) fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: "z_image_turbo_bf16" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen must be an object/);
});

test("gen as an array fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: [1, 2, 3] }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen must be an object/);
});

test("gen.model empty string fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: { ...GEN, model: "" } }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen\.model must be a non-empty string/);
});

test("gen.steps as a string fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: { ...GEN, steps: "24" } }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen\.steps must be a number/);
});

test("gen.seed as a non-integer number fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: { ...GEN, seed: 12345.5 } }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen\.seed must be an integer/);
});

test("gen.width zero or negative fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: { ...GEN, width: 0 } }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen\.width must be positive/);
});

test("gen.cfg non-finite (NaN via bad JSON-safe value) fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ gen: { ...GEN, cfg: "3" } }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gen\.cfg must be a number/);
});
