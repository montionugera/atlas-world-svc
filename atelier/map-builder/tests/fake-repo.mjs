// Shared fixture for the publish/undo suites (not itself a *.test.mjs).
//
// A temp "mini repo" made ONLY with mkdtempSync: every real snapshot-set file
// copied in, plus the inputs the services read but never snapshot
// (content/spine/roots.json — snapshotSet throws without it — budgets.json,
// manifest.json) and the generate-world.mjs marker assertRepoRoot needs.
// Publish and undo rewrite and DELETE files under this root; it must never be
// the real checkout.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotSet } from "../lib/snapshots.mjs";
import { createRepo } from "../lib/repo.mjs";

export const REAL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const copyIn = (root, rel) => {
  const dst = join(root, rel);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, readFileSync(join(REAL_REPO, rel)));
};

/** Returns `{ root, cleanup }`; `cleanup` only ever removes the mkdtemp dir itself. */
export function makeFakeRepoRoot() {
  const root = mkdtempSync(join(tmpdir(), "mb-pub-repo-"));
  mkdirSync(join(root, "atelier/mapforge"), { recursive: true });
  writeFileSync(join(root, "atelier/mapforge/generate-world.mjs"), "");
  for (const rel of snapshotSet({ repoRoot: REAL_REPO })) copyIn(root, rel);
  for (const rel of ["content/spine/roots.json", "content/world/budgets.json", "content/world/manifest.json"])
    if (!existsSync(join(root, rel))) copyIn(root, rel);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A repo service over a fake root. `state.branch` (null = detached) and
 * `state.deps` are read on every call, so a test can flip them mid-test.
 * Git is faked — the temp root is not a git repo.
 */
export function makeFakeRepo({ root, state }) {
  const git = (_cmd, args) => (args[0] === "rev-parse" ? `${state.branch ?? "HEAD"}\n` : "");
  return { ...createRepo({ repoRoot: root, git }), contentGateDeps: () => state.deps, stageCount: 18 };
}

const nodeE = (src) => [process.execPath, "-e", src];

/** Fake tools: every spawn is a `node -e` run with cwd = the fake root. */
export function fakeTools({ draftSeed, render = "ok", fail = null }) {
  const exit0 = nodeE("");
  const failing = (tag) => nodeE(`console.error('G-RENDER-LOCK: ${tag} failed on purpose'); process.exit(1)`);
  const promoteSrc = [
    "const fs = require('fs');",
    "const p = 'content/world/fabric/world.json';",
    `const w = JSON.parse(fs.readFileSync(p, 'utf8')); w.seed = ${JSON.stringify(draftSeed)}; fs.writeFileSync(p, JSON.stringify(w));`,
    "fs.writeFileSync('content/spine/nodes/n-ZZZ-added-by-publish.json', '{}');",
    "console.log('promote-world: 2 written, 0 deleted');",
  ].join(" ");
  const tools = {
    promote: nodeE(promoteSrc),
    render: (id) => (render === "skip"
      ? nodeE("console.log('  rsvg-convert not found — PNG skipped. Install librsvg (brew install librsvg).')")
      : nodeE(`console.log('  wrote game-client/assets/art/maps/${id}.svg')`)),
    parity: exit0, lock: exit0, check: exit0, spineCheck: exit0,
  };
  if (fail) tools[fail] = failing(fail);
  return tools;
}
