// Asset Studio bearer token (F-174). Same source as
// ~/asset-studio-private/atlas-3d-plan/atlas_char/batch.py token(): STUDIO_TOKEN, else a dev token
// minted from the local orbstack cluster's JWT secret by asset-studio/scripts/dev-token.mjs.
// Never prints the token. Returns null when neither route works.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function studioToken({ env = process.env, run = spawnSync } = {}) {
  if (env.STUDIO_TOKEN) return env.STUDIO_TOKEN;
  try {
    const k = ["--context", "orbstack", "-n", "asset-studio"];
    const opt = { encoding: "utf8", timeout: 20000 }; // a wedged cluster must not hang Gate 1
    const sec = run("kubectl", [...k, "get", "secret", "asset-studio-secret", "-o", "json"], opt);
    const cm = run("kubectl", [...k, "get", "configmap", "asset-studio-config", "-o", "json"], opt);
    if (sec.status !== 0 || cm.status !== 0) return null;
    const jwt = Buffer.from(JSON.parse(sec.stdout).data.JWT_SECRET_KEY, "base64").toString("utf8");
    const email = JSON.parse(cm.stdout).data.OWNER_EMAILS.split(",")[0].trim();
    const script = join(homedir(), "workspace/repos/asset-studio/scripts/dev-token.mjs");
    const r = run("node", [script], { ...opt, env: { ...env, JWT_SECRET_KEY: jwt, OWNER_EMAIL: email } });
    const tok = (r.stdout ?? "").trim();
    return r.status === 0 && tok ? tok : null;
  } catch {
    return null;
  }
}
