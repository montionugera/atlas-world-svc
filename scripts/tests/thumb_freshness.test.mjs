// F-038 — guard (U): every manifest entry must have a thumbnail, and that
// thumbnail must have been baked from the source bytes now on disk.
//
// tools/asset-storybook renders every card from a baked thumbnail, so a
// thumbnail that does not match its source is a card that LIES about what the
// asset looks like — the reviewer judges a stale image and files a verdict
// against it.
//
// The rule is a CONTENT HASH recorded by the bake in .thumbs/index.json, not
// an mtime comparison. mtime only means something on a tree edited in place;
// on a fresh `git checkout` every file gets its own write time in checkout
// order, and `.thumbs` sorts first under assets/, so the old rule called all
// 643 entries stale in CI while passing locally. These tests therefore vary
// the recorded hash, never the timestamps.
//
// Pure filesystem + stdlib hashing: CI needs neither Blender nor sharp to run
// it, only `node scripts/bake_thumbnails.mjs` does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { thumbFilename, sourceHash } from "../lib/thumbkey.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_asset_manifest.mjs");

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100" +
    "05fe02fea7b3a4e50000000049454e44ae426082",
  "hex",
);

const SRC_RES = "res://assets/thing.png";

// thumbState: "fresh" | "stale" | "unrecorded" | "missing"
//   fresh       thumbnail present, index records the source's real hash
//   stale       thumbnail present, index records a DIFFERENT hash — i.e. the
//               asset was edited after the bake
//   unrecorded  thumbnail present but the index never heard of it, so nothing
//               proves which bytes it came from
//   missing     no thumbnail at all
function fixture(thumbState) {
  const dir = mkdtempSync(join(tmpdir(), "thumbgate-"));
  mkdirSync(join(dir, "assets", ".thumbs"), { recursive: true });
  mkdirSync(join(dir, "art", "concept"), { recursive: true });

  const src = join(dir, "assets", "thing.png");
  writeFileSync(src, PNG_1X1);

  if (thumbState !== "missing") {
    const thumb = join(dir, "assets", ".thumbs", thumbFilename(SRC_RES));
    writeFileSync(thumb, PNG_1X1);
    // Backdate the thumbnail an hour behind the source in EVERY state. Under
    // the old mtime rule that alone said "stale"; under the hash rule it is
    // irrelevant, which is exactly the regression these tests pin.
    const srcSec = Date.now() / 1000;
    utimesSync(src, srcSec, srcSec);
    utimesSync(thumb, srcSec - 3600, srcSec - 3600);

    const entries = {};
    if (thumbState === "fresh" || thumbState === "stale") {
      entries[SRC_RES] = {
        thumb: thumbFilename(SRC_RES),
        bytes: PNG_1X1.length,
        w: 1,
        h: 1,
        srcHash: thumbState === "fresh" ? sourceHash(src) : "0000000000000000",
      };
    }
    writeFileSync(
      join(dir, "assets", ".thumbs", "index.json"),
      JSON.stringify({ version: 1, entries }),
    );
  }

  writeFileSync(
    join(dir, "catalog.json"),
    JSON.stringify({
      version: 1,
      entries: {
        "prop:thing": {
          kind: "prop",
          scene: SRC_RES,
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
      sections: [{ id: "prop", label: "Props", order: 10, kinds: ["prop"] }],
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

test("guard (U): a thumbnail whose recorded hash matches the source passes", () => {
  const { code, out } = runGate(fixture("fresh"));
  assert.equal(code, 0, `expected pass, got:\n${out}`);
});

test("guard (U): an older mtime alone is NOT stale — only the hash decides", () => {
  // The regression this guard shipped with: `git checkout` writes .thumbs
  // first, so every source is "newer" than its thumbnail on a tree nobody
  // edited. The fresh fixture above backdates the thumbnail by an hour and
  // must still pass; assert that explicitly so nobody reintroduces mtime.
  const { code, out } = runGate(fixture("fresh"));
  assert.equal(code, 0);
  assert.doesNotMatch(out, /STALE/);
});

test("guard (U): a source edited since the bake is STALE and fails", () => {
  const { code, out } = runGate(fixture("stale"));
  assert.notEqual(code, 0);
  assert.match(out, /STALE/);
  assert.match(out, /prop:thing/);
  assert.match(out, /bake_thumbnails\.mjs/);
});

test("guard (U): a thumbnail absent from the index is UNRECORDED and fails", () => {
  // A thumbnail nothing vouches for is indistinguishable from a stale one —
  // the bake stamps srcHash only for images it actually rendered, so a gap
  // here means the bake failed or was never run for that entry.
  const { code, out } = runGate(fixture("unrecorded"));
  assert.notEqual(code, 0);
  assert.match(out, /UNRECORDED/);
  assert.match(out, /prop:thing/);
  assert.match(out, /bake_thumbnails\.mjs/);
});

test("guard (U): a missing thumbnail fails and names the bake script", () => {
  const { code, out } = runGate(fixture("missing"));
  assert.notEqual(code, 0);
  assert.match(out, /missing thumbnail/);
  assert.match(out, /bake_thumbnails\.mjs/);
});

test("guard (U): audio entries are exempt — an .ogg has nothing to thumbnail", () => {
  // render-spec gives audio/music pathField "stream", and the storybook
  // renders those as soundboard tiles, not thumbnail cards. Requiring a
  // thumbnail for them produced 38 spurious failures on the real repo.
  const dir = fixture("missing");
  writeFileSync(
    join(dir, "assets", "boom.ogg"),
    Buffer.from("OggS_not_really_but_non_empty"),
  );
  // The shared fixture's render-spec only knows `image`; teach it audio so
  // the entry resolves to a real render-type and the run reaches guard (U).
  writeFileSync(
    join(dir, "render-spec.json"),
    JSON.stringify({
      version: 1,
      renderers: {
        image: { pathField: "scene", sceneLoadable: false, require: [] },
        audio: { pathField: "stream", sceneLoadable: false, require: [] },
      },
      kindDefaultRender: {},
      extRender: { ".png": "image", ".ogg": "audio" },
      codegenReservedNamespaces: [],
    }),
  );
  writeFileSync(
    join(dir, "audio.json"),
    JSON.stringify({
      version: 1,
      entries: {
        "sfx:boom": { stream: "res://assets/boom.ogg", license: "CC0" },
      },
    }),
  );
  // Remove the visual entry so the ONLY entry under test is the audio one.
  writeFileSync(
    join(dir, "catalog.json"),
    JSON.stringify({ version: 1, entries: {} }),
  );
  const { code, out } = runGate(dir);
  assert.equal(code, 0, `audio should not require a thumbnail, got:\n${out}`);
  assert.doesNotMatch(out, /missing thumbnail/);
});
