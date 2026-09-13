import { existsSync, statSync, createReadStream } from "node:fs";
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

export function createStaticHandler({ root }) {
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
    if (!existsSync(full)) return notFound(res);

    const stat = statSync(full);
    if (stat.isDirectory()) return notFound(res);

    const ext = extname(full);
    const headers = { "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" };
    if (NO_STORE.has(ext)) headers["Cache-Control"] = "no-store";
    res.writeHead(200, headers);
    createReadStream(full).pipe(res);
    return true;
  };
}
