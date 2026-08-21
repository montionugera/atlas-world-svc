#!/usr/bin/env node
// Thumbnail bake (F-038).
//
// tools/asset-storybook renders EVERY card from a baked thumbnail — that is
// what makes 742 heterogeneous assets uniformly reviewable and uniformly
// cheap. Before this, the page mounted 643 <model-viewer> elements and pulled
// 16.4 MB at rest; a thumbnail spine replaces both with one small image per
// card.
//
// Two backends, chosen by resolved render-type:
//   model3d                     -> headless Blender via scripts/bake_poster.py
//   everything else + art PNGs  -> sharp resize
//
// Output:
//   game-client/assets/.thumbs/<thumbKey(sourcePath)>.webp   (256px long edge)
//   game-client/assets/.thumbs/index.json                    (path -> meta)
//
// The index is what lets the page show each card's on-disk size WITHOUT the
// 653 HEAD requests js/utils.mjs used to issue on every load.
//
// Freshness is CONTENT-HASH based, matching guard (U) in
// check_asset_manifest.mjs: index.json records sourceHash(source) per entry,
// and a source whose bytes no longer hash to the recorded value is stale and
// gets re-baked. It used to be an mtime comparison, which is only meaningful
// on a tree that was edited in place — see the note in lib/thumbkey.mjs for
// how that made CI report 643 false STALEs. CI never runs this script; it only
// runs the guard, which needs no Blender and no sharp.
//
// Flags:
//   --force            re-bake everything, ignoring recorded hashes
//   --only <substr>    only BAKE sources whose path contains <substr>. Matches
//                      the SOURCE PATH (e.g. "maps/", "concept/"), not the
//                      manifest key — `--only art:map-cluster1` matches nothing.
//                      Rows outside the filter are carried forward unchanged,
//                      never dropped from the index.
//   --skip-3d          skip the Blender queue (useful without Blender installed)
//   --dry-run          report what would be baked, write nothing

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import {
  thumbFilename,
  sourceHash,
  carryForwardFiltered,
} from "./lib/thumbkey.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const GAME_CLIENT = join(REPO_ROOT, "game-client");
const ASSETS = join(GAME_CLIENT, "assets");
const THUMB_DIR = join(ASSETS, ".thumbs");
const ART_ROOT = join(ASSETS, "art");
const POSTER_PY = join(__dirname, "bake_poster.py");
const BLENDER =
  process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";

const LONG_EDGE = 256;

function parseArgs(argv) {
  const opts = { force: false, only: null, skip3d: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = true;
    else if (a === "--skip-3d") opts.skip3d = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--only") opts.only = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Mirrors resolveRender in check_asset_manifest.mjs / js/renderers.mjs. Not
// byte-shared with them because those two are held byte-identical to each
// other by resolve_render_mirror.test.mjs; a third copy would have to join
// that pact. This one only has to answer "3D or not", so it stays small and
// its behaviour is pinned by scripts/tests/bake_thumbnails.test.mjs.
function isModel3d(entry, spec) {
  if (entry.render) return entry.render === "model3d";
  if (entry.kind && spec.kindDefaultRender[entry.kind])
    return spec.kindDefaultRender[entry.kind] === "model3d";
  const path = entry.scene ?? entry.stream ?? "";
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return (spec.extRender[ext] || "unknown") === "model3d";
}

// Every bakeable thing in the repo, as { key, srcPath, absSrc, kind }.
// `srcPath` is the string the storybook will look up in the index — a res://
// path for manifest entries, a plain art-relative path for concept art, which
// mirrors how the page already resolves each (ASSET_ROOT vs ART_ROOT).
function collectJobs(spec) {
  const jobs = [];

  for (const rel of ["manifest.json", "catalog-manifest.json"]) {
    const doc = readJson(join(ASSETS, rel));
    for (const [key, entry] of Object.entries(doc.entries || {})) {
      const srcPath = entry.scene ?? entry.stream;
      if (!srcPath) continue;
      // Baked-preview types (theme/material) have no readable source image;
      // their `preview` PNG is the thing to thumbnail.
      const imageSource = entry.preview || srcPath;
      const absSrc = join(GAME_CLIENT, imageSource.replace(/^res:\/\//, ""));
      jobs.push({
        key,
        srcPath,
        absSrc,
        is3d: isModel3d(entry, spec) && !entry.preview,
      });
    }
  }

  const artPath = join(ART_ROOT, "art-manifest.json");
  if (existsSync(artPath)) {
    for (const [key, entry] of Object.entries(
      readJson(artPath).entries || {},
    )) {
      if (typeof entry.file !== "string") continue;
      jobs.push({
        key,
        srcPath: entry.file,
        absSrc: join(ART_ROOT, entry.file),
        is3d: false,
      });
    }
  }

  return jobs;
}

// Stale = the thumbnail was not rendered from the bytes currently on disk.
// `recordedHash` is index.json's srcHash for this source; an entry the index
// has never seen is stale by definition, which is also what makes the guard
// and the bake agree — the guard fails an unrecorded thumbnail, and this
// re-bakes it rather than leaving CI permanently red.
function isStale(absSrc, absThumb, recordedHash) {
  if (!existsSync(absThumb)) return true;
  if (!existsSync(absSrc)) return false; // a missing source is the gate's problem
  return sourceHash(absSrc) !== recordedHash;
}

// The previous index, read for its srcHash records. Missing or malformed means
// "nothing is known to be fresh" — every entry re-bakes, which is correct if
// slow, never silently wrong.
function readPriorIndex() {
  const p = join(THUMB_DIR, "index.json");
  if (!existsSync(p)) return {};
  try {
    return readJson(p).entries || {};
  } catch {
    console.warn(
      "bake_thumbnails: .thumbs/index.json unreadable — re-baking all",
    );
    return {};
  }
}

// Trim the transparent margin, then centre-pad back to a square. Blender
// frames each model to its own bounding box, which leaves an elongated asset
// (spear, sword, fence) occupying a sliver of the frame; trimming recovers
// those pixels. Harmless for 2D sources, which usually have no alpha margin.
async function toThumb(absSrc, absOut, { trim }) {
  let img = sharp(absSrc, { failOn: "error" });
  if (trim) img = img.trim();
  const buf = await img
    .resize(LONG_EDGE, LONG_EDGE, { fit: "inside", withoutEnlargement: false })
    .webp({ quality: 82 })
    .toBuffer();
  // Re-read the resized buffer to record true dimensions in the index.
  const meta = await sharp(buf).metadata();
  writeFileSync(absOut, buf);
  return { w: meta.width, h: meta.height };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const spec = readJson(join(ASSETS, "render-spec.json"));

  if (!opts.dryRun) mkdirSync(THUMB_DIR, { recursive: true });

  const allJobs = collectJobs(spec);
  // `--only` filters what gets BAKED. It must not filter what gets INDEXED:
  // the index is written whole, so a filtered run used to erase every row it
  // did not visit — 643 of them — and turn guard (U) red on a clean tree.
  // See carryForwardFiltered() in lib/thumbkey.mjs for the full account.
  let jobs = allJobs;
  if (opts.only) jobs = jobs.filter((j) => j.srcPath.includes(opts.only));
  const bakedPaths = new Set(jobs.map((j) => j.srcPath));
  const retainPaths = new Set(
    allJobs.map((j) => j.srcPath).filter((p) => !bakedPaths.has(p)),
  );

  // Several manifest keys can share one source file — projectile:spear and
  // projectile:magicSpear both point at res://assets/vfx/projectile-spear.glb.
  // They therefore share a thumbKey, so baking per key would render the same
  // model twice (and, in the Blender queue, pay ~1s for the privilege).
  // The index is keyed by source path too, so one entry per path is correct.
  const byPath = new Map();
  for (const j of jobs) if (!byPath.has(j.srcPath)) byPath.set(j.srcPath, j);
  const duplicates = jobs.length - byPath.size;
  jobs = [...byPath.values()];
  if (duplicates > 0) {
    console.log(
      `bake_thumbnails: ${duplicates} manifest keys share a source with another key`,
    );
  }

  const index = { version: 1, entries: {} };
  const prior = readPriorIndex();
  const stale = [];
  let missingSource = 0;

  for (const job of jobs) {
    job.absThumb = join(THUMB_DIR, thumbFilename(job.srcPath));
    if (!existsSync(job.absSrc)) {
      missingSource++;
      continue; // guard (B) already fails the build on a missing source
    }
    const recorded = prior[job.srcPath] && prior[job.srcPath].srcHash;
    if (opts.force || isStale(job.absSrc, job.absThumb, recorded))
      stale.push(job);
  }

  console.log(
    `bake_thumbnails: ${jobs.length} entries, ${stale.length} stale, ` +
      `${missingSource} with a missing source`,
  );
  if (opts.dryRun) {
    for (const j of stale) console.log(`  would bake ${j.srcPath}`);
    return 0;
  }

  let baked = 0;
  let failed = 0;

  // --- 3D queue: ONE Blender process for the whole batch. Per-process
  //     startup is ~2s; batching 21 models measured 0.94s each end-to-end
  //     versus 4.2s when each got its own process. ---
  const jobs3d = stale.filter((j) => j.is3d);
  if (jobs3d.length > 0 && !opts.skip3d) {
    if (!existsSync(BLENDER)) {
      console.error(
        `bake_thumbnails: ERROR: Blender not found at '${BLENDER}'. ` +
          `Set $BLENDER, or pass --skip-3d to bake only 2D thumbnails.`,
      );
      failed += jobs3d.length;
    } else {
      const jobFile = join(tmpdir(), `atlas-poster-jobs-${process.pid}.json`);
      writeFileSync(
        jobFile,
        JSON.stringify(jobs3d.map((j) => [j.absSrc, j.absThumb])),
      );
      const proc = spawnSync(
        BLENDER,
        ["-b", "--factory-startup", "--python", POSTER_PY, "--", jobFile],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      unlinkSync(jobFile);

      // Blender does NOT exit non-zero on an unhandled Python exception
      // (documented in tools/asset-forge/bake.sh). Count the result lines
      // instead of trusting the exit code.
      const out = (proc.stdout || "") + (proc.stderr || "");
      for (const line of out.split("\n")) {
        if (line.startsWith("BAKE_FAIL:")) {
          failed++;
          console.error("  " + line);
        }
      }
      for (const j of jobs3d) {
        if (existsSync(j.absThumb)) {
          // Blender frames to the bounding box; recover the wasted margin.
          try {
            await toThumb(j.absThumb, j.absThumb, { trim: true });
            j.baked = true;
            baked++;
          } catch (e) {
            failed++;
            console.error(`  TRIM_FAIL ${j.srcPath}: ${e.message}`);
          }
        }
      }
    }
  } else if (jobs3d.length > 0 && opts.skip3d) {
    console.log(`  --skip-3d: skipping ${jobs3d.length} model posters`);
  }

  // --- 2D queue ---
  for (const job of stale.filter((j) => !j.is3d)) {
    try {
      await toThumb(job.absSrc, job.absThumb, { trim: false });
      job.baked = true;
      baked++;
    } catch (e) {
      failed++;
      console.error(`  BAKE_FAIL ${job.srcPath}: ${e.message}`);
    }
  }

  // --- index: every job whose thumbnail exists on disk. Written with sorted
  //     keys so a re-run produces a byte-identical file when nothing changed
  //     — an unsorted object would churn the diff on every bake.
  //
  //     `srcHash` is the freshness token guard (U) checks, so it may only be
  //     stamped with the CURRENT source hash for a thumbnail that really was
  //     rendered from those bytes: one that was already fresh, or one this run
  //     baked successfully. A job whose bake failed (or was skipped by
  //     --skip-3d) keeps whatever the previous index recorded, so the guard
  //     stays red until the bake actually succeeds instead of certifying an
  //     image nobody rendered. ---
  const staleSet = new Set(stale.map((j) => j.srcPath));
  for (const job of jobs.sort((a, b) => a.srcPath.localeCompare(b.srcPath))) {
    if (!existsSync(job.absThumb)) continue;
    // A missing source has nothing to hash; guard (B) owns that failure.
    const current =
      existsSync(job.absSrc) &&
      (!staleSet.has(job.srcPath) || job.baked === true);
    const srcHash = current
      ? sourceHash(job.absSrc)
      : prior[job.srcPath] && prior[job.srcPath].srcHash;
    const meta = await sharp(job.absThumb).metadata();
    index.entries[job.srcPath] = {
      thumb: thumbFilename(job.srcPath),
      bytes: existsSync(job.absSrc) ? statSync(job.absSrc).size : 0,
      w: meta.width,
      h: meta.height,
      ...(srcHash ? { srcHash } : {}),
    };
  }
  // Seam-4 review B, survivor 2: deleting this call leaves thumbkey.test.mjs
  // 12/0 and thumb_freshness.test.mjs 6/0. The pure function is covered (4 of
  // 4 mutants killed); its WIRING is not, because covering it means running
  // main(), which needs sharp and Blender and is not a CI-shaped test.
  //
  // VERIFIED BACKSTOP, which is why this is recorded rather than chased: the
  // failure is loud, not silent. Without this call a `--only` run drops every
  // unrelated row from index.json, and check_asset_manifest.mjs guard (U)
  // reads a thumbnail with no index row as UNRECORDED and FAILS —
  // scripts/tests/thumb_freshness.test.mjs pins exactly that case. A wiped
  // index cannot reach a green commit.
  index.entries = carryForwardFiltered({
    entries: index.entries,
    prior,
    retainPaths,
  });
  writeFileSync(
    join(THUMB_DIR, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
  );

  console.log(
    `bake_thumbnails: baked ${baked}, failed ${failed}, ` +
      `indexed ${Object.keys(index.entries).length}`,
  );
  // A silent partial bake is exactly the failure mode this spine exists to
  // prevent — a green run with missing thumbnails means blank cards.
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("bake_thumbnails: fatal:", err);
    process.exit(1);
  },
);
