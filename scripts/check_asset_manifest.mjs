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
// Render-type resolution (mirrors tools/asset-storybook/js/renderers.mjs exactly —
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
//   (K) frame+animations spritesheets must tile their PNG on a uniform grid:
//       sheetW % frameW == 0, sheetH % frameH == 0, and each animation count
//       <= cols*rows (partial final row allowed). Guards runtime frame-slicing.
//   (N) art-manifest OPTIONAL rich-metadata fields (F-024) — description,
//       tags, source, gen — validated when present, never required.
//
// Cross-file guards:
//   (G) keyspaces across all manifest sources must be disjoint — the same id
//       in two files would let C# (manifest.json only) and the storybook
//       (merges all) silently resolve different entries.
//   (H) curated (driftGated:false) sources may not use a reserved codegen
//       namespace (spec.codegenReservedNamespaces).
//   (I) tiered license/CC-BY policy (per-entry; applied during validateEntry).
//   (J) every AssetKind the codegen emits either has a render-spec
//       kindDefaultRender or every mapped key of that kind carries explicit
//       render — a no-default kind may not rely on ext sniffing (see §3 of
//       docs/superpowers/specs/2026-07-20-asset-registry-contract.md).
//   (U) every manifest entry must have a baked thumbnail in
//       game-client/assets/.thumbs/ that is no older than its source — the
//       storybook renders every card from one, so a stale thumbnail is a card
//       that lies about the asset (F-038).
//   (T) every manifest `kind` must have a section in
//       content/asset-taxonomy.json, so tools/asset-storybook can never fall
//       back to a munged label like "Model3d:dungeons" (F-038). Letters L/M
//       are taken by the art-rule lettering below, hence T.
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
//   --art-manifest <path>       override art-manifest.json path (testing)
//   --art-groups <path>         override art-groups.json path (testing)
//   --art-root <dir>            override the art root dir (testing)
//   --game-client <dir>         override the res:// root dir (testing)
//   --taxonomy <path>           override asset-taxonomy.json path (testing)

import {
  readFileSync,
  existsSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";
import { checkLicensePolicy } from "./lib/license-policy.mjs";
import { thumbFilename } from "./lib/thumbkey.mjs";

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
    musicManifest: join(REPO_ROOT, "game-client/assets/music-manifest.json"),
    artManifest: join(REPO_ROOT, "game-client/assets/art/art-manifest.json"),
    artGroups: join(REPO_ROOT, "game-client/assets/art/art-groups.json"),
    artRoot: join(REPO_ROOT, "game-client/assets/art"),
    gameClient: join(REPO_ROOT, "game-client"),
    taxonomy: join(REPO_ROOT, "content/asset-taxonomy.json"),
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
    else if (a === "--music-manifest") opts.musicManifest = resolve(argv[++i]);
    else if (a === "--art-manifest") opts.artManifest = resolve(argv[++i]);
    else if (a === "--art-groups") opts.artGroups = resolve(argv[++i]);
    else if (a === "--art-root") opts.artRoot = resolve(argv[++i]);
    else if (a === "--game-client") opts.gameClient = resolve(argv[++i]);
    else if (a === "--taxonomy") opts.taxonomy = resolve(argv[++i]);
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
// tools/asset-storybook/js/renderers.mjs so the gate and the storybook can
// never disagree on what a given entry renders as. Enforced by the
// "resolveRender mirror" test in scripts/tests/resolve_render_mirror.test.mjs
// — that test reads both copies and diffs them, so a drift here fails CI
// instead of silently diverging.
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
      validator: "render",
    },
    {
      path: opts.audioManifest,
      label: "audio-manifest",
      keyspace: "curated",
      driftGated: false,
      validator: "render",
    },
    {
      path: opts.catalogManifest,
      label: "catalog-manifest",
      keyspace: "curated",
      driftGated: false,
      validator: "render",
    },
    {
      path: opts.musicManifest,
      label: "music-manifest",
      keyspace: "curated",
      driftGated: false,
      validator: "render",
    }, // +1 line per new curated file (§6)
    {
      path: opts.artManifest,
      label: "art-manifest",
      keyspace: "curated",
      driftGated: false,
      validator: "art", // concept art is NOT render-spec shaped — see spec §4
      root: opts.artRoot,
    },
  ];
}

// Read a PNG's pixel dimensions from its IHDR chunk (bytes 16-24 after the
// 8-byte signature) without an image library. Returns {w,h} or null.
function readPngSize(fsPath) {
  try {
    const buf = readFileSync(fsPath);
    if (buf.length < 24 || buf.toString("ascii", 12, 16) !== "IHDR")
      return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

// A Git LFS pointer is a small text file that begins with this exact line. A
// fresh clone without `git lfs pull` has pointers where the images should be —
// they are non-empty regular files, so a size check alone lets them through.
const LFS_MAGIC = "version https://git-lfs.github.com/spec/v1";

function isLfsPointer(fsPath) {
  let fd;
  try {
    fd = openSync(fsPath, "r");
    const buf = Buffer.alloc(LFS_MAGIC.length);
    const n = readSync(fd, buf, 0, LFS_MAGIC.length, 0);
    return n === LFS_MAGIC.length && buf.toString("utf8") === LFS_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// (N) Optional rich-metadata fields (F-024): description, tags, source, gen.
// All are OPTIONAL — the 81 pre-existing entries carry none of them and must
// stay valid — but when present they are validated so a malformed value
// can never reach the storybook. `gen` is the reproducibility record (model
// + sampler knobs); without it a good result cannot be regenerated.
const GEN_NUMBER_FIELDS = [
  "steps",
  "cfg",
  "seed",
  "denoise",
  "width",
  "height",
];
const GEN_INTEGER_FIELDS = new Set(["steps", "seed", "width", "height"]);

function validateArtMetaFields(id, entry, failures) {
  if (entry.description !== undefined) {
    if (
      typeof entry.description !== "string" ||
      entry.description.trim() === ""
    ) {
      failures.push(
        `entry "${id}": description must be a non-empty string if present`,
      );
    }
  }

  if (entry.source !== undefined) {
    if (typeof entry.source !== "string" || entry.source.trim() === "") {
      failures.push(
        `entry "${id}": source must be a non-empty string if present`,
      );
    }
  }

  if (entry.tags !== undefined) {
    if (
      !Array.isArray(entry.tags) ||
      entry.tags.length === 0 ||
      entry.tags.some((t) => typeof t !== "string" || t.trim() === "")
    ) {
      failures.push(
        `entry "${id}": tags must be a non-empty array of non-empty strings if present`,
      );
    }
  }

  if (entry.gen !== undefined) {
    if (
      typeof entry.gen !== "object" ||
      entry.gen === null ||
      Array.isArray(entry.gen)
    ) {
      failures.push(`entry "${id}": gen must be an object if present`);
    } else {
      const gen = entry.gen;
      if (
        gen.model !== undefined &&
        (typeof gen.model !== "string" || gen.model.trim() === "")
      ) {
        failures.push(`entry "${id}": gen.model must be a non-empty string`);
      }
      for (const field of GEN_NUMBER_FIELDS) {
        if (gen[field] === undefined) continue;
        const v = gen[field];
        if (typeof v !== "number" || !Number.isFinite(v)) {
          failures.push(`entry "${id}": gen.${field} must be a number`);
          continue;
        }
        if (GEN_INTEGER_FIELDS.has(field) && !Number.isInteger(v)) {
          failures.push(`entry "${id}": gen.${field} must be an integer`);
          continue;
        }
        if ((field === "width" || field === "height") && v <= 0) {
          failures.push(`entry "${id}": gen.${field} must be positive`);
        }
      }
    }
  }
}

// (L) Concept-art entries. Curated reference material with NO renderer, so the
// render-spec path in validateEntry() does not apply — see
// docs/superpowers/specs/2026-08-01-art-forge-foundation-design.md §4.
// Licence guard (I) deliberately does not apply either: art is generated
// locally on mont-pc and has no upstream licence, so `note` carries provenance.
function validateArtEntry(id, entry, source, groupIds, failures) {
  if (!entry || typeof entry !== "object") {
    failures.push(`entry "${id}": not an object`);
    return;
  }
  if (typeof entry.group !== "string" || !groupIds.has(entry.group)) {
    failures.push(
      `entry "${id}": group "${entry.group}" is not declared in art-groups.json`,
    );
  }
  if (isEmptyField(entry.title)) failures.push(`entry "${id}": missing title`);
  if (isEmptyField(entry.note)) {
    failures.push(
      `entry "${id}": missing note — provenance is required (art carries no upstream licence)`,
    );
  }

  validateArtMetaFields(id, entry, failures);

  const file = entry.file;
  if (typeof file !== "string" || file.trim() === "") {
    failures.push(`entry "${id}": missing file`);
    return;
  }
  if (
    file.startsWith("res://") ||
    file.startsWith("/") ||
    file.split("/").includes("..")
  ) {
    failures.push(
      `entry "${id}": file must be a relative path under the art root — got "${file}"`,
    );
    return;
  }

  const fsPath = join(source.root, file);
  if (!existsSync(fsPath)) {
    failures.push(`entry "${id}": file not found — ${file}`);
    return;
  }
  const st = statSync(fsPath);
  if (!st.isFile() || st.size === 0) {
    failures.push(
      `entry "${id}": file is empty or not a regular file — ${file}`,
    );
    return;
  }
  if (isLfsPointer(fsPath)) {
    failures.push(
      `entry "${id}": file is a Git LFS pointer, not image payload — run \`git lfs pull\` (${file})`,
    );
  }
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
      failures.push(
        `entry "${id}": required "${f}" empty for render=${render}`,
      );
    }
  }

  // (I) tiered license policy — allowed set + CC-BY attribution completeness.
  checkLicensePolicy(id, entry, failures);

  // (D) optional path fields — if present, must resolve.
  for (const pf of r.optionalPaths || []) {
    if (entry[pf] && !existsSync(resolveResPath(entry[pf], gameClient))) {
      failures.push(`entry "${id}": ${pf} path missing — ${entry[pf]}`);
    }
  }

  // (E) oneOf groups — exactly one group fully present.
  for (const groups of r.oneOf ? [r.oneOf] : []) {
    const present = groups.filter((g) =>
      g.every((k) => !isEmptyField(entry[k])),
    );
    if (present.length !== 1) {
      failures.push(
        `entry "${id}": render=${render} needs exactly one of ${JSON.stringify(groups)} (got ${present.length})`,
      );
    }
  }

  // (K) spritesheet grid divisibility — a frame+animations spritesheet must
  // tile its PNG on a uniform grid: sheetW % frameW == 0, sheetH % frameH == 0,
  // and each animation's frame count must fit the grid (count <= cols*rows,
  // allowing a partial final row — do NOT require count == cols*rows, which
  // wrongly rejects a valid partial-row sheet like fireball 2048x1792/256=8x7
  // cells for 50 frames). A mis-tiled sheet slices garbage frames at runtime
  // while the gate stays GREEN. PNG dims read from the IHDR (no image lib).
  if (
    render === "spritesheet" &&
    entry.frame &&
    Array.isArray(entry.animations) &&
    fsPath &&
    existsSync(fsPath)
  ) {
    const dims = readPngSize(fsPath);
    const fw = entry.frame.w;
    const fh = entry.frame.h;
    if (dims && fw > 0 && fh > 0) {
      if (dims.w % fw !== 0 || dims.h % fh !== 0) {
        failures.push(
          `entry "${id}": spritesheet ${dims.w}x${dims.h} not divisible by frame ${fw}x${fh}`,
        );
      } else {
        const cols = dims.w / fw;
        const rows = dims.h / fh;
        const cells = cols * rows;
        for (const anim of entry.animations) {
          if (typeof anim.count === "number" && anim.count > cells) {
            failures.push(
              `entry "${id}": animation "${anim.name}" count ${anim.count} exceeds grid ${cols}x${rows}=${cells} cells`,
            );
          }
        }
      }
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
// (U) thumbnail freshness — every manifest entry must have a baked thumbnail
// in game-client/assets/.thumbs/, no older than its source file.
//
// tools/asset-storybook renders EVERY card from a baked thumbnail (F-038), so
// a thumbnail older than its source is a card that lies about what the asset
// looks like — and the reviewer files a reject/rebuild verdict against a stale
// image. This is guard (F)'s mtime rule (which covers only bakedPreview types)
// applied universally.
//
// Pure filesystem comparison, so CI needs neither Blender nor sharp; only
// `node scripts/bake_thumbnails.mjs` does.
//
// Art entries are exempt here — they are validated by the art source's own
// path rules and carry `file`, not a res:// scene/stream.
function assertThumbFreshness(sourcesEntries, gameClient, failures) {
  const thumbDir = join(gameClient, "assets/.thumbs");
  const seen = new Set(); // several keys can share one source path

  for (const { entries } of sourcesEntries) {
    for (const [id, entry] of Object.entries(entries)) {
      // `scene` only, never `stream`. render-spec.json gives audio and music
      // pathField "stream", and the storybook renders those as soundboard
      // tiles (js/audio.mjs) rather than thumbnail cards — an .ogg has
      // nothing to thumbnail. Keying on the field rather than the extension
      // means a future audio format needs no change here.
      const resPath = entry && entry.scene;
      if (!resPath || typeof resPath !== "string") continue;
      if (!resPath.startsWith("res://")) continue; // art `file` paths
      if (seen.has(resPath)) continue;
      seen.add(resPath);

      const thumbP = join(thumbDir, thumbFilename(resPath));
      if (!existsSync(thumbP)) {
        failures.push(
          `entry "${id}": missing thumbnail ${thumbFilename(resPath)} for ` +
            `${resPath} — run \`node scripts/bake_thumbnails.mjs\``,
        );
        continue;
      }

      const srcP = resolveResPath(entry.preview || resPath, gameClient);
      if (!srcP || !existsSync(srcP)) continue; // guard (B) owns missing sources
      if (statSync(srcP).mtimeMs > statSync(thumbP).mtimeMs) {
        failures.push(
          `entry "${id}": thumbnail is STALE — ${resPath} is newer than its ` +
            `baked thumbnail; re-run \`node scripts/bake_thumbnails.mjs\``,
        );
      }
    }
  }
}

// (T) taxonomy coverage — every manifest `kind` must have a section in
// content/asset-taxonomy.json.
//
// tools/asset-storybook groups and labels its sections by `kind` through that
// registry. Before this guard the storybook carried a hand-maintained label
// lookup that fell through to a generic capitalize-and-append-s branch on a
// miss, so an unregistered kind produced a section headed "Model3d:dungeons
// (283)" — a silent lookup miss, not an error. Failing here turns a whole
// class of bug into an impossibility: a new kind cannot reach the page
// without someone naming it.
//
// Art entries are exempt: they carry a `group` (validated against
// art-groups.json by assertArtCoverage), not a `kind`.
function assertTaxonomyCoverage(sourcesEntries, taxonomyDoc, failures) {
  if (!taxonomyDoc) return; // readJson already recorded the failure
  const known = new Set();
  for (const s of taxonomyDoc.sections || []) {
    for (const k of s.kinds || []) known.add(k);
  }

  const offenders = new Map(); // kind → first "source/id" that used it
  for (const { label, entries } of sourcesEntries) {
    for (const [id, entry] of Object.entries(entries)) {
      const kind = entry && entry.kind;
      if (!kind || known.has(kind)) continue;
      if (!offenders.has(kind)) offenders.set(kind, `${label} entry "${id}"`);
    }
  }

  for (const [kind, where] of offenders) {
    failures.push(
      `kind "${kind}" (first used by ${where}) has no section in ` +
        `content/asset-taxonomy.json — add it to a section's "kinds" array ` +
        `so the storybook can label it`,
    );
  }
}

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

const ART_IMAGE_EXT = new Set([".png", ".webp", ".jpg", ".jpeg"]);

function* walkImages(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkImages(p);
      continue;
    }
    const dot = ent.name.lastIndexOf(".");
    const ext = dot === -1 ? "" : ent.name.slice(dot).toLowerCase();
    if (ART_IMAGE_EXT.has(ext)) yield p;
  }
}

// (M) Reverse direction + group completeness. Rule (L) catches an entry whose
// file vanished; this catches the opposite — a committed image nothing points
// at, which is invisible forever — and a group that silently lost a member
// (the exact 7-vs-8 races symptom that went unnoticed).
function assertArtCoverage(entries, source, groupsDoc, failures) {
  const claimed = new Set();
  const counts = {};
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.file === "string" && entry.file.trim() !== "") {
      claimed.add(resolve(source.root, entry.file));
    }
    if (typeof entry.group === "string") {
      counts[entry.group] = (counts[entry.group] || 0) + 1;
    }
  }

  for (const abs of walkImages(source.root)) {
    if (!claimed.has(resolve(abs))) {
      failures.push(
        `art file has no manifest entry: ${relative(source.root, abs)}`,
      );
    }
  }

  for (const [group, expected] of Object.entries(
    (groupsDoc && groupsDoc.expectedCounts) || {},
  )) {
    const actual = counts[group] || 0;
    if (actual !== expected) {
      failures.push(
        `art group "${group}": expected ${expected} entries, found ${actual}`,
      );
    }
  }
}

// (J) AssetKind renderability completeness. Every `kind` the codegen emits
// (asset-keys.json) must resolve to a renderer by CONTRACT, not by accident:
// either render-spec declares a `kindDefaultRender[kind]` (guaranteed default),
// OR every mapped codegen key of that kind carries an explicit `render`. This
// is deliberately stricter than "does it resolve" — a no-default kind must NOT
// lean on tier-3 ext-sniffing, so future kinds (e.g. a spritesheet `vfx:` key)
// cannot silently fall through to the wrong renderer. See the asset-registry
// contract doc (§ taxonomy completeness). Scoped to the codegen-keyed source
// only; curated keyspaces are not codegen kinds.
function assertKindRenderable(keys, spec, codegenEntries, failures) {
  const defaults = spec.kindDefaultRender || {};
  const byKind = new Map(); // kind → [ids]
  for (const k of keys) {
    if (!k || !k.kind || !k.id) continue;
    if (!byKind.has(k.kind)) byKind.set(k.kind, []);
    byKind.get(k.kind).push(k.id);
  }
  for (const [kind, ids] of byKind) {
    if (defaults[kind]) continue; // guaranteed by an unambiguous kind default
    for (const id of ids) {
      const entry = codegenEntries ? codegenEntries[id] : undefined;
      if (entry === undefined) continue; // unmapped: covered by the UNMAPPED guard
      if (isEmptyField(entry.render)) {
        failures.push(
          `key "${id}": kind "${kind}" has no render-spec kindDefaultRender, ` +
            `so the entry must declare an explicit "render" (found none) — ` +
            `a no-default kind must not rely on extension sniffing`,
        );
      }
    }
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

  const groupsDoc = readJson(opts.artGroups, "art-groups", failures);
  const groupIds = new Set(
    groupsDoc && Array.isArray(groupsDoc.groups)
      ? groupsDoc.groups.map((g) => g && g.id).filter(Boolean)
      : [],
  );

  const sources = manifestSources(opts);
  const sourcesEntries = []; // for the disjointness guard
  let codegenEntries = null; // the driftGated source's entries (for guard J)

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
    if (source.driftGated) codegenEntries = entries;

    for (const [id, entry] of Object.entries(entries)) {
      if (source.validator === "art") {
        validateArtEntry(id, entry, source, groupIds, failures);
      } else {
        validateEntry(id, entry, source, opts.gameClient, spec, failures);
      }
      assertNoReserved(id, source, spec, failures);

      // A manifest entry for an id the codegen doesn't know about is drift —
      // warn (not fatal), since it points at a stale/renamed key. Only
      // meaningful for the codegen-keyed source.
      if (source.driftGated && !keyIds.has(id)) {
        warnings.push(
          `entry "${id}": not a known asset key (stale or renamed?)`,
        );
      }
    }

    if (source.validator === "art") {
      assertArtCoverage(entries, source, groupsDoc, failures);
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
  const taxonomyDoc = readJson(opts.taxonomy, "asset-taxonomy", failures);
  assertTaxonomyCoverage(sourcesEntries, taxonomyDoc, failures);
  assertThumbFreshness(sourcesEntries, opts.gameClient, failures);
  assertKindRenderable(keys, spec, codegenEntries, failures);

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
  console.log(`  music-manifest:    ${opts.musicManifest}`);
  console.log(`  art-manifest:      ${opts.artManifest}`);
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
