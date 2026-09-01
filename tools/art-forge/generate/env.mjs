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
 *        --refine <png> (dev only; img2img materials refine over an EXISTING
 *          reviewed cell using the anchor recipe — no base pass runs, no
 *          grain step: the source is already a textured render. REQUIRES
 *          --rolltag <tag> (rail 7: a refine never overwrites a reviewed
 *          cell). See the subject-probe verdict's open question 1.)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

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
import { renderColourPng, renderDepthPng, renderSegmentPng } from "./blockin.mjs";
import { assertPositivePromptClean } from "./prompt-lint.mjs";
import { briefHash } from "../lib/brief-hash.mjs";
import { appendAttempt } from "../lib/run-ledger.mjs";

const RUNS_DIR = path.join(FORGE_DIR, "runs");

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
  GUID: "30",
  ZERO: "31",
});

/** Node ids for the dev anchor pass (img2img on the grained block-in). */
export const ANCHOR_NODE = Object.freeze({
  CKPT: "40",
  POS: "41",
  NEG: "42",
  LOAD: "43",
  ENCODE: "44",
  GUID: "45",
  ZERO: "46",
  KSAMPLER: "47",
  DECODE: "48",
  SAVE: "49",
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
 * Forbidden-token union from the town-canon-reviewer's criteria file
 * (content/world/town-criteria.json): per-town brief forbidden phrases +
 * the shared anti-cliché vocabulary. Data the reviewer owns; this loader
 * only reads it. Missing/corrupt file degrades to [] — the base forge
 * forbiddenTokens still apply — so non-town briefs never see town rules.
 */
export function townCriteriaForbiddenTokens(contentRoot = path.join(FORGE_DIR, "..", "..", "content")) {
  const p = path.join(contentRoot, "world", "town-criteria.json");
  if (!fs.existsSync(p)) return [];
  try {
    const c = JSON.parse(fs.readFileSync(p, "utf8"));
    const phrases = Object.values(c.towns ?? {}).flatMap(
      (t) => t.briefs?.forbiddenPhrases?.value ?? [],
    );
    const vocab = c.antiCliche?.forbiddenVocabulary?.value ?? [];
    return [...new Set([...phrases, ...vocab])];
  } catch {
    return [];
  }
}

/**
 * Compose the environment positive prompt. Register ruling 2026-08-30 (anchor
 * verdict rail 5, owner-approved option a): the house styleLaws vocabulary is
 * CHARACTER data — "crisp flat 2D anime illustration, hand-drawn 2D cel-shaded
 * artwork, clean ink linework over painted flat colour" demonstrably fought the
 * medium clause in-prompt and won 2 of 3 anchor cells — so environments compose
 * from their OWN register only: the medium clause FIRST (primacy in the prompt),
 * then the brief prose, then the era block. The styleLaws positive/render
 * assertion/styleClause splices are gone from this path; the negative side
 * (environmentNegativeWords) still reads styleLaws.negative, which is inert at
 * cfg 1 and is not the register mechanism.
 *
 * `styleGuard.mustCompose` names clauses (`era`, `medium`) that must survive
 * composition: each clause text is asserted present in the composed string
 * through the same R4 mechanism that enforces a brief's `mustAssert`, so a
 * refactor that drops one fails at composition, not after the render queue.
 * The result is linted before it is returned, so a negation reaching the
 * positive prompt throws here rather than ~218 s of GPU later.
 */
export function buildEnvPositive(promptText, forge, { requiredAssertions = [], extraForbiddenTokens = [] } = {}) {
  const guard = forge.profile.styleGuard ?? {};
  const era = guard.era;
  const medium = guard.medium;
  const composed = [
    ...(medium ? [medium] : []),
    promptText,
    ...(era ? [era] : []),
  ].join(", ");
  const composeAssertions = (guard.mustCompose ?? []).map((key) => {
    const clause = guard[key];
    if (typeof clause !== "string" || clause.trim() === "") {
      throw new Error(
        `styleGuard.mustCompose lists "${key}" but styleGuard.${key} is missing or empty — the rail would compose nothing`,
      );
    }
    return clause;
  });
  return assertPositivePromptClean(composed, {
    forbiddenTokens: [...promptForbiddenTokens(forge), ...extraForbiddenTokens],
    ...promptScaleGuard(forge),
    requiredAssertions: [...composeAssertions, ...requiredAssertions],
  });
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

/** model key -> the forge.config.json models key holding its checkpoint. */
export const MODEL_CHECKPOINT = Object.freeze({ schnell: "checkpoint", dev: "dev" });

/**
 * Pick the model. Precedence: --model > "schnell" (the F-026 frozen default).
 * dev uses `models.dev.checkpoint` + the measured `samplerDev` settings
 * (ABP-flux-dev-and-anchor.md); schnell stays byte-identical to F-026.
 * @returns {{ model: string, checkpoint: string, sampler: object }}
 */
export function resolveModel({ forge, model }) {
  if (model === true) {
    throw new Error("--model requires a value, got a bare flag");
  }
  const key = model ?? "schnell";
  const checkpointKey = MODEL_CHECKPOINT[key];
  if (!checkpointKey) {
    throw new Error(
      `unknown --model "${key}" — expected one of ${Object.keys(MODEL_CHECKPOINT).join(", ")}`,
    );
  }
  const checkpoint = forge.profile.models[checkpointKey];
  if (key === "dev") {
    if (!checkpoint) {
      throw new Error('model "dev" has no "dev" entry in forge.config.json profiles.environment.models');
    }
    return { model: key, checkpoint, sampler: forge.profile.samplerDev };
  }
  return { model: key, checkpoint, sampler: forge.profile.sampler };
}

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
 * (`<id>-none-seed<n>`). An optional `rolltag` (rail 7, generalised from the
 * anchor path) namespaces a probe/re-roll era so a new measurement can never
 * overwrite the cells a previous verdict reviewed: `<id>[-<control>][-dev][-<rolltag>]-seed<n>-s<x>`.
 */
export function controlOutputId({ briefId, control, seed, strength, model = "schnell", rolltag = null }) {
  const modelInfix = model === "dev" ? "-dev" : "";
  const tagInfix = typeof rolltag === "string" && rolltag.trim() !== "" ? `-${rolltag.trim()}` : "";
  if (control === "none") return `${briefId}-none${modelInfix}${tagInfix}-seed${seed}`;
  const suffix = `-seed${seed}-s${formatStrength(strength)}`;
  return control === "depth"
    ? `${briefId}${modelInfix}${tagInfix}${suffix}`
    : `${briefId}-${control}${tagInfix}${suffix}`;
}

/** brief.id: control-qualified (except depth, for F-026 byte-diffability) + model-qualified. */
function composeBriefId(baseId, control, model) {
  const controlInfix = control !== "depth" ? `-${control}` : "";
  const modelInfix = model === "dev" ? "-dev" : "";
  return `${baseId}${controlInfix}${modelInfix}`;
}

/**
 * Rail 3 (carried nine rolls): the render ledger must be self-documenting —
 * record the sampler fields the graph actually ran with, at write time, so
 * provenance comes from data rather than filenames or config archaeology
 * (the v3-window schnell misroute is the standing argument). `resolved` is
 * the recipe block the graph read (`samplerDev` for dev, `sampler` for
 * schnell, `anchor` for the anchor/refine passes); `override` carries the
 * effective value when a CLI flag superseded the block (refine `--denoise`).
 * schnell's frozen path has no FluxGuidance node, so guidance is recorded
 * only when the recipe defines one.
 */
export function ledgerSamplerFields(resolved, model, override = {}) {
  const guidance = override.guidance ?? resolved.guidance;
  return {
    model,
    steps: override.steps ?? resolved.steps,
    cfg: override.cfg ?? resolved.cfg,
    ...(guidance != null ? { guidance } : {}),
    denoise: override.denoise ?? resolved.denoise,
  };
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
  model = "schnell",
}) {
  const { models, sampler, latent } = forge.profile;
  // Freehand (generateEnv passes controlNet: null for --control none): the
  // ControlNet nodes 20-23 are dropped entirely and the sampler conditions
  // straight from the text encodes. The output id carries no strength —
  // there is none to sweep. With a control, construction order is unchanged
  // so the frozen depth path stays byte-identical to F-026.
  const hasControl = controlNet != null;
  // dev (ABP-flux-dev-and-anchor.md): the all-in-one dev checkpoint, an
  // explicit FluxGuidance node (ComfyUI defaults guidance to 3.5 when unset —
  // 5.0 is the measured standard), and the template's ConditioningZeroOut
  // negative. schnell's frozen path gains nothing and loses nothing.
  const isDev = model === "dev";
  const devSampler = forge.profile.samplerDev;
  const checkpoint = isDev ? models.dev.checkpoint : models.checkpoint;
  const steps = isDev ? devSampler.steps : sampler.steps;
  const cfg = isDev ? devSampler.cfg : sampler.cfg;
  const denoise = isDev ? devSampler.denoise : sampler.denoise;
  const outputId =
    `${brief.id ?? "subject"}-seed${seed}${hasControl ? `-s${formatStrength(strength)}` : ""}`;
  const positiveFrom = hasControl ? [ENV_NODE.CN_APPLY, 0] : [ENV_NODE.POS, 0];
  const negativeFrom = hasControl ? [ENV_NODE.CN_APPLY, 1] : [ENV_NODE.NEG, 0];
  return {
    [ENV_NODE.CKPT]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    [ENV_NODE.POS]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ENV_NODE.CKPT, 1], text: brief.positive },
    },
    [ENV_NODE.NEG]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ENV_NODE.CKPT, 1], text: brief.negative ?? "" },
    },
    ...(isDev
      ? {
          [ENV_NODE.GUID]: {
            class_type: "FluxGuidance",
            inputs: { conditioning: [ENV_NODE.POS, 0], guidance: devSampler.guidance },
          },
          [ENV_NODE.ZERO]: {
            class_type: "ConditioningZeroOut",
            inputs: { conditioning: [ENV_NODE.NEG, 0] },
          },
        }
      : {}),
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
              positive: isDev ? [ENV_NODE.GUID, 0] : [ENV_NODE.POS, 0],
              negative: isDev ? [ENV_NODE.ZERO, 0] : [ENV_NODE.NEG, 0],
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
        positive: isDev && !hasControl ? [ENV_NODE.GUID, 0] : positiveFrom,
        negative: isDev && !hasControl ? [ENV_NODE.ZERO, 0] : negativeFrom,
        latent_image: [ENV_NODE.LATENT, 0],
        seed,
        steps,
        cfg,
        sampler_name: sampler.samplerName,
        scheduler: sampler.scheduler,
        denoise,
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
/**
 * Build the dev ANCHOR graph — img2img on the grained block-in
 * (ABP-flux-dev-and-anchor.md, D-anchored arm: 27 steps, cfg 1, guidance 5.0,
 * denoise 0.75 — window 0.70-0.78, only functional when the block-in carries
 * Gaussian grain; flat grey shapes hijack style into flat vector poster art).
 * `anchorImage` is the UPLOADED grained block-in filename (ComfyUI input dir),
 * produced by generateEnv's `--anchor` flow: renderDepthPng -> blur 0x6 ->
 * +noise Gaussian at `profiles.environment.anchor.grainAttenuate`.
 */
export function buildEnvAnchorGraph({ brief, seed, anchorImage, forge, denoise = forge.profile.anchor.denoise }) {
  const { models, sampler, anchor } = forge.profile;
  const outputId = `${brief.id ?? "subject"}-anchor-seed${seed}`;
  return {
    [ANCHOR_NODE.CKPT]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: models.dev.checkpoint },
    },
    [ANCHOR_NODE.POS]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ANCHOR_NODE.CKPT, 1], text: brief.positive },
    },
    [ANCHOR_NODE.NEG]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ANCHOR_NODE.CKPT, 1], text: brief.negative ?? "" },
    },
    [ANCHOR_NODE.GUID]: {
      class_type: "FluxGuidance",
      inputs: { conditioning: [ANCHOR_NODE.POS, 0], guidance: anchor.guidance },
    },
    [ANCHOR_NODE.ZERO]: {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: [ANCHOR_NODE.NEG, 0] },
    },
    [ANCHOR_NODE.LOAD]: {
      class_type: "LoadImage",
      inputs: { image: anchorImage },
    },
    [ANCHOR_NODE.ENCODE]: {
      class_type: "VAEEncode",
      inputs: { pixels: [ANCHOR_NODE.LOAD, 0], vae: [ANCHOR_NODE.CKPT, 2] },
    },
    [ANCHOR_NODE.KSAMPLER]: {
      class_type: "KSampler",
      inputs: {
        model: [ANCHOR_NODE.CKPT, 0],
        positive: [ANCHOR_NODE.GUID, 0],
        negative: [ANCHOR_NODE.ZERO, 0],
        latent_image: [ANCHOR_NODE.ENCODE, 0],
        seed,
        steps: anchor.steps,
        cfg: anchor.cfg,
        sampler_name: sampler.samplerName,
        scheduler: sampler.scheduler,
        denoise,
      },
    },
    [ANCHOR_NODE.DECODE]: {
      class_type: "VAEDecode",
      inputs: { samples: [ANCHOR_NODE.KSAMPLER, 0], vae: [ANCHOR_NODE.CKPT, 2] },
    },
    [ANCHOR_NODE.SAVE]: {
      class_type: "SaveImage",
      inputs: {
        images: [ANCHOR_NODE.DECODE, 0],
        filename_prefix: `art-forge/env/${outputId}`,
      },
    },
  };
}

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
  const { model } = resolveModel({ forge, model: args.model });
  const strength = resolveStrength({ control, block, override: args.strength });
  const { width, height } = forge.profile.latent;

  const base = comfyBaseUrl(forge, args);
  // --control none stages no control image at all: nothing is rendered or
  // uploaded, and the queued graph carries no LoadImage (dry-run included).
  let controlImage = null;
  if (control !== "none" && !args.refine) {
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
    // Both paths lint against the town-canon-reviewer's criteria vocabulary
    // on top of the forge's own forbiddenTokens.
    positive: positiveOverride
      ? assertPositivePromptClean(positiveOverride, {
          forbiddenTokens: [
            ...promptForbiddenTokens(forge),
            ...townCriteriaForbiddenTokens(),
          ],
          ...promptScaleGuard(forge),
          requiredAssertions: rawBrief.mustAssert ?? [],
        })
      : buildEnvPositive(rawBrief.prompt, forge, {
          requiredAssertions: rawBrief.mustAssert ?? [],
          extraForbiddenTokens: townCriteriaForbiddenTokens(),
        }),
    negative: buildEnvNegative(forge),
    id: composeBriefId(rawBrief.id, control, model),
  };

  // Rail 7: an optional --rolltag namespaces a probe/re-roll era so a new
  // measurement never overwrites the cells a previous verdict reviewed.
  const rolltag = typeof args.rolltag === "string" && args.rolltag.trim() !== ""
    ? args.rolltag.trim()
    : null;

  // --denoise is the refine's re-measure knob (subject-probe verdict open
  // question 1 (a)): the anchor window's 0.75 is measured HARMFUL on a
  // finished cell, so a re-measure must name its own denoise explicitly.
  // Refuse it anywhere else — anchor and base passes have no such knob.
  if (args.denoise != null && !args.refine) {
    throw new Error("--denoise is a --refine-only flag");
  }

  // --refine <png>: the materials refine pass (subject-probe verdict open
  // question 1 (a)) — img2img on an EXISTING reviewed cell using the anchor
  // recipe (dev, `profiles.environment.anchor` steps/cfg/guidance/denoise).
  // No base pass runs and no grain/blur step is applied: the source is
  // already a textured painterly render, not a flat block-in. Rail 7:
  // --rolltag is REQUIRED — the output lands on a rolltag-isolated name so a
  // refine can never overwrite a reviewed cell.
  if (args.refine) {
    if (typeof args.refine !== "string" || args.refine.trim() === "") {
      throw new Error("--refine needs the source PNG path, got a bare flag");
    }
    if (model !== "dev") {
      throw new Error(
        "--refine is a dev-model pass (anchor recipe) — schnell has no anchor recipe; run --model dev",
      );
    }
    if (!rolltag) {
      throw new Error(
        "--refine requires --rolltag <tag> (rail 7: a refine must never overwrite a reviewed cell)",
      );
    }
    // --denoise is the refine's re-measure knob (subject-probe verdict open
    // question 1 (a)): the anchor window's 0.75 is measured HARMFUL on a
    // finished cell, so a re-measure must name its own denoise explicitly.
    const refineDenoise = args.denoise != null ? Number(args.denoise) : forge.profile.anchor.denoise;
    if (!(refineDenoise > 0 && refineDenoise < 1)) {
      throw new Error(`--denoise must be a number strictly between 0 and 1, got ${JSON.stringify(args.denoise)}`);
    }
    const refineSourceLocal = path.resolve(args.refine.trim());
    const refineSource = args["dry-run"]
      ? `art-forge/${path.basename(refineSourceLocal)}`
      : await uploadControlImage({ base, localPath: refineSourceLocal, subfolder: "art-forge" });
    const refineGraph = buildEnvAnchorGraph({ brief, seed, anchorImage: refineSource, forge, denoise: refineDenoise });
    const refineOutputId = `${briefId}-dev-refine-${rolltag}-seed${seed}`;
    const refineResult = await runGraph({
      forge,
      args,
      graph: refineGraph,
      name: `env/${refineOutputId}`,
      label: `env refine ${briefId} seed=${seed} source=${refineSource} denoise=${refineDenoise}`,
    });
    if (refineResult.dest) {
      // Same ledger policy as the base and anchor passes — the refine render
      // is a real artifact and its provenance (which cell it refined, at what
      // denoise) must be recoverable. `refineSource` names the input cell;
      // strength is null (no ControlNet in the anchor recipe the reuses).
      try {
        appendAttempt(RUNS_DIR, briefId, {
          type: "render",
          seed,
          hires: false,
          control: "refine",
          strength: null,
          refineSource: path.relative(process.cwd(), refineSourceLocal),
          ...ledgerSamplerFields(forge.profile.anchor, "dev", { denoise: refineDenoise }),
          briefHash: briefHash(rawBrief),
          out: path.relative(FORGE_DIR, refineResult.dest),
        });
      } catch (err) {
        console.error(`env.mjs: WARNING: ledger append failed: ${err.message}`);
      }
    }
    return refineResult;
  }

  const outputId = controlOutputId({ briefId, control, seed, strength, model, rolltag });
  const graph = buildEnvGraph({ brief, seed, depthImage: controlImage, forge, strength, controlNet: block, model });

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

  // Run-ledger entry (F-050): the base PNG is downloaded — record the render
  // attempt. Dry-run downloads nothing, so it records nothing.
  //
  // Anchor runs (rail 6, anchor verdict): the base pass is a byproduct the
  // anchor graph never consumes, and writing it to the plain
  // `<brief>-dev-seed<N>-s<S>.png` name overwrote reviewed render files twice
  // on 2026-08-30. In anchor mode the download is renamed to
  // `<brief>-dev-anchorbase-seed<N>.png` BEFORE the ledger entry, and the
  // entry carries `anchorBase: true` so the index can tell the two apart.
  if (baseResult.dest) {
    if (args.anchor) {
      const anchorBaseDest = path.join(
        path.dirname(baseResult.dest),
        `${briefId}-dev-anchorbase-seed${seed}-s${formatStrength(strength)}.png`,
      );
      fs.renameSync(baseResult.dest, anchorBaseDest);
      baseResult.dest = anchorBaseDest;
    }
    // Ledger failure must NOT fail the run after the PNG was produced —
    // warn and continue (same policy as artifact-gate.mjs).
    try {
      appendAttempt(RUNS_DIR, briefId, {
        type: "render",
        seed,
        hires: false,
        ...(args.anchor ? { anchorBase: true } : {}),
        control,
        strength: control === "none" ? null : strength,
        ...ledgerSamplerFields(model === "dev" ? forge.profile.samplerDev : forge.profile.sampler, model),
        briefHash: briefHash(rawBrief),
        out: path.relative(FORGE_DIR, baseResult.dest),
      });
    } catch (err) {
      console.error(`env.mjs: WARNING: ledger append failed: ${err.message}`);
    }
  }

  if (!args.hires && !args.anchor) {
    return baseResult;
  }

  // --anchor (dev only): the composition anchor pass from
  // ABP-flux-dev-and-anchor.md — the COLOUR block-in (content colours over a
  // declared sky gradient) is grained (blur 0x6, then +noise Gaussian at
  // anchor.grainAttenuate — grain creates the denoise window; flat shapes
  // hijack style into flat vector), re-uploaded, and refined img2img at
  // denoise 0.75 over 27 steps.
  //
  // The base is the COLOUR block-in, not the depth map (fix, 2026-08-30):
  // img2img reads its base as content, so the depth path's "dark = far"
  // semantics rendered the parked anchor as a flat black-and-white night
  // poster — the black canvas kept as a black sky, flat tones as a flat
  // vector medium. The ABP's measured anchor base was always the colour
  // block-in; the depth map is for the ControlNet base pass only.
  if (args.anchor && model !== "dev") {
    throw new Error(
      "--anchor is a dev-model pass (ABP-flux-dev-and-anchor.md) — schnell has no anchor recipe; run --model dev",
    );
  }
  if (args.anchor && !controlImage) {
    throw new Error("--anchor needs a control image to anchor on — control none stages nothing");
  }
  if (args.anchor) {
    const anchorCfg = forge.profile.anchor;
    const colourSourceLocal = path.join(forge.outDir, "control", "colour", `${briefId}-colour.png`);
    await renderColourPng({ brief: rawBrief, width, height, outPath: colourSourceLocal });
    try {
      appendAttempt(RUNS_DIR, briefId, {
        type: "blockin",
        briefHash: briefHash(rawBrief),
        out: path.relative(FORGE_DIR, colourSourceLocal),
      });
    } catch (err) {
      console.error(`env.mjs: WARNING: ledger append failed: ${err.message}`);
    }
    const grainedPath = path.join(
      forge.outDir,
      "control",
      "colour",
      `${briefId}-colour-grained.png`,
    );
    const anchorSource = args["dry-run"]
      ? `art-forge/${briefId}-colour-grained.png`
      : await execFile("magick", [
          colourSourceLocal,
          "-blur",
          "0x6",
          "-attenuate",
          String(anchorCfg.grainAttenuate),
          "+noise",
          "Gaussian",
          grainedPath,
        ]).then(() => {
          console.error(`[art-forge] anchor: grained colour block-in -> ${grainedPath}`);
          return uploadControlImage({ base, localPath: grainedPath, subfolder: "art-forge" });
        });
    const anchorGraph = buildEnvAnchorGraph({ brief, seed, anchorImage: anchorSource, forge });
    // Rail 7 (v6 anchor verdict): the anchor output previously wrote straight
    // to `<brief>-dev-anchor-seed<N>.png`, so every re-roll overwrote the
    // cells the previous verdict had reviewed — the v5 evidence pixels are
    // unrecoverable. A `--rolltag <tag>` (e.g. `anchor-r3`) namespaces the
    // output per roll; without one the historical name is kept.
    const anchorOutputId = rolltag
      ? `${briefId}-dev-anchor-${rolltag}-seed${seed}`
      : `${briefId}-dev-anchor-seed${seed}`;
    const anchorResult = await runGraph({
      forge,
      args,
      graph: anchorGraph,
      name: `env/${anchorOutputId}`,
      label: `env anchor ${briefId} seed=${seed} source=${anchorSource} denoise=${anchorCfg.denoise}`,
    });
    if (anchorResult.dest) {
      // Same ledger policy as the base and hires passes — the anchor render
      // is a real artifact and its provenance (no ControlNet strength: the
      // anchor graph conditions from the grained colour block-in alone) must
      // be recoverable from the ledger, not from filenames.
      try {
        appendAttempt(RUNS_DIR, briefId, {
          type: "render",
          seed,
          hires: false,
          anchor: true,
          control: "anchor-colour",
          strength: null,
          ...ledgerSamplerFields(anchorCfg, "dev"),
          briefHash: briefHash(rawBrief),
          out: path.relative(FORGE_DIR, anchorResult.dest),
        });
      } catch (err) {
        console.error(`env.mjs: WARNING: ledger append failed: ${err.message}`);
      }
    }
    return { base: baseResult, anchor: anchorResult };
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

  if (hiresResult.dest) {
    // Same guard as the base render above: never throw after the PNG exists.
    try {
      appendAttempt(RUNS_DIR, briefId, {
        type: "render",
        seed,
        hires: true,
        control,
        strength: control === "none" ? null : strength,
        briefHash: briefHash(rawBrief),
        out: path.relative(FORGE_DIR, hiresResult.dest),
      });
    } catch (err) {
      console.error(`env.mjs: WARNING: ledger append failed: ${err.message}`);
    }
  }

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
