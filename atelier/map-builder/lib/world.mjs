import { existsSync, readFileSync, statSync } from "node:fs";
import { join, delimiter } from "node:path";
import { SHEETS } from "../../mapforge/render-sheet.mjs";
import { publicJob } from "./jobs.mjs";
import { publishOrUndoActive } from "./publish.mjs";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// No child process — walk PATH the same way the shell would, once per read().
const hasRsvgConvert = () =>
  (process.env.PATH ?? "").split(delimiter).some((dir) => { try { return existsSync(join(dir, "rsvg-convert")); } catch { return false; } });


// True when a restorable snapshot would actually undo something (fix round 1,
// C). Only a publish takes snapshots, so a readable one (corrupt rows carry no
// `at`) counts unless:
//  - an undo's restore step has completed since it was taken (the world was
//    already put back — keyed on the restore step, not the job status, since
//    a failed `check` after it does not un-restore anything), or
//  - its publish failed and auto-restored (`restored: true`): the world is
//    byte-identical to it, so an undo would re-copy the same bytes.
// An interrupted publish or one whose auto-restore FAILED keeps its snapshot
// counted — that is exactly when the owner needs the undo.
function undoAvailable({ store, snapshots }) {
  if (!snapshots) return false;
  const lastUndo = store.list({ kind: "undo" }).find((j) => j.startedAt && j.steps?.some((s) => s.name === "restore" && s.status === "done"));
  const autoRestored = new Set(store.list({ kind: "publish" }).filter((j) => j.restored === true).map((j) => j.snapshotId));
  return snapshots.list().some((m) => !m.corrupt && !autoRestored.has(m.id) && (!lastUndo || m.at > lastUndo.startedAt));
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
      // Mirrors the queue's idle-queue refusal (fix round 1, A) so the button
      // is disabled instead of answering 409.
      else if (store.list({}).some((j) => j.status === "queued" || j.status === "running")) { publishAllowed = false; publishReason = "a draft or dry-run is still queued or running"; }
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
