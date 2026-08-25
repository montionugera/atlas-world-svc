import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function rebuildIndex(runsDir) {
  const briefs = readdirSync(runsDir)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  const index = { v: 1, briefs };
  writeFileSync(join(runsDir, "_index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rebuildIndex(fileURLToPath(new URL("./runs/", import.meta.url)));
  console.log("runs/_index.json rebuilt");
}
