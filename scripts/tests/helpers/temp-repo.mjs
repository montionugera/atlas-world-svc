// A throwaway repo root for tests that must prove a gate FIRES.
//
// Proving "the gate catches a stale committed sheet" requires a stale
// committed sheet. Doing that by truncating the real, TRACKED
// game-client/assets/art/maps/cluster1-world.svg and restoring it in a
// `finally` was safe while exactly one test file did it. Task 10 added a
// second, and `node --test` runs test FILES in parallel — scripts/package.json
// runs `node --test tests/*.test.mjs` with no --test-concurrency, so the pool
// is os.availableParallelism() (14 on this machine). Two concurrent
// read-modify-restore cycles on one file is a lost-update race, and the update
// that gets lost is a DRAWN ARTIFACT this plan may not change.
//
// Measured before this helper existed: with check_map_render.test.mjs looping
// in the background, 1 of 4 `node --test scripts/tests/render-lock.test.mjs`
// runs reported `pass 9 / fail 1` — the CLI saw a half-truncated sheet that
// another test file was mid-restore on.
//
// The fix is a private sandbox per test: copy content/ and the committed
// sheets into a temp dir and point the gate at THAT root. Nothing tracked is
// ever written, so the tests are order- and concurrency-independent by
// construction rather than by discipline.
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Hand-rolled rather than fs.cpSync: cpSync is still flagged experimental on
// the Node 18 that .github/workflows/ci.yml pins, and this is six lines.
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name);
    const d = join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) copyFileSync(s, d);
  }
}

// content/ is ~752 KB, so a full copy per test is cheaper than any scheme for
// sharing one — and a shared sandbox would reintroduce exactly the coupling
// this helper exists to remove.
export function makeTempRepo({ sheets = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "atlas-repo-"));
  copyTree(join(REPO_ROOT, "content"), join(root, "content"));
  for (const sheet of Object.values(sheets)) {
    const dst = join(root, sheet.outSvg);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(REPO_ROOT, sheet.outSvg), dst);
  }
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
