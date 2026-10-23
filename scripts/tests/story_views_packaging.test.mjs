// Guards the story registry against the web surface that serves it.
//
// The story panel (atelier/asset-storybook/js/panels/story.mjs) iframes the pages named in
// atelier/asset-storybook/story-views.json, resolved to root-absolute URLs. atlas-world
// (scripts/catalog_explorer_web.py) only serves repo paths on the static-mount allowlist in
// scripts/atlas_world_web/static_mounts.py. A registry entry whose page is not mounted still
// works under any dev server that serves the whole repo, and silently 404s in the iframe on the
// real surface. This asks the real `safe_resolve` — not a copy of its allowlist — so the mistake
// fails in CI instead. (It replaces the retired storybook Dockerfile COPY/.dockerignore check.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STORYBOOK_DIR = join(ROOT, "atelier/asset-storybook");
const REGISTRY = join(STORYBOOK_DIR, "story-views.json");
const STORY_VIEWS_URL = "/atelier/asset-storybook/story-views.json"; // SB_BASE + "story-views.json" in state.mjs

// URL path -> served file path, or null, exactly as the server decides it.
function resolveMounted(urlPaths) {
  const code = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[1])",
    "from atlas_world_web import static_mounts",
    "out = {}",
    "for p in json.loads(sys.argv[2]):",
    "    r = static_mounts.safe_resolve(p)",
    "    out[p] = str(r) if r else None",
    "print(json.dumps(out))",
  ].join("\n");
  const raw = execFileSync("python3", ["-I", "-c", code, join(ROOT, "scripts"), JSON.stringify(urlPaths)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(raw);
}

// What story.mjs does with a registry `src`: new URL(src, new URL(STORY_VIEWS_URL, page)).pathname
const urlPathOf = (src) => new URL(src, new URL(STORY_VIEWS_URL, "http://x")).pathname;

test("every story-views.json src exists on disk", () => {
  const views = JSON.parse(readFileSync(REGISTRY, "utf8"));
  assert.ok(Array.isArray(views) && views.length > 0, "registry must be a non-empty array");
  for (const view of views) {
    const abs = resolve(STORYBOOK_DIR, view.src);
    assert.ok(existsSync(abs), `story view "${view.id}" points at a missing file: ${view.src}`);
  }
});

test("every story-views.json src is served by the atlas-world static-mount allowlist", () => {
  const views = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const urls = views.map((v) => urlPathOf(v.src));
  const served = resolveMounted(urls);
  for (const [i, view] of views.entries()) {
    assert.ok(
      served[urls[i]],
      `story view "${view.id}" (${urls[i]}) is not served by scripts/atlas_world_web/static_mounts.py — its iframe would 404 on atlas-world`,
    );
    assert.equal(
      served[urls[i]],
      resolve(STORYBOOK_DIR, view.src),
      `story view "${view.id}" resolves to a different file than its registry src`,
    );
  }
});

// content/story/*.json is not a registry `src` — it is a runtime data dependency the "reader" and
// "graph" pages fetch after they load (atelier/story-explorer/reader.html and index.html both
// fetch ../../content/story/<file>). The walk above only checks registry `src` paths, so it can
// never catch a dropped content/story mount — that break stays green here while the iframes
// render empty. Assert it directly, using a file that really exists.
test("content/story (the reader/graph pages' runtime data fetch) is served by the allowlist", () => {
  const sample = "acts.json"; // a committed content/story file the reader/graph pages load
  const url = `/content/story/${sample}`;
  assert.ok(existsSync(join(ROOT, "content/story", sample)), `fixture ${url} missing on disk`);
  const served = resolveMounted([url]);
  assert.ok(
    served[url],
    `${url} is not served by static_mounts.py — the "reader" and "graph" views fetch content/story/*.json at runtime and would render empty`,
  );
});

test("the allowlist stays a deny-by-default door (a sibling of a mounted dir is not served)", () => {
  const served = resolveMounted(["/atelier/story-explorer/../../.git/config", "/docs/story/undertow-private/x.html"]);
  assert.equal(served["/atelier/story-explorer/../../.git/config"], null);
  assert.equal(served["/docs/story/undertow-private/x.html"], null);
});
