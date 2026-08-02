#!/usr/bin/env node
/**
 * env.mjs — environment art runner (ComfyUI / FLUX.1-schnell + depth ControlNet).
 *
 * Ports the graph measured and recorded in
 * docs/worldbuilding/ABP-controlnet-rescue.md ("The working graph") verbatim:
 * an EMPTY latent at denoise 1.0 — there is no img2img anchor in this graph
 * at all, all structure comes from the depth control signal via
 * ControlNetApplyAdvanced (node 23). Node ids intentionally match the ABP's
 * numbering (1, 4, 5, 7, 8, 9, 10, 20-23) so the graph stays diffable against
 * the record.
 *
 *   CheckpointLoaderSimple(1) -> CLIPTextEncode(4/5), VAE(2) --------+
 *   ControlNetLoader(20) -> SetUnionControlNetType(21) --+           |
 *   LoadImage(22) [depth map] ---------------------------+           |
 *                                    ControlNetApplyAdvanced(23) <---+
 *   EmptySD3LatentImage(7) --+                 |
 *                             v                v
 *                          KSampler(8) -> VAEDecode(9) -> SaveImage(10)
 *
 * Every tunable (checkpoint/controlNet filenames, sampler denoise/steps/cfg,
 * controlNet strength/start/end percent, latent width/height) is read from
 * forge.config.json `profiles.environment` — nothing here restates a
 * measured value. Strength 0.30 is NOT a typo: see forge.config.json's
 * `profiles.environment._note` and the ABP doc — the conventional 0.8-1.0
 * collapses schnell into flat vector art.
 *
 * The ABP's own recorded workflow carried a BARE prompt — it was measuring
 * ControlNet strength, not style — and porting it verbatim reproduced the
 * exact failure the F-024 character campaign already diagnosed: a bare
 * prompt on A1-ART-02 "Millcross" (a pre-industrial crossing town) rendered
 * as a photorealistic MODERN settlement (pickup trucks, an SUV, a
 * contemporary skyline). `buildEnvPositive`/`buildEnvNegative` compose the
 * brief prose with the house style vocabulary (`prompts/style-laws.json`)
 * plus an anti-modern-contamination guard
 * (forge.config.json `profiles.environment.styleGuard`) — see their
 * doc-comments for what was included/excluded and why.
 *
 * The hires pass described in the ABP is a SECOND graph and is not built
 * here yet — this file covers the base pass only.
 *
 * NOT RUNNABLE IN CI. Needs a live GPU on mont-pc plus an SSH tunnel:
 *   ssh -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100
 *
 * Usage:
 *   node generate/env.mjs --brief A1-ART-02 --seed 12345
 *
 * Flags: --seed N  --timeout SECONDS (default 600)
 *        --host H  --direct  --dry-run (print the graph, queue nothing)
 *        --port N (override forge.config.json's comfy.port; CLI wins over
 *          config; does not mutate the config file)
 *        --positive "<string>" (replace the FULLY COMPOSED positive prompt
 *          entirely — bypasses buildEnvPositive, so style vocabulary is
 *          NOT auto-appended; CLI wins over the brief)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORGE_DIR,
  comfyBaseUrl,
  loadForge,
  parseArgs,
  parsePromptOverride,
  parseSeed,
  runGraph,
} from "./charsheet.mjs";
import { renderDepthPng } from "./blockin.mjs";

/** Node ids follow docs/worldbuilding/ABP-controlnet-rescue.md's numbering. */
export const ENV_NODE = Object.freeze({
  CKPT: "1",
  POS: "4",
  NEG: "5",
  LATENT: "7",
  KSAMPLER: "8",
  DECODE: "9",
  SAVE: "10",
  CN_LOAD: "20",
  CN_TYPE: "21",
  CN_IMAGE: "22",
  CN_APPLY: "23",
});

/** Read one brief JSON (tools/art-forge/briefs/<id>.json). */
function readBrief(id) {
  const file = path.join(FORGE_DIR, "briefs", `${id}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(
      `could not read brief "${id}" at ${file}: ${err.message}`,
    );
  }
}

/**
 * Shared style-laws.json negative words that do NOT apply to environments.
 * "no fur" guards a character-specific failure mode (creature/costume fur
 * rendering, see style-laws.json's `laws`) with no environment analogue.
 * The other three ("NOT 3D render", "NOT CGI", "NOT clay") are generic
 * render-style guards and apply unchanged.
 */
const ENV_NEGATIVE_EXCLUDE = new Set(["no fur"]);

/**
 * The negative word list for one environment render: the shared house-style
 * guard (prompts/style-laws.json `negative`, minus the character-only
 * exclusions above) plus `styleGuard.negative`
 * (forge.config.json `profiles.environment`) — anti-modern-contamination
 * words measured directly from this recipe's first real generation
 * (A1-ART-02 "Millcross" rendered as a photoreal MODERN settlement: pickup
 * trucks, an SUV, a contemporary skyline). Read from config, never
 * hardcoded here.
 */
export function environmentNegativeWords(forge) {
  const shared = forge.styleLaws.negative.filter((w) => !ENV_NEGATIVE_EXCLUDE.has(w));
  const guard = forge.profile.styleGuard?.negative ?? [];
  return [...shared, ...guard];
}

/**
 * Compose the environment positive prompt: the brief's own scene prose, the
 * house style vocabulary (`style-laws.json` `positive` + `styleClause`), and
 * the negative words repeated as literal counter-prompt phrasing.
 *
 * `profiles.environment.sampler.cfg` is 1 — same as the character profile —
 * so KSampler's negative conditioning branch is not evaluated (the CFG
 * formula collapses to the conditional prediction alone at cfg=1). That is
 * exactly why `buildPrompt()` (charsheet.mjs) also repeats its negatives
 * inside the positive string as literal counter-prompt words instead of
 * relying on the negative branch; this mirrors that same reasoning. A real
 * CLIPTextEncode negative node is still built (see `buildEnvNegative`) so
 * the graph stays correct if cfg is ever raised.
 */
export function buildEnvPositive(promptText, forge) {
  return [
    promptText,
    ...forge.styleLaws.positive,
    ...environmentNegativeWords(forge),
    ...forge.styleLaws.styleClause,
  ].join(", ");
}

export function buildEnvNegative(forge) {
  return environmentNegativeWords(forge).join(", ");
}

/**
 * Build the environment graph. `depthImage` is the filename LoadImage
 * resolves against the ComfyUI server's own input directory (which is a
 * remote Windows path on mont-pc — see uploadControlImage below); it is
 * never a local filesystem path.
 */
export function buildEnvGraph({ brief, seed, depthImage, forge }) {
  const { models, sampler, latent, controlNet } = forge.profile;
  return {
    [ENV_NODE.CKPT]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: models.checkpoint },
    },
    [ENV_NODE.POS]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ENV_NODE.CKPT, 1], text: brief.positive },
    },
    [ENV_NODE.NEG]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ENV_NODE.CKPT, 1], text: brief.negative ?? "" },
    },
    [ENV_NODE.CN_LOAD]: {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: models.controlNet },
    },
    [ENV_NODE.CN_TYPE]: {
      class_type: "SetUnionControlNetType",
      inputs: { control_net: [ENV_NODE.CN_LOAD, 0], type: controlNet.type },
    },
    [ENV_NODE.CN_IMAGE]: {
      class_type: "LoadImage",
      inputs: { image: depthImage },
    },
    [ENV_NODE.CN_APPLY]: {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: [ENV_NODE.POS, 0],
        negative: [ENV_NODE.NEG, 0],
        control_net: [ENV_NODE.CN_TYPE, 0],
        image: [ENV_NODE.CN_IMAGE, 0],
        strength: controlNet.strength,
        start_percent: controlNet.startPercent,
        end_percent: controlNet.endPercent,
        vae: [ENV_NODE.CKPT, 2],
      },
    },
    [ENV_NODE.LATENT]: {
      class_type: "EmptySD3LatentImage",
      inputs: { width: latent.width, height: latent.height, batch_size: 1 },
    },
    [ENV_NODE.KSAMPLER]: {
      class_type: "KSampler",
      inputs: {
        model: [ENV_NODE.CKPT, 0],
        positive: [ENV_NODE.CN_APPLY, 0],
        negative: [ENV_NODE.CN_APPLY, 1],
        latent_image: [ENV_NODE.LATENT, 0],
        seed,
        steps: sampler.steps,
        cfg: sampler.cfg,
        sampler_name: sampler.samplerName,
        scheduler: sampler.scheduler,
        denoise: sampler.denoise,
      },
    },
    [ENV_NODE.DECODE]: {
      class_type: "VAEDecode",
      inputs: { samples: [ENV_NODE.KSAMPLER, 0], vae: [ENV_NODE.CKPT, 2] },
    },
    [ENV_NODE.SAVE]: {
      class_type: "SaveImage",
      inputs: {
        images: [ENV_NODE.DECODE, 0],
        filename_prefix: `art-forge/env/${brief.id ?? "subject"}`,
      },
    },
  };
}

/**
 * Upload a local depth PNG to the ComfyUI server's input directory via
 * `POST /upload/image` — the method docs/worldbuilding/ABP-controlnet-rescue.md
 * itself used ("the only writes were four POST /upload/image calls of
 * locally-derived control images — ordinary ControlNet usage"), not any
 * filesystem/SCP access to the remote Windows box (`F:\comfy-ui\input`).
 * Returns the `image` string LoadImage expects: `<subfolder>/<filename>`.
 */
export async function uploadControlImage({
  base,
  localPath,
  subfolder = "art-forge",
}) {
  const buf = fs.readFileSync(localPath);
  const form = new FormData();
  form.append("image", new Blob([buf]), path.basename(localPath));
  form.append("type", "input");
  form.append("subfolder", subfolder);
  form.append("overwrite", "true");
  const res = await fetch(`${base}/upload/image`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(
      `POST ${base}/upload/image -> ${res.status} ${await res.text()}`,
    );
  }
  const json = await res.json();
  return json.subfolder ? `${json.subfolder}/${json.name}` : json.name;
}

/**
 * Generate one environment subject end to end: render the depth control PNG
 * from the brief's block-in masses (Task 5's blockin.mjs), upload it to the
 * ComfyUI box's input directory, queue the graph, download the result.
 */
export async function generateEnv(
  args,
  forge = loadForge({ profile: "environment" }),
) {
  const briefId = args.brief;
  if (!briefId || briefId === true) {
    throw new Error("usage: --brief <A1-ART-NN> [--seed N]");
  }
  const rawBrief = readBrief(briefId);
  const seed = parseSeed(args.seed);
  const positiveOverride = parsePromptOverride("positive", args.positive);
  const { width, height } = forge.profile.latent;

  const depthLocalPath = path.join(forge.outDir, "depth", `${briefId}.png`);
  await renderDepthPng({ brief: rawBrief, width, height, outPath: depthLocalPath });

  const base = comfyBaseUrl(forge, args);
  // dry-run must not touch the network — the depth PNG still renders locally
  // above so a --dry-run graph carries a realistic LoadImage name.
  const depthImage = args["dry-run"]
    ? `art-forge/${briefId}.png`
    : await uploadControlImage({ base, localPath: depthLocalPath, subfolder: "art-forge" });

  // --positive replaces the composed prompt entirely (CLI wins over
  // composed), matching charsheet.mjs/i2i.mjs's --positive convention. When
  // not given, the positive is the brief prose PLUS the house style
  // vocabulary — a bare brief prompt is exactly what produced the modern-
  // contamination failure this composition exists to prevent.
  const brief = {
    positive: positiveOverride ?? buildEnvPositive(rawBrief.prompt, forge),
    negative: buildEnvNegative(forge),
    id: rawBrief.id,
  };
  const graph = buildEnvGraph({ brief, seed, depthImage, forge });

  return runGraph({
    forge,
    args,
    graph,
    name: `env/${briefId}`,
    label: `env ${briefId} seed=${seed} depth=${depthImage}`,
  });
}

async function main() {
  const args = parseArgs();
  await generateEnv(args);
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
