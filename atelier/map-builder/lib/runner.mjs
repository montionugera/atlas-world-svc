import { spawn } from "node:child_process";
import readline from "node:readline";

const FIRST_TOOL_ERR = /^(generate-world|promote-world|render-sheet|spine-emit|render-lock|check_content|map-builder): /;
// An uncaught throw has no tool prefix: Node prints location, source line,
// caret, `Error: …` (or `TypeError [ERR_X]: …`), frames, then a version
// banner — so the `Error:` line is the message, and the LAST line is the one
// line that never is (final review I3).
const ERROR_LINE = /^\w*Error(?: \[\w+\])?: /;
// A failed command's message, in order of preference: the tool's own
// prefixed line, a thrown error's `Error:` line, else the first non-empty
// stderr line (never the last — see ERROR_LINE), else the bare exit code.
function errorMessage(own, code) {
  return own.find((l) => FIRST_TOOL_ERR.test(l)) ?? own.find((l) => ERROR_LINE.test(l)) ?? own.find((l) => l.trim() !== "") ?? `exit ${code}`;
}

export function createRunner({ killGraceMs = 5000 } = {}) {
  const live = new Map(); // jobId -> { child, cancelled }
  const kill = (entry) => { if (!entry?.child || entry.child.exitCode !== null) return; entry.child.kill("SIGTERM"); setTimeout(() => { if (entry.child.exitCode === null) entry.child.kill("SIGKILL"); }, killGraceMs).unref(); };
  return {
    // An in-process fn step (publish's snapshot/restore) cannot be interrupted
    // safely — cancel() while one runs is ignored (returns false) rather than
    // queued up to abort the NEXT step (Task 14 brief).
    cancel(jobId) { const e = live.get(jobId); if (!e || e.inFn) return false; e.cancelled = true; kill(e); return true; },
    async run({ job, commands, cwd, timeoutMs, onLine = () => {}, onCommandStart = () => {}, onCommandEnd = () => {} }) {
      const captured = {}; const stderrLines = []; const entry = { child: null, cancelled: false, inFn: false }; live.set(job.id, entry);
      const deadline = Date.now() + timeoutMs; let timedOut = false;
      try {
        for (const cmd of commands) {
          if (entry.cancelled) break;
          captured[cmd.label] = []; onCommandStart(cmd);
          const t0 = Date.now();
          if (cmd.fn) {
            // In-process step: log() lines are captured and streamed exactly
            // like a child's stdout; a throw is this step's error verbatim.
            const log = (line) => { captured[cmd.label].push(line); onLine({ label: cmd.label, stream: "stdout", line }); };
            let error = null;
            entry.inFn = true;
            try { await cmd.fn({ log }); } catch (e) { error = String(e?.message ?? e); onLine({ label: cmd.label, stream: "stderr", line: error }); } finally { entry.inFn = false; }
            onCommandEnd({ ...cmd, exitCode: error ? 1 : 0, ms: Date.now() - t0, error });
            if (error) return { ok: false, exitCode: 1, error, cancelled: false, timedOut: false, captured };
            continue;
          }
          // Error attribution is per command: a multi-step job (publish) must
          // not blame a later failure on an earlier step's stderr noise.
          const errFrom = stderrLines.length;
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
          if (code !== 0 && !entry.cancelled && !timedOut) {
            const own = stderrLines.slice(errFrom);
            const error = errorMessage(own, code);
            onCommandEnd({ ...cmd, exitCode: code, ms: Date.now() - t0, error });
            return { ok: false, exitCode: code, error, cancelled: false, timedOut: false, captured };
          }
          onCommandEnd({ ...cmd, exitCode: code, ms: Date.now() - t0, error: entry.cancelled ? "cancelled" : timedOut ? "hung" : null });
          if (entry.cancelled) return { ok: false, exitCode: code, error: "cancelled", cancelled: true, timedOut: false, captured };
          if (timedOut) return { ok: false, exitCode: code, error: "hung", cancelled: false, timedOut: true, captured };
        }
        return { ok: true, exitCode: 0, error: null, cancelled: false, timedOut: false, captured };
      } finally { live.delete(job.id); }
    },
  };
}
