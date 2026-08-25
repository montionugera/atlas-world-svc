// Reject / rebuild verdicts (F-038 Phase 4).
//
// A verdict is a WORK ORDER for the art pipeline, not a diary entry:
// content/review-queue.json is committed, and art-forge / asset-forge can read
// it to regenerate exactly what is listed, using the note as the instruction.
// That is why the note is mandatory and why the committed file — never
// localStorage — is the source of truth.
//
// localStorage holds only the UNSAVED working buffer, so marking is instant and
// survives a reload before you export. The page stays a static artifact: no
// server, no write endpoint.
//
// Pure — no DOM, no fetch, no localStorage access. The caller supplies both
// layers and persists the local one. Covered by tests/review-store.test.mjs.

export const VERDICTS = new Set(["reject", "rebuild"]);

// F-050 — forge re-run work orders ride in the same committed queue file.
// The UI only ever appends orders here and exports; it never executes them.
export const WORK_ORDER_CELLS = new Set(["blockin", "render", "gate", "intake"]);

const CLEARED = "__cleared__";

// Same shape rule as the server-side ledger validation: brief ids are
// alphanumeric with dashes only.
const BRIEF_ID_RE = /^[A-Za-z0-9-]+$/;

// Date.now() alone can collide when same-brief same-cell orders are appended
// in one batch loop (same millisecond), so every id gets a module-level
// sequence suffix — ids stay unique and monotonic across a session.
let woSeq = 0;

function readVerdicts(doc) {
  const v = doc && doc.verdicts;
  if (!v || typeof v !== "object") return {};
  return v;
}

/**
 * Parse a review-queue.json string. A legacy file without `workOrders`
 * degrades to an empty array so the key always exists downstream.
 * @param {string} json
 */
export function parseQueue(json) {
  let doc;
  try {
    doc = JSON.parse(json);
  } catch {
    doc = null;
  }
  const verdicts = readVerdicts(doc);
  const workOrders = Array.isArray(doc && doc.workOrders) ? doc.workOrders : [];
  return { version: 1, verdicts, workOrders };
}

/**
 * Byte-stable export: verdict keys sorted, work-order array order preserved
 * (append-only semantics — order IS the queue). Same shape as the store's
 * own export, so a re-export of unchanged data never churns the git diff.
 * @param {{ version?: number, verdicts?: object, workOrders?: object[] }} queue
 */
export function serializeQueue(queue) {
  const verdicts = {};
  for (const key of Object.keys(readVerdicts(queue)).sort()) {
    verdicts[key] = queue.verdicts[key];
  }
  const out = {
    version: queue.version ?? 1,
    verdicts,
    workOrders: Array.isArray(queue.workOrders) ? queue.workOrders : [],
  };
  return JSON.stringify(out, null, 2) + "\n";
}

/**
 * Append a forge work order. Pure — returns a NEW queue; the input is
 * untouched. Injects the monotonic id + createdAt, validates everything else.
 * @param {{ workOrders?: object[] }} queue
 * @param {{ briefId: string, cell: string, reason: string, seed?: number }} order
 */
export function addWorkOrder(queue, order) {
  if (
    typeof order.briefId !== "string" ||
    !order.briefId ||
    !BRIEF_ID_RE.test(order.briefId)
  ) {
    throw new Error(
      'briefId must be a non-empty string matching /^[A-Za-z0-9-]+$/ (same rule as the server-side ledger)',
    );
  }
  if (!WORK_ORDER_CELLS.has(order.cell)) {
    throw new Error(
      `unknown cell "${order.cell}" — must be one of ${[...WORK_ORDER_CELLS].join(", ")}`,
    );
  }
  const trimmed = typeof order.reason === "string" ? order.reason.trim() : "";
  if (!trimmed) {
    throw new Error(
      "a work order needs a reason — it is what the human running the forge session will act on",
    );
  }
  if (
    order.seed !== undefined &&
    (!Number.isInteger(order.seed) || order.seed < 0)
  ) {
    throw new Error("seed must be a non-negative integer");
  }
  const wo = {
    id: `wo-${order.briefId}-${order.cell}-${Date.now()}-${++woSeq}`,
    briefId: order.briefId,
    cell: order.cell,
    reason: trimmed,
    createdAt: new Date().toISOString(),
  };
  if (order.seed !== undefined) wo.seed = order.seed;
  return { ...queue, workOrders: [...(queue.workOrders || []), wo] };
}

/**
 * @param {object} opts
 * @param {object} opts.committed  parsed content/review-queue.json
 * @param {object} opts.local      parsed localStorage buffer
 * @param {(local:object)=>void} [opts.persist]  called after every mutation
 */
export function createStore({ committed, local, persist }) {
  const base = readVerdicts(committed);
  const buffer = { ...(local || {}) };
  const save = () => persist && persist(buffer);

  function effective() {
    const out = { ...base };
    for (const [key, rec] of Object.entries(buffer)) {
      if (rec === CLEARED) delete out[key];
      else out[key] = rec;
    }
    return out;
  }

  return {
    get(key) {
      const rec = effective()[key];
      return rec || null;
    },

    set(key, verdict, note) {
      if (!VERDICTS.has(verdict)) {
        throw new Error(
          `unknown verdict "${verdict}" — must be one of ${[...VERDICTS].join(", ")}`,
        );
      }
      const trimmed = typeof note === "string" ? note.trim() : "";
      if (!trimmed) {
        throw new Error(
          "a verdict needs a note — it is the instruction whoever rebuilds the asset will act on",
        );
      }
      const prior = base[key];
      // Re-asserting exactly what is already committed is not an unsaved
      // change, so it must not light up the export bar.
      if (prior && prior.verdict === verdict && prior.note === trimmed) {
        delete buffer[key];
      } else {
        buffer[key] = { verdict, note: trimmed };
      }
      save();
    },

    clear(key) {
      if (base[key]) buffer[key] = CLEARED;
      else delete buffer[key];
      save();
    },

    unsavedCount() {
      return Object.keys(buffer).length;
    },

    counts() {
      const out = { reject: 0, rebuild: 0 };
      for (const rec of Object.values(effective())) {
        if (out[rec.verdict] !== undefined) out[rec.verdict]++;
      }
      return out;
    },

    keysWith(verdict) {
      return Object.entries(effective())
        .filter(([, rec]) => rec.verdict === verdict)
        .map(([key]) => key)
        .sort();
    },

    allKeys() {
      return Object.keys(effective());
    },

    // Sorted keys so a re-export of unchanged data is byte-identical — an
    // unstable export would churn the committed file's diff on every save.
    exportJson() {
      const eff = effective();
      const verdicts = {};
      for (const key of Object.keys(eff).sort()) verdicts[key] = eff[key];
      return serializeQueue({
        version: 1,
        verdicts,
        workOrders:
          committed && Array.isArray(committed.workOrders)
            ? committed.workOrders
            : [],
      });
    },
  };
}
