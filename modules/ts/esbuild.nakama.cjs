// Build TS runtime into a single Nakama-compatible JS file
const esbuild = require('esbuild');

async function build() {
  await esbuild.build({
    entryPoints: ['src/runtime.ts'],
    outfile: 'build/index.js',
    bundle: false,      // keep as a single top-level file
    platform: 'browser',
    format: 'esm',      // no wrapper; top-level code only
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });
}

build().catch((err) => { console.error(err); process.exit(1); });


