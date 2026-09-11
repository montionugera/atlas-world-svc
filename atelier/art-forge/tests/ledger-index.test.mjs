import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildIndex } from "../ledger-index.mjs";

test("index lists every brief with a ledger and nothing else", () => {
  const dir = mkdtempSync(join(tmpdir(), "idx-"));
  try {
    writeFileSync(
      join(dir, "A1-ART-02.json"),
      '{"v":1,"briefId":"A1-ART-02"}\n{"type":"render"}\n',
    );
    writeFileSync(join(dir, "_stray.txt"), "ignore me");
    const idx = rebuildIndex(dir);
    assert.deepEqual(idx, { v: 1, briefs: ["A1-ART-02"] });
    const onDisk = JSON.parse(readFileSync(join(dir, "_index.json"), "utf8"));
    assert.deepEqual(onDisk.briefs, ["A1-ART-02"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
