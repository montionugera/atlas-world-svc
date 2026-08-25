// F-050 Task 6 — forge staleness detection.
//
// The storybook is static: it recomputes the brief hash client-side and flags
// any ledger attempt whose recorded hash no longer matches. The browser path
// uses crypto.subtle; this file must stay pure (no DOM).
//
// CRITICAL invariant: digestHex here MUST produce hashes identical to
// tools/art-forge/lib/brief-hash.mjs (node:crypto) — same canonicalization,
// same sha256 truncated to 16 hex. The parity test at the bottom enforces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalBriefString, digestHex, markStale } from "../js/forge/staleness.mjs";

test("canonicalBriefString sorts keys and drops _note", () => {
  const s = canonicalBriefString({ b: 2, a: 1, _note: "x" });
  assert.equal(s, '{"a":1,"b":2}');
});

test("canonicalBriefString drops _note at all nesting levels", () => {
  const s = canonicalBriefString({
    id: "A",
    masses: [{ color: "#112233", _note: "inner thought" }],
  });
  assert.deepEqual(JSON.parse(s), {
    id: "A",
    masses: [{ color: "#112233" }],
  });
});

test("digestHex returns 16 lowercase hex chars", async () => {
  const h = await digestHex('{"a":1}');
  assert.match(h, /^[0-9a-f]{16}$/);
});

test("markStale flags only attempts whose briefHash differs from current", async () => {
  const cur = await digestHex('{"a":1}');
  const attempts = [
    { type: "render", briefHash: cur },
    { type: "render", briefHash: "dead0000dead0000" },
    { type: "gate" }, // no hash — inherits staleness of referenced png's render
  ];
  const flags = markStale(attempts, cur);
  assert.deepEqual(flags, [false, true, false]);
});

test("markStale: gate entries inherit staleness from their referenced render", () => {
  const cur = "aaaa0000aaaa0000";
  const attempts = [
    { type: "render", out: "out/env/a.png", briefHash: cur },
    { type: "gate", png: "out/env/a.png", ok: true },
    { type: "render", out: "out/env/b.png", briefHash: "bbbb0000bbbb0000" },
    { type: "gate-skipped", png: "out/env/b.png", reason: "no gate available" },
  ];
  assert.deepEqual(markStale(attempts, cur), [false, false, true, true]);
});

test("markStale: duplicate out paths keep the FIRST render's staleness", () => {
  const cur = "aaaa0000aaaa0000";
  const attempts = [
    { type: "render", out: "out/env/a.png", briefHash: cur },
    // Re-render of the same png under an older-era hash must not flip the
    // gate verdict for the png the gate actually inspected.
    { type: "render", out: "out/env/a.png", briefHash: "bbbb0000bbbb0000" },
    { type: "gate", png: "out/env/a.png", ok: true },
  ];
  assert.deepEqual(markStale(attempts, cur), [false, true, false]);
});

test("markStale: a render with no briefHash is marked stale (conservative)", () => {
  const cur = "aaaa0000aaaa0000";
  const attempts = [{ type: "render", out: "out/env/a.png" }];
  assert.deepEqual(markStale(attempts, cur), [true]);
});

test("markStale: non-visual stages are never stale", () => {
  const attempts = [
    { type: "blockin", out: "out/depth/A.png", briefHash: "cccc0000cccc0000" },
    { type: "intake", assetKey: "environment/a" },
  ];
  assert.deepEqual(markStale(attempts, "dddd0000dddd0000"), [false, false]);
});

// Cross-phase invariant: the browser canonicalization + crypto.subtle digest
// must equal the node-side normalizeBrief + node:crypto digest for a real
// brief object. (node:test runs in node, so importing the node module is fine.)
test("digestHex agrees with tools/art-forge/lib/brief-hash.mjs", async () => {
  const { normalizeBrief, briefHash } = await import(
    "../../../tools/art-forge/lib/brief-hash.mjs"
  );
  const brief = {
    id: "A1-ART-02",
    subject: "grove",
    prompt: "a grove at dusk",
    width: 1024,
    height: 640,
    horizon: 0.35,
    focal: [512, 300],
    _note: "scratch thought that must NOT affect identity",
    masses: [
      { plane: "bg", kind: "rect", x: 0, y: 0, w: 10, h: 5, color: "#223344", _note: "inner" },
      { plane: "fg", kind: "blob", x: 3, y: 2, w: 4, h: 4, color: "#556677" },
    ],
  };
  assert.equal(canonicalBriefString(brief), normalizeBrief(brief));
  assert.equal(await digestHex(normalizeBrief(brief)), briefHash(brief));
});
