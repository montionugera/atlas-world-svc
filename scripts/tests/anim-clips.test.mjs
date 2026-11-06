import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glbClipNames, checkAnimClips } from "../lib/anim-clips.mjs";

const tmpDirs = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});
const mk = () => {
  const d = mkdtempSync(join(tmpdir(), "animclips-"));
  tmpDirs.push(d);
  return d;
};

// Minimal GLB: 12-byte header + one JSON chunk (padded to 4 bytes).
function glb(json) {
  let body = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (body.length % 4)) % 4;
  body = Buffer.concat([body, Buffer.alloc(pad, 0x20)]);
  const h = Buffer.alloc(20);
  h.writeUInt32LE(0x46546c67, 0);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(20 + body.length, 8);
  h.writeUInt32LE(body.length, 12);
  h.writeUInt32LE(0x4e4f534a, 16);
  const p = join(mk(), "m.glb");
  writeFileSync(p, Buffer.concat([h, body]));
  return p;
}
const CLIPS = [
  "idle",
  "walk",
  "run",
  "attack",
  "attack_2",
  "death",
  "block_idle",
  "hit",
];
const file = () =>
  glb({
    asset: { version: "2.0" },
    animations: CLIPS.map((name) => ({ name })),
  });
const full = {
  idle: "idle",
  walk: "walk",
  run: "run",
  attack: ["attack", "attack_2"],
  death: "death",
  combat_idle: "block_idle",
  hit: "hit",
};

test("glbClipNames reads the JSON chunk", () => {
  assert.deepEqual(glbClipNames(file()), CLIPS);
});

test("all mapped clips present (string and list) → no failure", () => {
  const f = [];
  checkAnimClips("npc:s", { anims: full }, file(), f);
  assert.deepEqual(f, []);
});

test("a renamed mapped clip fails, naming state and clip", () => {
  const f = [];
  checkAnimClips(
    "npc:s",
    { anims: { ...full, hit: "hit_RENAMED" } },
    file(),
    f,
  );
  assert.match(f.join(), /anims\.hit → clip "hit_RENAMED" not in/);
});

test("a renamed attack variant fails", () => {
  const f = [];
  checkAnimClips(
    "npc:s",
    { anims: { ...full, attack: ["attack", "attack_9"] } },
    file(),
    f,
  );
  assert.match(f.join(), /anims\.attack → clip "attack_9"/);
});

test("combat_idle without death fails completeness", () => {
  const { death, ...noDeath } = full;
  const f = [];
  checkAnimClips("npc:s", { anims: noDeath }, file(), f);
  assert.match(f.join(), /maps combat_idle but not death/);
});

test("an entry without combat_idle needs no combat set; no anims → no-op", () => {
  const f = [];
  checkAnimClips("mob:a", { anims: { idle: "idle" } }, file(), f);
  checkAnimClips("mob:b", {}, file(), f);
  assert.deepEqual(f, []);
});

test("an LFS pointer fails loudly instead of passing", () => {
  const p = join(mk(), "p.glb");
  writeFileSync(p, "version https://git-lfs.github.com/spec/v1\n");
  const f = [];
  checkAnimClips("npc:s", { anims: { idle: "idle" } }, p, f);
  assert.match(f.join(), /cannot read clips: not a binary glTF/);
});

test("an empty list fails", () => {
  const f = [];
  checkAnimClips("npc:s", { anims: { ...full, hit: [] } }, file(), f);
  assert.match(f.join(), /anims\.hit must be a clip name or a non-empty list/);
});

test("a non-string clip value fails", () => {
  const f = [];
  checkAnimClips("npc:s", { anims: { ...full, hit: 42 } }, file(), f);
  assert.match(f.join(), /anims\.hit must be a clip name or a non-empty list/);
});

test("a non-glb file (random bytes) fails with a clean reason", () => {
  const p = join(mk(), "x.glb");
  writeFileSync(p, Buffer.alloc(64, 7));
  const f = [];
  checkAnimClips("npc:s", { anims: { idle: "idle" } }, p, f);
  assert.match(f.join(), /cannot read clips: not a binary glTF/);
});

test("a JSON chunk length claiming extra bytes fails cleanly, no TypeError text", () => {
  const p = file();
  const b = readFileSync(p);
  b.writeUInt32LE(b.readUInt32LE(12) + 1000, 12);
  writeFileSync(p, b);
  const f = [];
  checkAnimClips("npc:s", { anims: { idle: "idle" } }, p, f);
  assert.match(
    f.join(),
    /cannot read clips: GLB JSON chunk length exceeds file size/,
  );
  assert.doesNotMatch(f.join(), /TypeError|ERR_|undefined/);
});

test("a header total length beyond the file fails cleanly", () => {
  const p = file();
  const b = readFileSync(p);
  b.writeUInt32LE(b.length + 500, 8);
  writeFileSync(p, b);
  const f = [];
  checkAnimClips("npc:s", { anims: { idle: "idle" } }, p, f);
  assert.match(
    f.join(),
    /cannot read clips: GLB header length exceeds file size/,
  );
});

test("a first chunk that is not JSON fails cleanly", () => {
  const p = file();
  const b = readFileSync(p);
  b.writeUInt32LE(0x004e4942, 16);
  writeFileSync(p, b);
  const f = [];
  checkAnimClips("npc:s", { anims: { idle: "idle" } }, p, f);
  assert.match(f.join(), /cannot read clips: first GLB chunk is not JSON/);
});
