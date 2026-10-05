import { statSync, createReadStream } from "node:fs";
import { normalize, resolve, sep, extname } from "node:path";

const REDIRECT_TARGET = "/atelier/asset-storybook/index.html";

// Small extension map, deliberately not exhaustive — anything outside it
// falls back to application/octet-stream. .json/.mjs are the two the
// storybook regenerates on every build, so they never get cached (mirrors
// k8s/local/storybook-nginx.conf's `location ~ \.(json|mjs)$`).
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".css": "text/css",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".ts": "text/plain",
};
const NO_STORE = new Set([".json", ".mjs"]);

const notFound = (res) => { res.writeHead(404); res.end(); return true; };

export function createStaticHandler({ root: rawRoot }) {
  // resolve() once here: a trailing slash or relative --repo-root makes the
  // "starts with root + sep" prefix check below fail for every request,
  // 404ing the whole storybook while /healthz still answers (fix round 1, F5).
  const root = resolve(rawRoot);
  return (req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0];

    if (urlPath === "/") {
      res.writeHead(302, { Location: REDIRECT_TARGET });
      res.end();
      return true;
    }
    if (urlPath === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return true;
    }

    let decoded;
    try { decoded = decodeURIComponent(urlPath); } catch { return notFound(res); }
    const normalised = normalize(decoded);
    // decoded always starts with "/" (it came off req.url), so normalize can
    // never leave the path rooted above "/" — but the prefix check below is
    // the real guard: it is what actually refuses anything that ends up
    // outside `root`, independent of how normalize behaves on a given input.
    const full = resolve(root, "." + normalised);
    if (!(full === root || full.startsWith(root + sep))) return notFound(res);

    // Single try/catch around the stat (fix round 1, F1/I3): existsSync+statSync
    // was a TOCTOU — a file removed between the two calls threw synchronously,
    // which is an uncaught exception here (this handler runs outside the
    // router's promise wrapper) and takes the whole service down.
    let stat;
    try { stat = statSync(full); } catch { return notFound(res); }
    if (!stat.isFile()) return notFound(res); // rejects directories, FIFOs, sockets

    const ext = extname(full);
    const headers = { "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" };
    if (NO_STORE.has(ext)) headers["Cache-Control"] = "no-store";

    // Headers are only written once the stream has actually opened, so an
    // open failure after a clean stat (mode 000, EPERM, removed mid-race with
    // a DELETE) still reaches the client as a plain 404 instead of an
    // unhandled 'error' event on the read stream crashing the process.
    const stream = createReadStream(full);
    stream.once("open", () => { res.writeHead(200, headers); stream.pipe(res); });
    stream.on("error", () => { if (!res.headersSent) notFound(res); else res.destroy(); });
    return true;
  };
}
