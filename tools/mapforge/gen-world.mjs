#!/usr/bin/env node
// tools/mapforge/gen-world.mjs — F-043 Task 2: generator CLI.
//
// Turns Task 1's pure library (lib/world-gen.mjs's buildWorld) into
// gate-valid candidate spine-node files: it builds a synthetic content root
// in a temp dir, canonicalizes every node's `interior`/`derived` blocks the
// same way scripts/check_spine_emit.mjs's derive-writer does (reusing its
// exported canonicalNode/canonStringify — never hand-rolled), and spawns the
// REAL spine gate (scripts/check_content.mjs --only=spine) against it. ajv
// is only installed under scripts/, so this is the only way to validate
// against the schema without adding a dependency.
//
// Usage:
//   node tools/mapforge/gen-world.mjs [--out <dir>]   (default: content/spine/candidates/)
//
// Deterministic: no Math.random, no Date, no performance.now anywhere in
// this file or in buildWorld — two runs must be byte-identical (AC 1).
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { buildWorld } from "./lib/world-gen.mjs";
import { buildTree, deriveNode } from "../../scripts/lib/spine.mjs";
import { canonicalNode, canonStringify } from "../../scripts/check_spine_emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

const COMPOSITION_TARGET = { ocean: 96, rock: 2, ice: 2 };
const COMPOSITION_TOLERANCE = 2;
const SYNTHETIC_LOAD_BUDGET = { maxNodes: 48, maxBytes: 393216 }; // mirrors Task 3's committed bump

// Canonical bytes for a node (2-space indent, trailing newline), reusing the
// derive-writer's own serializer so `interior`/`derived` are byte-consistent
// with every other committed spine node — never hand-rolled JSON.stringify.
function canonicalBytes({ node, tree, keepDerived }) {
  const { bytes, error } = canonicalNode({ node, tree, plans: [] });
  if (error) throw new Error(`gen-world: ${error}`);
  if (keepDerived) return bytes;
  const obj = JSON.parse(bytes);
  delete obj.derived;
  return canonStringify(obj) + "\n";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, doc) {
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

// Real n-atlas children this generator never regenerates — the pre-F-043
// world frame. Everything else directly under n-atlas is a PREVIOUS
// gen-world/promotion run's output; once Task 3 promotes a candidate set
// into content/spine/nodes/, the real root already contains it, so merging
// a freshly-regenerated (old-id) candidate set on top would double every
// F-043 landmass (duplicate seeds, self-overlap, blown budget/composition).
const PRE_WORLD_ATLAS_CHILDREN = new Set(["n-cluster1", "n-westsea"]);

// Real edges this generator never regenerates: everything except the
// original e-sea-lane. Promoted F-043 sealanes (e-lane-*) point at feature
// ids (e.g. f-port-tallowquay) that only exist on the PROMOTED nodes, not
// on the freshly-regenerated candidate set this run produces — so they'd
// dangle (G-NET) if carried into the synthetic pre-world root.
const PRE_WORLD_SEALANE_ID = "e-sea-lane";

// Nodes to drop when reconstructing the pre-world state: every direct child
// of n-atlas that isn't in PRE_WORLD_ATLAS_CHILDREN, plus all of its
// descendants (walked via parentId, not just F-043's own subtree shape, so
// this stays correct if a future feature adds more n-atlas children).
function postWorldNodeIds({ nodes }) {
  const childrenOf = new Map();
  for (const n of nodes) {
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId).push(n.id);
  }
  const excluded = new Set();
  for (const id of childrenOf.get("n-atlas") ?? []) {
    if (PRE_WORLD_ATLAS_CHILDREN.has(id)) continue;
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      excluded.add(cur);
      for (const c of childrenOf.get(cur) ?? []) stack.push(c);
    }
  }
  return excluded;
}

// Builds a synthetic content root (mkdtempSync) carrying the PRE-F-043 real
// spine table (see postWorldNodeIds above) PLUS a freshly-regenerated
// candidate set, so the real gate proves buildWorld()'s output is gate-valid
// from scratch — a reproduction proof against the pre-F-043 world, not a
// no-op merge against a root that may already contain a promoted (possibly
// renamed) copy of the same generation. Returns
// { tmp, tree, candidateNodes, candidateEdges, summary }; caller owns
// cleanup (rmSync the tmp dir).
function buildSyntheticRoot({ repoRoot }) {
  const realContentRoot = join(repoRoot, "content");
  const atlasNode = readJson(join(realContentRoot, "spine/nodes/n-atlas.json"));
  const { nodes: candidateNodes, edges: candidateEdges, summary } = buildWorld({ atlasNode });

  const tmp = mkdtempSync(join(tmpdir(), "gen-world-"));
  // Self-cleaning: if anything below throws (schema/tree/canonicalization
  // errors), rmSync the half-built tmp dir before rethrowing — otherwise it
  // leaks, since a throw here means buildSyntheticRoot never returns `tmp`
  // for a caller-side finally to find.
  try {
    mkdirSync(join(tmp, "schemas"), { recursive: true });
    mkdirSync(join(tmp, "spine/nodes"), { recursive: true });

    writeFileSync(join(tmp, "schemas/spine-node.schema.json"), readFileSync(join(realContentRoot, "schemas/spine-node.schema.json")));
    writeFileSync(join(tmp, "spine/sheet-atlas.json"), readFileSync(join(realContentRoot, "spine/sheet-atlas.json")));
    writeFileSync(join(tmp, "spine/coverage-budget.json"), readFileSync(join(realContentRoot, "spine/coverage-budget.json")));
    writeJson(join(tmp, "spine/load-budget.json"), SYNTHETIC_LOAD_BUDGET);

    const roots = readJson(join(realContentRoot, "spine/roots.json"));
    writeJson(join(tmp, "spine/roots.json"), roots);

    // Real nodes, restricted to the PRE-F-043 world (postWorldNodeIds drops
    // any already-promoted F-043 landmass under n-atlas), with n-atlas
    // overlaid: the survey is complete enough now (the freshly-regenerated
    // continents/oceans cover most of the sheet) that the world stops being
    // blanket-UNCHECKED and falls back to a pure-ocean interstitial for
    // whatever sliver of frame remains undrawn.
    const nodesDir = join(realContentRoot, "spine/nodes");
    const allRealNodes = readdirSync(nodesDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => readJson(join(nodesDir, f)));
    const excluded = postWorldNodeIds({ nodes: allRealNodes });
    const realNodes = allRealNodes.filter((n) => !excluded.has(n.id));
    const atlasIdx = realNodes.findIndex((n) => n.id === "n-atlas");
    if (atlasIdx === -1) throw new Error("gen-world: content/spine/nodes/n-atlas.json not found in real node set");
    realNodes[atlasIdx] = { ...realNodes[atlasIdx], interstitialUnsurveyed: false, interstitial: { ocean: 100 } };

    const mergedNodes = [...realNodes, ...candidateNodes];
    const tree = buildTree({ nodes: mergedNodes, rootIds: roots });
    if (tree.errors.length) throw new Error(`gen-world: merged tree is invalid: ${tree.errors.join("; ")}`);

    // Canonicalize EVERY node (real + candidate) over the merged tree — the
    // real nodes' own interior/derived is unaffected by new siblings except
    // n-atlas, whose rollup now includes the candidates as children; the
    // candidates get their derived block computed for the first time here.
    for (const node of mergedNodes) {
      const bytes = canonicalBytes({ node, tree, keepDerived: true });
      writeFileSync(join(tmp, "spine/nodes", `${node.id}.json`), bytes);
    }

    const allRealEdges = readJson(join(realContentRoot, "spine/edges.json"));
    const realEdges = allRealEdges.filter((e) => e.kind !== "sealane" || e.id === PRE_WORLD_SEALANE_ID);
    writeJson(join(tmp, "spine/edges.json"), [...realEdges, ...candidateEdges]);

    return { tmp, tree, candidateNodes, candidateEdges, summary };
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

function runSpineGate({ repoRoot, syntheticRoot }) {
  try {
    execFileSync(process.execPath, [join(repoRoot, "scripts/check_content.mjs"), "--content-root", syntheticRoot, "--only=spine"], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function summaryTable(summary) {
  const header = "id · tier · name-candidates · km² · composition · regions";
  const rows = summary.map((s) => {
    const comp = Object.entries(s.composition)
      .map(([b, v]) => `${b}:${v}`)
      .join(" ");
    const names = s.nameCandidates.length ? s.nameCandidates.join(", ") : "—";
    return `${s.id} · ${s.tier} · ${names} · ${s.areaKm2} · ${comp} · ${s.regionCount}`;
  });
  return [header, ...rows].join("\n");
}

// The core pipeline. Exits the process on any validation failure (exit 1);
// returns normally after printing the summary + "gen-world: OK" on success.
export function generate({ repoRoot, outDir }) {
  // buildSyntheticRoot() is called INSIDE the try (not before it, as an
  // earlier revision had it) so that a throw from IT is also covered by the
  // finally below — it already self-cleans on its own throw (see its own
  // try/catch above), but keeping the call in here too means every path
  // that can create `tmp` is covered by exactly one cleanup, not two
  // separate ones a future edit could drift apart.
  let tmp;
  try {
    const built = buildSyntheticRoot({ repoRoot });
    tmp = built.tmp;
    const { tree, candidateNodes, candidateEdges, summary } = built;

    const gate = runSpineGate({ repoRoot, syntheticRoot: tmp });
    if (!gate.ok) {
      process.stdout.write(gate.stdout);
      process.stderr.write(gate.stderr);
      console.error("gen-world: candidates FAILED the spine gate (scripts/check_content.mjs --only=spine)");
      process.exit(1);
    }

    // Composition budget: the world's overall rollup (real + candidates,
    // n-atlas surveyed) must land within +/-2pp of {ocean:96, rock:2, ice:2}
    // and be CHECKED — stricter than the gate's own +/-3pp G-COMP-ROLLUP
    // tolerance, so this is the tighter of the two and catches drift first.
    const atlasDerived = deriveNode({ tree, id: "n-atlas", plans: [] });
    const ocean = atlasDerived.computedComposition.ocean ?? 0;
    const rock = atlasDerived.computedComposition.rock ?? 0;
    const ice = atlasDerived.computedComposition.ice ?? 0;
    console.log(`gen-world: composition rollup ocean=${ocean.toFixed(1)} rock=${rock.toFixed(1)} ice=${ice.toFixed(1)} verdict=${atlasDerived.rollupVerdict}`);
    const withinTolerance = Object.entries(COMPOSITION_TARGET).every(
      ([biome, target]) => Math.abs((atlasDerived.computedComposition[biome] ?? 0) - target) <= COMPOSITION_TOLERANCE,
    );
    if (atlasDerived.rollupVerdict !== "CHECKED" || !withinTolerance) {
      console.error("gen-world: composition rollup FAILED the budget (verdict must be CHECKED, each biome within +/-2pp of ocean:96 rock:2 ice:2)");
      process.exit(1);
    }

    // Write candidates to outDir: canonical bytes, WITHOUT derived —
    // promotion (Task 3) + a future --write owns computing that once the
    // candidates are renamed/hand-polished into the real content root.
    mkdirSync(outDir, { recursive: true });
    for (const node of candidateNodes) {
      const bytes = canonicalBytes({ node, tree, keepDerived: false });
      writeFileSync(join(outDir, `${node.id}.json`), bytes);
    }
    writeJson(join(outDir, "edges-addition.json"), candidateEdges);

    console.log(summaryTable(summary));
    console.log("gen-world: OK");
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const opts = { outDir: join(REPO_ROOT, "content/spine/candidates") };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      const v = argv[++i];
      if (v === undefined) {
        console.error("gen-world: missing value for --out");
        process.exit(2);
      }
      opts.outDir = resolve(v);
    } else {
      console.error(`gen-world: unknown arg ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv);
  generate({ repoRoot: REPO_ROOT, outDir: opts.outDir });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
