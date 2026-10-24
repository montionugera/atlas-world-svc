// F-050 Task 7, reshaped in F-053 Phase 1 — the Forge tab's pipeline strip.
//
// One row per brief: brief id, four stage pills (blockin → render → gate →
// intake) with attempt counts, then a note: "N stale", "all fresh", "no ledger
// yet", or a named ledger error. The old builder emitted one pill per ATTEMPT
// (202 for A1-ART-02) and had no caller. Pure model functions are node-tested
// (tests/forge-pipeline.test.mjs); buildPipelineRow is the thin DOM layer.

export const CELL_STATUS = {
  done: "done",
  flag: "flag",
  stale: "stale",
  notrun: "notrun",
};

export const STAGES = ["blockin", "render", "gate", "intake"];

const stageOf = (attempt) => (attempt.type === "gate-skipped" ? "gate" : attempt.type);

/**
 * @param {{ attempts: object[], staleFlags: boolean[] }} opts
 * @returns {{ stages: {stage: string, count: number, status: string}[], staleCount: number }}
 */
export function summarizePipeline({ attempts, staleFlags }) {
  const stages = STAGES.map((stage) => {
    let count = 0;
    let latest = -1;
    attempts.forEach((a, i) => {
      if (stageOf(a) === stage) {
        count++;
        latest = i;
      }
    });
    let status = CELL_STATUS.notrun;
    if (latest >= 0) {
      const a = attempts[latest];
      if (staleFlags[latest]) status = CELL_STATUS.stale;
      else if (a.type === "gate" && !a.ok) status = CELL_STATUS.flag;
      else status = CELL_STATUS.done;
    }
    return { stage, count, status };
  });
  return { stages, staleCount: staleFlags.filter(Boolean).length };
}

const notRunCells = () =>
  STAGES.map((stage) => ({ stage, text: stage, status: CELL_STATUS.notrun }));

/**
 * @param {{ briefId: string, outcome:
 *   {kind:"ledger", attempts: object[], staleFlags: boolean[]} |
 *   {kind:"no-ledger"} | {kind:"error", error: Error} }} opts
 */
export function pipelineRowModel({ briefId, outcome }) {
  if (outcome.kind === "error") {
    return {
      briefId,
      state: "error",
      cells: [],
      note: ledgerErrorText({ briefId, error: outcome.error }),
      noteTone: "error",
    };
  }
  if (outcome.kind === "no-ledger" || outcome.attempts.length === 0) {
    return { briefId, state: "no-ledger", cells: notRunCells(), note: "no ledger yet", noteTone: "notrun" };
  }
  const { stages, staleCount } = summarizePipeline(outcome);
  return {
    briefId,
    state: "ledger",
    cells: stages.map((s) => ({
      stage: s.stage,
      text: s.count > 0 ? `${s.stage} ${s.count}` : s.stage,
      status: s.status,
    })),
    note: staleCount > 0 ? `${staleCount} stale` : "all fresh",
    noteTone: staleCount > 0 ? "stale" : "done",
  };
}

/**
 * Brief ids for the Forge tab: the brief index order first, then any
 * ledgered brief the index does not list (never hide a ledger).
 * @param {{ briefsIndex: {briefs:{id:string}[]} | null, runsIndex: {briefs:string[]} }} opts
 */
export function forgeBriefIds({ briefsIndex, runsIndex }) {
  const ids = [];
  const add = (id) => {
    if (typeof id === "string" && !ids.includes(id)) ids.push(id);
  };
  if (briefsIndex && Array.isArray(briefsIndex.briefs)) briefsIndex.briefs.forEach((b) => add(b && b.id));
  if (runsIndex && Array.isArray(runsIndex.briefs)) runsIndex.briefs.forEach(add);
  return ids;
}

/**
 * Empty-state text for a Forge data source that did not load.
 * @param {{ path: string, error: Error }} opts
 */
export function forgeSourceFailureText({ path, error }) {
  const message = error && error.message ? error.message : String(error);
  return /HTTP 404\b/.test(message)
    ? `not packaged in this image: ${path}`
    : `source failed: ${path} — ${message}`;
}

/** DOM for one pipeline row. @param {ReturnType<typeof pipelineRowModel>} model */
export function buildPipelineRow(model) {
  const row = document.createElement("div");
  row.className = "forge-row forge-pipeline-row";
  row.dataset.brief = model.briefId;
  row.dataset.state = model.state;
  if (model.state === "error") row.dataset.error = "ledger";

  const label = document.createElement("span");
  label.className = "forge-brief-id";
  label.textContent = model.briefId;
  row.append(label);

  for (const c of model.cells) {
    const cell = document.createElement("span");
    cell.className = `forge-cell is-${c.status}`;
    cell.dataset.stage = c.stage;
    cell.textContent = c.text;
    row.append(cell);
  }

  const note = document.createElement("span");
  note.className = `forge-row-note is-${model.noteTone}`;
  note.textContent = model.note;
  row.append(note);
  return row;
}

/**
 * Visible text for a ledger that could not be read (fetch failure or a
 * malformed line). Never silent: forge.mjs renders this as a row.
 * @param {{ briefId: string, error: Error & { line?: number } }} opts
 */
export function ledgerErrorText({ briefId, error }) {
  const where = Number.isInteger(error && error.line) ? ` (line ${error.line})` : "";
  const message = error && error.message ? error.message : String(error);
  return `ledger ${briefId}.json unreadable${where}: ${message}`;
}
