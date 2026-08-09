#!/usr/bin/env node
// F-041 Phase 0 HARD deliverable: the ASCII tree + coverage printer.
//
// The flat node table (content/spine/nodes/*.json) deliberately has no single
// file showing the shape of the world — this printer is that view. If it
// rots, authors drift back to editing generated mirrors, which is the
// four-way disagreement the spine exists to end (research §9 Phase 0).
//
// usage: node scripts/spine-tree.mjs [--content-root <dir>]
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, buildTree, rollupComposition } from "./lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let contentRoot = join(ROOT, "content");
const argv = process.argv;
for (let i = 2; i < argv.length; i++) {
  if (argv[i] === "--content-root") contentRoot = resolve(argv[++i]);
  else { console.error(`unknown arg: ${argv[i]}`); process.exit(2); }
}

const spine = loadSpine({ contentRoot });
if (!spine.present) { console.log("spine: no content/spine/ directory"); process.exit(0); }
if (spine.errors.length) { for (const e of spine.errors) console.error(`ERROR ${e}`); process.exit(1); }
const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
if (tree.errors.length) { for (const e of tree.errors) console.error(`ERROR ${e}`); process.exit(1); }

const lines = [];
function walk(id, prefix, isLast, isRoot) {
  const n = tree.byId.get(id);
  const roll = rollupComposition({ tree, id });
  const connector = isRoot ? "" : prefix + (isLast ? "└── " : "├── ");
  lines.push(`${connector}${id} · ${n.tier} · ${n.interior?.units ?? "?"} · coverage ${roll.coveragePct.toFixed(1)}% ${roll.verdict}`);
  const kids = tree.childrenOf.get(id);
  const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
  kids.forEach((c, i) => walk(c, childPrefix, i === kids.length - 1, false));
}
for (const r of [...spine.roots].sort()) walk(r, "", true, true);
lines.push(`${spine.nodes.length} nodes · ${spine.roots.length} roots`);
console.log(lines.join("\n"));
