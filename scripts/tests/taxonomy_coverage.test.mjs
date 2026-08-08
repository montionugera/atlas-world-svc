// F-038 — guard (T): every manifest `kind` must have a section in
// content/asset-taxonomy.json.
//
// tools/asset-storybook groups and labels its sections by `kind` through that
// registry. Before this guard, the storybook carried a hand-maintained label
// lookup that fell through to a generic capitalize-and-append-s branch on a
// miss, which is how 283 dungeon assets came to sit under a heading reading
// "Model3d:dungeons (283)". A miss was indistinguishable from a hit and
// nothing failed.
//
// Runs the gate as a subprocess against a fixture tree — the same pattern as
// check_asset_manifest.test.mjs, and necessary because the gate calls main()
// at module load, so importing it would run the whole gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_asset_manifest.mjs");

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100" +
    "05fe02fea7b3a4e50000000049454e44ae426082",
  "hex",
);

// A fixture whose catalog carries one entry of the given kind. The entry is a
// plain PNG so it passes the per-entry guards and the run reaches guard (T).
function fixture({ kind, taxonomyKinds }) {
  const dir = mkdtempSync(join(tmpdir(), "taxgate-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "art", "concept"), { recursive: true });
  writeFileSync(join(dir, "assets", "thing.png"), PNG_1X1);

  writeFileSync(
    join(dir, "catalog.json"),
    JSON.stringify({
      version: 1,
      entries: {
        "prop:thing": {
          kind,
          scene: "res://assets/thing.png",
          license: "CC0",
          source: "test",
        },
      },
    }),
  );

  writeFileSync(
    join(dir, "taxonomy.json"),
    JSON.stringify({
      version: 1,
      sections: [
        {
          id: "sect",
          label: "A Real Label",
          order: 10,
          kinds: taxonomyKinds,
        },
      ],
    }),
  );

  writeFileSync(
    join(dir, "art-groups.json"),
    JSON.stringify({ version: 1, groups: [{ id: "cast", label: "Cast" }] }),
  );
  writeFileSync(
    join(dir, "art-manifest.json"),
    JSON.stringify({ version: 1, entries: {} }),
  );
  writeFileSync(
    join(dir, "keys.json"),
    JSON.stringify({ version: 1, keys: [] }),
  );
  writeFileSync(
    join(dir, "render-spec.json"),
    JSON.stringify({
      version: 1,
      renderers: {
        image: { pathField: "scene", sceneLoadable: false, require: [] },
      },
      kindDefaultRender: {},
      extRender: { ".png": "image" },
      codegenReservedNamespaces: [],
    }),
  );
  for (const n of ["manifest", "audio", "music"])
    writeFileSync(
      join(dir, `${n}.json`),
      JSON.stringify({ version: 1, entries: {} }),
    );
  return dir;
}

function runGate(dir) {
  const args = [
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
    join(dir, "art"),
    "--game-client",
    dir,
    "--taxonomy",
    join(dir, "taxonomy.json"),
  ];
  try {
    return { code: 0, out: execFileSync("node", args, { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}

test("guard (T): an unregistered kind fails the gate", () => {
  const dir = fixture({ kind: "sasquatch", taxonomyKinds: ["prop"] });
  const { code, out } = runGate(dir);
  assert.notEqual(code, 0, "gate must exit non-zero on an unregistered kind");
  assert.match(out, /sasquatch/);
  assert.match(out, /asset-taxonomy\.json/);
});

test("guard (T): a registered kind passes clean", () => {
  const dir = fixture({ kind: "prop", taxonomyKinds: ["prop"] });
  const { code, out } = runGate(dir);
  assert.equal(code, 0, `gate should pass but said:\n${out}`);
  assert.doesNotMatch(out, /asset-taxonomy\.json/);
});

test("guard (T): a missing taxonomy file is itself a failure", () => {
  const dir = fixture({ kind: "prop", taxonomyKinds: ["prop"] });
  const args = [GATE, "--taxonomy", join(dir, "nope.json")];
  let code = 0;
  let out = "";
  try {
    out = execFileSync("node", args, { encoding: "utf8" });
  } catch (e) {
    code = e.status;
    out = (e.stdout || "") + (e.stderr || "");
  }
  assert.notEqual(code, 0);
  assert.match(out, /asset-taxonomy: file not found/);
});
