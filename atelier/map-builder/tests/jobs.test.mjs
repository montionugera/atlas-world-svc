import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobStore, newJobId, JOB_ID } from "../lib/jobs.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "mb-jobs-"));

test("ids are sortable and match the grammar", () => {
  const a = newJobId(new Date("2026-09-13T14:02:01Z")); const b = newJobId(new Date("2026-09-13T14:02:02Z"));
  assert.match(a, JOB_ID); assert.ok(a < b);
});
test("create/get/update round-trip persists JSON", () => {
  const dir = tmp(); const s = createJobStore({ dir });
  const j = s.create({ kind: "draft", seed: "3f81c0aa9d2e5b17", reason: "x" });
  assert.equal(j.status, "queued"); assert.ok(j.createdAt);
  s.update(j.id, { status: "running", startedAt: "t" });
  assert.equal(createJobStore({ dir }).get(j.id).status, "running");
  rmSync(dir, { recursive: true, force: true });
});
test("list filters by kind/status/seed and is newest first with limit", () => {
  const dir = tmp(); const s = createJobStore({ dir });
  const ids = ["a", "b", "c"].map((_, i) => s.create({ kind: i ? "draft" : "publish", seed: "3f81c0aa9d2e5b17".replace("3f", `${i}f`) }).id);
  assert.deepEqual(s.list({}).map((j) => j.id), [...ids].reverse());
  assert.equal(s.list({ kind: "publish" }).length, 1);
  assert.equal(s.list({ seed: "1f81c0aa9d2e5b17" }).length, 1);
  assert.equal(s.list({ limit: 2 }).length, 2);
  rmSync(dir, { recursive: true, force: true });
});
test("logs append and tail", () => {
  const dir = tmp(); const s = createJobStore({ dir }); const j = s.create({ kind: "draft", seed: "3f81c0aa9d2e5b17" });
  s.appendLog(j.id, "l1\nl2\n"); s.appendLog(j.id, "l3\n");
  assert.equal(s.readLog(j.id, { tail: 2 }), "l2\nl3\n");
  rmSync(dir, { recursive: true, force: true });
});
test("recoverInterrupted marks queued/running as interrupted", () => {
  const dir = tmp(); let s = createJobStore({ dir });
  const q = s.create({ kind: "draft", seed: "3f81c0aa9d2e5b17" }); const r = s.create({ kind: "draft", seed: "4f81c0aa9d2e5b17" }); s.update(r.id, { status: "running" });
  const d = s.create({ kind: "draft", seed: "5f81c0aa9d2e5b17" }); s.update(d.id, { status: "succeeded" });
  s = createJobStore({ dir });
  assert.deepEqual(new Set(s.recoverInterrupted()), new Set([q.id, r.id]));
  assert.equal(s.get(d.id).status, "succeeded"); assert.equal(s.get(r.id).status, "interrupted");
  rmSync(dir, { recursive: true, force: true });
});
test("get rejects a malformed id without touching the filesystem", () => {
  const s = createJobStore({ dir: tmp() });
  assert.throws(() => s.get("../etc/passwd"), /invalid job id/);
});
