import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const CHECK_SCRIPT = path.join(ROOT, "scripts/check_atlas_web_image.py");

// Defined once, with its reason, in scripts/check_atlas_web_image.py.
const { dirs, files, absent } = JSON.parse(
  execFileSync("python3", [CHECK_SCRIPT, "--list-mounts"], {
    encoding: "utf8",
  }),
);
const ABSENT_MOUNTS = new Set(absent);

test("every mount is in the image or explained", () => {
  const ignore = read("Dockerfile.atlas-web.dockerignore")
    .split("\n")
    .filter((l) => l.startsWith("!"));
  const allowed = ignore.map((l) => l.slice(1).replace(/\/\*\*$/, ""));
  for (const m of [...dirs, ...files]) {
    if (ABSENT_MOUNTS.has(m)) continue;
    assert.ok(
      allowed.some((a) => m === a || m.startsWith(`${a}/`)),
      `${m} missing from the image`,
    );
  }
});

test("image is read-only and uses its own ignore file", () => {
  const docker = read("Dockerfile.atlas-web");
  assert.match(docker, /ATLAS_READ_ONLY=1/);
  assert.match(docker, /check_atlas_web_image\.py/);
  assert.match(read("Dockerfile.atlas-web.dockerignore"), /^\*$/m);
});

test("the build uses a commit export and stops on failure", () => {
  const sh = read("scripts/build-atlas-web-image.sh");
  assert.match(sh, /set -euo pipefail/);
  assert.match(sh, /git .*archive[^\n]*"\$COMMIT"/);
  assert.doesNotMatch(sh, /archive[^\n]*HEAD/);
  assert.doesNotMatch(sh, /docker build[^\n]*\$REPO_ROOT"?\s*$/m);
});

test("the image runs as nobody", () => {
  assert.match(read("Dockerfile.atlas-web"), /^USER 65534$/m);
});

test("prune only touches commit tags and extraction ignores umask", () => {
  const sh = read("scripts/build-atlas-web-image.sh");
  assert.match(sh, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(sh, /chmod -R a\+rX "\$EXPORT"/);
});

test("the image check fails when a mount is missing from the tree", () => {
  assert.ok(dirs.length > 0 && absent.includes("atelier/art-forge/out"));
  const tree = mkdtempSync(path.join(tmpdir(), "atlas-web-image-"));
  try {
    for (const d of dirs) mkdirSync(path.join(tree, d), { recursive: true });
    for (const f of files) {
      mkdirSync(path.dirname(path.join(tree, f)), { recursive: true });
      writeFileSync(path.join(tree, f), "{}");
    }
    const run = () =>
      spawnSync("python3", [CHECK_SCRIPT, "--mounts-only"], {
        encoding: "utf8",
        env: { ...process.env, ATLAS_WEB_IMAGE_ROOT: tree },
      });
    assert.equal(run().status, 0, "complete tree should pass");
    rmSync(path.join(tree, "atelier/combat-lab"), { recursive: true });
    const bad = run();
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /missing mount: atelier\/combat-lab/);
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
});
