#!/usr/bin/env node
// Asset manifest drift-gate (F-002, Stage 0 → Universal Asset Previewer §6):
// keys ↔ render-spec ↔ manifest sources ↔ files ↔ license.
//
// Asserts that the committed client asset manifests are internally consistent
// with the codegen-emitted key set (the single source of truth), the
// declarative render-type contract (render-spec.json — the SAME file the
// asset storybook fetches, so the gate and the storybook can never disagree
// on what a render-type requires), and the files on disk.
//
// Inputs (defaults resolve relative to the repo root):
//   - colyseus-server/generated/asset-keys.json  { version, keys: [{ id, kind }] }
//   - game-client/assets/render-spec.json        { version, renderers, kindDefaultRender, extRender, codegenReservedNamespaces }
//   - game-client/assets/manifest.json           codegen-keyed,  driftGated:true
//   - game-client/assets/audio-manifest.json     curated,        driftGated:false
//   - game-client/assets/catalog-manifest.json   curated,        driftGated:false
//   - res:// scene/stream paths resolve against game-client/ (the Godot project root).
//
// Render-type resolution (mirrors tools/asset-storybook/index.html exactly —
// see docs/superpowers/specs/2026-07-14-universal-asset-previewer-design.md §4.1):
//   1. entry.render, if present — authoritative
//   2. spec.kindDefaultRender[entry.kind], if entry.kind has an unambiguous default
//   3. spec.extRender[ext] of the primary path (scene ?? stream)
//   4. "unknown"
//
// Per-entry validation (driven entirely by render-spec.json — §6):
//   (A) codegen-keyed (driftGated:true) entries must resolve to a
//       Godot-scene-loadable render type (spec.renderers[render].sceneLoadable)
//       — otherwise AssetRegistry.Resolve's ResourceLoader.Load<PackedScene>
//       silently capsule-falls back at runtime with a green gate.
//   (B) the render's path field (scene|stream) is a res:// path, resolves to
//       an existing, non-empty file.
//   (C) every field in render-spec's `require` list is non-empty.
//   (D) every field in render-spec's `optionalPaths` list, if present, resolves.
//   (E) `oneOf` field-groups (e.g. spritesheet's frame/frames vs atlas vs
//       frame/animations) — exactly one group must be fully present.
//   (F) `bakedPreview` types with both `preview` and `previewHashOf` set fail
//       if the source resource is newer than the baked preview (STALE).
//
// Cross-file guards:
//   (G) keyspaces across all manifest sources must be disjoint — the same id
//       in two files would let C# (manifest.json only) and the storybook
//       (merges all) silently resolve different entries.
//   (H) curated (driftGated:false) sources may not use a reserved codegen
//       namespace (spec.codegenReservedNamespaces).
//
// Codegen cross-check (driftGated:true sources only):
//   WARNING  — a key present in asset-keys.json has no manifest entry (UNMAPPED)
//   WARNING  — a manifest entry whose id is not a known asset key (UNKNOWN)
//   --require-complete promotes UNMAPPED to a hard FAILURE.
//
// Collects ALL violations before exiting (no fail-fast) for a useful report.
// Exit 0 iff there are no FAILUREs; else exit 1.
//
// Flags:
//   --require-complete         unmapped keys become failures
//   --keys <path>               override asset-keys.json path (testing)
//   --render-spec <path>        override render-spec.json path (testing)
//   --manifest <path>           override manifest.json path (testing)
//   --audio-manifest <path>     override audio-manifest.json path (testing)
//   --catalog-manifest <path>   override catalog-manifest.json path (testing)
//   --game-client <dir>         override the res:// root dir (testing)

import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = {
    requireComplete: false,
    keys: join(REPO_ROOT, "colyseus-server/generated/asset-keys.json"),
    renderSpec: join(REPO_ROOT, "game-client/assets/render-spec.json"),
    manifest: join(REPO_ROOT, "game-client/assets/manifest.json"),
    audioManifest: join(REPO_ROOT, "game-client/assets/audio-manifest.json"),
    catalogManifest: join(
      REPO_ROOT,
      "game-client/assets/catalog-manifest.json",
    ),
    gameClient: join(REPO_ROOT, "game-client"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--require-complete") opts.requireComplete = true;
    else if (a === "--keys") opts.keys = resolve(argv[++i]);
    else if (a === "--render-spec") opts.renderSpec = resolve(argv[++i]);
    else if (a === "--manifest") opts.manifest = resolve(argv[++i]);
    else if (a === "--audio-manifest") opts.audioManifest = resolve(argv[++i]);
    else if (a === "--catalog-manifest")
      opts.catalogManifest = resolve(argv[++i]);
    else if (a === "--game-client") opts.gameClient = resolve(argv[++i]);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

// Read + parse JSON, pushing a FAILURE (and returning null) on any problem so
// the caller can bail cleanly instead of throwing.
function readJson(path, label, failures) {
  if (!existsSync(path)) {
    failures.push(`${label}: file not found at ${path}`);
    return null;
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    failures.push(`${label}: cannot read ${path} — ${e.message}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    failures.push(`${label}: malformed JSON in ${path} — ${e.message}`);
    return null;
  }
}

// Resolve a res:// path to a filesystem path under the game-client root.
// Returns null if the value is not a proper res:// path.
function resolveResPath(value, gameClientRoot) {
  if (typeof value !== "string" || !value.startsWith("res://")) return null;
  const relative = value.slice("res://".length);
  return join(gameClientRoot, relative);
}

// A field counts as "empty" for `require`/`oneOf` purposes if it's missing,
// a blank string, or an empty object/array — covers both scalar fields
// (license, source, family, role, tileSize) and structured fields
// (patchMargins, frame, animations).
function isEmptyField(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

// §4.1 — render-type resolution. Mirrored byte-for-byte in
// tools/asset-storybook/index.html so the gate and the storybook can never
// disagree on what a given entry renders as.
function primaryPath(entry) {
  return entry.scene ?? entry.stream ?? "";
}

function resolveRender(entry, spec) {
  if (entry.render) return entry.render; // 1. explicit — authoritative
  if (entry.kind && spec.kindDefaultRender[entry.kind])
    return spec.kindDefaultRender[entry.kind]; // 2. unambiguous kind default
  const path = primaryPath(entry);
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return spec.extRender[ext] || "unknown"; // 3. ext sniff → 4. unknown
}

// The manifest sources this gate validates. Adding a new curated file is a
// one-line addition here (§6) — no other code changes.
function manifestSources(opts) {
  return [
    {
      path: opts.manifest,
      label: "manifest",
      keyspace: "codegen",
      driftGated: true,
    },
    {
      path: opts.audioManifest,
      label: "audio-manifest",
      keyspace: "curated",
      driftGated: false,
    },
    {
      path: opts.catalogManifest,
      label: "catalog-manifest",
      keyspace: "curated",
      driftGated: false,
    }, // +1 line per new curated file (§6)
  ];
}

// Per-entry validation, driven entirely by render-spec.json. See the guard
// lettering (A)-(F) in the header comment.
function validateEntry(id, entry, source, gameClient, spec, failures) {
  if (!entry || typeof entry !== "object") {
    failures.push(`entry "${id}": not an object`);
    return;
  }

  const render = resolveRender(entry, spec);
  const r = spec.renderers[render];
  if (!r) {
    failures.push(`entry "${id}": unknown render "${render}"`);
    return;
  }

  // (A) codegen-keyed entries must be Godot-scene-loadable.
  if (source.driftGated && !r.sceneLoadable) {
    failures.push(
      `entry "${id}": codegen-keyed entry cannot use render="${render}" ` +
        `(not Godot-instantiable — would capsule-fallback at runtime with a GREEN gate)`,
    );
  }

  // (B) path field exists, is res://, resolves to a real, non-zero file,
  //     AND its extension is in the render type's `exts` allowlist. The ext
  //     check is what closes the "resolved before any extension check" hole:
  //     a kind-default/explicit render (e.g. character → model3d) can point
  //     at a wrong-ext file (a .svg) that exists and is non-empty — the old
  //     checks passed it with a GREEN gate, but the Godot/model-viewer loader
  //     would then fail at runtime. Assert ext ∈ r.exts and fail loudly.
  const pathVal = entry[r.pathField];
  const fsPath = resolveResPath(pathVal, gameClient);
  if (fsPath === null) {
    failures.push(
      `entry "${id}": ${r.pathField} must be res:// (got ${JSON.stringify(pathVal)})`,
    );
  } else {
    if (!existsSync(fsPath) || !statSync(fsPath).isFile()) {
      failures.push(`entry "${id}": file missing — ${pathVal}`);
    } else if (statSync(fsPath).size === 0) {
      failures.push(`entry "${id}": file is empty — ${pathVal}`);
    }
    const dot = pathVal.lastIndexOf(".");
    const ext = dot === -1 ? "" : pathVal.slice(dot).toLowerCase();
    if (Array.isArray(r.exts) && !r.exts.includes(ext)) {
      failures.push(
        `entry "${id}": ${r.pathField} extension "${ext || "(none)"}" not allowed for ` +
          `render="${render}" — allowed: ${JSON.stringify(r.exts)}`,
      );
    }
  }

  // (C) required scalar/structured fields.
  for (const f of r.require) {
    if (isEmptyField(entry[f])) {
      failures.push(`entry "${id}": required "${f}" empty for render=${render}`);
    }
  }

  // (D) optional path fields — if present, must resolve.
  for (const pf of r.optionalPaths || []) {
    if (entry[pf] && !existsSync(resolveResPath(entry[pf], gameClient))) {
      failures.push(`entry "${id}": ${pf} path missing — ${entry[pf]}`);
    }
  }

  // (E) oneOf groups — exactly one group fully present.
  for (const groups of r.oneOf ? [r.oneOf] : []) {
    const present = groups.filter((g) => g.every((k) => !isEmptyField(entry[k])));
    if (present.length !== 1) {
      failures.push(
        `entry "${id}": render=${render} needs exactly one of ${JSON.stringify(groups)} (got ${present.length})`,
      );
    }
  }

  // (F) baked-preview staleness — the "never disagree" guarantee for baked types.
  if (r.bakedPreview && entry.previewHashOf && entry.preview) {
    const srcP = resolveResPath(entry.previewHashOf, gameClient);
    const pvP = resolveResPath(entry.preview, gameClient);
    if (
      srcP &&
      pvP &&
      existsSync(srcP) &&
      existsSync(pvP) &&
      statSync(srcP).mtimeMs > statSync(pvP).mtimeMs
    ) {
      failures.push(
        `entry "${id}": baked preview is STALE — ${entry.previewHashOf} is newer than ${entry.preview}; re-bake`,
      );
    }
  }
}

// (G) cross-file keyspace disjointness — the same id in two manifest sources
// would let C# (manifest.json only) and the storybook (merges all) silently
// resolve different entries.
function assertDisjoint(sourcesEntries, failures) {
  const seen = new Map(); // id → source label
  for (const { label, entries } of sourcesEntries) {
    for (const id of Object.keys(entries)) {
      if (seen.has(id)) {
        failures.push(
          `duplicate id "${id}" in ${seen.get(id)} AND ${label} — keyspaces must be disjoint`,
        );
      }
      seen.set(id, label);
    }
  }
}

// (H) curated files may not use a reserved codegen namespace.
function assertNoReserved(id, source, spec, failures) {
  if (
    !source.driftGated &&
    (spec.codegenReservedNamespaces || []).some(
      (ns) => id === ns || id.startsWith(ns),
    )
  ) {
    failures.push(
      `curated entry "${id}" uses reserved codegen namespace — forbidden`,
    );
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const failures = [];
  const warnings = [];

  const spec = readJson(opts.renderSpec, "render-spec", failures);
  const keysDoc = readJson(opts.keys, "asset-keys", failures);
  if (spec === null || keysDoc === null) {
    return report(failures, warnings, opts);
  }

  const keys = Array.isArray(keysDoc.keys) ? keysDoc.keys : null;
  if (keys === null) {
    failures.push("asset-keys: expected a `keys` array");
    return report(failures, warnings, opts);
  }
  const keyIds = new Set(keys.map((k) => k && k.id).filter(Boolean));

  const sources = manifestSources(opts);
  const sourcesEntries = []; // for the disjointness guard

  for (const source of sources) {
    const doc = readJson(source.path, source.label, failures);
    if (doc === null) continue; // missing/malformed source is already a failure

    const entries =
      doc.entries && typeof doc.entries === "object" ? doc.entries : null;
    if (entries === null) {
      failures.push(`${source.label}: expected an \`entries\` object`);
      continue;
    }
    sourcesEntries.push({ label: source.label, entries });

    for (const [id, entry] of Object.entries(entries)) {
      validateEntry(id, entry, source, opts.gameClient, spec, failures);
      assertNoReserved(id, source, spec, failures);

      // A manifest entry for an id the codegen doesn't know about is drift —
      // warn (not fatal), since it points at a stale/renamed key. Only
      // meaningful for the codegen-keyed source.
      if (source.driftGated && !keyIds.has(id)) {
        warnings.push(`entry "${id}": not a known asset key (stale or renamed?)`);
      }
    }

    // Every generated key should eventually have a manifest entry in the
    // codegen-keyed source. Stage-0: unmapped is a warning;
    // --require-complete makes it a hard failure.
    if (source.driftGated) {
      for (const id of keyIds) {
        if (!(id in entries)) {
          const msg = `key "${id}": no manifest entry (UNMAPPED)`;
          if (opts.requireComplete) failures.push(msg);
          else warnings.push(msg);
        }
      }
    }
  }

  assertDisjoint(sourcesEntries, failures);

  return report(failures, warnings, opts);
}

function report(failures, warnings, opts) {
  console.log("asset-manifest drift-gate");
  console.log(
    `  mode: ${opts.requireComplete ? "require-complete (Stage 0.5+)" : "stage-0 (unmapped = warning)"}`,
  );
  console.log(`  keys:              ${opts.keys}`);
  console.log(`  render-spec:       ${opts.renderSpec}`);
  console.log(`  manifest:          ${opts.manifest}`);
  console.log(`  audio-manifest:    ${opts.audioManifest}`);
  console.log(`  catalog-manifest:  ${opts.catalogManifest}`);
  console.log("");

  for (const w of warnings) console.log(`  ⚠️  WARN  ${w}`);
  for (const f of failures) console.log(`  ❌ FAIL  ${f}`);

  console.log("");
  console.log(`  ${warnings.length} warning(s), ${failures.length} failure(s)`);

  if (failures.length > 0) {
    console.log("❌ asset-manifest drift-gate FAILED");
    process.exit(1);
  }
  console.log("✅ asset-manifest drift-gate passed");
  process.exit(0);
}

main();
