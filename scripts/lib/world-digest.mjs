// G-WORLD-DIGEST (spec §9.3 layer 2).
//
// The freeze bought one thing: a coordinate change became a loud reviewable
// byte diff. Under generated land, coordinates ARE generated, so pinning
// individual anchors is both wrong and useless. This replaces it at the whole-
// world level: one sha256 over fabric + resolved + trunk. A deliberate
// regeneration updates one line; an accidental one reddens the gate.
//
// Per-input digests, not one opaque number: "the world changed" is useless in
// review, "content/world/resolved changed and nothing else did" is a finding.
//
// An ABSENT input is recorded as "absent", never skipped — otherwise the
// arrival of content/world/fabric/ (Plan C) would be invisible to the digest,
// which is the one moment it most needs to be visible.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const WORLD_DIGEST_INPUTS = Object.freeze([
  "content/world/fabric",
  "content/world/resolved",
  "content/spine/nodes",
]);

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * sha256 over `<relpath>\0<bytes>\0` for every file, in sorted path order.
 * Hashing the PATH is what makes a rename a change; hashing only the bytes
 * would call a rename a no-op.
 */
function digestOf({ repoRoot, dir }) {
  const h = createHash("sha256");
  for (const f of filesUnder(dir)) {
    h.update(relative(repoRoot, f).split("\\").join("/"));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return `sha256:${h.digest("hex")}`;
}

export function computeWorldDigest({ repoRoot, inputs = WORLD_DIGEST_INPUTS }) {
  const perInput = {};
  for (const rel of inputs) {
    const dir = join(repoRoot, rel);
    perInput[rel] = existsSync(dir) ? digestOf({ repoRoot, dir }) : "absent";
  }
  const roll = createHash("sha256");
  for (const rel of inputs) { roll.update(rel); roll.update("\0"); roll.update(perInput[rel]); roll.update("\0"); }
  return { version: 1, inputs: perInput, digest: `sha256:${roll.digest("hex")}` };
}

/** Never throws. Names the moved layer FIRST, then the roll-up. */
export function checkWorldDigest({ committed, computed }) {
  const problems = [];
  const keys = new Set([...Object.keys(committed?.inputs ?? {}), ...Object.keys(computed.inputs)]);
  for (const k of [...keys].sort()) {
    const want = committed?.inputs?.[k], got = computed.inputs[k];
    if (want !== got)
      problems.push(`G-WORLD-DIGEST: input "${k}" is ${got} != committed ${want}`);
  }
  if (committed?.digest !== computed.digest)
    problems.push(`G-WORLD-DIGEST: world digest ${computed.digest} != committed ${committed?.digest} — a deliberate regeneration updates this one line with \`node scripts/check_world_digest.mjs --write\`; an accidental one is this failure`);
  return problems;
}
