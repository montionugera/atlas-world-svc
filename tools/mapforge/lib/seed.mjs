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

// THE FOUR RESERVED NAMES, and why this list is a MECHANISM rather than a note.
//
// `content/spine/derived.json` commits, for every spine node, four TOP-LEVEL
// streams minted from that node's own world seed:
//
//   resolvedSeedStreams = { terrain, settlements, vegetation, names }
//
// Three times now — seam 3, and twice inside seam 4 — a pass has minted a
// CHILD under one of those four names from a stream that is not the world
// seed, produced a different 16-hex value, and used it. The value is
// deterministic, the world is self-consistent, every golden is stable, and it
// is still the wrong stream:
//
//   * seam 3 built the whole terrain field from `manifest.seed` (the world
//     seed) instead of its `terrain` child, so the goldens pinned a world the
//     thirteen footprints had not been fitted to. Neither review found it.
//   * seam 4's `assignNames` minted `mintSeed(terrainStream, "names")` =
//     a39da863a8093b67 while derived.json commits
//     `n-atlas.resolvedSeedStreams.names` = 6033b1b1f52e861c. Two streams, one
//     name, and nothing joined them. Plan D mints the titles from the
//     COMMITTED one.
//
// Three occurrences is a guard, not a correction. So the reserved names are
// UNMINTABLE as children: `mintSeed` throws on them, and `namedStream` — which
// takes a `worldSeed`, never a parent stream — is the only way to spell one.
// A pass that wants a reserved stream must be HANDED it by a caller that read
// derived.json, and tests/noise-determinism.test.mjs asserts (a) this list is
// exactly the committed key set and (b) no source file under tools/mapforge
// mints a reserved name through mintSeed.
export const RESERVED_STREAM_NAMES = Object.freeze(["names", "settlements", "terrain", "vegetation"]);
const RESERVED = new Set(RESERVED_STREAM_NAMES);

const digest16 = (parentStream, name) =>
  createHash("sha256").update(`${parentStream}:${name}`).digest("hex").slice(0, 16);

/** A CHILD stream, minted under any name that is not one of the four the
 *  committed record already owns. */
export function mintSeed({ parentStream, name }) {
  if (RESERVED.has(name))
    throw new Error(
      `mintSeed: "${name}" is one of the four stream names content/spine/derived.json ` +
      `commits per node (${RESERVED_STREAM_NAMES.join(", ")}). Minting it as a child of ` +
      `${parentStream} produces a DIFFERENT value from the committed one under the same ` +
      `name — the seam-3 defect, third occurrence. Use namedStream({ worldSeed, name }) ` +
      `and join it to derived.json, or pick a name of your own.`);
  return digest16(parentStream, name);
}

/** One of the four RESERVED streams, minted from the WORLD seed — the same
 *  construction scripts/lib/spine.mjs's streamSeed() uses, which is what makes
 *  the result equal to the committed `resolvedSeedStreams` entry. */
export function namedStream({ worldSeed, name }) {
  if (!RESERVED.has(name))
    throw new Error(
      `namedStream: "${name}" is not one of the committed stream names ` +
      `(${RESERVED_STREAM_NAMES.join(", ")}) — use mintSeed for a child stream.`);
  return digest16(worldSeed, name);
}

// THE TERRAIN STREAM, named once so nothing can build the world from the
// wrong seed again.
//
// This is a seam-3 defect, found by the adjudicating fix pass and missed by
// both reviews. `content/world/manifest.json`'s `seed` is the WORLD seed, the
// parent of four named streams; the terrain field is built from the child
// stream `namedStream(seed, "terrain")`, which is committed in
// `content/spine/derived.json` as `n-atlas.resolvedSeedStreams.terrain` and is
// what `fit-premises.mjs`, `mask.test.mjs` and `rank-select.test.mjs` all use.
// Seam 3's real-world goldens — arcs.test.mjs and water.test.mjs — passed
// `manifest.seed` itself, so they generated a DIFFERENT WORLD from the one the
// premise footprints were fitted to: seaLevel 0.04435581713914871 against the
// fitted 0.043565794825553894, and per-continent land off its own areaBandKm2
// by up to -59% (c12 407.25 km2 against a [900, 1100] band) while the thirteen
// still summed to 65,600. On the terrain stream the same thirteen land within
// 0.05% of target.
//
// tests/water.test.mjs joins this to the committed derived.json record, so the
// two cannot drift apart silently.
export const TERRAIN_STREAM_NAME = "terrain";
export function terrainStream({ worldSeed }) {
  return namedStream({ worldSeed, name: TERRAIN_STREAM_NAME });
}
