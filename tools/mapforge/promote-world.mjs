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
//   * The gate on a promoted Plan C world is RED, and the red is Plan C's
//     accounted carried-canon debt, which Plan E's redraw clears: 88 G-NET + 3
//     G-CANON-LEG on the DRAFT root, plus the region aliases that name towns
//     the redraw deletes once the promoted root's authored content is in
//     scope. The five G-POI thin surveyed regions are WARNINGS since Task 13
//     declared them in budgets.json (STATE §20 supersedes §18's 96/104), and
//     the total is a property of the ROOT rather than of the promotion — 112
//     in the test fixture's scratch repo, 113 in a full checkout, measured
//     2026-08-23. That is why step 5's baseline below is a set of RULE IDS and
//     not a number. A promoter that called any of this an error could never
//     return clean until Plan E, and the plan's own tests require it to.
//   * The two committed chart sheets are drawn for a trunk this promotion
//     replaces. Re-inking them is Plan E's redraw commit, not this command's.
//
// So both steps run, both record what they saw in `notes`, and neither is
// swallowed. What step 5 DOES fail on is the gate losing its own report —
// STATE §19 measured three separate ways that can happen while the exit code
// stays honest — so a run with no `content-gate:` line is an error here — and,
// since the seam-8 fix pass, a failure on a rule that describes THE SPINE'S OWN
// INTEGRITY. See `gateRulesThatMustBeGreen` below.
//
// ── THE CENSUS FLOOR, and why the guard above it was one-directional ────────
//
// The rider guard closes PRESENT-but-unhashed. The harmful direction is
// ABSENT-and-unhashed, because absence is what causes DELETION: a draft whose
// content/spine/nodes/ is empty AND whose manifest agrees passes every guard
// above — step 1 has nothing to verify, the rider check has nothing to copy,
// classifyLiveNodes finds no problem, the edges check passes — and step 2 then
// deletes every n-atlas descendant. MEASURED 2026-08-23 on a scratch repo:
// 44 node files in, 7 out, `errors: []`, `promote-world: OK`, exit 0. Only the
// runtime subtree survived. This is exactly the "partial copy, rebase, hand
// edit" the header above names as the threat model, and the promoter did not
// notice it.
//
// Three guards close it, and all three are DECLARED in
// content/world/budgets.json's `promotion` block rather than written here,
// because a number in code is a number nobody can find:
//
//   * `promotion.minTrunkNodes` — a floor on the draft's node census. A draft
//     below it is refused before anything is deleted.
//   * nothing that is still POINTED AT may be deleted — a surviving node's
//     `representsNodeId` and a committed town plan's `spineId` are both hard
//     joins (G-ALIAS, T1), and both are derived from the tree, never listed.
//   * `promotion.gateRulesThatMustBeGreen` — step 5's baseline.
//
// A missing or malformed declaration is an ERROR, never a skipped check: a
// floor that can be deleted with the suite green is not a floor.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
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

/**
 * The promotion's safety declaration, read from the tree being WRITTEN TO.
 *
 * It lives beside the world budgets because that is the file this programme
 * puts committed numbers with stated reasons in, and because the numbers are
 * claims about the committed world, not about the tool. Every clause is
 * refused OUT LOUD rather than skipped — the `poi.supplyLimitedSurveyedRegions`
 * discipline, and for the same reason: a declaration whose absence turns a
 * guard off is a guard that can be deleted with the suite green.
 */
export function readPromotionDeclaration({ repoRoot }) {
  const rel = "content/world/budgets.json";
  let doc;
  try { doc = readJson(join(repoRoot, rel)); }
  catch (e) {
    return { errors: [`promote: ${rel} is not readable JSON (${e.message}) — the promotion floor is declared there, and a promotion with no floor is the failure this refuses`] };
  }
  const d = doc.promotion;
  if (d === null || typeof d !== "object" || Array.isArray(d))
    return { errors: [`promote: ${rel} has no "promotion" object — the census floor and the integrity rules are declared there, and a promotion cannot run without them`] };
  const errors = [];
  const min = d.minTrunkNodes;
  if (!Number.isInteger(min) || min < 1)
    errors.push(`promote: ${rel} promotion.minTrunkNodes is ${JSON.stringify(min)}, not a positive integer — the census floor cannot be read, so nothing is promoted`);
  const rules = d.gateRulesThatMustBeGreen;
  if (rules === null || typeof rules !== "object" || Array.isArray(rules)) {
    errors.push(`promote: ${rel} promotion.gateRulesThatMustBeGreen is not an object — step 5's baseline cannot be read, so nothing is promoted`);
  } else if (Object.keys(rules).length === 0) {
    errors.push(`promote: ${rel} promotion.gateRulesThatMustBeGreen is empty — an empty baseline detects nothing, which is the defect it was added to close`);
  } else {
    for (const [id, why] of Object.entries(rules))
      if (typeof why !== "string" || why.trim() === "")
        errors.push(`promote: ${rel} promotion.gateRulesThatMustBeGreen["${id}"] carries no stated reason — a declaration IS its reason`);
  }
  if (errors.length) return { errors };
  return { errors: [], minTrunkNodes: min, gateRules: rules };
}

/** Run a repo tool, answering in-band. Never throws, never inherits stdio. */
function runTool({ repoRoot, script, args = [] }) {
  const r = spawnSync(process.execPath, [join(repoRoot, script), ...args],
    { encoding: "utf8", cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { status: r.error ? null : r.status, out, error: r.error ? String(r.error.message) : null };
}

/**
 * STEP 5's BASELINE — and it is deliberately NOT a failure COUNT.
 *
 * The count was the obvious remedy and it is not reproducible: it is a property
 * of the ROOT, not of the promotion. Measured 2026-08-23 at this HEAD, one
 * faithful promotion of the same draft — 113 failures in a reviewer's full
 * checkout, 112 in the test fixture's scratch repo, of which 3 are that root's own
 * missing files (`cannot read/parse` on the art manifest and the spawn areas),
 * so a full checkout is 109. A gate keyed on a number three trees disagree
 * about is a gate that reds on the environment.
 *
 * What IS invariant is the KIND. A faithful Plan C promotion leaves exactly the
 * carried-canon debt Plan E clears — 88 `G-NET` + 3 `G-CANON-LEG` plus the
 * region aliases that name towns the redraw deletes — and it leaves the rules
 * that describe THE SPINE'S OWN INTEGRITY green, because it wrote that spine.
 * Measured on the truncated draft above: `G-ALIAS` x2, `G-PARENT` and
 * `G-TOWN-FRAME` appear only there. Those three are the declared set.
 *
 * It is a POSITIVE list, not an exhaustive taxonomy, and budgets.json says so:
 * a rule is added when a promotion defect is shown to red it, with the
 * measurement. The measurement is printed on every run either way, so a set
 * that stops covering anything is visible rather than silent.
 */
export function gateIntegrityErrors({ out, rules, notes }) {
  const ids = Object.keys(rules).sort();
  const errors = [];
  const fails = out.split("\n").filter((l) => /^\s*FAIL\b/.test(l));
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Z0-9-])${esc}(?![A-Z0-9-])`);
    const hits = fails.filter((l) => re.test(l));
    if (!hits.length) continue;
    errors.push(`promote: the gate reports ${hits.length} ${id} failure(s) — a rule a faithful promotion leaves GREEN (budgets.json promotion.gateRulesThatMustBeGreen: ${rules[id]}). This is the promotion breaking the spine it wrote, not carried-canon debt Plan E clears:\n${hits.slice(0, 5).map((h) => `    ${h.trim()}`).join("\n")}`);
  }
  notes?.push(`promote: gate integrity rules ${errors.length ? "RED" : "clean"} — ${ids.join(", ")} over ${fails.length} failure line(s)`);
  return errors;
}

export function promoteWorld({ repoRoot = DEFAULT_REPO_ROOT, runDir, dryRun = false }) {
  const written = [], deleted = [], errors = [], notes = [];

  // ── 0. the declaration, before anything is read or written ───────────────
  const decl = readPromotionDeclaration({ repoRoot });
  if (decl.errors.length) return { written, deleted, errors: decl.errors, notes };

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
  // A manifest key is a RELATIVE PATH INSIDE THE RUN DIR, and until the seam-8
  // fix pass nothing said so. Both halves of "verify the draft against its own
  // manifest" were satisfiable by files that are not the draft:
  //   * `hashes["../../../../etc/hosts"] = <the correct sha>` verified clean;
  //   * a SYMLINK named n-EVIL.json pointing outside the run dir was hashed
  //     AND copied, because readFileSync follows links on both sides, so the
  //     guard was self-consistently fooled and promoted the target's bytes.
  // Neither is the accident this command exists for — both need a cooperating
  // manifest — but a check that can be satisfied by the wrong file is not the
  // check its own header claims. Refusing costs two lines.
  const runRoot = resolve(runDir) + sep;
  for (const [rel, want] of Object.entries(hashes)) {
    const p = join(runDir, rel);
    if (!resolve(p).startsWith(runRoot)) {
      errors.push(`promote: the run manifest names "${rel}", which resolves OUTSIDE the run dir — a manifest key is a path inside the draft, and a draft cannot be verified against someone else's files`);
      continue;
    }
    if (!existsSync(p)) { errors.push(`promote: draft file ${rel} is missing`); continue; }
    if (!lstatSync(p).isFile()) {
      errors.push(`promote: draft file ${rel} is not a regular file — a symlink is hashed and copied through its TARGET, so the manifest would verify bytes the draft does not own`);
      continue;
    }
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

  // THE CENSUS FLOOR. Absence is what causes deletion, and every guard above
  // this line is about presence. See the header.
  if (draftFiles.size < decl.minTrunkNodes)
    errors.push(`promote: the draft carries ${draftFiles.size} spine node file(s), below the declared floor of ${decl.minTrunkNodes} (content/world/budgets.json promotion.minTrunkNodes) — a truncated draft DELETES the trunk it cannot replace, so this refuses rather than reconciles`);
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
  const deletedNodeFiles = new Set();
  for (const { f, doc } of live) {
    if (!atlasIds.has(doc.id)) continue;                 // runtime: untouched
    if (draftFiles.has(f)) continue;                     // present in the draft: rewritten below
    deletedNodeFiles.add(f);
    deleted.push(`content/spine/nodes/${f}`);
  }
  for (const fam of REPLACED_FAMILIES) {
    const src = new Set(listFiles(join(runDir, fam)));
    for (const f of listFiles(join(repoRoot, fam))) if (!src.has(f)) deleted.push(`${fam}/${f}`);
  }
  // NOTHING THAT IS STILL POINTED AT MAY BE DELETED.
  //
  // The census floor catches a wholesale truncation; this catches the same
  // thing ONE FILE AT A TIME. Dropping `n-millcross.json` from a draft and its
  // manifest row used to list it under DELETE with `errors: []`, while dropping
  // an authored EDGE was hard-refused — an arbitrary asymmetry, since both
  // deletions are the promoter overwriting a committed join it cannot see.
  // Neither join is a hardcoded id list: `representsNodeId` is read off the
  // surviving live nodes (scripts/lib/spine.mjs hard-fails G-ALIAS on a
  // dangling one) and `spineId` off the committed town plans (T1's join,
  // check_content.mjs). The id set compared against is the tree AS IT WILL BE.
  const finalIds = new Set();
  for (const { f, doc } of live) if (!deletedNodeFiles.has(f)) finalIds.add(doc.id);
  for (const f of [...draftFiles].sort()) {
    try { finalIds.add(readJson(join(draftNodes, f)).id); }
    catch (e) { errors.push(`promote: the draft's content/spine/nodes/${f} is not readable JSON: ${e.message}`); }
  }
  for (const { f, doc } of live) {
    if (deletedNodeFiles.has(f)) continue;
    const r = doc.representsNodeId;
    if (typeof r === "string" && r !== "" && !finalIds.has(r))
      errors.push(`promote: content/spine/nodes/${f} has representsNodeId "${r}", which this promotion would delete — G-ALIAS hard-fails on a dangling alias, so this refuses rather than reconciles`);
  }
  const townsDir = join(repoRoot, "content/towns");
  for (const t of listFiles(townsDir).filter((x) => x.endsWith(".json"))) {
    let spineId;
    try { spineId = readJson(join(townsDir, t)).spineId; }
    catch (e) { errors.push(`promote: content/towns/${t} is not readable JSON: ${e.message}`); continue; }
    if (typeof spineId === "string" && spineId !== "" && !finalIds.has(spineId))
      errors.push(`promote: content/towns/${t} has spineId "${spineId}", which this promotion would delete — T1's town-to-spine join hard-fails, so this refuses rather than reconciles`);
  }
  if (errors.length) return { written, deleted: [], errors, notes };
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
    if (line) errors.push(...gateIntegrityErrors({ out: gate.out, rules: decl.gateRules, notes }));
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
