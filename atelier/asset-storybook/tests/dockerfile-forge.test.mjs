// F-053 Phase 1 — C2.8: the Forge tab fetches atelier/art-forge/runs/ and
// briefs/, but the storybook image never copied them, so the deployed page
// could only ever say "not packaged in this image". Every directory the Forge
// tab fetches needs BOTH a COPY line and a "!" whitelist line (BuildKit uses
// Dockerfile.dockerignore, a "*"-first whitelist).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNS_BASE_URL, BRIEFS_BASE_URL } from "../js/state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(join(HERE, "..", "Dockerfile"), "utf8");
const dockerignore = readFileSync(join(HERE, "..", "Dockerfile.dockerignore"), "utf8");

// "../../atelier/art-forge/runs/" (relative to atelier/asset-storybook/) -> "atelier/art-forge/runs"
const repoPath = (url) => url.replace(/^(\.\.\/)+/, "").replace(/\/$/, "");

test("every Forge fetch directory is COPYed into the image and whitelisted in Dockerfile.dockerignore", () => {
  for (const dir of [repoPath(RUNS_BASE_URL), repoPath(BRIEFS_BASE_URL)]) {
    assert.match(dockerfile, new RegExp(`^COPY ${dir} ${dir}$`, "m"), `Dockerfile lacks: COPY ${dir} ${dir}`);
    assert.match(dockerignore, new RegExp(`^!${dir}/\\*\\*$`, "m"), `Dockerfile.dockerignore lacks: !${dir}/**`);
  }
});
