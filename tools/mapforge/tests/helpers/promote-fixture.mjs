// tools/mapforge/tests/helpers/promote-fixture.mjs — the shared scratch tree
// for promote.test.mjs and repro.test.mjs.
//
// Three costs this exists to avoid paying, all of them measured:
//
//   1. A full generation is ~6.5 s alone. Between them these two files need
//      eight, inside a `node --test` pool that runs files in parallel AND that
//      render-sheet.test.mjs spawns a second copy of. `cachedRun()` builds ONE
//      per input-tree state, on disk under build/mapforge/, and every process
//      after the first reuses it.
//   2. A generation under that contention is not 6.5 s, it is 19-28 s — and
//      `budgets.json`'s `generate` row fails at 8,000 ms, so the CLI exits 1
//      and `execFileSync` THROWS. That is not a defect and it is not this
//      fixture's to assert on: generate-world.test.mjs already owns the timing
//      claim and deliberately accepts the budget exit, reports the number and
//      bounds it at failMs x 4. `generateInto` does the same, so a slow box
//      cannot red the promotion suite with a wall clock.
//   3. `cpSync(scripts/)` copies 25 MB of node_modules. The scratch repo needs
//      those modules (check_content.mjs imports ajv and js-yaml) but never
//      writes to them, so it gets a SYMLINK. `scriptsAreLinked` is the
//      assertion that keeps that visible rather than assumed.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, existsSync,
         realpathSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const GEN = join(ROOT, "tools/mapforge/generate-world.mjs");
export const SEED = "7c9e4a2f8b1d6e03";
const BUILD = join(ROOT, "build/mapforge");

const temps = [];
// realpathSync is REQUIRED, not tidiness. On macOS `mkdtempSync` answers
// /var/folders/… while the real path is /private/var/folders/…, and every CLI
// in this repo guards main() with
// `import.meta.url === pathToFileURL(process.argv[1]).href`. import.meta.url
// is resolved; argv[1] is not. Spawn a tool by its /var path and main() never
// runs: the process prints NOTHING and exits 0. That is a silently skipped
// derive-writer and a silently skipped gate — which is exactly the failure
// mode promote-world's "the tool produced no summary line" errors exist to
// catch, and they did catch it here.
const tmp = (prefix) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temps.push(d);
  return d;
};

export function cleanup() {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
}

/**
 * Run the generator into `out`.
 *
 * Accepts exit 1 when the ONLY thing wrong is the loop budget — that is a wall
 * clock on a contended box, and the suite already owns that claim elsewhere.
 * Any other non-zero exit throws with the tool's own output.
 */
export function generateInto(out, cwd = ROOT) {
  const r = spawnSync(process.execPath, [GEN, "--seed", SEED, "--out", out, "--no-png"],
    { encoding: "utf8", cwd, maxBuffer: 64 * 1024 * 1024 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.error) throw new Error(`generate-world could not run: ${r.error.message}`);
  if (r.status === 0) return text;
  const budgetOnly = /generate-world: LOOP BUDGET/.test(text) && !/PROBLEM: |refusing|unknown arg/.test(text);
  if (r.status === 1 && budgetOnly) return text;
  throw new Error(`generate-world exited ${r.status}:\n${text.slice(-4000)}`);
}

/**
 * A sha256 over every byte the generator could possibly read.
 *
 * Deliberately a SUPERSET of the real input set — the whole of content/ and
 * the whole of tools/mapforge/ outside tests/ — because a cache key that is a
 * subset of the inputs is a stale cache waiting to happen, and this programme
 * has already paid for that class of bug five times in the determinism scan
 * alone. Over-invalidating costs one 6.5 s run; under-invalidating costs a
 * green suite over the wrong world. ~3.5 MB, ~25 ms.
 */
function inputDigest() {
  const h = createHash("sha256");
  const walk = (dir, rel, skip) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (skip && skip(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, `${rel}${e.name}/`, skip);
      else { h.update(`${rel}${e.name}\n`); h.update(readFileSync(p)); }
    }
  };
  walk(join(ROOT, "content"), "content/", null);
  walk(join(ROOT, "tools/mapforge"), "tools/mapforge/", (n) => n === "tests");
  return h.digest("hex").slice(0, 16);
}

let cached = null;
/**
 * One generated draft root per input-tree state, shared across processes.
 * Treat as READ ONLY — `copyRun()` is for tests that must corrupt one.
 */
export function cachedRun() {
  if (cached) return cached;
  const dir = join(BUILD, `.test-run-${SEED.slice(0, 8)}-${inputDigest()}`);
  if (!existsSync(join(dir, "manifest.json"))) {
    // Build beside the target on the SAME filesystem, then rename into place:
    // several test processes race for this and rename is the only step that
    // must be atomic. A loser finds the directory already there and uses it.
    mkdirSync(BUILD, { recursive: true });
    const staging = realpathSync(mkdtempSync(join(BUILD, ".staging-")));
    try {
      generateInto(staging);
      try { renameSync(staging, dir); }
      catch { rmSync(staging, { recursive: true, force: true }); }
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      throw e;
    }
  }
  cached = dir;
  return dir;
}

/** Kept as the name the tests read; the sharing is an implementation detail. */
export const sharedRun = cachedRun;

/** A private, mutable copy of the shared run. */
export function copyRun() {
  const d = tmp("mf-runcopy-");
  cpSync(sharedRun(), d, { recursive: true });
  return d;
}

/**
 * A scratch repo root: content/ + scripts/ + tools/ + the colyseus-server
 * shell, so the emitter's mirrors behave exactly as they do in the real tree.
 */
export function scratchRepo() {
  const dir = tmp("mf-repo-");
  cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
  cpSync(join(ROOT, "tools"), join(dir, "tools"), { recursive: true });
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), {
    recursive: true,
    filter: (src) => !src.endsWith("/node_modules"),
  });
  symlinkSync(join(ROOT, "scripts/node_modules"), join(dir, "scripts/node_modules"));
  mkdirSync(join(dir, "colyseus-server/src/config/generated"), { recursive: true });
  cpSync(join(ROOT, "colyseus-server/src/config/generated"),
    join(dir, "colyseus-server/src/config/generated"), { recursive: true });
  return dir;
}

export const scriptsAreLinked = (dir) => existsSync(join(dir, "scripts/node_modules/ajv"));
