import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIRS = ["content", "docs/worldbuilding", "atelier/art-forge/briefs"];
const EXTS = new Set([".json", ".md", ".txt", ".yaml", ".yml", ".mjs", ".js", ".py", ".csv"]);
// The list itself and the card generated from it must name the retired terms.
const SELF = ["content/studio/canon/glossary.json", "content/studio/canon/canon-card.md"];
// shortcut: baseline files still carry borrowed names, remove each entry when the §6 rename feature cleans it
const BASELINE = [
  "content/biome_themes_catalog.json",
  "content/studio/world_history_and_concept.json",
  "content/studio/t_shaped_world_atlas.json",
  "content/studio/map_feature_layers.json",
  "content/studio/schemas/t-shaped-world-atlas.schema.json",
  "content/studio/nodes/continent-02-clockwork-steppe/district-gilded-exhaust/town-bellows-hearth.json",
];

function* walk(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = join(rel, e.name);
    if (e.isDirectory()) yield* walk(root, p);
    else if (EXTS.has(extname(e.name))) yield p;
  }
}

export function scanRetiredNames(root, { retired, files = DIRS }) {
  const res = retired.map((name) => [name, new RegExp(`(?<![\\p{L}\\p{N}_])${name}(?![\\p{L}\\p{N}_])`, "u")]);
  const hits = [];
  for (const dir of files)
    for (const file of walk(root, dir)) {
      if ([...SELF, ...BASELINE].includes(file)) continue;
      const text = readFileSync(join(root, file), "utf8");
      for (const [name, re] of res) if (re.test(text)) hits.push({ file, name });
    }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { retired_names: retired } = JSON.parse(readFileSync(join(repo, SELF[0]), "utf8"));
  // ATLAS_CANON_ROOT: scan another tree with the repo's retired list (red-proof seam).
  const hits = scanRetiredNames(process.env.ATLAS_CANON_ROOT ?? repo, { retired });
  for (const h of hits) console.log(`${h.file}: ${h.name}`);
  console.log(hits.length ? `canon names: ${hits.length} hit(s)` : "canon names: clean");
  process.exit(hits.length ? 1 : 0);
}
