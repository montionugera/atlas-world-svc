import { spawn } from "node:child_process";
import readline from "node:readline";

const FIRST_TOOL_ERR = /^(generate-world|promote-world|render-sheet|spine-emit|render-lock|check_content|map-builder): /;

export function createRunner({ killGraceMs = 5000 } = {}) {
  const live = new Map(); // jobId -> { child, cancelled }
  const kill = (entry) => { if (!entry?.child || entry.child.exitCode !== null) return; entry.child.kill("SIGTERM"); setTimeout(() => { if (entry.child.exitCode === null) entry.child.kill("SIGKILL"); }, killGraceMs).unref(); };
  return {
    cancel(jobId) { const e = live.get(jobId); if (!e) return false; e.cancelled = true; kill(e); return true; },
    async run({ job, commands, cwd, timeoutMs, onLine = () => {}, onCommandStart = () => {}, onCommandEnd = () => {} }) {
      const captured = {}; const stderrLines = []; const entry = { child: null, cancelled: false }; live.set(job.id, entry);
      const deadline = Date.now() + timeoutMs; let timedOut = false;
      try {
        for (const cmd of commands) {
          if (entry.cancelled) break;
          captured[cmd.label] = []; onCommandStart(cmd);
          const t0 = Date.now();
          const code = await new Promise((resolve) => {
            const child = spawn(cmd.argv[0], cmd.argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
            entry.child = child;
            const timer = setTimeout(() => { timedOut = true; kill(entry); }, Math.max(0, deadline - Date.now()));
            for (const stream of ["stdout", "stderr"]) readline.createInterface({ input: child[stream] }).on("line", (line) => {
              if (stream === "stdout") captured[cmd.label].push(line); else stderrLines.push(line);
              onLine({ label: cmd.label, stream, line });
            });
            child.on("close", (c, sig) => { clearTimeout(timer); resolve(c ?? (sig ? 128 : 1)); });
            child.on("error", (e) => { clearTimeout(timer); stderrLines.push(String(e.message)); resolve(1); });
          });
          onCommandEnd({ ...cmd, exitCode: code, ms: Date.now() - t0 });
          if (entry.cancelled) return { ok: false, exitCode: code, error: "cancelled", cancelled: true, timedOut: false, captured };
          if (timedOut) return { ok: false, exitCode: code, error: "hung", cancelled: false, timedOut: true, captured };
          if (code !== 0) {
            const error = stderrLines.find((l) => FIRST_TOOL_ERR.test(l)) ?? stderrLines[stderrLines.length - 1] ?? `exit ${code}`;
            return { ok: false, exitCode: code, error, cancelled: false, timedOut: false, captured };
          }
        }
        return { ok: true, exitCode: 0, error: null, cancelled: false, timedOut: false, captured };
      } finally { live.delete(job.id); }
    },
  };
}
