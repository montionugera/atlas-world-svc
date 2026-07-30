// Verifies build/index.js actually satisfies Nakama's load contract.
//
// Why this exists separately from `pnpm build`: esbuild exiting 0 does NOT mean
// the bundle loads. Nakama's embedded runtime (goja) evaluates the file as a
// plain script — not a module — and then looks up a top-level `InitModule`.
// If someone adds a top-level `import`/`export` to src/ (e.g. `import * as fs
// from "fs"`), esbuild with platform:'node' externalizes the builtin, emits a
// top-level `import` statement, and exits 0. tsc --noEmit also exits 0. The
// bundle is then an ES module, goja fails to load it, and InitModule is never
// found — auth, matchmaking and the loadout RPCs are down for the whole
// deployment, with two green checks upstream.
//
// Verified 2026-07-31: with that exact probe applied, `pnpm build` exits 0 and
// this check exits 3 (SyntaxError: Cannot use import statement outside a module).
//
// The context is deliberately bare ({} — no require, no process, no console) so
// a module-init path that reaches for a Node global fails here rather than in
// goja. esbuild.config.mjs asserts the same property in prose; this enforces it.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const bundlePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'build',
  'index.js'
);

function fail(message, detail) {
  console.error(`✗ nakama bundle check FAILED: ${message}`);
  if (detail) console.error(`  ${detail}`);
  console.error(
    '  The bundle must stay a flat, unwrapped script exposing a top-level ' +
      'InitModule.\n  See nakama/esbuild.config.mjs for the goja constraints.'
  );
  process.exit(3);
}

let source;
try {
  source = readFileSync(bundlePath, 'utf8');
} catch {
  fail(
    `no bundle at ${bundlePath}`,
    'Run `pnpm --filter @atlas/nakama-runtime run build` first.'
  );
}

// goja loads a plain script, so evaluate it as one. A top-level import/export
// makes this throw SyntaxError — which is precisely the failure goja hits.
const context = vm.createContext({});
try {
  new vm.Script(source, { filename: 'nakama/build/index.js' }).runInContext(
    context,
    { timeout: 10_000 }
  );
} catch (error) {
  fail(
    'bundle does not evaluate as a plain script',
    `${error.constructor.name}: ${error.message.split('\n')[0]}`
  );
}

const initModuleType = vm.runInContext('typeof InitModule', context);
if (initModuleType !== 'function') {
  fail(
    `InitModule is not defined at top level (typeof === "${initModuleType}")`,
    'Nakama resolves InitModule from the global scope after loading the script.'
  );
}

console.log('✓ nakama bundle loads as a plain script and defines InitModule');
