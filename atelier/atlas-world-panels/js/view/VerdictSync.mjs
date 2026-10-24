// Persists reject/rebuild verdicts to the observatory (assets panel).
//
// The review layer (review/ui.mjs) keeps marks in a browser-local buffer and used
// to hand them over as a downloaded review-queue.json. Inside atlas-world the
// server owns that file, so every mark is also POSTed to
// /api/review-queue/asset-verdicts. This module watches the store rather than the
// UI: every save path (card editor, clear, future callers) emits
// `storybook:verdict-change`, and the diff against what the server last accepted
// is what gets sent — a failed POST is simply retried inside the next diff.
//
// diffVerdicts() is pure (tests/verdict-sync.test.mjs).

export const ASSET_VERDICTS_URL = "/api/review-queue/asset-verdicts";

/**
 * Changes needed to take `synced` to `current`. A removed key is `null`
 * (the server deletes it). Returns null when there is nothing to send.
 * @param {Record<string,{verdict:string,note:string}>} synced
 * @param {Record<string,{verdict:string,note:string}>} current
 */
export function diffVerdicts(synced, current) {
  const out = {};
  for (const [key, rec] of Object.entries(current)) {
    const prior = synced[key];
    if (!prior || prior.verdict !== rec.verdict || prior.note !== rec.note) {
      out[key] = { verdict: rec.verdict, note: rec.note };
    }
  }
  for (const key of Object.keys(synced)) if (!(key in current)) out[key] = null;
  return Object.keys(out).length ? out : null;
}

function pick(rec) {
  return { verdict: rec.verdict, note: rec.note };
}

/**
 * @param {object} opts
 * @param {{effective:()=>Record<string,any>}} opts.store
 * @param {Record<string,any>} opts.committed   verdicts the server already holds
 * @param {(msg:string|null)=>void} opts.onStatus  null clears; a string is a visible failure
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {EventTarget} [opts.target]
 * @returns {{ flush: ()=>Promise<void>, stop: ()=>void }}
 */
export function startVerdictSync({
  store,
  committed,
  onStatus,
  fetchImpl = fetch,
  target = document,
}) {
  let synced = {};
  for (const [k, rec] of Object.entries(committed || {})) synced[k] = pick(rec);
  let chain = Promise.resolve();

  function flush() {
    // Serialised: two quick marks must reach the server in the order they were made.
    chain = chain.then(async () => {
      const current = {};
      for (const [k, rec] of Object.entries(store.effective())) {
        current[k] = pick(rec);
      }
      const delta = diffVerdicts(synced, current);
      if (!delta) return;
      try {
        const res = await fetchImpl(ASSET_VERDICTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdicts: delta }),
        });
        if (!res.ok) {
          let detail = "";
          try {
            const body = await res.json();
            detail =
              (body.error && (body.error.message || body.error.code)) || "";
          } catch {
            /* non-JSON error body — the status is enough */
          }
          throw new Error(
            "HTTP " + res.status + (detail ? " — " + detail : ""),
          );
        }
        synced = current;
        onStatus(null);
      } catch (err) {
        console.error("[assets] verdict save failed:", err);
        onStatus(
          "Verdict not saved to review-queue.json (" +
            String(err && err.message ? err.message : err) +
            "). It is kept in this browser and retried on the next change.",
        );
      }
    });
    return chain;
  }

  const onChange = () => {
    flush();
  };
  target.addEventListener("storybook:verdict-change", onChange);
  return {
    flush,
    stop: () =>
      target.removeEventListener("storybook:verdict-change", onChange),
  };
}
