import { existsSync, readFileSync, statSync } from "node:fs";
import { join, delimiter } from "node:path";
import { SHEETS } from "../../mapforge/render-sheet.mjs";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// No child process — walk PATH the same way the shell would, once per read().
const hasRsvgConvert = () =>
  (process.env.PATH ?? "").split(delimiter).some((dir) => { try { return existsSync(join(dir, "rsvg-convert")); } catch { return false; } });

const publishOrUndoRunning = (store) =>
  store.list({}).some((j) => (j.kind === "publish" || j.kind === "undo") && (j.status === "queued" || j.status === "running"));

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
      else if (publishOrUndoRunning(store)) { publishAllowed = false; publishReason = "a publish or undo is already running"; }
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
        lastPublish: store.list({ kind: "publish", limit: 1 })[0] ?? null,
        generatorVersion: repo.generatorVersion,
        stageCount: repo.stageCount ?? null,
      };
    },
  };
}
