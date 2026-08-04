import { ASSET_ROOT } from "./state.mjs";

export function resolveSceneSrc(scenePath) {
  return ASSET_ROOT + scenePath.replace(/^res:\/\//, "");
}

export function filenameOf(path) {
  return path.split("/").pop();
}

// ---------- per-card file-size probe (HEAD, no body) ----------
//
// Reads Content-Length via a HEAD request so each visual card can show
// its on-disk size next to the filename (mirroring the SFX tiles' KB)
// without downloading the asset itself. Concurrency-capped so ~60 probes
// don't stampede the network on first paint.
const SIZE_PROBE_CONCURRENCY = 8;
let activeProbes = 0;
const probeQueue = [];

function pumpProbeQueue() {
  while (activeProbes < SIZE_PROBE_CONCURRENCY && probeQueue.length > 0) {
    const task = probeQueue.shift();
    activeProbes++;
    task().finally(() => {
      activeProbes--;
      pumpProbeQueue();
    });
  }
}

function fmtBytes(n) {
  if (!isFinite(n) || n <= 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

export function attachFileSize(el, resPath) {
  if (!resPath) return;
  const url = resolveSceneSrc(resPath);
  probeQueue.push(() =>
    fetch(url, { method: "HEAD" })
      .then((res) => {
        const len = res.ok ? +res.headers.get("content-length") : NaN;
        const txt = fmtBytes(len);
        if (txt) el.textContent = " · " + txt;
      })
      .catch(() => {
        /* size is a nicety — a failed probe just leaves it blank */
      }),
  );
  pumpProbeQueue();
}

