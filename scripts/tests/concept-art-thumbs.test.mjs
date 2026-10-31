// Each concept-art thumb must be a downscale of its own image. A thumb that
// exists and has legal dimensions can still show the wrong picture: on
// 2026-10-31 the raid boss card carried a contact sheet of other art.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// sharp 0.35 needs Node >= 20.9; CI is pinned to Node 18 (.release.json
// nodeMajor), where the import throws. Skip there rather than fail the gate;
// the guard still runs wherever sharp loads (Node 20+, local runs).
let sharp = null;
let skipReason = false;
try {
  sharp = (await import("sharp")).default;
} catch (err) {
  skipReason = `sharp unavailable on Node ${process.versions.node}: ${err.message.split("\n")[0]}`;
}

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../content/concept-art");
const SIZE = 32;

async function fingerprint(path) {
  return sharp(path).resize(SIZE, SIZE, { fit: "fill" }).removeAlpha().raw().toBuffer();
}

function distance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

test("every thumb is closest to its own image and nearly identical to it", { skip: skipReason }, async () => {
  const items = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")).items;
  const images = await Promise.all(items.map((i) => fingerprint(join(DIR, i.file))));
  for (const [index, item] of items.entries()) {
    const thumb = await fingerprint(join(DIR, item.thumb));
    const distances = images.map((image) => distance(thumb, image));
    const own = distances[index];
    assert.ok(own < 6, `${item.id}: thumb differs from its image by ${own.toFixed(1)}`);
    assert.equal(own, Math.min(...distances), `${item.id}: thumb is closer to another image`);
  }
});
