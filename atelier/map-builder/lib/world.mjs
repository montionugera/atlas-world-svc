import { existsSync, readFileSync, statSync } from "node:fs";
import { join, delimiter } from "node:path";
import { SHEETS } from "../../mapforge/render-sheet.mjs";
import { publicJob } from "./jobs.mjs";
import { publishOrUndoActive } from "./publish.mjs";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// No child process — walk PATH the same way the shell would, once per read().
const hasRsvgConvert = () =>
  (process.env.PATH ?? "").split(delimiter).some((dir) => { try { return existsSync(join(dir, "rsvg-convert")); } catch { return false; } });


// True when a readable snapshot newer than the last SUCCESSFUL publish's
// start exists — i.e. that publish's own pre-publish snapshot is still on
// disk (publish takes it after startedAt). Corrupt rows carry no `at`.
function undoAvailable({ store, snapshots }) {
  if (!snapshots) return false;
  const last = store.list({ kind: "publish", status: "succeeded", limit: 1 })[0];
  if (!last?.startedAt) return false;
  return snapshots.list().some((m) => !m.corrupt && m.at >= last.startedAt);
}

export function createWorldReader({ repo, snapshots = null, store }) {
  return {
    read() {
      const branch = repo.branch();
      const band = repo.ratioBand();
      const worldJson = readJson(join(repo.repoRoot, "content/world/fabric/world.json"));
      const lockPath = join(repo.repoRoot, "content/world/render-lock.json");
      const locked = existsSync(lockPath);
      const contentGateDeps = repo.contentGateDeps();

      let publishAllowed = true;
      let publishReason = null;
      if (branch.detached) { publishAllowed = false; publishReason = "detached HEAD"; }
      else if (branch.name === "main") { publishAllowed = false; publishReason = "on main"; }
      else if (publishOrUndoActive(store)) { publishAllowed = false; publishReason = "a publish or undo is already running"; }
      else if (!contentGateDeps) { publishAllowed = false; publishReason = "scripts deps missing — run: npm ci --prefix scripts"; }

      return {
        seed: repo.currentSeed(),
        ratio: { value: worldJson.seaToLandRatio, min: band.min, max: band.max, target: band.target },
        sheets: { count: Object.keys(SHEETS).length, locked, lockedAt: locked ? statSync(lockPath).mtime.toISOString() : null },
        branch,
        dirtyFiles: repo.dirtyWorldFiles(),
        publishAllowed,
        publishReason,
        pngTool: hasRsvgConvert(),
        contentGateDeps,
        // Sanitised the same way as the JSON job routes (fix round 1, F3) —
        // this was returning the raw stored record, leaking _seq.
        lastPublish: publicJob(store.list({ kind: "publish", limit: 1 })[0] ?? null),
        undoAvailable: undoAvailable({ store, snapshots }),
        generatorVersion: repo.generatorVersion,
        stageCount: repo.stageCount ?? null,
      };
    },
  };
}
