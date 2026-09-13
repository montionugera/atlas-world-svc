// atelier/map-builder/lib/snapshots.mjs — Task 12: computed snapshot set + retained snapshots.
//
// The snapshot set is COMPUTED, never hand-listed (spec §5, global-constraints):
// every producer that touches the committed world already declares what it
// owns — promote-world.mjs's REPLACED_FAMILIES + listFiles, check_spine_emit's
// collectOutputs (the derive-writer's own output list), render-lock's
// lockExtraPaths. Re-deriving from those means a new fabric family or mirror
// only needs to be taught to ITS OWN producer; this file never grows a
// parallel list that can drift from it.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { REPLACED_FAMILIES, listFiles } from "../../mapforge/promote-world.mjs";
import { lockExtraPaths } from "../../../scripts/lib/render-lock.mjs";
import { collectOutputs } from "../../../scripts/check_spine_emit.mjs";

const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

const addIfExists = (set, repoRoot, rel) => {
  if (existsSync(join(repoRoot, rel))) set.add(rel);
};

/**
 * Directory roots whose WHOLE contents are owned by the generator/promoter:
 * content/spine/nodes, the three REPLACED_FAMILIES dirs, and the committed
 * maps. `restore()` walks these (and only these) to delete a file a publish
 * ADDED that the snapshot never saw — an individually named file (edges.json,
 * render-lock.json, maps-index.json, the derive-writer's mirrors) cannot
 * gain a sibling, so it is never in this list.
 */
export const SNAPSHOT_DIRS = Object.freeze([
  "content/spine/nodes",
  ...REPLACED_FAMILIES,
  "game-client/assets/art/maps",
]);

/** Sorted, unique, repo-relative file list — see the module header. */
export function snapshotSet({ repoRoot }) {
  const files = new Set();
  for (const f of listFiles(join(repoRoot, "content/spine/nodes")))
    files.add(`content/spine/nodes/${f}`);
  for (const fam of REPLACED_FAMILIES)
    for (const f of listFiles(join(repoRoot, fam))) files.add(`${fam}/${f}`);
  addIfExists(files, repoRoot, "content/spine/edges.json");
  const spineEmit = collectOutputs({ contentRoot: join(repoRoot, "content") });
  for (const o of spineEmit.outputs ?? []) files.add(relative(repoRoot, o.path));
  addIfExists(files, repoRoot, "content/world/render-lock.json");
  for (const rel of lockExtraPaths({ repoRoot })) addIfExists(files, repoRoot, rel);
  for (const f of listFiles(join(repoRoot, "game-client/assets/art/maps")))
    files.add(`game-client/assets/art/maps/${f}`);
  addIfExists(files, repoRoot, "atelier/asset-storybook/maps-index.json");
  return [...files].filter((f) => existsSync(join(repoRoot, f))).sort();
}

const assertSafeId = (id) => {
  if (typeof id !== "string" || id === "" || id.includes("/") || id.includes("\\") || id.includes(".."))
    throw new Error(`snapshots: invalid snapshot id ${JSON.stringify(id)}`);
};

export function createSnapshots({ repoRoot, dir, keep = 3 }) {
  mkdirSync(dir, { recursive: true });
  const snapDirOf = (id) => join(dir, id);
  const metaPathOf = (id) => join(snapDirOf(id), "snapshot.json");
  const readMeta = (id) => {
    try { return JSON.parse(readFileSync(metaPathOf(id), "utf8")); }
    catch { return null; }
  };
  const listIds = () =>
    existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];

  const api = {
    create({ seed }) {
      const files = snapshotSet({ repoRoot });
      const at = new Date().toISOString();
      const id = `${at.replace(/:/g, "-")}-${seed}`;
      assertSafeId(id);
      const snapDir = snapDirOf(id);
      mkdirSync(snapDir, { recursive: true });
      const recorded = files.map((rel) => {
        const buf = readFileSync(join(repoRoot, rel));
        const dst = join(snapDir, rel);
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, buf);
        return { path: rel, sha256: sha256Hex(buf) };
      });
      const meta = { id, dir: snapDir, files: recorded, seed, at };
      writeFileSync(metaPathOf(id), JSON.stringify(meta, null, 2));
      return meta;
    },

    restore({ id }) {
      assertSafeId(id);
      const meta = readMeta(id);
      if (!meta) throw new Error(`snapshots: unknown snapshot id ${id}`);
      const snapDir = snapDirOf(id);
      const keepSet = new Set(meta.files.map((f) => f.path));
      const repoRootAbs = resolve(repoRoot) + sep;

      let deleted = 0;
      for (const ownedDir of SNAPSHOT_DIRS) {
        const abs = resolve(join(repoRoot, ownedDir));
        for (const rel of listFiles(abs)) {
          const relPath = `${ownedDir}/${rel}`;
          if (keepSet.has(relPath)) continue;
          const target = resolve(join(repoRoot, relPath));
          // Guard, not merely construction: a target must resolve inside the
          // repo AND inside the owned dir it was discovered under, or nothing
          // is deleted. See the module header on SNAPSHOT_DIRS.
          if (!target.startsWith(repoRootAbs) || !target.startsWith(abs + sep))
            throw new Error(`snapshots: refusing to delete "${relPath}" — it resolves outside its owned directory`);
          rmSync(target);
          deleted++;
        }
      }

      let restored = 0;
      const mismatches = [];
      for (const f of meta.files) {
        const src = join(snapDir, f.path);
        const dst = join(repoRoot, f.path);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        restored++;
        const got = sha256Hex(readFileSync(dst));
        if (got !== f.sha256) mismatches.push(`${f.path}: expected sha256 ${f.sha256}, got ${got}`);
      }
      if (mismatches.length)
        throw new Error(`snapshots: restore verification failed for ${mismatches.length} file(s):\n${mismatches.join("\n")}`);

      return { restored, deleted };
    },

    list() {
      return listIds().map(readMeta).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    },

    prune() {
      const removed = api.list().slice(keep);
      for (const m of removed) rmSync(snapDirOf(m.id), { recursive: true, force: true });
      return removed.map((m) => m.id);
    },

    get(id) { assertSafeId(id); return readMeta(id); },
  };
  return api;
}
