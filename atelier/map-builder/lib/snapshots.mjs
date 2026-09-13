// atelier/map-builder/lib/snapshots.mjs — Task 12: computed snapshot set + retained snapshots.
//
// The snapshot set is COMPUTED, never hand-listed (spec §5, global-constraints):
// every producer that touches the committed world already declares what it
// owns — promote-world.mjs's REPLACED_FAMILIES + listFiles, check_spine_emit's
// collectOutputs (the derive-writer's own output list), render-lock's
// lockExtraPaths. Re-deriving from those means a new fabric family or mirror
// only needs to be taught to ITS OWN producer; this file never grows a
// parallel list that can drift from it.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, rmSync, lstatSync } from "node:fs";
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
  // collectOutputs's two failure modes (`{ skip: true }` — no spine/ dir,
  // `{ errors: [...] }` — unparsable spine/town plan) must NOT coalesce to
  // "no outputs": that would silently drop derived.json + the two mirrors
  // from the snapshot set with no error, on exactly the checkouts (a broken
  // spine) where a later restore is most needed. check_spine_emit.mjs's own
  // main() treats both as hard failures (`:180-181`) — match that here.
  const spineEmit = collectOutputs({ contentRoot: join(repoRoot, "content") });
  if (spineEmit.skip)
    throw new Error("snapshots: cannot compute the snapshot set — spine-emit: no content/spine/ directory");
  if (spineEmit.errors)
    throw new Error(
      `snapshots: cannot compute the snapshot set — spine-emit reported ${spineEmit.errors.length} error(s):\n` +
        spineEmit.errors.join("\n"),
    );
  for (const o of spineEmit.outputs) files.add(relative(repoRoot, o.path));
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
  // ENOENT (no snapshot.json at all — e.g. an unknown id) is the only case
  // that resolves to `null`. Anything else that stops this from being
  // readable JSON (EACCES, truncated bytes, a directory where the file
  // should be) is a CORRUPT snapshot, not an absent one, and must not be
  // silently hidden as "unknown" — it is rethrown so `list()`/`get()` can
  // each report it distinctly instead of the read just vanishing.
  const readMeta = (id) => {
    let raw;
    try { raw = readFileSync(metaPathOf(id), "utf8"); }
    catch (e) {
      if (e.code === "ENOENT") return null;
      throw new Error(`snapshots: cannot read snapshot ${id}: ${e.message}`);
    }
    try { return JSON.parse(raw); }
    catch (e) { throw new Error(`snapshots: snapshot ${id} is corrupt (unreadable snapshot.json): ${e.message}`); }
  };
  const readMetaOrMark = (id) => {
    try { return readMeta(id); }
    catch { return { id, corrupt: true }; }
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
      // readMeta throws (not returns null) for a CORRUPT snapshot.json, so
      // that error propagates here as-is — distinct from the "unknown id"
      // throw below, which only fires when there is no snapshot.json at all.
      const meta = readMeta(id);
      if (!meta) throw new Error(`snapshots: unknown snapshot id ${id}`);
      const snapDir = snapDirOf(id);
      const repoRootAbs = resolve(repoRoot) + sep;

      // Pre-flight — BEFORE any rmSync or copy: every meta.files[].path must
      // resolve inside the repo (the copy-back destination, same as the
      // delete-phase containment guard below) and every stored snapshot file
      // must exist with a sha256 matching what was recorded at create()
      // time. A recovery tool must not damage before it verifies — collect
      // every failure and throw ONE clear message with the live tree still
      // untouched, rather than deleting/copying partway and failing mid-loop.
      const preflightErrors = [];
      for (const f of meta.files) {
        const dstAbs = resolve(join(repoRoot, f.path));
        if (!dstAbs.startsWith(repoRootAbs)) {
          preflightErrors.push(`${f.path}: resolves outside the repo root`);
          continue;
        }
        const src = join(snapDir, f.path);
        if (!existsSync(src)) {
          preflightErrors.push(`${f.path}: missing from the snapshot store`);
          continue;
        }
        const got = sha256Hex(readFileSync(src));
        if (got !== f.sha256)
          preflightErrors.push(`${f.path}: snapshot store is corrupt — expected sha256 ${f.sha256}, got ${got}`);
      }
      if (preflightErrors.length)
        throw new Error(
          `snapshots: refusing to restore ${id} — pre-flight check failed for ${preflightErrors.length} file(s); live tree untouched:\n` +
            preflightErrors.join("\n"),
        );

      const keepSet = new Set(meta.files.map((f) => f.path));

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
      for (const f of meta.files) {
        const src = join(snapDir, f.path);
        const dst = join(repoRoot, f.path);
        mkdirSync(dirname(dst), { recursive: true });
        // Never write THROUGH a symlink at dst — a foreign symlink surviving
        // the delete pass (its own name is in keepSet, or it lives outside
        // SNAPSHOT_DIRS) would otherwise let copyFileSync follow it and
        // write outside the repo. Unlink it first so the copy lands as a
        // real file.
        if (existsSync(dst) && lstatSync(dst).isSymbolicLink()) rmSync(dst);
        copyFileSync(src, dst);
        restored++;
      }

      // Belt-and-braces re-verify after the copy (disk errors, something
      // mutating dst mid-restore) — the pre-flight above is what makes this
      // a second check rather than the only one.
      const mismatches = [];
      for (const f of meta.files) {
        const got = sha256Hex(readFileSync(join(repoRoot, f.path)));
        if (got !== f.sha256) mismatches.push(`${f.path}: expected sha256 ${f.sha256}, got ${got}`);
      }
      if (mismatches.length)
        throw new Error(`snapshots: restore verification failed for ${mismatches.length} file(s) after copy:\n${mismatches.join("\n")}`);

      return { restored, deleted };
    },

    // A corrupt snapshot.json surfaces as `{ id, corrupt: true }` instead of
    // being silently dropped — prune() below can then remove it even though
    // it is not a normal, readable, keep-N-newest snapshot.
    list() {
      return listIds()
        .map(readMetaOrMark)
        .filter(Boolean)
        .sort((a, b) => {
          if (a.corrupt || b.corrupt) return a.corrupt === b.corrupt ? 0 : a.corrupt ? 1 : -1;
          return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
        });
    },

    prune() {
      const rows = api.list();
      // Corrupt snapshots are never worth keeping regardless of `keep` —
      // they are dead weight (a full copy of the world nobody can restore
      // from) that would otherwise leak on disk forever.
      const removed = [...rows.filter((m) => m.corrupt), ...rows.filter((m) => !m.corrupt).slice(keep)];
      for (const m of removed) rmSync(snapDirOf(m.id), { recursive: true, force: true });
      return removed.map((m) => m.id);
    },

    // Unlike list(), a corrupt id here THROWS (via readMeta) with a message
    // distinct from restore()'s "unknown snapshot id" — the caller asked for
    // one specific id and deserves to know it exists but is unreadable,
    // rather than getting `null` indistinguishable from "never existed".
    get(id) { assertSafeId(id); return readMeta(id); },
  };
  return api;
}
