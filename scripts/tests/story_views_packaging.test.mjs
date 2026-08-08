// Guards the storybook's story registry against its Docker packaging.
//
// tools/asset-storybook/Dockerfile.dockerignore is a `*`-then-allowlist, and
// its own header says to keep it in sync with the Dockerfile's COPY lines. A
// registry entry pointing at a path that is copied but not allowlisted (or
// neither) still works in local dev — which serves the repo root directly —
// and silently renders an empty section in the container. This test makes that
// mistake fail in CI instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STORYBOOK_DIR = join(ROOT, "tools/asset-storybook");
const REGISTRY = join(STORYBOOK_DIR, "story-views.json");
const DOCKERFILE = join(STORYBOOK_DIR, "Dockerfile");
const DOCKERIGNORE = join(STORYBOOK_DIR, "Dockerfile.dockerignore");

// A COPY/allowlist line covers a path when it names that path or any ancestor
// directory of it — `COPY content/story content/story` covers
// `content/story/quests.json`.
function coveredBy(lines, repoRelPath) {
  return lines.some((covered) => {
    const rel = relative(covered, repoRelPath);
    return rel === "" || !rel.startsWith("..");
  });
}

function copyPaths() {
  return readFileSync(DOCKERFILE, "utf8")
    .split("\n")
    .filter((l) => l.trim().startsWith("COPY "))
    .map((l) => l.trim().split(/\s+/)[1]);
}

function allowlistPaths() {
  return readFileSync(DOCKERIGNORE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1).replace(/\/\*\*$/, "").replace(/\/$/, ""));
}

test("every story-views.json src exists on disk", () => {
  const views = JSON.parse(readFileSync(REGISTRY, "utf8"));
  assert.ok(Array.isArray(views) && views.length > 0, "registry must be a non-empty array");
  for (const view of views) {
    const abs = resolve(STORYBOOK_DIR, view.src);
    assert.ok(existsSync(abs), `story view "${view.id}" points at a missing file: ${view.src}`);
  }
});

test("every story-views.json src is packaged into the storybook image", () => {
  const views = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const copies = copyPaths();
  const allowed = allowlistPaths();
  for (const view of views) {
    const repoRel = relative(ROOT, resolve(STORYBOOK_DIR, view.src));
    assert.ok(
      coveredBy(copies, repoRel),
      `story view "${view.id}" (${repoRel}) has no COPY line in tools/asset-storybook/Dockerfile`,
    );
    assert.ok(
      coveredBy(allowed, repoRel),
      `story view "${view.id}" (${repoRel}) has no "!" allowlist line in tools/asset-storybook/Dockerfile.dockerignore`,
    );
  }
});

// content/story/*.json is not a registry `src` — it's a runtime data dependency
// that the "reader" and "graph" registry entries fetch after they load (see
// tools/story-explorer/reader.html and index.html, both of which
// `fetch("../../content/story/${filename}")`). The walk above only ever checks
// registry `src` paths, so it can never catch a dropped `content/story` COPY or
// allowlist line — that class of break stays green in this suite while the
// shipped pages 404 on their data fetch and render empty. Assert it directly.
test("content/story (the reader/graph pages' runtime data fetch) is packaged into the storybook image", () => {
  const copies = copyPaths();
  const allowed = allowlistPaths();
  assert.ok(
    coveredBy(copies, "content/story"),
    'content/story has no COPY line in tools/asset-storybook/Dockerfile — the "reader" and "graph" views fetch content/story/*.json at runtime and would render empty',
  );
  assert.ok(
    coveredBy(allowed, "content/story"),
    'content/story has no "!" allowlist line in tools/asset-storybook/Dockerfile.dockerignore — the "reader" and "graph" views fetch content/story/*.json at runtime and would render empty',
  );
});
