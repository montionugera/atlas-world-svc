#!/usr/bin/env node
/**
 * charsheet.mjs — txt2img baseline generator (ComfyUI / Z-Image Turbo).
 *
 * This file is BOTH a CLI and the shared core for the rest of `generate/`:
 * `i2i.mjs` imports the config loader, prompt builder and ComfyUI transport
 * from here and swaps the empty latent for a silhouette-encoded one;
 * `batch-matrix.mjs` imports `i2i.mjs`. Keeping the chain
 * charsheet -> i2i -> batch-matrix avoids a fourth shared module while
 * guaranteeing all three take the exact same code path.
 *
 * NOT RUNNABLE IN CI. Needs a live GPU on mont-pc plus an SSH tunnel:
 *   ssh -f -N -L 8188:127.0.0.1:8188 -o ServerAliveInterval=30 mont@100.66.190.100
 *
 * Usage:
 *   node generate/charsheet.mjs --race human --job swordsman --seed 12345
 *
 * Flags: --seed N  --width N  --height N  --timeout SECONDS (default 600)
 *        --host H  --direct  --dry-run (print the graph, queue nothing)
 *        --steps N  --cfg N  --sampler NAME  --scheduler NAME  --shift N
 *          (override forge.config.json's `sampler.*`; CLI wins over config)
 *        --port N (override forge.config.json's `comfy.port`; CLI wins over
 *          config; does not mutate the config file)
 *        --positive "<string>"  --negative "<string>" (replace the composed
 *          buildPrompt()/negativePrompt() strings entirely; CLI wins over
 *          composed; does not change buildPrompt()/negativePrompt() themselves)
 *        --denoise N (0 < N <= 1; overrides the hardcoded txt2img fallback of
 *          1 — forge.config.json's sampler.denoise is the img2img knob and is
 *          not consulted here; does not mutate the config file)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FORGE_DIR = path.resolve(HERE, "..");

/* ------------------------------------------------------------------ *
 * Config — every tunable lives in forge.config.json / prompts/*.json. *
 * Nothing in this file may restate a value that lives in those files. *
 * ------------------------------------------------------------------ */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`could not read ${file}: ${err.message}`);
  }
}

/** Load forge.config.json + prompts/*.json as one frozen bundle for ONE named profile. */
export function loadForge({ forgeDir = FORGE_DIR, profile } = {}) {
  const config = readJson(path.join(forgeDir, "forge.config.json"));
  if (!profile) {
    throw new Error(
      `loadForge requires an explicit profile — one of ${Object.keys(config.profiles).join(", ")}. ` +
        `There is deliberately no default: inheriting the wrong recipe silently produces wrong-style art.`,
    );
  }
  const resolved = config.profiles?.[profile];
  if (!resolved) {
    throw new Error(
      `unknown profile "${profile}" — expected one of ${Object.keys(config.profiles ?? {}).join(", ")}`,
    );
  }
  return {
    config,
    profile: resolved,
    styleLaws: readJson(path.join(forgeDir, "prompts", "style-laws.json")),
    raceIdentity: readJson(
      path.join(forgeDir, "prompts", "race-identity.json"),
    ),
    jobCostume: readJson(path.join(forgeDir, "prompts", "job-costume.json")),
    outDir: path.join(forgeDir, "out"),
  };
}

/* ------------------------------- CLI ------------------------------- */

/** Minimal `--flag value` / `--flag=value` / `--bool` parser. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq !== -1) {
      out[tok.slice(2, eq)] = tok.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      out[tok.slice(2)] = argv[++i];
    } else {
      out[tok.slice(2)] = true;
    }
  }
  return out;
}

export function requireCell(args, forge) {
  const { raceAxis, jobAxis } = forge.config.muscleGradient;
  const race = args.race;
  const job = args.job;
  if (!race || !job) {
    throw new Error("usage: --race <race> --job <job> [--seed N]");
  }
  if (!raceAxis.includes(race)) {
    throw new Error(
      `unknown race "${race}" — expected one of ${raceAxis.join(", ")}`,
    );
  }
  if (!jobAxis.includes(job)) {
    throw new Error(
      `unknown job "${job}" — expected one of ${jobAxis.join(", ")}`,
    );
  }
  // race-identity.json is locked canon (README + content/story/canon.md §5).
  // A race on the axis with no entry there would silently generate without its
  // identity markers, so refuse rather than emit off-canon art.
  if (!forge.raceIdentity[race]) {
    throw new Error(
      `race "${race}" is on muscleGradient.raceAxis but missing from prompts/race-identity.json`,
    );
  }
  // job-costume.json is the other locked-canon prompt ingredient (costume/prop
  // vocabulary, see content/story/canon.md §5); missing it would silently
  // generate without costume identity, same failure mode raceIdentity guards.
  if (!forge.jobCostume?.[job]?.clause) {
    throw new Error(
      `job "${job}" is on muscleGradient.jobAxis but missing a clause in prompts/job-costume.json`,
    );
  }
  return { race, job };
}

/**
 * Parse `--seed`. A bare `--seed` (parsed as `true`) or a non-numeric value
 * must fail loudly: silently falling back to seed 1 or NaN would hand back an
 * unreproducible render that the caller believes is pinned.
 */
export function parseSeed(value) {
  if (value === undefined) return randomSeed();
  const n = Number(value);
  if (value === true || !Number.isFinite(n) || n < 0) {
    throw new Error(`--seed must be a non-negative number, got "${value}"`);
  }
  return Math.floor(n);
}

/**
 * Parse a numeric sampler CLI override (`--steps` / `--cfg` / `--shift`).
 * Same fail-loudly shape as `parseSeed`: a bare flag (parsed as `true`) or a
 * non-numeric value must exit non-zero before anything is queued, rather than
 * silently sailing through as `NaN` or the boolean `true` coerced to `1`.
 */
export function parseNumericOverride(flag, value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (value === true || !Number.isFinite(n)) {
    throw new Error(`--${flag} must be a number, got "${value}"`);
  }
  return n;
}

/**
 * Parse a `--denoise` CLI override. Same fail-loudly shape as
 * `parseNumericOverride`, plus a range check: denoise is the fraction of the
 * input latent KSampler is allowed to replace, so a bare flag (parsed as
 * `true`), a non-numeric value, or anything outside `0 < x <= 1` must exit
 * non-zero before anything is queued rather than silently reaching KSampler
 * out of range. Returns `fallback` when the flag was not passed; never
 * mutates forge.config.json itself.
 */
export function parseDenoiseOverride(value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (value === true || !Number.isFinite(n) || n <= 0 || n > 1) {
    throw new Error(
      `--denoise must be a number with 0 < x <= 1, got "${value}"`,
    );
  }
  return n;
}

/**
 * Parse a string sampler CLI override (`--sampler` / `--scheduler`). Only the
 * bool-sentinel bug applies here — a bare flag (parsed as `true`) must exit
 * non-zero rather than silently stringifying to `"true"` and reaching ComfyUI
 * as a nonexistent sampler/scheduler name.
 */
export function parseStringOverride(flag, value, fallback) {
  if (value === undefined) return fallback;
  if (value === true) {
    throw new Error(`--${flag} requires a value, got a bare flag`);
  }
  return value;
}

/**
 * Parse a `--positive` / `--negative` prompt-override CLI flag. Same
 * fail-loudly shape as `parseSeed`/`parseNumericOverride`/`parseStringOverride`:
 * a bare flag (parsed as `true`) OR an empty string must exit non-zero before
 * anything is queued. This codebase has been bitten by the bare-flag bug
 * before — an empty string here would silently send an unprompted image to
 * ComfyUI while the caller believes the override took effect. Returns
 * `undefined` when the flag was not passed, so the caller falls back to the
 * composed prompt from `buildPrompt()`/`negativePrompt()`.
 */
export function parsePromptOverride(flag, value) {
  if (value === undefined) return undefined;
  if (value === true || value === "") {
    throw new Error(
      `--${flag} must be a non-empty string, got ${
        value === true ? "a bare flag" : "an empty string"
      }`,
    );
  }
  return value;
}

/**
 * Resolve the five sampler knobs: forge.config.json `sampler.*` is the base,
 * CLI flags are overrides (CLI wins over config). Every override is
 * validated at the CLI boundary before any graph is queued.
 */
export function resolveSampler(args, forge) {
  const base = forge.config.sampler;
  return {
    steps: parseNumericOverride("steps", args.steps, base.steps),
    cfg: parseNumericOverride("cfg", args.cfg, base.cfg),
    samplerName: parseStringOverride("sampler", args.sampler, base.samplerName),
    scheduler: parseStringOverride("scheduler", args.scheduler, base.scheduler),
    shift: parseNumericOverride("shift", args.shift, base.shift),
  };
}

/* --------------------------- Prompt build --------------------------- */

/**
 * Muscle score for one race x job cell.
 *
 * The race axis carries the canon score (prompts/race-identity.json). The job
 * axis nudges it within `muscleGradient.scoreRange`, by at most half a step of
 * the race axis — so a heavy job never pushes a light race past its neighbour.
 * Every number here is derived from config; none is written down.
 */
export function muscleScore(race, job, forge) {
  const { raceAxis, jobAxis, scoreRange } = forge.config.muscleGradient;
  const [min, max] = scoreRange;
  const base = forge.raceIdentity[race].muscle;
  const raceStep = (max - min) / Math.max(1, raceAxis.length - 1);
  const jobFactor = jobAxis.indexOf(job) / Math.max(1, jobAxis.length - 1);
  const nudged = base + (jobFactor - 0.5) * raceStep;
  return Math.min(max, Math.max(min, nudged));
}

/**
 * Assemble the positive prompt for a cell.
 *
 * Z-Image Turbo is a distilled model sampled at cfg 1, where the negative
 * branch is not evaluated at all. That is why style-laws.json phrases its
 * negatives as counter-prompt words ("NOT 3D render", "no fur") — per
 * README.md they belong INSIDE the positive prompt. They are also encoded
 * into a real negative conditioning (see buildBaseGraph) so the graph stays
 * correct if cfg is ever raised.
 *
 * The F-024 calibration campaign found the negatives-inside-positive
 * duplication makes no visual difference either way, so it stays exactly
 * where it always was — it is not worth moving now that cfg defaults to 3
 * (forge.config.json). Two more ingredients are appended AFTER it, in this
 * order, to reproduce the campaign's validated prompt string verbatim: the
 * job's costume/prop clause (prompts/job-costume.json), then the style
 * clause (style-laws.json `styleClause`).
 */
export function buildPrompt({ race, job }, forge) {
  const identity = forge.raceIdentity[race].identity;
  const score = muscleScore(race, job, forge);
  return [
    ...forge.styleLaws.positive,
    `full body character sheet, ${race} ${job}`,
    ...identity,
    `muscle mass ${score.toFixed(1)} out of 10`,
    "single character, plain background, front view",
    ...forge.styleLaws.negative,
    forge.jobCostume[job].clause,
    ...forge.styleLaws.styleClause,
  ].join(", ");
}

export function negativePrompt(forge) {
  return forge.styleLaws.negative.join(", ");
}

/* --------------------------- Graph build --------------------------- */

/**
 * Node ids and wiring for the Z-Image Turbo graph, discovered from this
 * install's `GET /object_info` and the shipped `image_z_image_turbo`
 * template (`GET /templates/image_z_image_turbo.json`) rather than guessed:
 *
 *   UNETLoader -> ModelSamplingAuraFlow -+
 *   CLIPLoader -> CLIPTextEncode(pos) ---+-> KSampler -> VAEDecode -> SaveImage
 *              -> CLIPTextEncode(neg) ---+       ^
 *   VAELoader --------------------------+        |
 *   <latent source>  ---------------------------+
 *
 * The latent source is the only difference between txt2img and img2img:
 * charsheet uses EmptySD3LatentImage, i2i uses LoadImage -> VAEEncode.
 */
export const MODELS = Object.freeze({
  unet: "z_image_turbo_bf16.safetensors",
  clip: "qwen_3_4b.safetensors",
  clipType: "lumina2",
  vae: "ae.safetensors",
});

export const NODE = Object.freeze({
  UNET: "1",
  MODEL_SAMPLING: "2",
  CLIP: "3",
  POS: "4",
  NEG: "5",
  VAE: "6",
  LATENT: "7",
  KSAMPLER: "8",
  DECODE: "9",
  SAVE: "10",
  LOAD_IMAGE: "11",
  ENCODE: "12",
});

/**
 * Build the API-format prompt graph shared by txt2img and img2img.
 * `latentSource` is [nodeId, outputSlot]; extra nodes producing it are merged in.
 * `steps`/`cfg`/`samplerName`/`scheduler`/`shift` come from `resolveSampler()`
 * (forge.config.json `sampler.*`, CLI-overridable) — never restated here.
 */
export function buildBaseGraph({
  positive,
  negative,
  seed,
  denoise,
  filenamePrefix,
  latentNodes,
  latentSource,
  steps,
  cfg,
  samplerName,
  scheduler,
  shift,
}) {
  return {
    [NODE.UNET]: {
      class_type: "UNETLoader",
      inputs: { unet_name: MODELS.unet, weight_dtype: "default" },
    },
    [NODE.MODEL_SAMPLING]: {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: [NODE.UNET, 0], shift },
    },
    [NODE.CLIP]: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: MODELS.clip,
        type: MODELS.clipType,
        device: "default",
      },
    },
    [NODE.POS]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [NODE.CLIP, 0], text: positive },
    },
    [NODE.NEG]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [NODE.CLIP, 0], text: negative },
    },
    [NODE.VAE]: { class_type: "VAELoader", inputs: { vae_name: MODELS.vae } },
    ...latentNodes,
    [NODE.KSAMPLER]: {
      class_type: "KSampler",
      inputs: {
        model: [NODE.MODEL_SAMPLING, 0],
        positive: [NODE.POS, 0],
        negative: [NODE.NEG, 0],
        latent_image: latentSource,
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise,
      },
    },
    [NODE.DECODE]: {
      class_type: "VAEDecode",
      inputs: { samples: [NODE.KSAMPLER, 0], vae: [NODE.VAE, 0] },
    },
    [NODE.SAVE]: {
      class_type: "SaveImage",
      inputs: { images: [NODE.DECODE, 0], filename_prefix: filenamePrefix },
    },
  };
}

/* --------------------------- ComfyUI client --------------------------- */

/**
 * Parse a `--port` CLI override. Same fail-loudly shape as `parseSeed` /
 * `parseNumericOverride`: a bare flag (parsed as `true`), a non-numeric
 * value, or a value outside the valid TCP port range must exit non-zero
 * before anything is queued — silently coercing a bare `--port` to `true`
 * (-> 1 as a number) would target the wrong ComfyUI instance without
 * warning. Returns `undefined` when the flag was not passed, so the caller
 * can fall back to forge.config.json's `comfy.port` — this never mutates
 * the config file itself.
 */
export function parsePort(value) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (value === true || !Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(
      `--port must be an integer between 1 and 65535, got "${value}"`,
    );
  }
  return n;
}

/**
 * Resolve the ComfyUI base URL.
 *
 * The port comes from forge.config.json by default, overridable per-run via
 * `--port` (CLI wins over config; the config file is never mutated) — e.g.
 * to target a different instance/GPU explicitly for one invocation. The
 * host defaults to 127.0.0.1 because README.md's access path is an SSH
 * tunnel; `--direct` targets `comfy.host` (the Tailscale address) when
 * running on the LAN.
 */
export function comfyBaseUrl(forge, args = {}) {
  const { host, port } = forge.config.comfy;
  const resolved = args.host || (args.direct ? host : "127.0.0.1");
  const resolvedPort = parsePort(args.port) ?? port;
  return `http://${resolved}:${resolvedPort}`;
}

async function comfyFetch(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${url} -> ${res.status} ${await res.text()}`,
    );
  }
  return res;
}

export async function assertReachable(base) {
  try {
    const stats = await (await comfyFetch(`${base}/system_stats`)).json();
    return stats?.system?.comfyui_version ?? "unknown";
  } catch (err) {
    throw new Error(
      `ComfyUI unreachable at ${base}: ${err.message}\n` +
        "Open the tunnel first:\n" +
        "  ssh -f -N -L 8188:127.0.0.1:8188 -o ServerAliveInterval=30 mont@100.66.190.100",
    );
  }
}

export async function queuePrompt(base, graph) {
  const body = JSON.stringify({
    prompt: graph,
    client_id: `art-forge-${process.pid}`,
  });
  const res = await comfyFetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = await res.json();
  if (json.node_errors && Object.keys(json.node_errors).length) {
    throw new Error(
      `ComfyUI rejected the graph: ${JSON.stringify(json.node_errors)}`,
    );
  }
  return json.prompt_id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll /history/<id> until the job finishes; returns its outputs block. */
export async function awaitHistory(
  base,
  promptId,
  { timeoutMs = 600_000, pollMs = 1500 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hist = await (await comfyFetch(`${base}/history/${promptId}`)).json();
    const entry = hist[promptId];
    if (entry) {
      const status = entry.status ?? {};
      if (status.status_str === "error") {
        const msgs = (status.messages ?? [])
          .map((m) => JSON.stringify(m))
          .join("\n");
        throw new Error(`ComfyUI job ${promptId} failed:\n${msgs}`);
      }
      // Only a real completion, or a non-empty outputs block, ends the poll —
      // a present-but-empty `outputs: {}` is not a finished job.
      if (status.completed) return entry.outputs ?? {};
      if (entry.outputs && Object.keys(entry.outputs).length) {
        return entry.outputs;
      }
    }
    await sleep(pollMs);
  }
  throw new Error(
    `timed out after ${timeoutMs}ms waiting for prompt ${promptId}. ` +
      "The job may still be queued — check GET /queue, and raise --timeout " +
      "(seconds) if the box is busy with other work.",
  );
}

/** Pull the first image out of a history outputs block and write it locally. */
export async function downloadFirstImage(base, outputs, destPath) {
  const images = Object.values(outputs).flatMap((o) => o.images ?? []);
  if (!images.length) throw new Error("job completed but produced no images");
  const img = images[0];
  const qs = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder ?? "",
    type: img.type ?? "output",
  });
  const res = await comfyFetch(`${base}/view?${qs}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return { bytes: buf.length, remote: img };
}

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * Queue one graph, wait for it, save it to out/<name>.png. Shared by all
 * three CLIs so there is exactly one transport implementation.
 */
export async function runGraph({ forge, args, graph, name, label }) {
  const base = comfyBaseUrl(forge, args);
  if (args["dry-run"]) {
    console.log(JSON.stringify(graph, null, 2));
    return null;
  }
  const version = await assertReachable(base);
  const dest = path.join(forge.outDir, `${name}.png`);
  console.log(`[art-forge] ${label} -> ${base} (ComfyUI ${version})`);
  const started = Date.now();
  const promptId = await queuePrompt(base, graph);
  console.log(`[art-forge] queued prompt_id=${promptId}`);
  const outputs = await awaitHistory(base, promptId, {
    timeoutMs: args.timeout ? Number(args.timeout) * 1000 : undefined,
  });
  const { bytes, remote } = await downloadFirstImage(base, outputs, dest);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[art-forge] ${remote.filename} -> ${dest} (${bytes} bytes, ${secs}s)`,
  );
  return { dest, bytes, promptId };
}

/* ------------------------------ txt2img ------------------------------ */

/** Build the txt2img graph for one cell. */
export function buildCharsheetGraph({
  race,
  job,
  seed,
  width,
  height,
  forge,
  sampler,
  positiveOverride,
  negativeOverride,
  denoise,
}) {
  return buildBaseGraph({
    positive: positiveOverride ?? buildPrompt({ race, job }, forge),
    negative: negativeOverride ?? negativePrompt(forge),
    seed,
    // txt2img always denoises fully by default; forge.config's denoise is the
    // img2img knob, not applicable here — the --denoise CLI override (see
    // parseDenoiseOverride) can still force a partial denoise for experiments.
    denoise,
    filenamePrefix: `art-forge/${race}-${job}-t2i`,
    latentNodes: {
      [NODE.LATENT]: {
        class_type: "EmptySD3LatentImage",
        inputs: { width, height, batch_size: 1 },
      },
    },
    latentSource: [NODE.LATENT, 0],
    ...sampler,
  });
}

export async function generateCharsheet(args, forge = loadForge()) {
  const { race, job } = requireCell(args, forge);
  const seed = parseSeed(args.seed);
  const sampler = resolveSampler(args, forge);
  const width = Number(args.width ?? 1024);
  const height = Number(args.height ?? 1024);
  const positiveOverride = parsePromptOverride("positive", args.positive);
  const negativeOverride = parsePromptOverride("negative", args.negative);
  // txt2img's fallback is the hardcoded `1` (always denoise fully), NOT
  // forge.config.json's sampler.denoise — that value is the img2img knob.
  const denoise = parseDenoiseOverride(args.denoise, 1);
  const graph = buildCharsheetGraph({
    race,
    job,
    seed,
    width,
    height,
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
    name: `${race}-${job}-t2i`,
    label: `txt2img ${race}/${job} seed=${seed} ${width}x${height} denoise=${denoise}`,
  });
}

async function main() {
  const args = parseArgs();
  await generateCharsheet(args);
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
