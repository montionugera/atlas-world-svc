// F-050 Task 8 — the Forge tab: art-forge pipeline runs, per-cell
// status/staleness, and the pending work-orders list.
//
// Static page invariants: this module only ever FETCHES committed files
// (run ledgers, briefs, review-queue.json) and DOWNLOADS an updated queue.
// It never POSTs to anything and never executes a re-run — a work order is
// consumed by the next human-run forge session.

import {
  FORGE_CLASS,
  RUNS_INDEX_URL,
  RUNS_BASE_URL,
  BRIEFS_BASE_URL,
  REVIEW_QUEUE_URL,
  ART_FORGE_ROOT_URL,
  fetchJson,
} from "../state.mjs";
import {
  canonicalBriefString,
  digestHex,
  markStale,
  parseLedgerText,
} from "./staleness.mjs";
import { buildPipelineRow } from "./pipeline.mjs";
import { openInfoDetail } from "../view/DetailOverlay.mjs";
import { getStore } from "../review/ui.mjs";
import {
  addWorkOrder,
  parseQueue,
  serializeQueue,
  WORK_ORDER_CELLS,
} from "../review/store.mjs";

const EMPTY_RUNS_TEXT = "No forge runs recorded yet";

// Session state: orders appended since page load (the committed file is only
// updated when the human exports + commits), plus the last parsed committed
// queue. Module-level because export + order listing outlive one render pass.
let committedQueue = parseQueue(JSON.stringify({ version: 1, verdicts: {} }));
const sessionOrders = [];
// briefId -> ledger attempts, for marking orders done/not-done.
const attemptsByBrief = new Map();
// Set by loadOrders(); re-run submits call it to repaint done/pending.
let refreshOrdersFn = null;
// Last document-level attempts-loaded handler this module registered, so a
// remount replaces it instead of stacking duplicates (finding: listener leak).
let attemptsLoadedHandler = null;

function cellLabel(a) {
  return a.type === "render"
    ? `render s${a.seed}${a.hires ? " hi" : ""}`
    : a.type === "gate-skipped"
      ? "gate ⤼skip"
      : a.type;
}

/** Link element for a ledger artifact path like "out/depth/A1.png". */
function artifactLink(path, text) {
  const a = document.createElement("a");
  a.href = ART_FORGE_ROOT_URL + path;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text || path;
  return a;
}

function detailContentFor(entry) {
  const box = document.createElement("div");
  box.className = "forge-detail";

  const pre = document.createElement("pre");
  pre.className = "forge-detail-json";
  pre.textContent = JSON.stringify(entry, null, 2);
  box.appendChild(pre);

  const pngPath = entry.out || entry.png;
  if (pngPath) {
    const p = document.createElement("p");
    p.appendChild(artifactLink(pngPath));
    box.appendChild(p);
  }
  if (entry.cornerSheet) {
    const p = document.createElement("p");
    p.textContent = "corner sheet: ";
    p.appendChild(artifactLink(entry.cornerSheet));
    box.appendChild(p);
  }
  if (Array.isArray(entry.reasons) && entry.reasons.length > 0) {
    const title = document.createElement("p");
    title.textContent = "gate reasons:";
    box.appendChild(title);
    const ul = document.createElement("ul");
    for (const r of entry.reasons) {
      const li = document.createElement("li");
      li.textContent = String(r);
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  if (entry.type === "gate-skipped" && entry.reason) {
    const p = document.createElement("p");
    p.textContent = "skip reason: " + entry.reason;
    box.appendChild(p);
  }
  return box;
}

function wireRow(row, briefId, attempts) {
  row.querySelectorAll(".forge-cell[data-entry-index]").forEach((cell) => {
    const entry = attempts[Number(cell.dataset.entryIndex)];
    cell.addEventListener("click", () => {
      openInfoDetail({
        title: briefId + " · " + cellLabel(entry),
        subtitle: entry.ts || "",
        content: detailContentFor(entry),
      });
    });
    attachRerunAffordance(row, cell, briefId, entry);
  });
}

// ---------- Task 9: per-cell re-run → work order (download-only) ----------

/**
 * The work-order "cell" must be one of the store's four canonical stages;
 * a gate-skipped entry is re-ordered as a gate re-run (re-check that PNG).
 */
function workOrderCellFor(entry) {
  const cell = entry.type === "gate-skipped" ? "gate" : entry.type;
  if (!WORK_ORDER_CELLS.has(cell)) return null;
  return cell;
}

function attachRerunAffordance(row, cell, briefId, entry) {
  // Intake means the art already shipped — there is nothing to re-run.
  // Notrun placeholders are spans without an entry index, so they never
  // reach this function.
  const woCell = workOrderCellFor(entry);
  if (!woCell) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "forge-rerun";
  btn.textContent = "↻";
  btn.title = "Issue a re-run work order for " + cellLabel(entry);
  row.insertBefore(btn, cell.nextSibling);

  btn.addEventListener("click", () => {
    const existing = row.parentNode.querySelector(".forge-order-form");
    if (existing) existing.remove();
    openOrderForm(row, btn, { briefId, cell: woCell, seed: entry.seed });
  });
}

function openOrderForm(row, rerunBtn, order) {
  const form = document.createElement("div");
  form.className = "forge-order-form";

  const reason = document.createElement("textarea");
  reason.className = "forge-order-reason";
  reason.rows = 2;
  reason.placeholder = "why re-run? (required — it is what the forge session acts on)";

  let seedInput = null;
  if (order.cell === "render") {
    seedInput = document.createElement("input");
    seedInput.type = "number";
    seedInput.min = "0";
    seedInput.step = "1";
    seedInput.className = "forge-order-seed";
    if (order.seed !== undefined) seedInput.value = String(order.seed);
    else seedInput.placeholder = "seed (optional)";
    form.appendChild(seedInput);
  }

  const err = document.createElement("p");
  err.className = "forge-order-error";
  err.hidden = true;

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "forge-order-submit";
  submit.textContent = "issue work order";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "forge-order-cancel";
  cancel.textContent = "cancel";

  function close() {
    form.remove();
    rerunBtn.disabled = false;
  }

  submit.addEventListener("click", () => {
    const payload = { briefId: order.briefId, cell: order.cell, reason: reason.value };
    if (seedInput && seedInput.value !== "") payload.seed = Number(seedInput.value);
    let appended;
    try {
      const next = addWorkOrder(committedQueue, payload);
      appended = next.workOrders[next.workOrders.length - 1];
      sessionOrders.push(appended);
    } catch (e) {
      err.textContent = String(e.message || e);
      err.hidden = false;
      reason.focus();
      return;
    }
    close();
    console.info(
      "[asset-storybook] work order issued:",
      appended.id,
      "— export it from Pending work orders",
    );
    if (refreshOrdersFn) refreshOrdersFn();
  });
  cancel.addEventListener("click", close);
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    e.stopPropagation(); // don't trigger page-level handlers while typing
  });

  form.appendChild(reason);
  form.appendChild(err);
  const actions = document.createElement("div");
  actions.className = "forge-order-actions";
  actions.appendChild(submit);
  actions.appendChild(cancel);
  form.appendChild(actions);

  rerunBtn.disabled = true; // one open form per affordance at a time
  row.after(form);
  reason.focus();
}

/**
 * Run ledgers are NDJSON (header line + one entry per line — see
 * tools/art-forge/lib/run-ledger.mjs), so `res.json()` would throw on every
 * real ledger. Fetch text and parse with parseLedgerText instead. _index.json
 * and briefs are single JSON docs and keep using fetchJson.
 */
async function fetchLedger(briefId) {
  const res = await fetch(RUNS_BASE_URL + briefId + ".json");
  if (!res.ok) throw new Error("ledger " + briefId + ": HTTP " + res.status);
  return parseLedgerText(await res.text());
}

async function loadRows(rowsHost) {
  let index;
  try {
    index = await fetchJson(RUNS_INDEX_URL, "runs-index");
  } catch (err) {
    console.warn(
      "[asset-storybook] runs/_index.json unavailable — Forge shows no runs:",
      err,
    );
  }
  if (!index || !Array.isArray(index.briefs) || index.briefs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = EMPTY_RUNS_TEXT;
    rowsHost.appendChild(empty);
    return;
  }

  for (const briefId of index.briefs) {
    // Ledger is required for a row, brief is optional (absence just
    // disables staleness for that row).
    let ledger = null;
    let brief = null;
    try {
      [ledger, brief] = await Promise.all([
        fetchLedger(briefId),
        fetchJson(BRIEFS_BASE_URL + briefId + ".json", "brief " + briefId).catch(
          () => null,
        ),
      ]);
    } catch (err) {
      console.warn("[asset-storybook] ledger unavailable for " + briefId, err);
      continue;
    }

    // An empty ledger file parses to null — nothing recorded yet.
    const attempts = ledger && Array.isArray(ledger.attempts) ? ledger.attempts : [];
    attemptsByBrief.set(briefId, attempts);

    try {
      let staleFlags;
      if (brief) {
        const currentHash = await digestHex(canonicalBriefString(brief));
        staleFlags = markStale(attempts, currentHash);
      } else {
        staleFlags = attempts.map(() => false);
      }

      const row = buildPipelineRow({ briefId, attempts, staleFlags });
      wireRow(row, briefId, attempts);
      rowsHost.appendChild(row);
    } catch (err) {
      // One bad brief must not abort the remaining rows.
      console.error(
        "[asset-storybook] could not render pipeline row for " + briefId + ":",
        err,
      );
      const errRow = document.createElement("div");
      errRow.className = "forge-row";
      const errLabel = document.createElement("span");
      errLabel.className = "forge-brief-id";
      errLabel.textContent = briefId;
      const errMsg = document.createElement("span");
      errMsg.className = "forge-cell is-notrun";
      errMsg.textContent = "render error — see console";
      errRow.append(errLabel, errMsg);
      rowsHost.appendChild(errRow);
    }
  }
}

// ---------- pending work orders ----------

/**
 * An order is DONE when a matching newer attempt exists in that brief's
 * ledger: same briefId + cell (+ seed for render orders) with ts > createdAt.
 *
 * Known limitation: work orders do not carry a png reference today (the
 * work-order schema is intentionally unchanged), so a `gate` order can be
 * closed by ANY newer gate attempt in that brief's ledger — not only one
 * that inspected the same PNG the order was issued for. Tightening this to
 * png-matching requires adding a png field to the work-order schema first.
 */
export function isOrderDone(order, attempts) {
  if (!Array.isArray(attempts)) return false;
  const created = new Date(order.createdAt).getTime();
  return attempts.some((a) => {
    if (a.type !== order.cell) return false;
    if (order.cell === "render" && order.seed !== undefined && a.seed !== order.seed)
      return false;
    const ts = new Date(a.ts).getTime();
    return Number.isFinite(ts) && Number.isFinite(created) && ts > created;
  });
}

function allOrders() {
  return [...committedQueue.workOrders, ...sessionOrders];
}

function refreshOrders(listHost, countLabel) {
  const orders = allOrders();
  countLabel.textContent =
    orders.length === 0
      ? "none"
      : orders.length + (orders.length === 1 ? " order" : " orders");

  listHost.innerHTML = "";
  for (const order of orders) {
    const done = isOrderDone(order, attemptsByBrief.get(order.briefId));
    const item = document.createElement("div");
    item.className = "forge-order" + (done ? " is-done" : "");

    const head = document.createElement("span");
    head.className = "forge-order-head";
    head.textContent =
      order.briefId +
      " · " +
      order.cell +
      (order.seed !== undefined ? " s" + order.seed : "") +
      " · ";
    const badge = document.createElement("strong");
    badge.textContent = done ? "done" : "pending";
    head.appendChild(badge);
    item.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "forge-order-meta";
    meta.textContent = order.reason + " — " + order.createdAt;
    item.appendChild(meta);

    listHost.appendChild(item);
  }
}

function downloadQueue() {
  // Same byte-stable serializer + browser-download flow as the review export
  // (js/review/ui.mjs): Blob → object URL → anchor click → revoke.
  //
  // Verdicts come from the review store's EFFECTIVE view (committed + unsaved
  // localStorage buffer), exactly like the Review tab's own export — a Forge
  // export must never silently drop pending marks. Falls back to the parsed
  // committed queue only if the review layer never initialized.
  const store = getStore();
  const verdicts = store ? store.effective() : committedQueue.verdicts;
  const json = serializeQueue({
    version: 1,
    verdicts,
    workOrders: allOrders(),
  });
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "review-queue.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadOrders(sectionEl) {
  try {
    committedQueue = parseQueue(
      JSON.stringify(await fetchJson(REVIEW_QUEUE_URL, "review-queue")),
    );
  } catch (err) {
    console.warn(
      "[asset-storybook] review-queue.json unavailable — starting with no work orders:",
      err,
    );
  }

  const h3 = document.createElement("h3");
  h3.textContent = "Pending work orders";
  sectionEl.appendChild(h3);

  const countLabel = document.createElement("span");
  countLabel.className = "forge-orders-count";
  h3.appendChild(countLabel);

  const hint = document.createElement("p");
  hint.className = "art-tabbar-hint";
  hint.textContent =
    'Issued from cell re-runs below. Export appends to content/review-queue.json — ' +
    "commit the downloaded file; the next forge session consumes it. Nothing executes here.";
  sectionEl.appendChild(hint);

  const listHost = document.createElement("div");
  listHost.className = "forge-orders";
  sectionEl.appendChild(listHost);

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "forge-export-btn";
  exportBtn.textContent = "Export work orders (review-queue.json)";
  exportBtn.addEventListener("click", downloadQueue);
  sectionEl.appendChild(exportBtn);

  refreshOrders(listHost, countLabel);
  refreshOrdersFn = () => refreshOrders(listHost, countLabel);
  // Re-evaluate done/pending once ledgers have loaded (loadRows may finish
  // after this point on a cold cache). Remove-before-add so remounting the
  // tab never stacks duplicate handlers.
  if (attemptsLoadedHandler) {
    document.removeEventListener(
      "storybook:forge-attempts-loaded",
      attemptsLoadedHandler,
    );
  }
  attemptsLoadedHandler = () => refreshOrders(listHost, countLabel);
  document.addEventListener(
    "storybook:forge-attempts-loaded",
    attemptsLoadedHandler,
  );
}

export async function mountForge(main) {
  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + FORGE_CLASS;
  section.dataset.kind = FORGE_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Forge — art pipeline runs";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.style.cssText =
    "color:#9aa1b2;font-size:13px;margin:0 0 12px;max-width:70ch";
  note.textContent =
    "One row per brief, from the committed run ledgers (tools/art-forge/runs/). " +
    "Cells go left→right: blockin → render → gate → intake; amber = gate flag, " +
    "red = stale against the current brief hash. Click a cell for its entry; " +
    "re-runs are issued as work orders you export and commit — nothing auto-runs.";
  section.appendChild(note);

  const rowsHost = document.createElement("div");
  rowsHost.className = "forge-rows";
  section.appendChild(rowsHost);

  main.appendChild(section);

  await loadOrders(section);
  await loadRows(rowsHost);
  document.dispatchEvent(new Event("storybook:forge-attempts-loaded"));
}
