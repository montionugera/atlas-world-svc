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

// THE TERRAIN STREAM, named once so nothing can build the world from the
// wrong seed again.
//
// This is a seam-3 defect, found by the adjudicating fix pass and missed by
// both reviews. `content/world/manifest.json`'s `seed` is the WORLD seed, the
// parent of four named streams; the terrain field is built from the child
// stream `mintSeed(seed, "terrain")`, which is committed in
// `content/spine/derived.json` as `n-atlas.resolvedSeedStreams.terrain`.
// Seam 2's fit (fit-premises.mjs), mask.test.mjs and rank-select.test.mjs all
// use that child correctly. Seam 3's real-world goldens — arcs.test.mjs and
// water.test.mjs — passed `manifest.seed` itself, so they generated a
// DIFFERENT WORLD from the one the premise footprints were fitted to:
// seaLevel 0.04435581713914871 against the fitted 0.043565794825553894, and
// per-continent land off its own areaBandKm2 by up to -59% (c12 407.25 km2
// against a [900, 1100] band) while the thirteen still summed to 65,600.
// On the terrain stream the same thirteen land within 0.05% of target.
//
// tests/water.test.mjs joins this to the committed derived.json record, so the
// two cannot drift apart silently.
export const TERRAIN_STREAM_NAME = "terrain";
export function terrainStream({ worldSeed }) {
  return mintSeed({ parentStream: worldSeed, name: TERRAIN_STREAM_NAME });
}
