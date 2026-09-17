// F-052 Task 10 — pure view-model for the Map Builder tab. No DOM access at
// module scope (and none anywhere in this file): map-builder.mjs is the only
// place that touches `document`/`fetch`/`EventSource`, so this half can be
// unit-tested with plain node:test and reused unchanged if the DOM layer is
// ever rewritten.
//
// Seed grammar duplicated (not imported) from atelier/mapforge/generate-world.mjs's
// SEED_GRAMMAR: that module is Node-only (fs/child_process at module scope)
// and importing it here would drag those into the browser bundle. The
// service's app.mjs is the enforcement point for the wire format; this copy
// is only for instant client-side feedback on the seed field.
const SEED_GRAMMAR = /^[0-9a-f]{16}$/;

const LOOP_BUDGET = /LOOP BUDGET/;

/** Exact canvas status strings (global-constraints.md §"Status strings"). */
export function statusText(job, { stageCount } = {}) {
  switch (job.status) {
    case "queued":
      return "Queued";
    case "running":
      return `Building · step ${job.steps.length} of ${stageCount}`;
    case "succeeded":
      if (job.publishedBy) return "Published";
      if (job.review?.decision === "rejected") {
        return "Rejected · " + (job.review.reasons ?? []).join(", ");
      }
      return "Ready to review";
    case "failed": {
      const error = job.error ?? "";
      if (LOOP_BUDGET.test(error)) return "Failed · took too long";
      if (error === "hung") return "Failed · hung";
      return "Failed · " + error.split("\n")[0];
    }
    case "cancelled":
      return "Cancelled";
    case "interrupted":
      return "Interrupted";
    default:
      return job.status;
  }
}

/**
 * Groups a job's reported stage lines under steps.json's terrain/climate/
 * land/civil/fabric headings, plus a trailing "other" group for any stage
 * name steps.json doesn't know about.
 *
 * A known stage is "done" once it has reported (found by name in
 * `steps`), otherwise "pending" — the service only emits a stage line once
 * that segment has actually finished (stage-parser.mjs), so there is no
 * server signal for "this named stage is currently running" to render as
 * "current". Unknown stages are different: they are not part of the fixed
 * pipeline at all, so while the job is still `running` they are shown as
 * the (single) "current" activity rather than silently reclassified as
 * done; once the job stops running they settle to "done" like everything
 * else that reported.
 */
export function groupSteps({ steps = [], stepsJson, running = false }) {
  const byName = new Map(steps.map((s) => [s.name, s]));
  const knownNames = new Set();

  const groups = stepsJson.groups.map((g) => ({
    id: g.id,
    label: g.label,
    stages: g.stages.map((st) => {
      knownNames.add(st.name);
      const found = byName.get(st.name);
      return {
        name: st.name,
        label: st.label,
        ms: found ? found.ms : 0,
        runs: found ? found.runs : 0,
        status: found ? "done" : "pending",
      };
    }),
  }));

  const other = steps
    .filter((s) => !knownNames.has(s.name))
    .map((s) => ({
      name: s.name,
      label: s.label ?? s.name,
      ms: s.ms,
      runs: s.runs,
      status: running ? "current" : "done",
    }));
  if (other.length > 0) groups.push({ id: "other", label: "Other", stages: other });

  return groups;
}

/**
 * Elapsed time against the generate-stage budget (content/world/budgets.json
 * `loop[stage="generate"]`), expressed as a 0-100 percentage of `failMs` so
 * a progress bar can render one continuous track with a target marker.
 */
export function progress(job, { targetMs, failMs }) {
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const endedAt = job.endedAt ? new Date(job.endedAt).getTime() : null;
  const elapsedMs =
    job.durationMs ?? (startedAt !== null ? (endedAt ?? Date.now()) - startedAt : 0);
  const pct = failMs > 0 ? Math.min(100, (elapsedMs / failMs) * 100) : 0;
  const targetPct = failMs > 0 ? Math.min(100, (targetMs / failMs) * 100) : 0;
  const over = elapsedMs >= failMs ? "fail" : elapsedMs >= targetMs ? "target" : "none";
  return { pct, targetPct, elapsedMs, over };
}

const ACTIONS = {
  watch: { id: "watch", label: "Watch" },
  cancel: { id: "cancel", label: "Cancel" },
  review: { id: "review", label: "Review" },
  rerun: { id: "rerun", label: "Re-run" },
  delete: { id: "delete", label: "Delete" },
  why: { id: "why", label: "See why" },
};

/**
 * Row actions per job status (spec §6). A running publish/undo gets no
 * Cancel: queue.mjs refuses to cancel a running composite job at every step
 * (409, always — killing one mid-way would leave a half-replaced world), so
 * a Cancel button there could never do anything (carried finding, Batch G
 * re-review n3).
 */
export function rowActions(job) {
  switch (job.status) {
    case "running":
      return job.kind === "publish" || job.kind === "undo"
        ? [ACTIONS.watch]
        : [ACTIONS.watch, ACTIONS.cancel];
    case "queued":
      return [ACTIONS.cancel];
    case "succeeded":
      return [ACTIONS.review, ACTIONS.rerun, ACTIONS.delete];
    case "failed":
      return [ACTIONS.why, ACTIONS.rerun, ACTIONS.delete];
    case "cancelled":
    case "interrupted":
      return [ACTIONS.rerun, ACTIONS.delete];
    default:
      return [];
  }
}

export function validateSeed(s) {
  if (typeof s === "string" && SEED_GRAMMAR.test(s)) return { ok: true, message: "" };
  return { ok: false, message: "16 lowercase hex characters" };
}

/** Drafts that are succeeded and not yet decided — what the sidebar badge counts. */
export function badgeCount(jobs) {
  return jobs.filter(
    (j) => j.kind === "draft" && j.status === "succeeded" && j.review?.decision === null,
  ).length;
}

/**
 * The tab's state machine over `{ jobs: Map, world, connected }`. The DOM
 * layer adapts whatever the wire sends (SSE frames, polled /api/jobs pages)
 * into these event shapes before calling reduce — this function never
 * touches fetch/EventSource itself.
 */
export function reduce(state, event) {
  switch (event.type) {
    case "job.created":
    case "job.started":
    case "job.step":
    case "job.done": {
      const jobs = new Map(state.jobs);
      jobs.set(event.job.id, event.job);
      return { ...state, jobs };
    }
    case "jobs.synced": {
      // Polling fallback: one frame carries a whole page of /api/jobs, not a
      // single job — upsert every row the same way a job.* frame upserts one.
      const jobs = new Map(state.jobs);
      for (const j of event.jobs) jobs.set(j.id, j);
      return { ...state, jobs };
    }
    case "world.changed":
      return { ...state, world: event.world };
    case "connected":
      return { ...state, connected: true };
    case "disconnected":
      return { ...state, connected: false };
    default:
      return state;
  }
}

/**
 * Continent deltas for the Review screen, top-5 by |Δ landKm2| unless
 * `showAll`. Re-sorts rather than trusting the server's own order (which
 * happens to already be sorted this way in review.mjs's buildReview) so this
 * function's contract holds regardless of what the caller hands it.
 */
export function reviewRows(review, { showAll = false } = {}) {
  const rows = [...(review?.deltas ?? [])].sort(
    (a, b) => Math.abs(b.landKm2.delta) - Math.abs(a.landKm2.delta),
  );
  return showAll ? rows : rows.slice(0, 5);
}

// Duplicated (not imported) from atelier/map-builder/lib/publish.mjs's
// PUBLISH_STEPS/STEP_LABELS exports: that module pulls in Node-only fs +
// mapforge machinery and can never be imported into the browser bundle. Kept
// as its own pair of constants (not derived) so a drift between server and
// client is a plain data mismatch a test can catch — see
// tests/map-builder-model.test.mjs's "drift guard" test, which imports
// publish.mjs's real PUBLISH_STEPS directly (safe there: that test runs
// under node:test, not the browser) and asserts equality with PUBLISH_STEPS
// below.
export const PUBLISH_STEPS = Object.freeze(["snapshot", "promote", "render", "parity", "lock", "verify"]);

const PUBLISH_STEP_LABELS = Object.freeze({
  snapshot: "Save a snapshot of the current world",
  promote: "Replace the world with the draft",
  render: "Redraw every map sheet",
  parity: "Check the Map Sheets index",
  lock: "Re-baseline the render lock",
  verify: "Verify the published world",
});

/** The six publish steps' human labels, in order (see PUBLISH_STEPS above). */
export function publishStepsText() {
  return PUBLISH_STEPS.map((name) => PUBLISH_STEP_LABELS[name]);
}

/** The fixed reject-reason set (spec §6 Review screen). */
export const decisionReasons = Object.freeze([
  "too much sea",
  "too little sea",
  "coastline too regular",
  "settlements misplaced",
  "other",
]);
