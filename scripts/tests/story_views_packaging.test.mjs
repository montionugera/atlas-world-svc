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
