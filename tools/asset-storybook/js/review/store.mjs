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

const CLEARED = "__cleared__";

function readVerdicts(doc) {
  const v = doc && doc.verdicts;
  if (!v || typeof v !== "object") return {};
  return v;
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
      return JSON.stringify({ version: 1, verdicts }, null, 2) + "\n";
    },
  };
}
