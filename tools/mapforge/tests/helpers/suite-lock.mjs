// tools/mapforge/tests/helpers/suite-lock.mjs
//
// ONE cross-process lock, for exactly one purpose: G-RASTER-BUDGET is a
// WALL-CLOCK claim about what librsvg can do with a committed sheet, and
// raster.test.mjs's tracked-tree guard deliberately spawns a SECOND full
// mapforge suite. `node --test` runs files in parallel, so the budget was
// being measured against a machine this same suite was loading on purpose.
//
// That was filed as a 1-in-8 flake when the roster held four sheets
// (STATE §28, "the raster budget flakes on `synthetic` under concurrent
// load"). Plan E Task 8 took the roster to seventeen — 51 rasterisations
// instead of 12 — which made the overlap the common case rather than the rare
// one: measured, `synthetic` reads 0.708 s alone and 2.10-2.64 s while the
// child suite runs, against a 2 s cap.
//
// This does NOT weaken the assertion and does NOT touch the cap. The budget is
// still measured on the real committed bytes at the real ship width, best of
// three; it is simply not measured concurrently with a known heavy sibling
// this harness started itself. Everything else in both files still runs in
// parallel.
//
// Deliberately crude: an atomic `mkdir`, a bounded wait, and a release that
// cannot deadlock the suite — if the holder dies the stale directory is broken
// after the timeout and the run continues rather than hanging.
import { mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK = join(tmpdir(), "mapforge-heavy-suite.lock");
const STALE_MS = 600000;
const WAIT_MS = 300000;

/** Blocks until the lock is held, or until the wait budget runs out. */
export function acquireHeavyLock({ waitMs = WAIT_MS } = {}) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(LOCK);
      return true;
    } catch {
      // A lock older than STALE_MS belonged to a process that died.
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > STALE_MS) rmSync(LOCK, { recursive: true, force: true });
      } catch {
        /* it went away under us; loop and retry */
      }
      if (Date.now() > deadline) return false;
      // Busy-wait without a timer: node:test has no synchronous sleep and the
      // callers here are synchronous. 25 ms of spin per turn is cheap against
      // a multi-second raster.
      const until = Date.now() + 25;
      while (Date.now() < until);
    }
  }
}

export function releaseHeavyLock() {
  rmSync(LOCK, { recursive: true, force: true });
}
