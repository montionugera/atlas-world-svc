#!/usr/bin/env node
/**
 * batch-matrix.mjs — run the full race x job matrix through the i2i recipe.
 *
 * The axes come from forge.config.json (`muscleGradient.raceAxis` /
 * `jobAxis`); identity words and muscle scores come from
 * prompts/race-identity.json. Each cell calls `generateCell` from i2i.mjs —
 * the same code path as running i2i.mjs by hand — so a matrix run and a
 * single reroll can never drift apart.
 *
 * Cells run sequentially: one ComfyUI instance, one GPU (GPU 0 / port 8188).
 * GPU 1 / port 8189 is the owner's own instance — never touched.
 *
 * NOT RUNNABLE IN CI. Needs a live GPU on mont-pc plus an SSH tunnel.
 *
 * Usage:
 *   node generate/batch-matrix.mjs --races all --jobs all
 *   node generate/batch-matrix.mjs --races ogre --jobs mage,healer   # reroll
 *   node generate/batch-matrix.mjs --races all --jobs all --seed 12345
 *
 * Flags: --seed N  --timeout SECONDS (default 600)
 *        --host H  --direct  --dry-run (print the graphs, queue nothing)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadForge, parseArgs, randomSeed } from "./charsheet.mjs";
import { generateCell } from "./i2i.mjs";

/** Resolve `all` / a comma list into a validated subset of `axis`. */
export function selectAxis(value, axis, label) {
  if (value === undefined || value === true || value === "all")
    return [...axis];
  const picked = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = picked.filter((p) => !axis.includes(p));
  if (unknown.length) {
    throw new Error(
      `unknown ${label}: ${unknown.join(", ")} — expected from ${axis.join(", ")}`,
    );
  }
  return picked;
}

/**
 * Per-cell seed. With `--seed`, seeds are deterministic and stable per cell
 * (offset by the cell's position in the FULL matrix, so a reroll of one cell
 * reproduces exactly what the full run produced). Without it, each cell gets
 * a fresh random seed — the seed is echoed per cell so failures can be
 * rerolled deliberately.
 */
export function cellSeed(base, race, job, forge) {
  if (base === undefined) return randomSeed();
  const { raceAxis, jobAxis } = forge.config.muscleGradient;
  return (
    Number(base) +
    raceAxis.indexOf(race) * jobAxis.length +
    jobAxis.indexOf(job)
  );
}

export async function runMatrix(args, forge = loadForge()) {
  const { raceAxis, jobAxis } = forge.config.muscleGradient;
  const races = selectAxis(args.races, raceAxis, "race");
  const jobs = selectAxis(args.jobs, jobAxis, "job");
  const total = races.length * jobs.length;

  console.log(
    `[art-forge] matrix ${races.length} races x ${jobs.length} jobs = ${total} cells`,
  );

  const failures = [];
  let done = 0;
  for (const race of races) {
    for (const job of jobs) {
      done++;
      const seed = cellSeed(args.seed, race, job, forge);
      console.log(
        `[art-forge] --- cell ${done}/${total}: ${race}/${job} seed=${seed}`,
      );
      try {
        await generateCell({ ...args, race, job, seed }, forge);
      } catch (err) {
        console.error(`[art-forge] cell ${race}/${job} FAILED: ${err.message}`);
        failures.push({ race, job, seed, error: err.message });
      }
    }
  }

  if (failures.length) {
    console.error(`[art-forge] ${failures.length}/${total} cells failed:`);
    for (const f of failures) {
      console.error(
        `  ${f.race}/${f.job} (seed ${f.seed}) — reroll: ` +
          `node generate/batch-matrix.mjs --races ${f.race} --jobs ${f.job}`,
      );
    }
  } else if (args["dry-run"]) {
    console.log(
      `[art-forge] dry run: ${total} cell graphs built, nothing queued`,
    );
  } else {
    console.log(`[art-forge] all ${total} cells written to ${forge.outDir}`);
    for (const race of races) {
      console.log(`[art-forge] QC: ./generate/contact-sheet.sh ${race}`);
    }
  }
  return { total, failures };
}

async function main() {
  const { failures } = await runMatrix(parseArgs());
  if (failures.length) process.exitCode = 1;
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
