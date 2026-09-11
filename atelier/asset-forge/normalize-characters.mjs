// One-time (and re-runnable) fixer: strip mismatched non-root bone translation
// tracks from character glbs so oversized donor rigs stop crushing on playback.
// Idempotent + a no-op on already-correct rigs. See lib/normalize-anim.mjs.
//
// Usage:
//   node normalize-characters.mjs <glb...>              # normalize in place
//   node normalize-characters.mjs --dry <glb...>        # report only
import { NodeIO } from "@gltf-transform/core";
import { normalizeRigidTranslations } from "./lib/normalize-anim.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const files = args.filter((a) => a !== "--dry");
if (files.length === 0) {
  console.error("usage: node normalize-characters.mjs [--dry] <glb...>");
  process.exit(1);
}

const io = new NodeIO().setStrictResources(false);
let touched = 0;
for (const f of files) {
  const doc = await io.read(f);
  const rep = normalizeRigidTranslations(doc);
  const base = f.split("/").pop();
  if (rep.removedChannels === 0) {
    console.log(`  ok   ${base.padEnd(28)} (no crush; unchanged)`);
    continue;
  }
  touched++;
  console.log(
    `  FIX  ${base.padEnd(28)} pinned ${rep.pinnedBones.length} bones x ${rep.clips} clips ` +
      `(${rep.removedChannels} channels): ${rep.pinnedBones.join(", ")}`,
  );
  if (!dry) await io.write(f, doc);
}
console.log(`\n${dry ? "would fix" : "fixed"} ${touched}/${files.length} file(s)`);
