// tools/mapforge/lib/seed.mjs — Plan C: named seed streams.
//
// Lifted out of lib/world-gen.mjs so the construction is unchanged: streams
// are NAMED, not sequential, so adding a pass never perturbs an earlier one.
// n-atlas.json already carries four resolved streams (terrain / settlements /
// vegetation / names) minted the same way by scripts/lib/spine.mjs's
// streamSeed().
//
// No transcendentals and no ** operator: tests/noise-determinism.test.mjs
// scans this file's own source text, so a violation here is a red suite and
// not a comment nobody reads.
import { createHash } from "node:crypto";

export function mintSeed({ parentStream, name }) {
  return createHash("sha256").update(`${parentStream}:${name}`).digest("hex").slice(0, 16);
}
