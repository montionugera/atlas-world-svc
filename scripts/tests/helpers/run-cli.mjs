// Shared shape for "run a gate CLI as a child process and capture whether it
// failed" — scripts/tests/render-lock.test.mjs and
// scripts/tests/geometry-lock.test.mjs each hand-rolled this identically
// (down to the stdio array), one copy per file. One helper, imported by both,
// so the shape can't quietly drift between them.
import { execFileSync } from "node:child_process";

export function runCli(cli, args) {
  try {
    return {
      failed: false,
      out: execFileSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { failed: true, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
