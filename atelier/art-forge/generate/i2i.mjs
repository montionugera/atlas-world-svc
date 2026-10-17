#!/usr/bin/env node
/**
 * i2i.mjs — the winning v3 recipe: img2img over a flat-grey job silhouette.
 *
 * Proportion and pose come from `input/sil-<job>.png` on the ComfyUI box;
 * race and costume come from the prompt. Denoise comes from
 * forge.config.json (`sampler.denoise`) by default, CLI-overridable via
 * `--denoise` — never a bare literal in this file.
 *
 * Everything except the latent source is shared with charsheet.mjs.
 *
 * NOT RUNNABLE IN CI. Needs a live GPU on mont-pc plus an SSH tunnel.
 *
 * Usage:
 *   node generate/i2i.mjs --race ogre --job mage --seed 12345
 *
 * Flags: --seed N  --timeout SECONDS (default 600)
 *        --host H  --direct  --dry-run (print the graph, queue nothing)
 *        --steps N  --cfg N  --sampler NAME  --scheduler NAME  --shift N
 *          (override forge.config.json's `sampler.*`; CLI wins over config)
 *        --port N (override forge.config.json's `comfy.port`; CLI wins over
 *          config; does not mutate the config file)
 *        --positive "<string>"  --negative "<string>" (replace the composed
 *          buildPrompt()/negativePrompt() strings entirely; CLI wins over
 *          composed; does not change buildPrompt()/negativePrompt() themselves)
 *        --denoise N (0 < N <= 1; overrides forge.config.json's
 *          sampler.denoise; CLI wins over config; does not mutate the config
 *          file)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NODE,
  buildBaseGraph,
  buildPrompt,
  buildCreaturePrompt,
  loadForge,
  negativePrompt,
  parseArgs,
  parseDenoiseOverride,
  parsePromptOverride,
  parseSeed,
  promptForbiddenTokens,
  requireCell,
  resolveSampler,
  runGraph,
} from "./charsheet.mjs";
import { assertPositivePromptClean } from "./prompt-lint.mjs";

/**
 * ComfyUI resolves LoadImage names relative to its own input dir, so we pass
 * the bare `<prefix><job>.png` — the silhouettes already live at
 * `forge.config.json -> silhouettes.dir` on the remote and are never uploaded.
 */
export function silhouetteName(job, forge) {
  return `${forge.profile.silhouettes.prefix}${job}.png`;
}

/** Build the img2img graph for one cell. */
export function buildI2iGraph({
  race,
  job,
  seed,
  forge,
  sampler,
  positiveOverride,
  negativeOverride,
  denoise,
}) {
  const { mode } = forge.profile.sampler;
  if (mode !== "img2img") {
    console.warn(
      `[art-forge] warning: forge.config.json profiles.character.sampler.mode is "${mode}", not "img2img"`,
    );
  }
  return buildBaseGraph({
    // A --positive override bypasses buildPrompt()'s own lint, so lint it
    // here — see generate/prompt-lint.mjs.
    positive: positiveOverride
      ? assertPositivePromptClean(positiveOverride, {
          forbiddenTokens: promptForbiddenTokens(forge),
        })
      : buildPrompt({ race, job }, forge),
    negative: negativeOverride ?? negativePrompt(forge),
    seed,
    denoise,
    filenamePrefix: `art-forge/${race}-${job}`,
    latentNodes: {
      [NODE.LOAD_IMAGE]: {
        class_type: "LoadImage",
        inputs: { image: silhouetteName(job, forge) },
      },
      [NODE.ENCODE]: {
        class_type: "VAEEncode",
        inputs: { pixels: [NODE.LOAD_IMAGE, 0], vae: [NODE.VAE, 0] },
      },
    },
    latentSource: [NODE.ENCODE, 0],
    models: forge.profile.models,
    ...sampler,
  });
}

/**
 * Generate one race x job cell. This is the single code path batch-matrix.mjs
 * loops over — there is no second implementation of the recipe.
 */
export async function generateCell(
  args,
  forge = loadForge({ profile: "character" }),
) {
  const { race, job } = requireCell(args, forge);
  const seed = parseSeed(args.seed);
  const sampler = resolveSampler(args, forge);
  const positiveOverride = parsePromptOverride("positive", args.positive);
  const negativeOverride = parsePromptOverride("negative", args.negative);
  const denoise = parseDenoiseOverride(
    args.denoise,
    forge.profile.sampler.denoise,
  );
  const graph = buildI2iGraph({
    race,
    job,
    seed,
    forge,
    sampler,
    positiveOverride,
    negativeOverride,
    denoise,
  });
  return runGraph({
    forge,
    args,
    graph,
    name: `${race}-${job}`,
    label:
      `img2img ${race}/${job} seed=${seed} ` +
      `denoise=${denoise} sil=${silhouetteName(job, forge)}`,
  });
}

/**
 * F-031 — generate one CREATURE from the bestiary, reusing the exact same
 * img2img recipe as a race x job cell. Only two things differ: the prompt
 * comes from prompts/creature-identity.json instead of race+job, and the
 * silhouette is named explicitly by that entry rather than derived from a job.
 * Everything else — models, sampler, denoise, graph shape — is shared, so
 * there is no second implementation of the recipe to drift.
 */
export async function generateCreature(
  args,
  forge = loadForge({ profile: "character" }),
) {
  const designId = args.creature;
  const entry = forge.creatures?.[designId];
  if (!entry) {
    throw new Error(
      `unknown creature "${designId}" — add it to prompts/creature-identity.json first`,
    );
  }
  const seed = parseSeed(args.seed);
  const sampler = resolveSampler(args, forge);
  const denoise = parseDenoiseOverride(
    args.denoise,
    forge.profile.sampler.denoise,
  );
  const sil = `${forge.profile.silhouettes.prefix}${entry.silhouette.replace(/^sil-/, "")}.png`;
  const graph = buildBaseGraph({
    positive: (() => {
      const override = parsePromptOverride("positive", args.positive);
      return override
        ? assertPositivePromptClean(override, {
            forbiddenTokens: promptForbiddenTokens(forge),
          })
        : buildCreaturePrompt(designId, forge);
    })(),
    negative:
      parsePromptOverride("negative", args.negative) ?? negativePrompt(forge),
    seed,
    denoise,
    filenamePrefix: `art-forge/${designId}`,
    latentNodes: {
      [NODE.LOAD_IMAGE]: {
        class_type: "LoadImage",
        inputs: { image: sil },
      },
      [NODE.ENCODE]: {
        class_type: "VAEEncode",
        inputs: { pixels: [NODE.LOAD_IMAGE, 0], vae: [NODE.VAE, 0] },
      },
    },
    latentSource: [NODE.ENCODE, 0],
    models: forge.profile.models,
    ...sampler,
  });
  return runGraph({
    forge,
    args,
    graph,
    name: designId,
    label: `img2img creature ${designId} seed=${seed} denoise=${denoise} sil=${sil}`,
  });
}

async function main() {
  const args = parseArgs();
  if (args.creature) {
    await generateCreature(args);
    return;
  }
  await generateCell(args);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((err) => {
    console.error(`[art-forge] FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
