// F-174 pull-only manifest entries. The repo is public, so an owner-generated asset is
// recorded by Asset Studio id + tag + sha256 and its bytes live in the gitignored
// game-client/studio-cache/<sha256>.glb. These rules keep a pull-only entry from being judged
// as a committed asset, and keep a committed asset from claiming the studio-private licence.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

export const PULL_SCENE_PREFIX = "res://studio-cache/";
const HEX64 = /^[0-9a-f]{64}$/;
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

// Every res:// string an entry carries outside its pull block (scene, stream, preview, file,
// previewHashOf, any render-override path, nested too). Pull-only means none is a committed path.
function resPaths(v, out = []) {
  if (typeof v === "string") { if (v.startsWith("res://")) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => resPaths(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => resPaths(x, out));
  return out;
}
// A `..` segment can climb out of the cache while the string still starts with the prefix.
const insideCache = (r) => {
  const rest = r.slice("res://".length);
  return !rest.split("/").includes("..") && posix.normalize(rest).startsWith("studio-cache/");
};
const FILE_FIELDS = ["scene", "stream", "preview", "previewHashOf", "file", "frame"];

export function hasPullBlock(entry) {
  return entry?.pull !== undefined && entry?.pull !== null;
}

export function isPullOnly(entry) {
  const p = entry?.pull;
  if (!(p && typeof p === "object" && nonEmpty(p.assetStudioAsset) && nonEmpty(p.tag) &&
    HEX64.test(p.sha256 ?? "") && entry.scene === `${PULL_SCENE_PREFIX}${p.sha256}.glb`)) return false;
  const { pull: _pull, ...rest } = entry;
  if (resPaths(rest).some((r) => !r.startsWith(PULL_SCENE_PREFIX) || !insideCache(r))) return false;
  return FILE_FIELDS.every((f) => entry[f] === undefined || (typeof entry[f] === "string" && entry[f].startsWith(PULL_SCENE_PREFIX) && insideCache(entry[f])));
}

export function checkPullEntry(id, entry, gameClient, failures, { skipStudio }) {
  if (!isPullOnly(entry)) {
    failures.push(`entry "${id}": pull block needs assetStudioAsset, tag, 64-hex sha256 and scene ${PULL_SCENE_PREFIX}<sha256>.glb`);
    return "failed";
  }
  const file = join(gameClient, "studio-cache", `${entry.pull.sha256}.glb`);
  if (!existsSync(file)) {
    if (skipStudio) {
      console.log(`SKIP ${id}: pull-only, not in cache (ATLAS_SKIP_STUDIO=1) — not verified`);
      return "skipped";
    }
    failures.push(`entry "${id}": pull-only asset not in cache — run node scripts/studio-pull.mjs (only CI may set ATLAS_SKIP_STUDIO=1; local Gate 1 refuses it)`);
    return "failed";
  }
  const got = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (got !== entry.pull.sha256) {
    failures.push(`entry "${id}": cache file sha256 ${got} != pull.sha256 ${entry.pull.sha256} — delete it and re-run studio-pull`);
    return "failed";
  }
  return "ok";
}

// Guard (W): no byte of a pull-only asset, and nothing derived from one, is tracked. The
// release image copies game-client/assets/** (Dockerfile.atlas-web.dockerignore:9), so a
// tracked thumbnail or .import of the sergeant would publish it.
export function checkNoTrackedCache(repoRoot, failures, { git: gitImpl, pullShas } = {}) {
  const git = gitImpl ?? ((args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  // Fail CLOSED: only a definite "not a git work tree" skips the git checks; any other git error fails.
  let gitOk = true;
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
  } catch (err) {
    gitOk = false;
    const msg = `${err.stderr ?? ""}${err.message ?? ""}`;
    if (/not a git repository/i.test(msg)) {
      console.log("W: not a git checkout — tracked-cache check not run");
    } else {
      failures.push(`(W) git failed, tracked-cache check cannot run (failing closed): ${msg.trim().split("\n")[0]}`);
    }
  }
  let out = "";
  if (gitOk) {
    try {
      out = git(["ls-files", "game-client/studio-cache"]);
    } catch (err) {
      failures.push(`(W) git ls-files failed (failing closed): ${String(err.stderr ?? err.message).trim().split("\n")[0]}`);
    }
  }
  const tracked = out.split("\n").filter(Boolean);
  if (tracked.length) {
    failures.push(`(W) ${tracked.length} file(s) under game-client/studio-cache/ are tracked; this repo is public and pull-only bytes must never be committed: ${tracked.slice(0, 5).join(", ")}`);
  }
  // (W) thumbnail index: tracked, shipped, keyed by source path. No row may come from the cache.
  const idx = join(repoRoot, "game-client/assets/.thumbs/index.json");
  if (existsSync(idx)) {
    const leaked = Object.keys(JSON.parse(readFileSync(idx, "utf8")).entries ?? {}).filter((k) => k.includes("studio-cache/"));
    if (leaked.length) {
      failures.push(`(W) game-client/assets/.thumbs/index.json records ${leaked.length} thumbnail(s) of pull-only sources (${leaked.slice(0, 3).join(", ")}); delete those rows and their .webp files — a private asset's image must never ship`);
    }
  }
  // (W) tracked Godot files derived from the cache bytes (.import sidecar, scene, resource).
  if (!gitOk) return;
  // (W) plain copy: a tracked .glb byte-identical to a pull-only asset leaks it under another name.
  if (pullShas && pullShas.size) {
    let glbs = [];
    try {
      glbs = git(["ls-files", "--", "game-client/*.glb"]).split("\n").filter(Boolean);
    } catch (err) {
      failures.push(`(W) git ls-files '*.glb' failed (failing closed): ${String(err.stderr ?? err.message).trim().split("\n")[0]}`);
    }
    for (const g of glbs) {
      const abs = join(repoRoot, g);
      if (!existsSync(abs)) continue;
      const sha = createHash("sha256").update(readFileSync(abs)).digest("hex");
      if (pullShas.has(sha)) {
        failures.push(`(W) tracked glb ${g} is a byte copy of a pull-only asset (sha256 ${sha}); this repo is public — git rm it`);
      }
    }
  }
  let refs = "";
  try {
    refs = git(["grep", "--cached", "-l", "-F", "res://studio-cache/", "--",
      "game-client/*.import", "game-client/*.tscn", "game-client/*.tres"]);
  } catch (err) {
    if (err.status !== 1) throw err; // git grep exits 1 for "no match"
  }
  const hits = refs.split("\n").filter(Boolean);
  if (hits.length) {
    failures.push(`(W) ${hits.length} tracked file(s) reference studio-cache bytes: ${hits.slice(0, 5).join(", ")} — untrack them (git rm --cached)`);
  }
}
