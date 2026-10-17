// F-053 Phase 1 — pipeline row model: one row per brief, four stage pills
// with counts, a stale count or "all fresh", "no ledger yet" for briefs the
// forge has never run, and a named error row for an unreadable ledger.
// Pure data only; buildPipelineRow is the thin DOM layer (smoke-tested).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STAGES,
  summarizePipeline,
  pipelineRowModel,
  forgeBriefIds,
  forgeSourceFailureText,
} from "../js/forge/pipeline.mjs";

const blockin = { type: "blockin", briefHash: "h1" };
const render = (over = {}) => ({ type: "render", seed: 1, briefHash: "h1", out: "out/env/a.png", ...over });

test("summarizePipeline counts every stage and folds gate-skipped into gate", () => {
  const attempts = [blockin, blockin, render(), { type: "gate-skipped", png: "out/env/a.png" }];
  const { stages } = summarizePipeline({ attempts, staleFlags: attempts.map(() => false) });
  assert.deepEqual(stages.map((s) => s.stage), STAGES);
  assert.deepEqual(stages.map((s) => s.count), [2, 1, 1, 0]);
  assert.deepEqual(stages.map((s) => s.status), ["done", "done", "done", "notrun"]);
});

test("a stage's status follows its LATEST attempt: stale beats flag, a failed gate is flag", () => {
  const attempts = [render(), { type: "gate", ok: false }, render({ seed: 2 })];
  const flagged = summarizePipeline({ attempts, staleFlags: [false, false, false] });
  assert.equal(flagged.stages[2].status, "flag");
  const stale = summarizePipeline({ attempts, staleFlags: [false, false, true] });
  assert.equal(stale.stages[1].status, "stale");
});

test("staleCount counts stale attempts; the row note reads 'N stale' or 'all fresh'", () => {
  const attempts = [render(), render({ seed: 2 }), render({ seed: 3 })];
  const staleModel = pipelineRowModel({ briefId: "A1", outcome: { kind: "ledger", attempts, staleFlags: [true, true, false] } });
  assert.equal(staleModel.state, "ledger");
  assert.equal(staleModel.note, "2 stale");
  assert.equal(staleModel.noteTone, "stale");
  assert.deepEqual(staleModel.cells.map((c) => c.text), ["blockin", "render 3", "gate", "intake"]);
  const fresh = pipelineRowModel({ briefId: "A1", outcome: { kind: "ledger", attempts, staleFlags: [false, false, false] } });
  assert.equal(fresh.note, "all fresh");
  assert.equal(fresh.noteTone, "done");
});

test("a brief with no ledger, or a header-only ledger, reads 'no ledger yet' with four not-run stages", () => {
  for (const outcome of [{ kind: "no-ledger" }, { kind: "ledger", attempts: [], staleFlags: [] }]) {
    const m = pipelineRowModel({ briefId: "A1-ART-03", outcome });
    assert.equal(m.note, "no ledger yet");
    assert.equal(m.noteTone, "notrun");
    assert.deepEqual(m.cells.map((c) => c.status), ["notrun", "notrun", "notrun", "notrun"]);
  }
});

test("an unreadable ledger becomes an error row carrying the line number", () => {
  const error = Object.assign(new Error("ledger attempt on line 3: malformed JSON line: {x"), { line: 3 });
  const m = pipelineRowModel({ briefId: "A1-ART-02", outcome: { kind: "error", error } });
  assert.equal(m.state, "error");
  assert.equal(m.noteTone, "error");
  assert.deepEqual(m.cells, []);
  assert.match(m.note, /^ledger A1-ART-02\.json unreadable \(line 3\): /);
});

test("forgeBriefIds lists the brief index first, then ledgered briefs the index lacks, no duplicates", () => {
  const ids = forgeBriefIds({
    briefsIndex: { briefs: [{ id: "A1-ART-02" }, { id: "A1-ART-03" }] },
    runsIndex: { briefs: ["A1-ART-02", "Z9-ORPHAN"] },
  });
  assert.deepEqual(ids, ["A1-ART-02", "A1-ART-03", "Z9-ORPHAN"]);
  assert.deepEqual(forgeBriefIds({ briefsIndex: null, runsIndex: { briefs: ["A1-ART-02"] } }), ["A1-ART-02"]);
});

test("forgeSourceFailureText says 'not packaged in this image' for a 404 and 'source failed' otherwise", () => {
  assert.equal(
    forgeSourceFailureText({ path: "atelier/art-forge/runs/_index.json", error: new Error("runs-index: HTTP 404") }),
    "not packaged in this image: atelier/art-forge/runs/_index.json",
  );
  assert.equal(
    forgeSourceFailureText({ path: "atelier/art-forge/runs/_index.json", error: new SyntaxError("Unexpected token") }),
    "source failed: atelier/art-forge/runs/_index.json — Unexpected token",
  );
});
