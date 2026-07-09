// Bundles the Nakama TS runtime into a single flat script at build/index.js.
//
// Nakama's embedded JS runtime (goja) loads the file as a plain script and
// looks up a top-level `InitModule` function/identifier — it is NOT a module
// loader, so the bundle must NOT be wrapped (no IIFE, no `module.exports=`,
// no top-level `import`/`export`). Since src/main.ts declares InitModule as
// a bare function declaration and exports nothing, esbuild's ESM output
// format emits flat code with no wrapper as long as nothing is exported.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'build/index.js',
  format: 'esm',
  platform: 'neutral',
  target: 'es2019',
  legalComments: 'none',
  logLevel: 'info',
});
