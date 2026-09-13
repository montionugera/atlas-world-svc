import { runIdOf } from "../../mapforge/generate-world.mjs";
import { publishCommands, undoCommands } from "./publish.mjs";

export function outDirFor({ seed, version }) { return `build/mapforge/${runIdOf({ seed, version })}`; }

const GEN = "atelier/mapforge/generate-world.mjs", PROMOTE = "atelier/mapforge/promote-world.mjs";

export function dryRunCommands({ job, version }) {
  const out = job.outDir ?? outDirFor({ seed: job.seed, version });
  return [{ label: "dry-run", argv: [process.execPath, PROMOTE, "--dry-run", "--from", out] }];
}

export function draftCommands({ job, version }) {
  const out = job.outDir ?? outDirFor({ seed: job.seed, version });
  return [{ label: "generate", argv: [process.execPath, GEN, "--seed", job.seed, "--out", out, "--no-png", "--stage-report", "--json-report"] },
          ...dryRunCommands({ job: { ...job, outDir: out }, version })];
}

/** Kind-aware command plan — the queue's default `commandsFor`. */
export function commandsForKind({ kind, job, repo, snapshots, draftJob, tools }) {
  if (kind === "publish") return publishCommands({ repo, job, snapshots, draftJob, tools });
  if (kind === "undo") return undoCommands({ job, snapshots, tools });
  if (kind === "dry-run") return dryRunCommands({ job, version: repo.generatorVersion });
  return draftCommands({ job, version: repo.generatorVersion });
}
