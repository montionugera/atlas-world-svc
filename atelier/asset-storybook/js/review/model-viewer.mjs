// Loads the vendored <model-viewer> once. The detail overlay is the only place a
// live viewer exists, so a panel that opens it needs the custom element defined.
//
// Shares the `data-atlas-model-viewer` script tag with panels/assets.mjs, so
// whichever panel mounts first loads it and the other reuses the definition.

const SRC = "/vendor/model-viewer.min.js";
const TIMEOUT_MS = 15000;

let ready = null;

export function ensureModelViewer() {
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out defining <model-viewer>")),
      TIMEOUT_MS,
    );
    const done = (fn, arg) => {
      clearTimeout(timer);
      fn(arg);
    };
    let script = document.querySelector("script[data-atlas-model-viewer]");
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = SRC;
      script.dataset.atlasModelViewer = "1";
      script.addEventListener("error", () => {
        script.remove();
        done(reject, new Error("could not load " + SRC));
      });
      document.head.appendChild(script);
    }
    customElements.whenDefined("model-viewer").then(
      () => done(resolve),
      (err) => done(reject, err),
    );
  }).catch((err) => {
    ready = null; // a later open retries instead of caching the failure
    throw err;
  });
  return ready;
}
