import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUT = join(ROOT, "game-client/assets/art/maps/cluster1-world.svg");
const FIXTURE = join(HERE, "fixtures/basin-baseline.svg");

test("render-map.mjs reproduces the baseline byte-for-byte", () => {
  execFileSync(process.execPath, [join(ROOT, "tools/mapforge/render-map.mjs"), "--no-png"], { stdio: "pipe" });
  const got = readFileSync(OUT, "utf8");
  execFileSync("git", ["checkout", "--", OUT], { cwd: ROOT });
  assert.equal(got, readFileSync(FIXTURE, "utf8"));
});
