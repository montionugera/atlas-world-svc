// Rigid-skeleton animation normalization.
//
// Some donor character rigs (KayKit "Complete Pack" oversized bodies —
// orc_brute, 4gtn, the golems, blackknight …) ship with a TALLER rest
// skeleton than the standard adventurer rig, yet their baked clips contain
// the *standard* rig's per-bone translation tracks. On playback every
// non-root bone yanks from its tall rest position down to the small-rig
// position and the whole model collapses vertically ("crush").
//
// A rigid humanoid skeleton must never translate its non-root bones — bone
// lengths are fixed, only rotations (and the root, for motion) drive the pose.
// So the fix is provably safe: for any NON-ROOT bone whose translation track
// deviates from that bone's own rest translation beyond a small epsilon,
// delete the track. glTF/three.js then leaves the bone at its rest
// translation — killing the crush while preserving every rotation track.
//
// It is a no-op on correctly-authored rigs (their non-root translation tracks
// already sit at rest, well under the threshold).

const DEFAULT_THRESHOLD = 0.15; // world units; good rigs drift <=0.04, crushed >0.7

// The crush is SYSTEMIC: a whole-skeleton scale mismatch offsets the entire
// symmetric limb+spine chain (chest, spine, head, both arms, both legs — ~18
// core bones). A correctly-authored rig, by contrast, only ever shows a
// frame-0 translation on a handful of peripheral bones in a few clips (a
// weapon slot, the hip bob, one arm mid-attack), and IK-driven rigs translate
// their *IK control* bones by design. So we gate on the count of deviating
// CORE bones — excluding IK/control/attachment bones — and only rewrite a file
// when that count clears MIN_SYSTEMIC. Below it, the file is left untouched.
const MIN_SYSTEMIC_CORE_BONES = 8;
const NON_CORE_BONE = /IK|control|handslot|weapon|slot/i;

/**
 * Root joints of the document: joints that are not a child of another joint.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {Set<import('@gltf-transform/core').Node>}
 */
function rootJoints(doc) {
  const joints = new Set();
  for (const skin of doc.getRoot().listSkins()) {
    for (const j of skin.listJoints()) joints.add(j);
  }
  const childJoints = new Set();
  for (const j of joints) {
    for (const child of j.listChildren()) {
      if (joints.has(child)) childJoints.add(child);
    }
  }
  const roots = new Set();
  for (const j of joints) if (!childJoints.has(j)) roots.add(j);
  return roots;
}

/**
 * Euclidean deviation of a translation sampler's FIRST keyframe from `rest`.
 *
 * The crush is a rest-pose (bind) vs clip mismatch: an oversized rig whose
 * clips carry the standard rig's bone translations sits a constant large
 * offset from rest on *every* frame, frame 0 included. Keying on frame 0
 * (rather than the max across all frames) is what makes this a no-op on
 * correctly-authored rigs — their bones start every clip AT rest, so legit
 * mid-clip translations (a weapon slot swinging through an attack) are left
 * untouched instead of being flattened.
 * @param {import('@gltf-transform/core').AnimationSampler} sampler
 * @param {number[]} rest
 * @returns {number}
 */
function restDeviation(sampler, rest) {
  const out = sampler.getOutput();
  if (!out) return 0;
  const arr = out.getArray();
  if (!arr || arr.length < 3) return 0;
  return Math.hypot(arr[0] - rest[0], arr[1] - rest[1], arr[2] - rest[2]);
}

/**
 * Strip mismatched non-root bone translation tracks in place.
 * @param {import('@gltf-transform/core').Document} doc
 * @param {{threshold?: number}} [opts]
 * @returns {{pinnedBones: string[], clips: number, removedChannels: number}}
 *   pinnedBones: distinct bone names whose translation was pinned to rest.
 */
export function normalizeRigidTranslations(doc, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const roots = rootJoints(doc);
  const anims = doc.getRoot().listAnimations();

  // Pass 1: collect every deviating non-root translation channel.
  const offenders = [];
  const coreBones = new Set();
  for (const anim of anims) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "translation") continue;
      const node = ch.getTargetNode();
      if (!node || roots.has(node)) continue; // never touch the root's motion
      const sampler = ch.getSampler();
      if (!sampler) continue;
      if (restDeviation(sampler, node.getTranslation()) <= threshold) continue;
      offenders.push(ch);
      const name = node.getName();
      if (!NON_CORE_BONE.test(name)) coreBones.add(name);
    }
  }

  // Gate: only rewrite when the crush is systemic (whole limb+spine chain).
  if (coreBones.size < MIN_SYSTEMIC_CORE_BONES) {
    return { pinnedBones: [], clips: anims.length, removedChannels: 0 };
  }

  // Pass 2: pin the mismatched bones to their rest translation.
  const pinned = new Set();
  for (const ch of offenders) {
    pinned.add(ch.getTargetNode().getName());
    ch.dispose(); // bone falls back to its rest translation
  }
  return {
    pinnedBones: [...pinned].sort(),
    clips: anims.length,
    removedChannels: offenders.length,
  };
}

/**
 * Report-only detection (no mutation) for validation gates. Applies the same
 * systemic-crush gate as {@link normalizeRigidTranslations}: returns [] unless
 * the whole limb+spine chain is offset (so it never flags the few peripheral
 * frame-0 translations a correctly-authored rig legitimately carries).
 * @param {import('@gltf-transform/core').Document} doc
 * @param {{threshold?: number}} [opts]
 * @returns {{bone: string, drift: number}[]} worst offender per bone, desc drift
 */
export function detectCrushingTranslations(doc, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const roots = rootJoints(doc);
  const worst = new Map(); // bone -> drift
  const coreBones = new Set();
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "translation") continue;
      const node = ch.getTargetNode();
      if (!node || roots.has(node)) continue;
      const sampler = ch.getSampler();
      if (!sampler) continue;
      const drift = restDeviation(sampler, node.getTranslation());
      if (drift <= threshold) continue;
      const name = node.getName();
      if (!NON_CORE_BONE.test(name)) coreBones.add(name);
      if (drift > (worst.get(name) ?? 0)) worst.set(name, drift);
    }
  }
  if (coreBones.size < MIN_SYSTEMIC_CORE_BONES) return [];
  return [...worst.entries()]
    .map(([bone, drift]) => ({ bone, drift }))
    .sort((a, b) => b.drift - a.drift);
}

export { DEFAULT_THRESHOLD };
