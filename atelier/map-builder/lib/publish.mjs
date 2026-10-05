// atelier/map-builder/lib/publish.mjs — Task 14: publish + undo as composite jobs.
//
// A publish is six labelled steps run by the same runner as a draft: two are
// in-process `fn` steps (snapshot, the seed assertion inside verify), the rest
// spawn the repo's own tools. Labels are `<step>` or `<step>:<sub>` — the part
// before the colon is the step name the job record groups under, so the 17
// render spawns roll up into ONE `render` step (with `runs`), and verify's
// three sub-commands into ONE `verify` step.
import { SHEETS } from "../../mapforge/render-sheet.mjs";

export const PUBLISH_STEPS = Object.freeze(["snapshot", "promote", "render", "parity", "lock", "verify"]);
export const UNDO_STEPS = Object.freeze(["restore", "check"]);

export const STEP_LABELS = Object.freeze({
  snapshot: "Save a snapshot of the current world",
  promote: "Replace the world with the draft",
  render: "Redraw every map sheet",
  parity: "Check the Map Sheets index",
  lock: "Re-baseline the render lock",
  verify: "Verify the published world",
  restore: "Restore the snapshot",
  check: "Check the render lock",
});

export const stepNameOf = (label) => label.split(":")[0];

// render-sheet.mjs prints rasterize()'s skip message verbatim on stdout when
// rsvg-convert is absent ("rsvg-convert not found — PNG skipped. ...") and
// still exits 0 — a warning on the render step, never a failure.
export const PNG_SKIP_LINE = /PNG skipped/;
export const PNG_WARNING = "PNG not regenerated — install librsvg";

export const PUBLISH_REFUSED_ON_MAIN = "publish is refused on main / detached HEAD — check out a feature or release branch";
export const SCRIPTS_DEPS_MISSING = "scripts deps missing — run: npm ci --prefix scripts";

/** True while any publish or undo is queued or running (single-flight predicate shared with world.mjs). */
export const publishOrUndoActive = (store) =>
  store.list({}).some((j) => (j.kind === "publish" || j.kind === "undo") && (j.status === "queued" || j.status === "running"));

const node = process.execPath;
const LOCK = "scripts/check_render_lock.mjs";

/** The real tool argv set; tests override individual entries via `tools`. */
export function defaultTools({ draftJob }) {
  return {
    promote: [node, "atelier/mapforge/promote-world.mjs", "--from", draftJob?.outDir],
    render: (id) => [node, "atelier/mapforge/render-sheet.mjs", "--sheet", id, "--png"],
    parity: [node, "--test", "atelier/asset-storybook/tests/maps-index.test.mjs"],
    lock: [node, LOCK, "--write"],
    check: [node, LOCK, "--check"],
    spineCheck: [node, "scripts/check_spine_emit.mjs", "--check", "--content-root", "content"],
  };
}

/**
 * `job` is the queue's live job object: the snapshot step records
 * `job.snapshotId` on it, and the queue persists it after that step ends (the
 * auto-restore on a later failure reads it from there).
 */
export function publishCommands({ repo, job, snapshots, draftJob, tools = {} }) {
  const t = { ...defaultTools({ draftJob }), ...tools };
  return [
    { label: "snapshot", fn: async ({ log }) => {
      const snap = snapshots.create({ seed: repo.currentSeed() });
      job.snapshotId = snap.id;
      log(`snapshot ${snap.id} (${snap.files.length} files)`);
    } },
    { label: "promote", argv: t.promote },
    ...Object.keys(SHEETS).map((id) => ({ label: `render:${id}`, argv: t.render(id) })),
    { label: "parity", argv: t.parity },
    { label: "lock", argv: t.lock },
    { label: "verify:render-lock", argv: t.check },
    { label: "verify:spine-emit", argv: t.spineCheck },
    { label: "verify:seed", fn: async ({ log }) => {
      const seed = repo.currentSeed();
      if (seed !== draftJob.seed) throw new Error(`map-builder: committed seed ${seed} != draft seed ${draftJob.seed} after publish`);
      log(`committed seed is ${seed}`);
    } },
  ];
}

export function undoCommands({ job, snapshots, tools = {} }) {
  const t = { ...defaultTools({ draftJob: null }), ...tools };
  return [
    { label: "restore", fn: async ({ log }) => {
      const r = snapshots.restore({ id: job.snapshotId });
      log(`restored ${r.restored} file(s), deleted ${r.deleted} added file(s) from snapshot ${job.snapshotId}`);
    } },
    { label: "check", argv: t.check },
  ];
}

/**
 * Groups a composite job's commands into steps as they start/end. A step is
 * appended when its first command starts (so `steps.length` is "step k", as
 * for drafts), `done` once all its commands exited 0, `failed` on the first
 * non-zero exit.
 */
export function createCompositeSteps({ commands }) {
  const expected = new Map();
  for (const c of commands) { const n = stepNameOf(c.label); expected.set(n, (expected.get(n) ?? 0) + 1); }
  const steps = [];
  const current = () => steps[steps.length - 1];
  return {
    stepCount: expected.size,
    start(label) {
      const name = stepNameOf(label);
      if (current()?.name !== name) steps.push({ name, label: STEP_LABELS[name] ?? name, ms: 0, runs: 0, status: "running" });
      return { ...current() };
    },
    end({ label, exitCode, ms }) {
      const s = steps.find((x) => x.name === stepNameOf(label));
      s.ms += ms; s.runs += 1;
      s.status = exitCode !== 0 ? "failed" : s.runs === expected.get(s.name) ? "done" : "running";
      return { ...s };
    },
    warn(label, warning) { const s = steps.find((x) => x.name === stepNameOf(label)); if (s) s.warning = warning; },
    stepIndex: () => steps.length,
    steps: () => steps.map((s) => ({ ...s })),
  };
}
