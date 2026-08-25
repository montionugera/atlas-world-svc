import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function rebuildIndex(runsDir) {
  const briefs = readdirSync(runsDir)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  const index = { v: 1, briefs };
  writeFileSync(join(runsDir, "_index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rebuildIndex(new URL("./runs/", import.meta.url).pathname);
  console.log("runs/_index.json rebuilt");
}
