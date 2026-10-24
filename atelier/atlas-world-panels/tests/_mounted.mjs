// Test helper (not a *.test.mjs, so the node --test glob skips it): asks the REAL
// scripts/atlas_world_web/static_mounts.safe_resolve whether URL paths are served, instead of
// keeping a second copy of its allowlist. Replaces the retired Dockerfile/.dockerignore checks.
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** @param {string[]} urlPaths @returns {Record<string, string|null>} URL path -> served file, or null */
export function resolveMounted(urlPaths) {
  const code = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[1])",
    "from atlas_world_web import static_mounts",
    "out = {}",
    "for p in json.loads(sys.argv[2]):",
    "    r = static_mounts.safe_resolve(p)",
    "    out[p] = str(r) if r else None",
    "print(json.dumps(out))",
  ].join("\n");
  return JSON.parse(
    execFileSync("python3", ["-I", "-c", code, join(ROOT, "scripts"), JSON.stringify(urlPaths)], {
      cwd: ROOT,
      encoding: "utf8",
    }),
  );
}

export const REPO_ROOT_DIR = ROOT;
