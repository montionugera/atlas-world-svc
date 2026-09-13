import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { GENERATOR_VERSION } from "../../mapforge/lib/version.mjs";

const WORLD_PATHS = ["content/world", "content/spine", "content/maps", "game-client/assets/art/maps",
  "colyseus-server/src/config/generated", "atelier/asset-storybook/maps-index.json"];

export function assertRepoRoot({ repoRoot }) {
  if (!existsSync(join(repoRoot, "atelier/mapforge/generate-world.mjs")))
    throw new Error(`map-builder: ${repoRoot} is not the atlas-world-svc repo root (no atelier/mapforge/generate-world.mjs)`);
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadConfig({ dir, overrides = {} }) {
  const cfg = { ...readJson(join(dir, "config.json")), ...overrides };
  const cap = cfg.maxConcurrency ?? 2;
  if (cfg.concurrency > cap) { console.warn(`map-builder: concurrency ${cfg.concurrency} clamped to ${cap} (budgets.json failMs tolerates at most ${cap} parallel drafts)`); cfg.concurrency = cap; }
  return cfg;
}

export function loadSteps({ dir }) {
  const steps = readJson(join(dir, "steps.json"));
  const names = steps.groups.flatMap((g) => g.stages.map((s) => s.name));
  return { ...steps, stageCount: new Set(names).size };
}

export function createRepo({ repoRoot, git = (cmd, args) => execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }) }) {
  assertRepoRoot({ repoRoot });
  const budgets = readJson(join(repoRoot, "content/world/budgets.json"));
  const row = (stage) => budgets.loop.find((r) => r.stage === stage);
  const timeouts = {
    draft: 2 * (row("generate").failMs + row("sheets").failMs),
    publish: 2 * budgets.loop.reduce((s, r) => s + r.failMs, 0),
  };
  return {
    repoRoot, budgets, timeouts,
    // generatorVersion is a constant, not read from JSON: manifest.json's "version" is a schema
    // number, and fabric/world.json nests it at generator.version.
    generatorVersion: GENERATOR_VERSION,
    branch() {
      const name = git("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      return name === "HEAD" ? { name: null, detached: true } : { name, detached: false };
    },
    dirtyWorldFiles() {
      return git("git", ["status", "--porcelain", "--", ...WORLD_PATHS]).split("\n").filter(Boolean).map((l) => l.slice(3).trim());
    },
    currentSeed() { return readJson(join(repoRoot, "content/world/fabric/world.json")).seed; },
    ratioBand() { const r = readJson(join(repoRoot, "content/world/manifest.json")).ratio; return { min: r.min, max: r.max, target: r.target }; },
    promotionGates() { return Object.keys(budgets.promotion.gateRulesThatMustBeGreen); },
    contentGateDeps() { return existsSync(join(repoRoot, "scripts/node_modules/js-yaml")); },
  };
}
