// server-rs embeds repo files with include_str!, so each one must reach the
// image build through BOTH the .dockerignore whitelist and a Dockerfile COPY.
// cargo test runs outside Docker and cannot see a gap here: content/dungeons was
// missing from both for a day, and only the local image build failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "server-rs/src");

function embeddedDirs() {
  const dirs = new Set();
  for (const entry of readdirSync(SRC, { recursive: true })) {
    if (!String(entry).endsWith(".rs")) continue;
    // Test modules sit at the end of a file and do not compile in the image.
    const production = readFileSync(join(SRC, entry), "utf8").split(
      "#[cfg(test)]",
    )[0];
    for (const [, path] of production.matchAll(
      /include_(?:str|bytes)!\(\s*"((?:\.\.\/)+[^"]+)"/g,
    )) {
      const clean = path.replace(/^(\.\.\/)+/, "").split("/");
      dirs.add(clean.slice(0, 2).join("/"));
    }
  }
  return [...dirs].sort();
}

test("finds the embedded content directories", () => {
  assert.ok(embeddedDirs().includes("content/dungeons"));
  assert.ok(!embeddedDirs().some((d) => d.startsWith("client/")));
});

test("every embedded directory is in the server-rs image build context", () => {
  const ignore = readFileSync(join(ROOT, ".dockerignore"), "utf8");
  const docker = readFileSync(join(ROOT, "server-rs/Dockerfile"), "utf8");
  for (const dir of embeddedDirs()) {
    const allowed = [dir, dir.split("/")[0]].some((d) =>
      ignore.includes(`!${d}/**`),
    );
    assert.ok(allowed, `.dockerignore lacks !${dir}/**`);
    assert.ok(
      docker.includes(`COPY ${dir} /usr/src/${dir}`),
      `Dockerfile lacks COPY ${dir}`,
    );
  }
});
