// F-039 — Forge tab gallery: render-only cards grouped by recipe version
// (briefHash). Pure data contract for js/forge/gallery.mjs; the DOM layer in
// js/forge/forge.mjs renders these batches. Mirrors tests/forge-staleness.test.mjs
// conventions: node:test, no DOM.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildForgeGallery } from "../js/forge/gallery.mjs";

const render = (over = {}) => ({
  type: "render",
  seed: 12345,
  hires: false,
  control: "depth",
  strength: 0.4,
  briefHash: "aaaa0000aaaa0000",
  out: "out/env/A1-ART-02-seed12345-s0.40.png",
  ts: "2026-08-30T17:35:25.768Z",
  ...over,
});

test("only render attempts become cards; blockin/gate/intake are dropped", () => {
  const attempts = [
    { type: "blockin", briefHash: "aaaa0000aaaa0000", out: "out/control/depth/a.png" },
    render(),
    { type: "gate", png: "out/env/A1-ART-02-seed12345-s0.40.png", ok: true },
    { type: "intake", assetKey: "environment/a" },
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].cards.length, 1);
  assert.equal(batches[0].cards[0].entry.type, "render");
});

test("cards group by briefHash into separate batches", () => {
  const attempts = [
    render({ briefHash: "aaaa0000aaaa0000" }),
    render({ briefHash: "bbbb0000bbbb0000", out: "out/env/b.png" }),
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.deepEqual(
    batches.map((b) => b.briefHash).sort(),
    ["aaaa0000aaaa0000", "bbbb0000bbbb0000"],
  );
});

test("batches are ordered newest-first by their newest render ts", () => {
  const attempts = [
    render({ briefHash: "old0000old00000", ts: "2026-08-28T10:00:00Z", out: "out/env/old.png" }),
    render({ briefHash: "new0000new00000", ts: "2026-08-31T10:00:00Z", out: "out/env/new.png" }),
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.equal(batches[0].briefHash, "new0000new00000");
  assert.equal(batches[1].briefHash, "old0000old00000");
});

test("cards within a batch are ordered newest-first", () => {
  const attempts = [
    render({ ts: "2026-08-29T10:00:00Z", out: "out/env/older.png", seed: 1 }),
    render({ ts: "2026-08-30T10:00:00Z", out: "out/env/newer.png", seed: 2 }),
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.deepEqual(batches[0].cards.map((c) => c.entry.seed), [2, 1]);
});

test("batch carries its card count and keeps original attempt indices", () => {
  const attempts = [
    { type: "blockin", briefHash: "aaaa0000aaaa0000", out: "out/control/depth/a.png" },
    render({ seed: 1, out: "out/env/one.png", ts: "2026-08-30T18:00:00Z" }),
    { type: "blockin", briefHash: "aaaa0000aaaa0000", out: "out/control/depth/b.png" },
    render({ seed: 2, out: "out/env/two.png", ts: "2026-08-30T17:00:00Z" }),
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.equal(batches[0].cards.length, 2);
  assert.deepEqual(batches[0].cards.map((c) => c.index), [1, 3]);
});

test("equal-ts cards keep ledger order (stable tie-break)", () => {
  const attempts = [
    render({ seed: 1, out: "out/env/one.png" }),
    render({ seed: 2, out: "out/env/two.png" }),
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.deepEqual(batches[0].cards.map((c) => c.index), [0, 1]);
});

test("stale flag rides the original attempt index, not the filtered card index", () => {
  const attempts = [
    render({ out: "out/env/cur.png" }),
    { type: "blockin", briefHash: "aaaa0000aaaa0000", out: "out/control/depth/a.png" },
    render({ out: "out/env/oldhash.png" }),
  ];
  const staleFlags = [false, false, true];
  const batches = buildForgeGallery(attempts, staleFlags);
  const byOut = new Map(batches[0].cards.map((c) => [c.entry.out, c]));
  assert.equal(byOut.get("out/env/cur.png").stale, false);
  assert.equal(byOut.get("out/env/oldhash.png").stale, true);
});

test("gate entries attach to their render via png: flag when not ok, ok when ok", () => {
  const attempts = [
    render({ out: "out/env/fail.png" }),
    { type: "gate", png: "out/env/fail.png", ok: false, reasons: ["bridge detected"] },
    render({ out: "out/env/pass.png" }),
    { type: "gate", png: "out/env/pass.png", ok: true },
  ];
  const batches = buildForgeGallery(attempts, []);
  const byOut = new Map(batches[0].cards.map((c) => [c.entry.out, c]));
  assert.deepEqual(byOut.get("out/env/fail.png").gate, { state: "flag" });
  assert.deepEqual(byOut.get("out/env/pass.png").gate, { state: "ok" });
});

test("gate-skipped entries attach as skipped; latest gate entry for a png wins", () => {
  const attempts = [
    render({ out: "out/env/skip.png" }),
    { type: "gate-skipped", png: "out/env/skip.png", reason: "no gate available" },
    render({ out: "out/env/flip.png" }),
    { type: "gate", png: "out/env/flip.png", ok: true },
    { type: "gate", png: "out/env/flip.png", ok: false },
  ];
  const batches = buildForgeGallery(attempts, []);
  const byOut = new Map(batches[0].cards.map((c) => [c.entry.out, c]));
  assert.deepEqual(byOut.get("out/env/skip.png").gate, { state: "skipped" });
  assert.deepEqual(byOut.get("out/env/flip.png").gate, { state: "flag" });
});

test("a render with no gate entry has gate null; gate for a missing png is ignored", () => {
  const attempts = [
    render(),
    { type: "gate", png: "out/env/never-rendered.png", ok: false },
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.equal(batches[0].cards[0].gate, null);
});

test("isDev comes from -dev- in the out path", () => {
  const attempts = [
    render({ out: "out/env/A1-ART-02-dev-seed12345-s0.40.png" }),
    render({ out: "out/env/A1-ART-02-segment-seed12345-s0.45.png" }),
  ];
  const batches = buildForgeGallery(attempts, []);
  const byOut = new Map(batches[0].cards.map((c) => [c.entry.out, c]));
  assert.equal(byOut.get("out/env/A1-ART-02-dev-seed12345-s0.40.png").isDev, true);
  assert.equal(byOut.get("out/env/A1-ART-02-segment-seed12345-s0.45.png").isDev, false);
});

test("anchor variants with null strength still become cards", () => {
  const attempts = [render({ strength: null, control: "anchor-colour" })];
  const batches = buildForgeGallery(attempts, []);
  assert.equal(batches[0].cards.length, 1);
  assert.equal(batches[0].cards[0].entry.strength, null);
});

test("renders without a parsable ts sort last within their batch", () => {
  const attempts = [
    render({ out: "out/env/no-ts.png", ts: undefined }),
    render({ out: "out/env/dated.png", ts: "2026-08-30T10:00:00Z" }),
  ];
  const batches = buildForgeGallery(attempts, []);
  assert.deepEqual(batches[0].cards.map((c) => c.entry.out), [
    "out/env/dated.png",
    "out/env/no-ts.png",
  ]);
});

test("empty attempts yield no batches", () => {
  assert.deepEqual(buildForgeGallery([], []), []);
});
