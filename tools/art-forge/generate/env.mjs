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
 * The hires pass described in the ABP (`profiles.environment.hires`) is a
 * SECOND graph — `buildEnvHiresGraph` below — run as its own ComfyUI job
 * against the just-downloaded base PNG, OPT IN via `--hires`. It is not
 * queued automatically: the 16 base-pass cells already measured in
 * docs/worldbuilding/ABP-controlnet-replication.md must stay reproducible
 * from committed code exactly as they were generated, so nobody's `--hires`
 * experiment silently changes what that replication measured.
 *
 * The hires graph is deliberately a SEPARATE graph submission rather than
 * extra nodes appended to the base graph (which is how the ABP's own
 * "one graph, two SaveImage nodes" recipe worked) — see `buildEnvHiresGraph`'s
 * doc-comment for why, and what that costs vs. what it buys.
 *
 * NOT RUNNABLE IN CI. Needs a live GPU on mont-pc plus an SSH tunnel:
 *   ssh -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100
 *
 * Usage:
 *   node generate/env.mjs --brief A1-ART-02 --seed 12345
 *   node generate/env.mjs --brief A1-ART-02 --seed 12345 --hires
 *
 * Flags: --seed N  --timeout SECONDS (default 600)
 *        --host H  --direct  --dry-run (print the graph, queue nothing)
 *        --port N (override forge.config.json's comfy.port; CLI wins over
 *          config; does not mutate the config file)
 *        --positive "<string>" (replace the FULLY COMPOSED positive prompt
 *          entirely — bypasses buildEnvPositive, so style vocabulary is
 *          NOT auto-appended; CLI wins over the brief)
 *        --control depth|segment|none — which control signal steers the
 *          graph. Default stays `depth` until a segment strength is measured,
 *          and `--control depth` reproduces F-026's exact behaviour from
 *          committed code forever. `segment` feeds the zone-label map
 *          (measured NEGATIVE for Millcross — see
 *          docs/worldbuilding/ABP-segment-control.md). `none` is freehand
 *          txt2img: no control image, no ControlNet nodes 20-23, no strength
 *          — the prose (plus house style vocabulary) is the only steering.
 *        --strength N (override forge.config.json's profiles.environment
 *          .controlNet.strength; CLI wins over config. Neither half of the
 *          published 0.30/0.40 replication matrix was reproducible from
 *          committed code before this flag existed — see
 *          docs/worldbuilding/ABP-controlnet-replication.md)
 *        --hires (opt-in; queues a SECOND job after the base pass completes,
 *          the `profiles.environment.hires` upscale+refine pass measured in
 *          docs/worldbuilding/ABP-flux-eval.md/-anchor-model-choice.md/
 *          -controlnet-rescue.md. Off by default — see above.)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORGE_DIR,
  comfyBaseUrl,
  loadForge,
  parseArgs,
  parseNumericOverride,
  parsePromptOverride,
  parseSeed,
  promptForbiddenTokens,
  runGraph,
} from "./charsheet.mjs";
import { renderDepthPng, renderSegmentPng } from "./blockin.mjs";
import { assertPositivePromptClean } from "./prompt-lint.mjs";

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

/**
 * Node ids for the standalone hires graph (`buildEnvHiresGraph`). `1`, `4`,
 * `5`, `11`-`17` intentionally match the numbering in
 * docs/worldbuilding/ABP-flux-eval.md's "The working graph" (the origin of
 * this hires recipe, reconfirmed unchanged by ABP-anchor-model-choice.md and
 * ABP-controlnet-rescue.md) so the graph stays diffable against the record.
 * `18` (LoadImage of the re-uploaded base PNG) has no ABP counterpart — the
 * ABP's own graph fed `ImageUpscaleWithModel` straight from its base
 * `VAEDecode` node inside the SAME graph; this graph is standalone (see
 * `buildEnvHiresGraph`'s doc-comment for why), so it needs its own image
 * input.
 */
export const HIRES_NODE = Object.freeze({
  CKPT: "1",
  POS: "4",
  NEG: "5",
  UPSCALE_LOAD: "11",
  UPSCALE_MODEL: "12",
  SCALE: "13",
  ENCODE: "14",
  KSAMPLER: "15",
  SAVE: "16",
  DECODE: "17",
  LOAD_BASE: "18",
});

/**
 * Validate a parsed brief object before it reaches the graph. Same
 * fail-loudly precedent as `parsePromptOverride` (charsheet.mjs) — a brief
 * missing/empty `prompt` or `masses` must throw before anything is queued,
 * not sail through and burn a generation on bad input:
 *
 *  - an empty/missing `prompt` makes `buildEnvPositive(undefined, forge)`
 *    join the literal string "undefined" into the positive prompt.
 *  - an empty/missing `masses` makes `depthPlanesFromBrief` (blockin.mjs)
 *    produce only the black canvas rect — an all-black control image, with
 *    no depth signal at all — and `env.mjs` would upload it and generate
 *    anyway, silently.
 *
 * Exported (rather than folded into `readBrief`) so it can be unit tested
 * without touching the filesystem.
 */
export function validateBrief(brief, id, file) {
  if (
    typeof brief.prompt !== "string" ||
    brief.prompt.trim() === ""
  ) {
    throw new Error(
      `brief "${id}" at ${file} has an empty or missing "prompt"`,
    );
  }
  if (!Array.isArray(brief.masses) || brief.masses.length === 0) {
    throw new Error(
      `brief "${id}" at ${file} has an empty or missing "masses" — the ` +
        "depth control image would render as a blank black canvas with no depth signal",
    );
  }
  return brief;
}

/** Read one brief JSON (tools/art-forge/briefs/<id>.json). */
function readBrief(id) {
  const file = path.join(FORGE_DIR, "briefs", `${id}.json`);
  let brief;
  try {
    brief = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(
      `could not read brief "${id}" at ${file}: ${err.message}`,
    );
  }
  return validateBrief(brief, id, file);
}

/**
 * Shared style-laws.json negative words that do NOT apply to environments.
 * "fur" guards a character-specific failure mode (creature/costume fur
 * rendering, see style-laws.json's `laws`) with no environment analogue.
 * The other three ("3D render", "CGI", "clay") are generic render-style
 * guards and apply unchanged.
 */
const ENV_NEGATIVE_EXCLUDE = new Set(["fur"]);

/**
 * The negative CONDITIONING words for one environment render — the string
 * that goes into the real CLIPTextEncode negative node (`buildEnvNegative`),
 * and nowhere else. `profiles.environment.sampler.cfg` is 1, so KSampler
 * never evaluates that branch; the node is built anyway so the graph stays
 * correct if cfg is ever raised.
 *
 * This is the ONLY place negation-flavoured vocabulary is allowed. It must
 * never be spliced into the positive prompt — that is the F-039 defect, see
 * generate/prompt-lint.mjs.
 */
export function environmentNegativeWords(forge) {
  const shared = forge.styleLaws.negative.filter((w) => !ENV_NEGATIVE_EXCLUDE.has(w));
  return [...shared, ...(forge.profile.styleGuard?.forbiddenTokens ?? [])];
}

/**
 * Scale guard vocabulary, from `profiles.<profile>.styleGuard`:
 * `scaleTokens` (extent words) + `boundMarkers` (phrases that bound an
 * extent within a sentence). See generate/prompt-lint.mjs R3.
 */
export function promptScaleGuard(forge) {
  const guard = forge.profile.styleGuard ?? {};
  return {
    scaleTokens: guard.scaleTokens ?? [],
    boundMarkers: guard.boundMarkers ?? [],
  };
}

/**
 * Compose the environment positive prompt, entirely out of assertions of
 * what IS present: the brief's own scene prose, the house style vocabulary
 * (`style-laws.json` `positive` + `renderAssertion`), the shared era block
 * (`styleGuard.era`), then `styleClause` last.
 *
 * `styleGuard.era` sits in exactly the slot the old `styleGuard.negative`
 * list occupied. That list ("no cars", "no power lines", "no modern city
 * skyline", ...) was the contamination source, not the cure: a text encoder
 * attends to tokens, so each phrase delivered its own subject. Millcross
 * 2026-08-08 showed pylons and painted road markings in every cell across
 * ControlNet strengths 0.00/0.30/0.45/0.60 — including with the control
 * signal fully OFF — while a positive-only rewrite came back clean. See
 * forge.config.json `styleGuard._note` for the full evidence chain.
 *
 * The result is linted before it is returned, so a negation reaching the
 * positive prompt (from config, from a brief, from anywhere) throws here
 * rather than ~218 s of GPU later.
 */
export function buildEnvPositive(promptText, forge, { requiredAssertions = [] } = {}) {
  const era = forge.profile.styleGuard?.era;
  return assertPositivePromptClean(
    [
      promptText,
      ...forge.styleLaws.positive,
      ...forge.styleLaws.renderAssertion,
      ...(era ? [era] : []),
      ...forge.styleLaws.styleClause,
    ].join(", "),
    {
      forbiddenTokens: promptForbiddenTokens(forge),
      ...promptScaleGuard(forge),
      requiredAssertions,
    },
  );
}

export function buildEnvNegative(forge) {
  return environmentNegativeWords(forge).join(", ");
}

/**
 * Format a ControlNet strength value for use in an output filename —
 * `0.3` -> `"0.30"` — matching the `<subject>-seed<seed>-s<strength>.png`
 * naming docs/worldbuilding/ABP-controlnet-replication.md's driver used.
 */
export function formatStrength(strength) {
  return Number(strength).toFixed(2);
}

/* --------------------------- control selection --------------------------- */

/** control key -> the forge.config.json profile key holding its block. */
export const CONTROL_BLOCK = Object.freeze({ depth: "controlNet", segment: "segment" });

/** control key -> the blockin.mjs renderer that produces its control PNG. */
export const CONTROL_RENDERER = Object.freeze({ depth: renderDepthPng, segment: renderSegmentPng });

/**
 * Pick the active control. Precedence: --control > profile.control > "depth".
 * Throws by name on an unknown key, and on a block whose `type` does not equal
 * its key (a typo there silently sends the wrong SetUnionControlNetType).
 * @returns {{ control: string, block: object, render: Function }}
 */
export function resolveControl({ forge, control }) {
  if (control === true) {
    throw new Error("--control requires a value, got a bare flag");
  }
  if (control === "none") {
    // Freehand: no control image, no config block, no renderer — and no
    // strength (see resolveStrength). The F-039 segment-control negative
    // result's follow-up: composition comes from the prose, not a zone map.
    return { control, block: null, render: null };
  }
  const key = control ?? forge.profile.control ?? "depth";
  const blockKey = CONTROL_BLOCK[key];
  if (!blockKey) {
    throw new Error(
      `unknown --control "${key}" — expected one of ` +
        `${[...Object.keys(CONTROL_BLOCK), "none"].join(", ")}`,
    );
  }
  const block = forge.profile[blockKey];
  if (!block) {
    throw new Error(
      `control "${key}" has no "${blockKey}" block in forge.config.json profiles.environment`,
    );
  }
  if (block.type !== key) {
    throw new Error(
      `control "${key}"'s block has type "${block.type}" in forge.config.json — expected ` +
        `"${key}" (a typo there would silently send the wrong SetUnionControlNetType)`,
    );
  }
  return { control: key, block, render: CONTROL_RENDERER[key] };
}

/**
 * Resolve the strength for one control. `--strength` wins over the block's
 * value. Throws if the block's strength is null AND no override was given —
 * an unmeasured strength must fail loudly, not silently default.
 */
export function resolveStrength({ control, block, override }) {
  if (control === "none") {
    // Freehand has no strength dial — there is nothing to measure or sweep.
    return null;
  }
  const strength = parseNumericOverride("strength", override, block.strength);
  if (strength === null || strength === undefined) {
    throw new Error(
      `control "${control}" has an unmeasured strength (null in forge.config.json) — pass ` +
        "--strength to override; an unmeasured strength must fail loudly, not silently reach the graph",
    );
  }
  return strength;
}

/**
 * Output id for one cell. Depth keeps F-026's exact naming
 * (`<id>-seed<n>-s<x>`) so the replication record's filenames still resolve;
 * any other control inserts its key (`<id>-<control>-seed<n>-s<x>`); none
 * (freehand) carries no strength suffix — there is no strength to sweep
 * (`<id>-none-seed<n>`).
 */
export function controlOutputId({ briefId, control, seed, strength }) {
  if (control === "none") return `${briefId}-none-seed${seed}`;
  const suffix = `-seed${seed}-s${formatStrength(strength)}`;
  return control === "depth" ? `${briefId}${suffix}` : `${briefId}-${control}${suffix}`;
}

/**
 * Build the environment graph. `depthImage` is the filename LoadImage
 * resolves against the ComfyUI server's own input directory (which is a
 * remote Windows path on mont-pc — see uploadControlImage below); it is
 * never a local filesystem path. Despite the name (kept for F-026 diffability
 * and because every existing call/test site already names it this way), it
 * carries the control image for WHICHEVER control is active — `resolveControl`
 * picks the renderer, this just forwards its uploaded/staged filename.
 *
 * `strength` defaults to the config value but can be overridden (see
 * `generateEnv`'s `--strength` flag) — it also drives the output filename
 * below, since running the documented seed x strength sweep with a filename
 * that carries neither would leave only one surviving PNG per subject, each
 * later run silently overwriting the last.
 *
 * `controlNet` defaults to `forge.profile.controlNet` (the frozen depth
 * block) so every existing call site that omits it keeps today's behaviour;
 * `generateEnv` passes the block `resolveControl` picked instead, so the
 * union type and percents come from whichever control is actually active.
 */
export function buildEnvGraph({
  brief,
  seed,
  depthImage,
  forge,
  strength = forge.profile.controlNet.strength,
  controlNet = forge.profile.controlNet,
}) {
  const { models, sampler, latent } = forge.profile;
  // Freehand (generateEnv passes controlNet: null for --control none): the
  // ControlNet nodes 20-23 are dropped entirely and the sampler conditions
  // straight from the text encodes. The output id carries no strength —
  // there is none to sweep. With a control, construction order is unchanged
  // so the frozen depth path stays byte-identical to F-026.
  const hasControl = controlNet != null;
  const outputId =
    `${brief.id ?? "subject"}-seed${seed}${hasControl ? `-s${formatStrength(strength)}` : ""}`;
  const positiveFrom = hasControl ? [ENV_NODE.CN_APPLY, 0] : [ENV_NODE.POS, 0];
  const negativeFrom = hasControl ? [ENV_NODE.CN_APPLY, 1] : [ENV_NODE.NEG, 0];
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
    ...(hasControl
      ? {
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
              strength,
              start_percent: controlNet.startPercent,
              end_percent: controlNet.endPercent,
              vae: [ENV_NODE.CKPT, 2],
            },
          },
        }
      : {}),
    [ENV_NODE.LATENT]: {
      class_type: "EmptySD3LatentImage",
      inputs: { width: latent.width, height: latent.height, batch_size: 1 },
    },
    [ENV_NODE.KSAMPLER]: {
      class_type: "KSampler",
      inputs: {
        model: [ENV_NODE.CKPT, 0],
        positive: positiveFrom,
        negative: negativeFrom,
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
        filename_prefix: `art-forge/env/${outputId}`,
      },
    },
  };
}

/**
 * Build the hires (upscale + refine) graph — `profiles.environment.hires`
 * in forge.config.json. Ported from docs/worldbuilding/ABP-flux-eval.md's
 * "The working graph" (nodes 11-17: `UpscaleModelLoader` ->
 * `ImageUpscaleWithModel` -> `ImageScale` -> `VAEEncode` -> `KSampler` ->
 * `VAEDecode` -> `SaveImage`), reconfirmed unchanged in
 * ABP-anchor-model-choice.md and ABP-controlnet-rescue.md ("Hires pass 10
 * steps @ 0.40, unchanged from both prior ABPs"). Every tunable (upscaler
 * filename, steps, denoise, target width/height) comes from
 * `forge.profile.hires` — nothing here restates a measured value.
 *
 * DESIGN CHOICE — a standalone graph, not nodes appended to the base graph.
 * The ABP's own recipe ran base+hires as ONE graph with two `SaveImage`
 * nodes so "hires refines the byte-identical base rather than a re-roll."
 * This function instead takes `baseImage` — the filename of the base PNG
 * already downloaded and re-uploaded to the ComfyUI input directory (via
 * `uploadControlImage`, reused as-is) — and refines THAT. The refined image
 * is still byte-identical-base-derived (same file, no regeneration); the
 * difference is mechanical, not measurement-affecting: it reuses the
 * existing single-purpose `runGraph`/`downloadFirstImage` transport
 * unchanged (one graph submission -> exactly one `SaveImage` -> exactly one
 * downloaded file) instead of teaching that shared, already-tested path to
 * disambiguate between multiple `SaveImage` outputs in one job. The cost is
 * one extra network round-trip (re-upload); on a home-network SSH tunnel
 * this is negligible next to generation time.
 *
 * CONDITIONING CHOICE — plain `CLIPTextEncode`, not through ControlNet.
 * None of the three ABPs' recorded hires graphs (flux-eval.md,
 * ABP-anchor-model-choice.md, ABP-flux-dev-and-anchor.md) re-apply
 * ControlNet in the second pass — every one samples from the same
 * `CLIPTextEncode` nodes the base pass used, not through a
 * `ControlNetApplyAdvanced` node. `ABP-controlnet-rescue.md` does not
 * record the hires graph's exact wiring for the schnell+ControlNet case (it
 * only says the hires SETTINGS — 10 steps @ 0.40 — are "unchanged from both
 * prior ABPs"), so this is a documented, conservative choice made in the
 * gap: at denoise 0.4 the sampler only runs the last ~40% of the trajectory,
 * refining detail on top of an input latent whose structure was already
 * locked in by the base pass's ControlNet-held pixels — re-applying
 * ControlNet on a near-converged image is redundant with, and could fight,
 * that structure. If this is later found to lose composition fidelity,
 * re-run the base pass's ControlNet nodes into this graph instead.
 */
export function buildEnvHiresGraph({ brief, seed, baseImage, forge }) {
  const { models, sampler, hires } = forge.profile;
  const outputId = `${brief.id ?? "subject"}-seed${seed}-hires`;
  return {
    [HIRES_NODE.CKPT]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: models.checkpoint },
    },
    [HIRES_NODE.POS]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [HIRES_NODE.CKPT, 1], text: brief.positive },
    },
    [HIRES_NODE.NEG]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [HIRES_NODE.CKPT, 1], text: brief.negative ?? "" },
    },
    [HIRES_NODE.LOAD_BASE]: {
      class_type: "LoadImage",
      inputs: { image: baseImage },
    },
    [HIRES_NODE.UPSCALE_LOAD]: {
      class_type: "UpscaleModelLoader",
      inputs: { model_name: hires.upscaler },
    },
    [HIRES_NODE.UPSCALE_MODEL]: {
      class_type: "ImageUpscaleWithModel",
      inputs: {
        upscale_model: [HIRES_NODE.UPSCALE_LOAD, 0],
        image: [HIRES_NODE.LOAD_BASE, 0],
      },
    },
    [HIRES_NODE.SCALE]: {
      class_type: "ImageScale",
      inputs: {
        image: [HIRES_NODE.UPSCALE_MODEL, 0],
        width: hires.width,
        height: hires.height,
        upscale_method: "lanczos",
        crop: "disabled",
      },
    },
    [HIRES_NODE.ENCODE]: {
      class_type: "VAEEncode",
      inputs: { pixels: [HIRES_NODE.SCALE, 0], vae: [HIRES_NODE.CKPT, 2] },
    },
    [HIRES_NODE.KSAMPLER]: {
      class_type: "KSampler",
      inputs: {
        model: [HIRES_NODE.CKPT, 0],
        positive: [HIRES_NODE.POS, 0],
        negative: [HIRES_NODE.NEG, 0],
        latent_image: [HIRES_NODE.ENCODE, 0],
        seed,
        steps: hires.steps,
        cfg: sampler.cfg,
        sampler_name: sampler.samplerName,
        scheduler: sampler.scheduler,
        denoise: hires.denoise,
      },
    },
    [HIRES_NODE.DECODE]: {
      class_type: "VAEDecode",
      inputs: { samples: [HIRES_NODE.KSAMPLER, 0], vae: [HIRES_NODE.CKPT, 2] },
    },
    [HIRES_NODE.SAVE]: {
      class_type: "SaveImage",
      inputs: {
        images: [HIRES_NODE.DECODE, 0],
        filename_prefix: `art-forge/env/${outputId}`,
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
 * (`--control none` skips the render/upload entirely — freehand txt2img.)
 *
 * With `--hires`, a SECOND job runs after the base pass completes: the just-
 * downloaded base PNG is re-uploaded and refined through
 * `buildEnvHiresGraph` (`profiles.environment.hires`). Off by default — see
 * this file's header comment for why. Returns `{ base, hires }` when
 * `--hires` is set, or the base-only `runGraph` result otherwise (unchanged
 * shape — every existing caller of the base-only path is unaffected).
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

  const { control, block, render } = resolveControl({ forge, control: args.control });
  const strength = resolveStrength({ control, block, override: args.strength });
  const { width, height } = forge.profile.latent;

  const base = comfyBaseUrl(forge, args);
  // --control none stages no control image at all: nothing is rendered or
  // uploaded, and the queued graph carries no LoadImage (dry-run included).
  let controlImage = null;
  if (control !== "none") {
    // Per-control local path AND per-control uploaded basename. Both matter:
    // uploadControlImage sends path.basename(localPath) with overwrite=true, so
    // a shared "A1-ART-02.png" would let a segment run clobber the depth map
    // already sitting in ComfyUI's input dir (and vice versa).
    const controlLocalPath = path.join(forge.outDir, "control", control, `${briefId}-${control}.png`);
    await render({ brief: rawBrief, width, height, outPath: controlLocalPath });

    // dry-run must not touch the network — the control PNG still renders
    // locally above so a --dry-run graph carries a realistic LoadImage name.
    controlImage = args["dry-run"]
      ? `art-forge/${briefId}-${control}.png`
      : await uploadControlImage({ base, localPath: controlLocalPath, subfolder: "art-forge" });
  }

  // --positive replaces the composed prompt entirely (CLI wins over
  // composed), matching charsheet.mjs/i2i.mjs's --positive convention. When
  // not given, the positive is the brief prose PLUS the house style
  // vocabulary — a bare brief prompt is exactly what produced the modern-
  // contamination failure this composition exists to prevent.
  //
  // brief.id is qualified with the control (matching controlOutputId's own
  // naming) so buildEnvGraph's internal SaveImage filename_prefix — which it
  // derives from brief.id, not from the outer outputId below — lands on the
  // SAME control-qualified name instead of silently dropping the control
  // suffix for non-depth controls. depth's id stays bare on purpose: that is
  // what keeps its embedded filename_prefix byte-identical to F-026.
  const brief = {
    // The composed path lints inside buildEnvPositive(); a --positive
    // override bypasses composition, so it is linted here instead.
    positive: positiveOverride
      ? assertPositivePromptClean(positiveOverride, {
          forbiddenTokens: promptForbiddenTokens(forge),
          ...promptScaleGuard(forge),
          requiredAssertions: rawBrief.mustAssert ?? [],
        })
      : buildEnvPositive(rawBrief.prompt, forge, {
          requiredAssertions: rawBrief.mustAssert ?? [],
        }),
    negative: buildEnvNegative(forge),
    id: control === "depth" ? rawBrief.id : `${rawBrief.id}-${control}`,
  };

  const outputId = controlOutputId({ briefId, control, seed, strength });
  const graph = buildEnvGraph({ brief, seed, depthImage: controlImage, forge, strength, controlNet: block });

  const baseResult = await runGraph({
    forge,
    args,
    graph,
    name: `env/${outputId}`,
    label:
      `env ${briefId} seed=${seed} control=${control}` +
      (control === "none" ? "" : ` strength=${formatStrength(strength)}`) +
      (controlImage ? ` image=${controlImage}` : ""),
  });

  if (!args.hires) {
    return baseResult;
  }

  const hiresOutputId = `${briefId}-seed${seed}-hires`;
  // dry-run must not touch the network — mirrors the depthImage placeholder
  // above so `--dry-run --hires` still prints a realistic LoadImage name.
  const baseImage = args["dry-run"]
    ? `art-forge/${outputId}.png`
    : await uploadControlImage({ base, localPath: baseResult.dest, subfolder: "art-forge" });
  const hiresGraph = buildEnvHiresGraph({ brief, seed, baseImage, forge });
  const hiresResult = await runGraph({
    forge,
    args,
    graph: hiresGraph,
    name: `env/${hiresOutputId}`,
    label: `env hires ${briefId} seed=${seed} base=${baseImage}`,
  });

  return { base: baseResult, hires: hiresResult };
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
