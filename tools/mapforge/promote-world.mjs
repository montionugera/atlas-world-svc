#!/usr/bin/env node
// tools/mapforge/promote-world.mjs — Plan C Task 12: idempotent promotion.
//
// Six steps as ONE command, replacing today's two hand steps (rename the
// candidates, then remember to run check_spine_emit --write):
//   1. verify the draft against its own manifest hashes — in BOTH directions
//   2. RECONCILE, don't append — delete every n-atlas-descendant node absent
//      from the draft, write every draft node, replace fabric/handles/resolved
//      wholesale, rewrite edges after proving the draft carries every live one
//   3. derive through the ONE writer: scripts/check_spine_emit.mjs --write
//      (which also emits the sidecar and the two surviving mirrors)
//   4. render every sheet in the registry
//   5. gate
//   6. report
// Step 2 is a SET reconciliation, so running it twice is a no-op; steps 3-4
// are already byte-idempotent emitters. G-REPRO property 3 pins that.
//
// ── THE PROMOTION HAZARD, and why step 1 checks BOTH directions ─────────────
//
// The plan's step 1 verifies only that every file the run manifest LISTS is
// present and hashes to what the manifest says. The seam-6 review found the
// other half: `writeRun` did not clear its out dir, so a planted
// content/spine/nodes/n-ZOMBIE.json survived a full run, the CLI printed OK,
// and the manifest listed 72 files naming none of them n-ZOMBIE. A file the
// manifest cannot see is a file the hash check cannot see, and step 2 below
// would have promoted it into the committed tree. `clearRun` closed that at
// the producing end (Task 10b); this closes it at the CONSUMING end, which is
// the end that writes committed bytes: **every file this command copies must
// be named in the run manifest's hash map**, or the promotion refuses. The two
// guards are deliberately not one — a draft dir can be assembled by something
// other than a clean CLI run (a partial copy, a rebase, a hand edit), and the
// promoter is the last place to notice.
//
// ── WHY STEPS 4 AND 5 REPORT RATHER THAN FAIL ───────────────────────────────
//
// `errors` means "the promotion could not be performed faithfully" — the
// caller must not commit the result. It does NOT mean "something downstream is
// unhappy about the world that was promoted". Those are different claims and
// only the first is this command's business:
//
//   * The gate on a promoted Plan C world reports 96 failures under
//     --only=spine (88 G-NET + 3 G-CANON-LEG on the carried canon, each with a
//     named work order, + 5 G-POI thin surveyed regions) — a MEASURED,
//     accounted fact of Plan C recorded in STATE §18, which Plan E's redraw
//     clears. A promoter that called that an error could never return clean
//     until Plan E, and the plan's own tests require it to.
//   * The two committed chart sheets are drawn for a trunk this promotion
//     replaces. Re-inking them is Plan E's redraw commit, not this command's.
//
// So both steps run, both record what they saw in `notes`, and neither is
// swallowed. What step 5 DOES fail on is the gate losing its own report —
// STATE §19 measured three separate ways that can happen while the exit code
// stays honest — so a run with no `content-gate:` line is an error here.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { SHEETS } from "./render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, "../..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha = (buf) => "sha256:" + createHash("sha256").update(buf).digest("hex");

/** The three content families replaced wholesale, in promotion order. */
export const REPLACED_FAMILIES = Object.freeze([
  "content/world/fabric",
  "content/world/handles",
  // `content/world/resolved/` is here because it is the ONLY file the
  // renderers read (D5). Leaving it out means that after a re-seed the drawn
  // world is the OLD one until someone remembers a second command — precisely
  // the two-hand-steps failure this command exists to kill. Plan C writes
  // nothing there and `listFiles` answers [] for a missing directory, so the
  // loop is a no-op until Plan D's resolver lands.
  "content/world/resolved",
]);

export function listFiles(dir, rel = "") {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isDirectory()) out.push(...listFiles(join(dir, e.name), `${rel}${e.name}/`));
    else out.push(`${rel}${e.name}`);
  }
  return out;
}

/**
 * Which live nodes belong to the generator, and which to the runtime.
 *
 * Pure so the two hazards the reconciliation has can be driven directly:
 *   - a node reachable from n-atlas AND from a runtime root (a mis-parented
 *     file) would otherwise be DELETED by a walk that only asks about n-atlas;
 *   - a node whose parentId names nothing is reachable from no root at all, so
 *     a walk answers "not mine" and the file is silently kept forever.
 * Both come back as `problems` rather than as a deletion.
 */
export function classifyLiveNodes({ live, roots }) {
  const problems = [];
  const byId = new Map(live.map(({ doc }) => [doc.id, doc]));
  const kids = new Map();
  for (const { doc } of live) {
    if (!kids.has(doc.parentId)) kids.set(doc.parentId, []);
    kids.get(doc.parentId).push(doc.id);
  }
  const walk = (rootIds) => {
    const seen = new Set();
    const stack = [...rootIds];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;      // a cycle must not hang the promoter
      seen.add(id);
      for (const c of kids.get(id) ?? []) stack.push(c);
    }
    return seen;
  };
  if (!roots.includes("n-atlas"))
    problems.push("promote: content/spine/roots.json does not list n-atlas — the generator's territory is undefined");
  const atlasIds = walk(["n-atlas"]);
  const runtimeIds = walk(roots.filter((r) => r !== "n-atlas"));
  for (const id of [...atlasIds].sort())
    if (runtimeIds.has(id))
      problems.push(`promote: node "${id}" is reachable from BOTH n-atlas and a runtime root — refusing to reconcile a mis-parented tree`);
  for (const { f, doc } of live) {
    if (doc.parentId == null) continue;                 // a root
    if (byId.has(doc.parentId)) continue;
    problems.push(`promote: ${f} has parentId "${doc.parentId}", which names no node — it belongs to no root, so reconciliation can neither delete nor keep it deliberately`);
  }
  return { atlasIds, runtimeIds, problems };
}

/** Run a repo tool, answering in-band. Never throws, never inherits stdio. */
function runTool({ repoRoot, script, args = [] }) {
  const r = spawnSync(process.execPath, [join(repoRoot, script), ...args],
    { encoding: "utf8", cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { status: r.error ? null : r.status, out, error: r.error ? String(r.error.message) : null };
}

export function promoteWorld({ repoRoot = DEFAULT_REPO_ROOT, runDir, dryRun = false }) {
  const written = [], deleted = [], errors = [], notes = [];

  // ── 1. verify the draft against its own manifest ─────────────────────────
  if (!runDir) return { written, deleted, errors: ["promote: no runDir given"], notes };
  const manPath = join(runDir, "manifest.json");
  if (!existsSync(manPath)) return { written, deleted, errors: [`promote: ${manPath} does not exist`], notes };
  let man;
  try { man = readJson(manPath); }
  catch (e) { return { written, deleted, errors: [`promote: ${manPath} is not readable JSON: ${e.message}`], notes }; }
  const hashes = man.hashes ?? {};
  if (Object.keys(hashes).length === 0)
    errors.push("promote: the run manifest lists no file hashes — nothing can be verified");
  for (const [rel, want] of Object.entries(hashes)) {
    const p = join(runDir, rel);
    if (!existsSync(p)) { errors.push(`promote: draft file ${rel} is missing`); continue; }
    const got = sha(readFileSync(p));
    if (got !== want) errors.push(`promote: draft file ${rel} hash ${got} != manifest ${want}`);
  }

  const draftNodes = join(runDir, "content/spine/nodes");
  if (!existsSync(draftNodes)) errors.push(`promote: the draft has no ${"content/spine/nodes"}`);
  if (errors.length) return { written, deleted, errors, notes };

  // Every file this command is about to copy must be one the manifest hashed.
  // See the header: this is the consuming end of the stale-rider hazard.
  const draftFiles = new Set(readdirSync(draftNodes).filter((f) => f.endsWith(".json")));
  const toCopy = [
    ...[...draftFiles].sort().map((f) => `content/spine/nodes/${f}`),
    "content/spine/edges.json",
    ...REPLACED_FAMILIES.flatMap((fam) => listFiles(join(runDir, fam)).map((f) => `${fam}/${f}`)),
  ];
  for (const rel of toCopy)
    if (!Object.prototype.hasOwnProperty.call(hashes, rel))
      errors.push(`promote: draft file ${rel} is NOT in the run manifest's hash map — an unhashed file cannot be verified and will not be promoted`);
  if (errors.length) return { written, deleted, errors, notes };

  // ── 2. reconcile ─────────────────────────────────────────────────────────
  const liveNodes = join(repoRoot, "content/spine/nodes");
  if (!existsSync(liveNodes)) return { written, deleted, errors: [`promote: ${liveNodes} does not exist`], notes };
  let roots;
  try { roots = readJson(join(repoRoot, "content/spine/roots.json")); }
  catch (e) { return { written, deleted, errors: [`promote: content/spine/roots.json is not readable: ${e.message}`], notes }; }

  const live = readdirSync(liveNodes).filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, doc: readJson(join(liveNodes, f)) }));
  // Everything under n-atlas is the generator's territory. Everything under
  // every OTHER root is the runtime's and is never touched.
  const { atlasIds, problems } = classifyLiveNodes({ live, roots });
  errors.push(...problems);

  // The edges file is REPLACED wholesale, so a live edge the draft does not
  // carry is a silent deletion of authored content. `writeRun` carries them
  // whole (a feature endpoint that the redraw broke becomes a named work
  // order, not a dropped row) — this is what proves it, at the one place that
  // overwrites the committed file.
  const liveEdgesPath = join(repoRoot, "content/spine/edges.json");
  const draftEdgesPath = join(runDir, "content/spine/edges.json");
  if (existsSync(liveEdgesPath)) {
    let liveEdges = null, draftEdges = null;
    try { liveEdges = readJson(liveEdgesPath); } catch (e) { errors.push(`promote: content/spine/edges.json is not readable: ${e.message}`); }
    try { draftEdges = readJson(draftEdgesPath); } catch (e) { errors.push(`promote: the draft's content/spine/edges.json is not readable: ${e.message}`); }
    if (Array.isArray(liveEdges) && Array.isArray(draftEdges)) {
      const draftIds = new Set(draftEdges.map((e) => e.id));
      for (const e of liveEdges)
        if (!draftIds.has(e.id))
          errors.push(`promote: authored edge "${e.id}" is committed but absent from the draft — replacing edges.json would delete it`);
    }
  }
  if (errors.length) return { written, deleted, errors, notes };

  // Deletions are computed BEFORE any write, so a draft that turns out to be
  // unusable half way through cannot leave a half-reconciled tree.
  for (const { f, doc } of live) {
    if (!atlasIds.has(doc.id)) continue;                 // runtime: untouched
    if (draftFiles.has(f)) continue;                     // present in the draft: rewritten below
    deleted.push(`content/spine/nodes/${f}`);
  }
  for (const fam of REPLACED_FAMILIES) {
    const src = new Set(listFiles(join(runDir, fam)));
    for (const f of listFiles(join(repoRoot, fam))) if (!src.has(f)) deleted.push(`${fam}/${f}`);
  }
  written.push(...toCopy);

  if (dryRun) return { written, deleted, errors, notes, ratio: man.seaToLandRatio, landKm2: man.landKm2 };

  for (const rel of deleted) rmSync(join(repoRoot, rel));
  for (const rel of toCopy) {
    const dst = join(repoRoot, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(join(runDir, rel)));
  }

  // ── 3. derive through the ONE writer ─────────────────────────────────────
  const derive = runTool({ repoRoot, script: "scripts/check_spine_emit.mjs",
                           args: ["--write", "--content-root", join(repoRoot, "content")] });
  // The SUMMARY line, not merely a line from the tool. check_spine_emit prints
  // one `spine-emit: wrote <path>` per changed file and then one summary; a
  // report truncated on a pipe (STATE §19) keeps the former and loses the
  // latter, which is the case that must not read as success.
  const deriveLine = derive.out.split("\n").reverse().find((l) => /^spine-emit: (write|check) clean, \d+ files/.test(l));
  if (derive.error) errors.push(`promote: derive-writer could not be run: ${derive.error}`);
  else if (derive.status !== 0) errors.push(`promote: derive-writer failed (exit ${derive.status}):\n${derive.out}`);
  // Same rule as step 5, and it caught a real one: a CLI whose main() is
  // guarded by `import.meta.url === pathToFileURL(process.argv[1]).href` does
  // NOTHING and exits 0 when it is spawned through a path that is not its real
  // one (a symlinked or /var-vs-/private/var repo root on macOS). A promotion
  // whose derive-writer silently no-opped would commit nodes with no `derived`
  // block and a stale mapDimensions.ts, at exit 0.
  else if (!deriveLine) errors.push(`promote: the derive-writer produced no "spine-emit: write clean, <n> files" summary line (exit ${derive.status}) — it did not run:\n${derive.out.trim().slice(-2000)}`);
  else notes.push(`promote: ${deriveLine.trim()}`);

  // ── 4. render (SVG only — PNGs are a ship-time artifact, spec §7.5) ──────
  // Every id in the registry, never a hardcoded list: this file would
  // otherwise have to be edited every time a sheet is added, and the plan's
  // own list already named two sheets that do not exist until Task 13.
  for (const sheet of Object.keys(SHEETS).sort()) {
    const r = runTool({ repoRoot, script: "tools/mapforge/render-sheet.mjs", args: ["--sheet", sheet, "--no-png"] });
    if (r.error) notes.push(`promote: render ${sheet} could not be run: ${r.error}`);
    else if (r.status !== 0) notes.push(`promote: render ${sheet} reported problems (exit ${r.status}) — a sheet drawn for the PREVIOUS trunk is Plan E's redraw, not a promotion failure:\n${r.out.trim()}`);
    else notes.push(`promote: render ${sheet} OK`);
  }

  // ── 5. gate ──────────────────────────────────────────────────────────────
  const gate = runTool({ repoRoot, script: "scripts/check_content.mjs", args: ["--only=spine"] });
  if (gate.error) errors.push(`promote: the content gate could not be run: ${gate.error}`);
  else {
    const line = gate.out.split("\n").find((l) => l.startsWith("content-gate:"));
    // STATE §19: two uncaught throws and one truncating process.exit() could
    // each end a gate run with no summary line while the exit code stayed
    // honest. A promotion whose gate lost its report has measured nothing.
    if (!line) errors.push(`promote: the content gate produced no "content-gate:" summary line (exit ${gate.status}) — it lost its own report:\n${gate.out.trim().slice(-2000)}`);
    else notes.push(`promote: gate exit ${gate.status} — ${line.trim()}`);
  }

  return { written, deleted, errors, notes, ratio: man.seaToLandRatio, landKm2: man.landKm2 };
}

/**
 * Step 6 — the report. It lives in the CLI and not in `promoteWorld` because
 * promoteWorld is a library function three test files call in a loop; a
 * library that prints is a library whose callers cannot choose not to.
 */
export function reportLines({ result, dryRun }) {
  const out = [`promote-world: ${dryRun ? "DRY RUN — " : ""}${result.written.length} written, ${result.deleted.length} deleted`];
  if (result.ratio !== undefined) out.push(`promote-world: ratio ${result.ratio} (land ${result.landKm2} km²)`);
  // A dry run's whole product is the LIST. Printing only the two counts would
  // make acceptance criterion 6 ("lists writes and deletes") true of a
  // sentence rather than of an artifact, and a reviewer could not tell a
  // reconciliation that deletes the right eleven files from one that deletes
  // the runtime.
  if (dryRun) {
    for (const f of result.deleted) out.push(`  DELETE ${f}`);
    for (const f of result.written) out.push(`  WRITE  ${f}`);
  }
  for (const n of result.notes) out.push(`promote-world: ${n.replace(/^promote: /, "")}`);
  return out;
}

export function parseArgs(argv, { fail = (m) => { console.error(m); } } = {}) {
  let runDir = null, dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") {
      const v = argv[++i];
      // A flag value that is missing, or is itself a flag, silently ate the
      // next argument in the seam-6 CLI. Refuse instead.
      if (v === undefined || v.startsWith("--")) return fail("promote-world: --from needs a directory"), null;
      runDir = resolve(v);
    } else if (argv[i] === "--dry-run") dryRun = true;
    else return fail(`promote-world: unknown arg ${argv[i]}`), null;
  }
  if (!runDir) return fail("promote-world: pass --from build/mapforge/<runId>"), null;
  return { runDir, dryRun };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) { process.exitCode = 2; return; }
  const r = promoteWorld({ repoRoot: DEFAULT_REPO_ROOT, ...opts });
  for (const l of reportLines({ result: r, dryRun: opts.dryRun })) console.log(l);
  for (const e of r.errors) console.error(`promote-world: ${e}`);
  // NEVER process.exit() after printing a report: console.log to a pipe is
  // asynchronous on POSIX and exit() discards what libuv has not flushed
  // (STATE §19, measured 81/100 truncations at 76 KB on linux).
  if (r.errors.length) { process.exitCode = 1; return; }
  console.log("promote-world: OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
