// tools/mapforge/lib/version.mjs — ONE home for the generator version.
//
// Two readers in two plans: Plan A's computeLock() stamps it into
// content/world/render-lock.json's `generator.version`, and Plan C's
// generate-world.mjs builds `runId = ${seed.slice(0,8)}-${GENERATOR_VERSION}`.
// A constant with two readers in two plans must have exactly one home, or the
// lock and the run id disagree about which generator produced a world.
//
// This module imports NOTHING, deliberately: scripts/lib/render-lock.mjs
// re-exports it, which is the only scripts/ -> tools/mapforge/ edge in the
// repo, and an import-free leaf cannot close that into a cycle.
//
// BUMP IT whenever a change alters emitted bytes for unchanged inputs.
export const GENERATOR_VERSION = "3.0.0";
