#!/usr/bin/env node
// Task 2 (F-051 completion plan) — G-GEOMETRY-LOCK CLI.
//
// WHY THIS EXISTS: the redraw took scripts/tests/geometry-exact.test.mjs's
// equivalenceScan() from 1.20e8 to 2.118e10 edge tests inside
// gridIntersectionArea (scripts/lib/spine.mjs:194) — 492.6 s of a suite that
// otherwise runs in seconds. gridIntersectionArea is production-dead (its
// only caller was that scan, proving the exact kernel it replaced still
// agrees with it); paying its O(area/cell^2) cost on every `npm test` run
// buys nothing repeatable, because the cost is a function of world geometry
// and the next redraw regrows it. So the grid-sampler's per-pair RESULT is
// committed here, once, and the fast suite reads it instead of recomputing
// it — same shape as check_render_lock.mjs / check_spine_emit.mjs: --write
// baselines, --check recomputes and diffs, exit 1 on drift.
//
// THREE OPTIONS REJECTED before this one (see task-2-brief.md): coarsening
// the sample cell 0.05->0.1 cuts the cost to ~4s but the sampler then finds
// ZERO overlap at every pair — every equivalence assertion becomes vacuous,
// which is the exact defect class this repo keeps producing. A scanline
// reference (2.2s) drops the grid/exact timing ratio to ~10x, under the live
// 20x floor. Splitting the test file saves no runtime at all. So the fix is
// not "make the grid sampler faster" — it is "stop paying its cost on every
// run" — which is what a lock is for.
//
// --check recomputes the grid area for EVERY committed sibling pair (the
// full 492 s cost) and diffs against the lock. That is expensive on purpose
// and belongs in its OWN CI step (see check_render_lock.mjs / check_spine_
// emit.mjs's --check steps in .github/workflows/ci.yml) — never inside
// `npm test --prefix scripts`, which is what this lock exists to keep fast.
// --write re-baselines after a deliberate redraw of content/spine/nodes.
//
// --repo-root points every read/write at a different tree, exactly like
// check_render_lock.mjs, so tests can prove the gate fires without mutating
// the real committed content/spine/nodes or content/spine/geometry-lock.json.
//
// process.exitCode, NEVER process.exit() — see check_render_lock.mjs's own
// comment for the measured report-loss this avoids. main() is this module's
// last statement and every branch below is in tail position.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSpine, buildTree, gridIntersectionArea, SPINE_CELL_KM, SPINE_CELL_U } from "./lib/spine.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Exported so scripts/tests/geometry-exact.test.mjs and
// scripts/tests/geometry-lock.test.mjs read the committed lock's path from
// here instead of each re-typing the literal — one string, one place it can
// go stale.
export const LOCK_REL = "content/spine/geometry-lock.json";
const GENERATOR = { name: "geometry-lock", version: 1 };

// Hash of every committed node FILE (name + bytes) PLUS content/spine/roots.json,
// so a hand-edited ring, an added/removed node, or a change to which nodes are
// roots all move the hash — the same "the lock's hash must not match a
// mutated content/spine/nodes" contract Step 1 pins. roots.json belt-and-braces
// (fix round 1): collectSiblingPairs's traversal starts from buildTree, which
// reads roots.json too, so a roots-only edit that changes the tree shape
// (without touching any node file) would otherwise move the sibling-pair set
// with no hash movement to catch it — exactly the silent-drift shape this
// lock exists to close. Sorted filenames: never rely on readdir order (same
// discipline as loadSpine() itself).
export function hashNodesDir({ repoRoot }) {
  const dir = join(repoRoot, "content/spine/nodes");
  const h = createHash("sha256");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      h.update(f);
      h.update("\0");
      h.update(readFileSync(join(dir, f))); // BYTES, not "utf8" — see render-lock.mjs's sha256
    }
  }
  const rootsPath = join(repoRoot, "content/spine/roots.json");
  if (existsSync(rootsPath)) {
    h.update("\0roots.json\0");
    h.update(readFileSync(rootsPath));
  }
  return "sha256:" + h.digest("hex");
}

// The SAME traversal scripts/tests/geometry-exact.test.mjs's equivalenceScan()
// uses to enumerate non-point sibling pairs: every parent's children, minus
// points (points contribute no area — research §5.3), every i<j pair. Kept as
// its own export so scripts/tests/geometry-lock.test.mjs's fixture-repo
// recompute walks the identical set the real scan does, rather than a
// re-description of it that could quietly drift.
export function collectSiblingPairs({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const pairs = [];
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    const cell = parent.interior?.units === "u" ? SPINE_CELL_U : SPINE_CELL_KM;
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++)
        pairs.push({ key: `${kids[i].id}::${kids[j].id}`, a: kids[i], b: kids[j], cell });
  }
  return pairs;
}

// Fix round 1 (MEDIUM, both reviewers): a typo'd --repo-root used to mkdir
// content/spine/ in the wrong tree and write an empty "ok" lock at exit 0 —
// collectSiblingPairs's loadSpine soft-skips a missing spine/ dir (present:
// false, no errors) and an empty node set trivially has zero sibling pairs,
// so computeGeometryLock saw nothing WRONG, only nothing AT ALL. Matches
// check_spine_emit.mjs's collectOutputs: a missing spine/ dir is a `skip`
// (CLI misuse, exit 2, refuses --write too — a self-certifying empty lock is
// worse than no lock), and content/spine/*.json validation errors are
// `errors` (CLI reports and exits 1, --write also refuses — baking a lock
// from partially-broken node data would commit corrupted state).
function spineRootProblem({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  if (!spine.present) return { skip: true, messages: [`no content/spine/ directory under repo root ${repoRoot}`] };
  if (spine.errors.length) return { skip: false, messages: spine.errors };
  return null;
}

// The expensive half: runs gridIntersectionArea once per committed sibling
// pair. This is the 492 s cost — callers decide when that is affordable
// (--write, --check, or a small fixture repo in tests), never the fast suite.
// Caller MUST check spineRootProblem() first — this assumes a present, valid
// spine and will simply compute over whatever (possibly empty) pair set
// collectSiblingPairs finds otherwise.
export function computeGeometryLock({ repoRoot }) {
  const pairs = collectSiblingPairs({ repoRoot });
  const areas = {};
  for (const p of pairs)
    areas[p.key] = gridIntersectionArea({ a: p.a.placement, b: p.b.placement, cell: p.cell });
  return { version: 1, generator: GENERATOR, nodesHash: hashNodesDir({ repoRoot }), pairs: areas };
}

// checkGeometryLock({repoRoot, write}) -> {ok, drifted[], skip}. `skip: true`
// means the ROOT itself is the problem (misuse, e.g. a typo'd --repo-root) —
// distinct from `skip: false` with a nonempty `drifted`, which means the root
// is real but its content (spine errors, or a genuine lock/pair disagreement)
// is not. write:true baselines unconditionally once the root is confirmed
// good (mirrors check_render_lock.mjs's --write, which does not diff first);
// write:false (or omitted) diffs the committed lock against a fresh recompute
// and reports every disagreement — version, generator, nodesHash, and each
// pair's area, both directions (locked-but-gone and built-but-unlocked), same
// three-way shape as check_render_lock.mjs's drift/missing/extra.
export function checkGeometryLock({ repoRoot, write = false }) {
  const problem = spineRootProblem({ repoRoot });
  if (problem) return { ok: false, drifted: problem.messages, skip: problem.skip };

  const lockPath = join(repoRoot, LOCK_REL);
  const computed = computeGeometryLock({ repoRoot });

  if (write) {
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify(computed, null, 2) + "\n");
    return { ok: true, drifted: [], skip: false };
  }

  // Fix round 1 (LOW): a lock that exists but fails to PARSE (corrupted
  // JSON) used to be reported identically to a MISSING lock — different
  // problems, different fixes (a merge conflict left in the file vs. never
  // baselined at all). readFileSync's ENOENT is "missing"; anything else
  // thrown by readFileSync/JSON.parse is "exists but broken".
  let committed = null;
  let readError = null;
  try {
    committed = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (e) {
    readError = e;
  }
  const drifted = [];
  if (!committed) {
    drifted.push(
      readError && readError.code !== "ENOENT"
        ? `${LOCK_REL} exists but could not be read/parsed (${readError.message}) — re-baseline with --write`
        : `${LOCK_REL} is missing — baseline it with --write`,
    );
    return { ok: false, drifted, skip: false };
  }
  if (committed.version !== computed.version)
    drifted.push(`lock version ${JSON.stringify(committed.version)} != ${computed.version} — re-baseline with --write`);
  if (
    committed.generator?.name !== computed.generator.name ||
    committed.generator?.version !== computed.generator.version
  )
    drifted.push(`lock generator ${JSON.stringify(committed.generator ?? null)} != ${JSON.stringify(computed.generator)} — re-baseline with --write`);
  if (committed.nodesHash !== computed.nodesHash)
    drifted.push(`nodesHash ${JSON.stringify(committed.nodesHash ?? null)} != ${computed.nodesHash} — content/spine/nodes changed, re-baseline with --write`);

  const committedPairs = committed.pairs ?? {};
  // Exact `!==`, deliberately never a tolerance (fix round 1, JS reviewer):
  // both sides are the SAME deterministic computation — gridIntersectionArea
  // does only +, -, *, comparisons and Math.ceil over finite inputs (no
  // transcendentals, no accumulated iterative error), and the committed side
  // is that same IEEE-754 double round-tripped losslessly through
  // JSON.stringify/JSON.parse (doubles are exactly representable in JSON's
  // decimal grammar — no float ever loses precision crossing that boundary).
  // A tolerance here would let the exact in-tolerance drift this lock exists
  // to catch (0 -> 0.004, still under G-OVERLAP's own 0.005-of-area floor)
  // slide through unnoticed. NaN/-0 fail safe: NaN !== NaN is always true
  // (drifts, never silently "matches" a corrupt computation), and -0 !== 0
  // is false in JS (same numeric value, correctly treated as unchanged).
  for (const k of Object.keys(committedPairs).sort()) {
    if (!(k in computed.pairs)) drifted.push(`${k}: locked but is no longer a sibling pair`);
    else if (committedPairs[k] !== computed.pairs[k])
      drifted.push(`${k}: grid area ${computed.pairs[k]} != locked ${committedPairs[k]}`);
  }
  for (const k of Object.keys(computed.pairs).sort())
    if (!(k in committedPairs)) drifted.push(`${k}: is a sibling pair but has no lock row — baseline it with --write`);

  return { ok: drifted.length === 0, drifted, skip: false };
}

function main() {
  const argv = process.argv.slice(2);
  let mode = "check";
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") mode = "check";
    else if (arg === "--write") mode = "write";
    else if (arg === "--repo-root") {
      const dir = argv[++i];
      if (!dir) {
        console.error("check-geometry-lock: --repo-root needs a directory");
        process.exitCode = 2;
        return;
      }
      root = resolve(dir);
    } else {
      console.error(`check-geometry-lock: unknown arg ${arg}`);
      process.exitCode = 2;
      return;
    }
  }

  const { ok, drifted, skip } = checkGeometryLock({ repoRoot: root, write: mode === "write" });

  // A bad ROOT (missing content/spine/) is misuse, not drift — exit 2, same
  // as --repo-root with no value above, and refuses --write too (fix round 1
  // MEDIUM: a typo'd root must never silently bake an empty "ok" lock).
  if (skip) {
    for (const d of drifted) console.error(`check-geometry-lock: ${d}`);
    process.exitCode = 2;
    return;
  }
  if (!ok) {
    for (const d of drifted) console.error(`G-GEOMETRY-LOCK: ${d}`);
    process.exitCode = 1;
    return;
  }
  if (mode === "write") {
    console.log(`check-geometry-lock: wrote geometry-lock.json to ${LOCK_REL}`);
    return;
  }
  console.log("check-geometry-lock: check clean");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
