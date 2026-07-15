// Small filesystem/manifest helpers shared by intake.mjs.
//
// Atomic writes: every write to the manifest goes through a tmp-file +
// rename so a crash mid-write never leaves a half-written manifest.json on
// disk (rename is atomic on the same filesystem, which the tmp file always
// is -- it's created alongside the target).

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Resolves the repo root via `git rev-parse --show-toplevel`.
 * @returns {string}
 */
export function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

/**
 * Reads and JSON-parses a manifest file.
 * @param {string} manifestPath
 */
export function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function atomicWrite(targetPath, text) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${crypto
      .randomBytes(6)
      .toString("hex")}.tmp`,
  );
  writeFileSync(tmpPath, text, "utf8");
  renameSync(tmpPath, targetPath);
}

/**
 * Serializes `manifestObj` as pretty-printed JSON and atomically writes it
 * to manifestPath (tmp file + rename).
 * @param {string} manifestPath
 * @param {object} manifestObj
 */
export function writeManifestAtomic(manifestPath, manifestObj) {
  atomicWrite(manifestPath, `${JSON.stringify(manifestObj, null, 2)}\n`);
}

/**
 * Atomically writes raw text to manifestPath (tmp file + rename). Used to
 * restore a manifest to its exact pre-write bytes on rollback -- restoring
 * via JSON.stringify(JSON.parse(backup)) would not necessarily reproduce the
 * original byte-for-byte formatting.
 * @param {string} manifestPath
 * @param {string} text
 */
export function writeManifestRaw(manifestPath, text) {
  atomicWrite(manifestPath, text);
}
