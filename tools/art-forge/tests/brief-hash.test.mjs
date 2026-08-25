import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBrief, briefHash } from "../lib/brief-hash.mjs";

const brief = {
  id: "A1-ART-02",
  subject: "grove",
  prompt: "a grove",
  width: 1024,
  height: 640,
  _note: "scratch thought that must NOT affect identity",
  masses: [
    {
      plane: "bg",
      kind: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 5,
      color: "#223344",
    },
  ],
};

test("normalization drops _note and sorts keys", () => {
  const n = JSON.parse(normalizeBrief(brief));
  assert.equal("_note" in n, false);
  assert.deepEqual(Object.keys(n), [
    "height",
    "id",
    "masses",
    "prompt",
    "subject",
    "width",
  ]);
});

test("briefHash is stable, 16-hex, ignores key order and _note", () => {
  const reordered = {
    masses: brief.masses,
    _note: "x",
    height: 640,
    id: "A1-ART-02",
    prompt: "a grove",
    subject: "grove",
    width: 1024,
  };
  const h1 = briefHash(brief);
  assert.match(h1, /^[0-9a-f]{16}$/);
  assert.equal(h1, briefHash(reordered));
});
