// Guard (V) of check_asset_manifest.mjs (F-174): every manifest `anims` value
// names a clip that exists in its glb, and an entry that maps `combat_idle`
// maps the whole base set. Clip-name drift between the asset pipeline and the
// client is the main future failure; without this, a renamed clip ships green
// and the client silently skips the state (AnimationController warns once).
import { readFileSync } from "node:fs";

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
export const COMBAT_REQUIRES = ["idle", "walk", "run", "attack", "death"];

/** Animation names from a binary glTF's JSON chunk. Throws on anything else. */
export function glbClipNames(fsPath) {
  const b = readFileSync(fsPath);
  if (b.length < 20 || b.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("not a binary glTF (Git LFS pointer? run git lfs pull)");
  }
  if (b.readUInt32LE(8) > b.length)
    throw new Error("GLB header length exceeds file size (truncated)");
  if (b.readUInt32LE(16) !== JSON_CHUNK)
    throw new Error("first GLB chunk is not JSON");
  const len = b.readUInt32LE(12);
  if (len > b.length - 20)
    throw new Error("GLB JSON chunk length exceeds file size (truncated)");
  let json;
  try {
    json = JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
  } catch {
    throw new Error("GLB JSON chunk is not valid JSON");
  }
  return (json.animations ?? []).map((a) => a?.name ?? "");
}

export function checkAnimClips(id, entry, fsPath, failures) {
  const anims = entry?.anims;
  if (anims == null) return;
  if (typeof anims !== "object" || Array.isArray(anims)) {
    failures.push(`entry "${id}": anims must be an object`);
    return;
  }
  if (anims.combat_idle != null) {
    const missing = COMBAT_REQUIRES.filter((s) => anims[s] == null);
    if (missing.length)
      failures.push(
        `entry "${id}": maps combat_idle but not ${missing.join(", ")}`,
      );
  }
  if (!fsPath.toLowerCase().endsWith(".glb")) return; // .gltf/.tscn are not parsed here
  let names;
  try {
    names = new Set(glbClipNames(fsPath));
  } catch (err) {
    failures.push(`entry "${id}": cannot read clips: ${err.message}`);
    return;
  }
  for (const [state, value] of Object.entries(anims)) {
    const list = Array.isArray(value) ? value : [value];
    if (
      list.length === 0 ||
      list.some((c) => typeof c !== "string" || c === "")
    ) {
      failures.push(
        `entry "${id}": anims.${state} must be a clip name or a non-empty list of clip names`,
      );
      continue;
    }
    for (const clip of list) {
      if (!names.has(clip)) {
        failures.push(
          `entry "${id}": anims.${state} → clip "${clip}" not in ${[...names].join(", ") || "(no clips)"}`,
        );
      }
    }
  }
}
