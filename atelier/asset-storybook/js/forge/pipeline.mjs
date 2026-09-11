// F-050 Task 7 — pipeline row builder for the Forge tab.
//
// Pure DOM assembly: one row per brief = brief-id label + ordered cells
// derived from that brief's run-ledger entries, plus trailing not-run
// placeholders so every pipeline reads left→right through the same four
// stages (blockin → render → gate → intake). Statuses are display-only;
// staleness comes in precomputed from js/forge/staleness.mjs via staleFlags.

export const CELL_STATUS = {
  done: "done",
  flag: "flag",
  stale: "stale",
  notrun: "notrun",
};

/**
 * @param {{ briefId: string, attempts: object[], staleFlags?: boolean[] }} opts
 */
export function buildPipelineRow({ briefId, attempts, staleFlags }) {
  const row = document.createElement("div");
  row.className = "forge-row";
  const label = document.createElement("span");
  label.className = "forge-brief-id";
  label.textContent = briefId;
  row.append(label);

  let anyStale = false;
  attempts.forEach((a, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "forge-cell";
    cell.dataset.entryIndex = String(i);
    const labelTxt =
      a.type === "blockin"
        ? "blockin"
        : a.type === "render"
          ? `render s${a.seed}${a.hires ? " hi" : ""}`
          : a.type === "gate"
            ? "gate"
            : a.type === "gate-skipped"
              ? "gate ⤼skip"
              : a.type === "intake"
                ? "intake"
                : a.type;
    cell.textContent = labelTxt;
    let status = CELL_STATUS.done;
    if (a.type === "gate" && !a.ok) status = CELL_STATUS.flag;
    if (staleFlags && staleFlags[i]) {
      status = CELL_STATUS.stale;
      anyStale = true;
    }
    cell.classList.add(`is-${status}`);
    row.append(cell);
  });

  // Trailing not-run placeholders so pipelines read left→right consistently.
  // A gate-skipped entry means the gate stage WAS reached (it chose to skip),
  // so it counts as "gate seen" — no duplicate trailing gate placeholder.
  const seen = new Set(
    attempts.map((a) => (a.type === "gate-skipped" ? "gate" : a.type)),
  );
  for (const stage of ["blockin", "render", "gate", "intake"]) {
    if (!seen.has(stage)) {
      const ph = document.createElement("span");
      ph.className = "forge-cell is-notrun";
      ph.textContent = stage;
      row.append(ph);
    }
  }
  row.dataset.anyStale = String(anyStale);
  return row;
}
