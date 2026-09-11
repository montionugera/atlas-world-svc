import { NodeIO, getBounds, Primitive } from "@gltf-transform/core";

/**
 * Reads a .glb/.gltf file from disk into a glTF-Transform Document.
 * @param {string} path
 * @returns {Promise<import('@gltf-transform/core').Document>}
 */
export async function loadGlb(path) {
  // Some donor assets reference external image URIs (e.g. Textures/colormap.png)
  // that aren't shipped alongside the .glb. Metadata extraction here (bounds,
  // animations, joints, triangle counts) doesn't need decoded image bytes, so
  // disable strict resource resolution rather than failing the whole read.
  const io = new NodeIO().setStrictResources(false);
  return io.read(path);
}

function getPrimaryScene(doc) {
  const root = doc.getRoot();
  return root.getDefaultScene() ?? root.listScenes()[0];
}

/**
 * Y-axis extent (world units) of the document's scene bounding box.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {number}
 */
export function sceneHeight(doc) {
  const scene = getPrimaryScene(doc);
  const bbox = getBounds(scene);
  return bbox.max[1] - bbox.min[1];
}

/**
 * Bounding box of the SKINNED meshes only (nodes whose mesh has a skin),
 * falling back to the full scene bounds when no skinned mesh exists (plain
 * props must still be measurable). Used by the pivot rule: bone-parented
 * attachment meshes (e.g. a sword held out in front) are unskinned and would
 * otherwise drag the bbox center off-axis for legitimate characters.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {{min: number[], max: number[]}}
 */
export function skinnedBounds(doc) {
  const scene = getPrimaryScene(doc);
  let union = null;
  scene.traverse((node) => {
    if (!node.getSkin() || !node.getMesh()) return;
    const bbox = getBounds(node);
    if (!union) {
      union = { min: [...bbox.min], max: [...bbox.max] };
      return;
    }
    for (let i = 0; i < 3; i++) {
      union.min[i] = Math.min(union.min[i], bbox.min[i]);
      union.max[i] = Math.max(union.max[i], bbox.max[i]);
    }
  });
  return union ?? getBounds(scene);
}

/**
 * Total triangle count across all TRIANGLES-mode mesh primitives.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {number}
 */
export function countTriangles(doc) {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const indices = prim.getIndices();
      if (indices) {
        triangles += indices.getCount() / 3;
      } else {
        const position = prim.getAttribute("POSITION");
        if (position) triangles += position.getCount() / 3;
      }
    }
  }
  return Math.floor(triangles);
}

/**
 * Names of all animation clips in the document.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {string[]}
 */
export function listClipNames(doc) {
  return doc
    .getRoot()
    .listAnimations()
    .map((anim) => anim.getName());
}

/**
 * Sorted, de-duplicated list of joint (skeleton) node names across all skins.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {string[]}
 */
export function jointNames(doc) {
  const names = new Set();
  for (const skin of doc.getRoot().listSkins()) {
    for (const joint of skin.listJoints()) {
      names.add(joint.getName());
    }
  }
  return [...names].sort();
}

/**
 * Largest single dimension across all textures in the document (0 if none).
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {number}
 */
export function maxTextureSize(doc) {
  let max = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize();
    if (size) max = Math.max(max, size[0], size[1]);
  }
  return max;
}

/**
 * Reads the atlas-forge provenance stamp from asset.extras, if present.
 * @param {import('@gltf-transform/core').Document} doc
 * @returns {object|null}
 */
export function readStamp(doc) {
  const asset = doc.getRoot().getAsset();
  return asset.extras?.atlasForge ?? null;
}
