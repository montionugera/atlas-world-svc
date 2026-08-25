#!/usr/bin/env node
// Transactional concept-art intake: takes a source PNG produced by the
// art-forge generation scripts (Tasks 4-7) and lands it in
// game-client/assets/art/concept/ + the curated art-manifest.json as a
// single atomic, rollback-safe operation. This is the ONLY sanctioned way a
// generated image enters the repo — see docs/superpowers/specs/
// 2026-08-01-art-forge-foundation-design.md §4.
//
// Same SHAPE as tools/asset-2d-forge/intake2d.mjs (validate -> snapshot ->
// copy -> write-entry -> gate -> rollback), different sink: art-manifest.json
// (curated, driftGated:false, validated by the "art" validator in
// scripts/check_asset_manifest.mjs, NOT the render-spec validator).
//
// Order of operations:
//   1. validate — the source file exists; `id` starts with "art:"; `group`
//      is declared in the FIXED, committed art-groups.json (Task 1's
//      registry — always read from the real repo, independent of any
//      sandboxed `root`/`manifestPath` used for testing); `title` and `note`
//      (provenance — art carries no upstream licence) are non-empty; the
//      ARTIFACT GATE passes (hallucinated watermarks / tiling artifacts /
//      degenerate renders — see artifact-gate.mjs); and the destination path
//      does not already hold a DIFFERENT file. ANY failure aborts with ZERO
//      side effects.
//   2. snapshot — read art-manifest.json's exact bytes (and any PNG already
//      at the destination) before touching anything.
//   3. copy — the source PNG into <root>/concept/.
//   4. write-entry — add { group, title, file, note } via the REUSED atomic
//      writer (tmp+rename) from tools/asset-forge/lib/manifest.mjs.
//   5. gate — run `node scripts/check_asset_manifest.mjs` from the repo root.
//   6. rollback — on ANY failure after step 2, restore art-manifest.json to
//      its exact snapshot bytes and restore/delete the copied PNG.
//
// `root` is the ART root (game-client/assets/art — the directory containing
// concept/ and art-manifest.json), NOT the repo root. It defaults to the
// real game-client/assets/art but is fully injectable so tests can point it
// at a throwaway sandbox. The group registry (art-groups.json) and the gate
// script, by contrast, are always resolved against the real repo root
// (via manifest.mjs's repoRoot()) — they are fixed contracts, not sandboxed
// per call.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// REUSE the proven atomic manifest writer + repo-root resolver — do not
// reinvent tmp-file+rename semantics.
import {
  repoRoot,
  readManifest,
  writeManifestAtomic,
  writeManifestRaw,
} from "../asset-forge/lib/manifest.mjs";
import { inspectImage } from "./artifact-gate.mjs";
import { appendAttempt } from "./lib/run-ledger.mjs";

const FORGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(FORGE_DIR, "runs");

/**
 * Default artifact-gate runner: screens the SOURCE image for hallucinated
 * watermarks, checkerboard/tiling artifacts and degenerate renders before it
 * can enter the manifest. Injectable via opts.artifactGateRunner so the
 * transaction tests can use byte-stub "PNG"s that ImageMagick cannot decode.
 *
 * The gate is a TRIAGE tool, not a classifier — read artifact-gate.mjs's
 * header and docs/worldbuilding/ABP-artifact-gate.md before relaxing it. A
 * PASS does not prove the image is clean; it means the cheap checks found
 * nothing and the corner sheet still needs a human.
 * @param {{src: string}} params
 * @returns {{ok: boolean, reasons: string[]}}
 */
function defaultArtifactGateRunner({ src }) {
  const result = inspectImage({ src });
  return { ok: result.ok, reasons: result.reasons };
}

/**
 * Default drift-gate runner: spawns `node scripts/check_asset_manifest.mjs`
 * from the real repo root, pointed at the SAME `root`/`manifestPath` this
 * intake call actually wrote to (via the gate's `--art-root`/`--art-manifest`
 * overrides) — otherwise a sandboxed intake would "gate" the untouched real
 * manifest instead of the one it just wrote, a silent false green. Injectable
 * via opts.driftGateRunner for tests.
 * @param {{root: string, manifestPath: string}} params
 * @returns {Promise<{ok: boolean}>}
 */
function defaultDriftGateRunner({ root, manifestPath }) {
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [
        "scripts/check_asset_manifest.mjs",
        "--art-manifest",
        manifestPath,
        "--art-root",
        root,
      ],
      {
        cwd: repoRoot(),
        stdio: "inherit",
      },
    );
    child.on("error", () => resolve({ ok: false }));
    child.on("exit", (code) => resolve({ ok: code === 0 }));
  });
}

// (F-024) Rich-metadata field validation — MIRRORS validateArtMetaFields in
// scripts/check_asset_manifest.mjs field-for-field, so an entry that clears
// intake validation can never fail the gate on these fields (and vice
// versa). Kept as a local, self-contained function rather than a shared
// import: this file already mirrors the gate's SHAPE, not its code, per the
// header comment ("same SHAPE ... different sink") — intake and gate are
// deliberately independent validators over the same contract.
const GEN_NUMBER_FIELDS = [
  "steps",
  "cfg",
  "seed",
  "denoise",
  "width",
  "height",
];
const GEN_INTEGER_FIELDS = new Set(["steps", "seed", "width", "height"]);

/**
 * Validate the optional rich-metadata fields (description, tags, source,
 * gen). Returns an array of failure strings — empty when everything present
 * is well-formed. Fields that are `undefined` (not passed) are always fine;
 * these fields are optional everywhere.
 * @param {{description?: unknown, tags?: unknown, source?: unknown, gen?: unknown}} fields
 * @returns {string[]}
 */
function validateArtMetaFields(fields) {
  const failures = [];
  const { description, tags, source, gen } = fields;

  if (description !== undefined) {
    if (typeof description !== "string" || description.trim() === "") {
      failures.push("description must be a non-empty string if present");
    }
  }

  if (source !== undefined) {
    if (typeof source !== "string" || source.trim() === "") {
      failures.push("source must be a non-empty string if present");
    }
  }

  if (tags !== undefined) {
    if (
      !Array.isArray(tags) ||
      tags.length === 0 ||
      tags.some((t) => typeof t !== "string" || t.trim() === "")
    ) {
      failures.push(
        "tags must be a non-empty array of non-empty strings if present",
      );
    }
  }

  if (gen !== undefined) {
    if (typeof gen !== "object" || gen === null || Array.isArray(gen)) {
      failures.push("gen must be an object if present");
    } else {
      if (
        gen.model !== undefined &&
        (typeof gen.model !== "string" || gen.model.trim() === "")
      ) {
        failures.push("gen.model must be a non-empty string");
      }
      for (const field of GEN_NUMBER_FIELDS) {
        if (gen[field] === undefined) continue;
        const v = gen[field];
        if (typeof v !== "number" || !Number.isFinite(v)) {
          failures.push(`gen.${field} must be a number`);
          continue;
        }
        if (GEN_INTEGER_FIELDS.has(field) && !Number.isInteger(v)) {
          failures.push(`gen.${field} must be an integer`);
          continue;
        }
        if ((field === "width" || field === "height") && v <= 0) {
          failures.push(`gen.${field} must be positive`);
        }
      }
    }
  }

  return failures;
}

/**
 * Read the FIXED, committed art-groups.json (Task 1's registry) and return
 * the set of declared group ids. Always resolved against the real repo root
 * — the group registry is a global contract, not something a caller/test
 * should be able to fake by pointing `root` elsewhere.
 * @returns {{ groupIds: Set<string> } | { error: string }}
 */
function readGroupIds() {
  const groupsPath = path.join(
    repoRoot(),
    "game-client/assets/art/art-groups.json",
  );
  let doc;
  try {
    doc = JSON.parse(readFileSync(groupsPath, "utf8"));
  } catch (err) {
    return { error: `art-groups read: ${err.message}` };
  }
  const groupIds = new Set(
    Array.isArray(doc.groups)
      ? doc.groups.map((g) => g && g.id).filter(Boolean)
      : [],
  );
  return { groupIds };
}

/**
 * Transactional intake of a source PNG into the concept-art tree +
 * art-manifest.json. Single-path options object (repo invariant — no
 * positional args, no boolean-flag params that branch behavior).
 *
 * @param {object} opts
 * @param {string} opts.src            path to the source PNG
 * @param {string} opts.id             manifest id, must start with "art:"
 * @param {string} opts.group          group id, must be declared in art-groups.json
 * @param {string} opts.title          human-readable title
 * @param {string} opts.note           provenance note (required — no upstream licence)
 * @param {string} [opts.description]  optional sentence-or-two of prose
 * @param {string[]} [opts.tags]       optional array of short tag strings
 * @param {string} [opts.source]       optional brief-source reference (e.g. a doc anchor)
 * @param {object} [opts.gen]          optional reproducibility record: { model, steps, cfg, seed, denoise, width, height }
 * @param {string} [opts.briefId]      optional brief id (e.g. "A1-ART-02") — when given, intake
 *   and gate-skip events are appended to the brief's run ledger (tools/art-forge/runs/)
 * @param {string} [opts.skipArtifactGate] NON-EMPTY REASON to bypass the artifact
 *   gate. Deliberate by construction: there is no boolean form, the caller must
 *   type why, and the reason is recorded in the manifest entry as
 *   `artifactGate: { skipped: true, reason }` so a bypassed image is auditable
 *   forever. Use only when a human has reviewed the corner sheet and judged a
 *   flag to be a false positive.
 * @param {string} [opts.root]         art root (defaults to game-client/assets/art)
 * @param {string} [opts.manifestPath] art-manifest.json path (defaults to <root>/art-manifest.json)
 * @param {Function} [opts.driftGateRunner] injectable drift-gate runner (tests)
 * @param {Function} [opts.artifactGateRunner] injectable artifact-gate runner (tests)
 * @returns {Promise<{ok: boolean, id: string, actions?: string[], failures?: string[], entry?: object}>}
 */
export async function intakeArt(opts = {}) {
  const {
    src,
    id,
    group,
    title,
    note,
    description,
    tags,
    source: briefSource,
    gen,
    briefId,
    skipArtifactGate,
    root = path.join(repoRoot(), "game-client/assets/art"),
    manifestPath = path.join(root, "art-manifest.json"),
    driftGateRunner,
    artifactGateRunner,
  } = opts;

  const actions = [];
  const fail = (...failures) => ({ ok: false, id, actions, failures });

  // --- 1. Validate — every failure below must abort with ZERO side effects.

  if (!src) return fail("intake-art: 'src' is required");
  if (!id) return fail("intake-art: 'id' is required");
  if (!group) return fail("intake-art: 'group' is required");

  if (!existsSync(src)) return fail(`source file not found: ${src}`);

  if (!id.startsWith("art:")) {
    return fail(`id "${id}" must start with "art:"`);
  }

  const groupResult = readGroupIds();
  if (groupResult.error) return fail(groupResult.error);
  if (!groupResult.groupIds.has(group)) {
    return fail(`group "${group}" is not declared in art-groups.json`);
  }

  if (typeof title !== "string" || title.trim() === "") {
    return fail("title is required and must be non-empty");
  }
  if (typeof note !== "string" || note.trim() === "") {
    return fail(
      "note is required and must be non-empty — provenance is mandatory (art carries no upstream licence)",
    );
  }

  const metaFailures = validateArtMetaFields({
    description,
    tags,
    source: briefSource,
    gen,
  });
  if (metaFailures.length > 0) return fail(...metaFailures);

  // --- 1b. Artifact gate. Runs inside the validate phase, so a flagged image
  //     aborts before ANY file or manifest write — the image simply never
  //     enters the repo. Bypassing requires a written reason (see
  //     opts.skipArtifactGate); an empty/whitespace reason is NOT a bypass and
  //     must fail loudly rather than silently disabling the gate.
  let artifactGateRecord;
  if (skipArtifactGate !== undefined) {
    if (
      typeof skipArtifactGate !== "string" ||
      skipArtifactGate.trim() === ""
    ) {
      return fail(
        "skipArtifactGate must be a non-empty reason string — bypassing the " +
          "artifact gate has to be justified in writing",
      );
    }
    artifactGateRecord = { skipped: true, reason: skipArtifactGate.trim() };
    actions.push(`artifact-gate: SKIPPED (${artifactGateRecord.reason})`);
    // Run-ledger entry (F-050): a bypassed gate is a pipeline event — record
    // the skip reason against the brief when one was given.
    if (briefId) {
      appendAttempt(RUNS_DIR, briefId, {
        type: "gate-skipped",
        png: path.relative(FORGE_DIR, src),
        reason: artifactGateRecord.reason,
      });
    }
  } else {
    const artifactGate = artifactGateRunner ?? defaultArtifactGateRunner;
    let artifactResult;
    try {
      artifactResult = await artifactGate({ src });
    } catch (err) {
      return fail(`artifact-gate: ${err.message}`);
    }
    if (!artifactResult || !artifactResult.ok) {
      return fail(
        ...(artifactResult?.reasons?.length
          ? artifactResult.reasons.map((r) => `artifact-gate: ${r}`)
          : ["artifact-gate: failed"]),
        "artifact-gate: pass --skip-artifact-gate <reason> only after reviewing " +
          "the corner sheet (node artifact-gate.mjs <png> --corner-sheet <out.png>)",
      );
    }
    actions.push("artifact-gate: passed");
  }

  const destDir = path.join(root, "concept");
  const destPath = path.join(destDir, path.basename(src));

  // A pre-existing file at the destination with DIFFERENT bytes is a
  // conflicting intake — abort rather than silently overwrite it. Identical
  // bytes are tolerated (idempotent re-intake attempt).
  if (existsSync(destPath)) {
    let same = false;
    try {
      same = readFileSync(src).equals(readFileSync(destPath));
    } catch (err) {
      return fail(`destination read: ${err.message}`);
    }
    if (!same) {
      return fail(`destination already has a different file: ${destPath}`);
    }
  }

  actions.push(`validate: ${id} (${group}) OK`);

  // --- 2. Snapshot — read the manifest's exact bytes before touching
  //    anything, so a missing/malformed manifest aborts with zero side
  //    effects, and rollback can restore byte-for-byte.

  let backupText;
  let manifestObj;
  try {
    backupText = readFileSync(manifestPath, "utf8");
    manifestObj = readManifest(manifestPath);
  } catch (err) {
    return fail(`manifest read: ${err.message}`);
  }
  manifestObj.entries ??= {};
  if (manifestObj.entries[id]) {
    return fail(`id "${id}" already exists in art-manifest.json`);
  }

  const entry = {
    group,
    title,
    file: `concept/${path.basename(src)}`,
    note,
  };
  // Optional rich-metadata fields (F-024) — only set the key when the
  // caller actually passed a value, so entries without them stay exactly
  // the same shape as the 81 pre-existing entries (no `tags: undefined`
  // or similar noise landing in the manifest).
  if (description !== undefined) entry.description = description;
  if (tags !== undefined) entry.tags = tags;
  if (briefSource !== undefined) entry.source = briefSource;
  if (gen !== undefined) entry.gen = gen;
  // Only recorded when the gate was BYPASSED. A passing gate leaves no key, so
  // entries stay byte-identical in shape to the 81 pre-existing ones and the
  // presence of `artifactGate` is itself the audit signal.
  if (artifactGateRecord !== undefined) entry.artifactGate = artifactGateRecord;
  manifestObj.entries[id] = entry;

  // Snapshot any file already at destPath (identical bytes, per the check
  // above) so rollback restores it rather than deleting a pre-existing file.
  const destExisted = existsSync(destPath);
  const destBackup = destExisted ? readFileSync(destPath) : null;

  function rollback() {
    writeManifestRaw(manifestPath, backupText);
    if (destExisted) writeFileSync(destPath, destBackup);
    else rmSync(destPath, { force: true });
  }

  // --- 3. Copy the PNG into <root>/concept/. Inside the rollback net: an
  //    overwrite copy that throws mid-write could truncate a pre-existing
  //    dest, so any failure here must roll back too.
  try {
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, destPath);
  } catch (err) {
    rollback();
    return fail(`copy: ${err.message}`);
  }
  actions.push(`copy: ${src} -> ${destPath}`);

  // --- 4. Write-entry (atomic tmp+rename).
  try {
    writeManifestAtomic(manifestPath, manifestObj);
  } catch (err) {
    rollback();
    return fail(`manifest write: ${err.message}`);
  }
  actions.push(`manifest: wrote entries["${id}"]`);

  // --- 5. Gate.
  const gate = driftGateRunner ?? defaultDriftGateRunner;
  let gateResult;
  try {
    gateResult = await gate({ root, manifestPath, id });
  } catch (err) {
    gateResult = { ok: false, error: err.message };
  }
  if (!gateResult || !gateResult.ok) {
    // --- 6. Rollback on gate failure.
    rollback();
    return fail("drift-gate: failed (rolled back)");
  }
  actions.push("drift-gate: passed");

  // Run-ledger entry (F-050): the intake fully committed (manifest entry +
  // copy survived the drift gate) — record it against the brief.
  if (briefId) {
    appendAttempt(RUNS_DIR, briefId, {
      type: "intake",
      assetKey: entry.file,
      manifest: "game-client/assets/art/art-manifest.json",
    });
  }

  return { ok: true, id, actions, entry };
}

/**
 * Minimal argv parser: `--flag value` only. Raw string values — `--gen`'s
 * JSON string and `--tags`'s comma-separated list are parsed by the CLI
 * caller (main()), not here. Exported for testing parity with intake2d's
 * parseArgs.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${body}`);
      }
      flags[body] = value;
      i++;
    }
  }
  return flags;
}

function printUsageAndExit() {
  console.error(
    "usage: node intake-art.mjs --src <png> --id <art:key> --group <group-id> " +
      "--title <text> --note <provenance> [--description <text>] " +
      "[--tags <comma,separated,tags>] [--source <ref>] [--gen <json>] " +
      "[--brief <briefId>] [--skip-artifact-gate <reason>] [--root <dir>] " +
      "[--manifest-path <path>]\n" +
      "\n" +
      "  --skip-artifact-gate REQUIRES a written reason and records it in the " +
      "manifest entry.\n" +
      "  Review the corner sheet first: node artifact-gate.mjs <png> " +
      "--corner-sheet <out.png>",
  );
  process.exit(1);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.src || !flags.id || !flags.group || !flags.title || !flags.note) {
    printUsageAndExit();
  }

  // --tags: comma-separated -> array. A bare `--tags` (no following value)
  // already throws inside parseArgs (space-separated form, the codebase's
  // recurring bare-flag bug); guard the `--tags=` empty-string form here
  // too so it fails loudly with a usage error rather than silently
  // resolving to an empty tag list.
  let tags;
  if (flags.tags !== undefined) {
    if (flags.tags.trim() === "") {
      console.error("--tags requires a non-empty comma-separated value");
      printUsageAndExit();
    }
    tags = flags.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");
  }

  // --gen: JSON string -> object. Malformed JSON must fail loudly with a
  // usage error BEFORE intakeArt (and therefore any manifest write) is ever
  // reached — not land in the manifest as a broken or partial value.
  let gen;
  if (flags.gen !== undefined) {
    if (flags.gen.trim() === "") {
      console.error("--gen requires a non-empty JSON value");
      printUsageAndExit();
    }
    try {
      gen = JSON.parse(flags.gen);
    } catch (err) {
      console.error(`--gen must be valid JSON: ${err.message}`);
      process.exit(1);
    }
  }

  // --skip-artifact-gate: parseArgs already throws on the bare space-separated
  // form (`--skip-artifact-gate` with no value), which is the whole point —
  // the bypass cannot be tripped by accident. Guard the `--skip-artifact-gate=`
  // empty-string form here too.
  if (flags["skip-artifact-gate"] !== undefined) {
    if (flags["skip-artifact-gate"].trim() === "") {
      console.error("--skip-artifact-gate requires a non-empty reason");
      printUsageAndExit();
    }
  }

  const result = await intakeArt({
    src: path.resolve(flags.src),
    id: flags.id,
    group: flags.group,
    title: flags.title,
    note: flags.note,
    description: flags.description,
    tags,
    source: flags.source,
    gen,
    briefId: flags.brief,
    skipArtifactGate: flags["skip-artifact-gate"],
    root: flags.root ? path.resolve(flags.root) : undefined,
    manifestPath: flags["manifest-path"]
      ? path.resolve(flags["manifest-path"])
      : undefined,
  });

  for (const action of result.actions ?? []) console.log(action);
  if (result.entry && !result.ok) {
    console.log(`entry: ${JSON.stringify(result.entry, null, 2)}`);
  }
  for (const failure of result.failures ?? []) console.log(`FAIL ${failure}`);

  process.exit(result.ok ? 0 : 1);
}

// Only run the CLI when executed directly — not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`intake-art.mjs: ERROR: ${err.message}`);
    process.exit(1);
  });
}
