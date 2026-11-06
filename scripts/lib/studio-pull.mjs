// F-174 "pull, don't commit". Owner-generated assets stay in Asset Studio. This repo is public,
// so a manifest entry records only asset id, tag and sha256. The bytes are fetched into the
// gitignored game-client/studio-cache/ and trusted only after they hash to that sha256.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STUDIO_CLIENT = "atlas-world";
export const studioUrl = (env = process.env) =>
  (env.ATLAS_STUDIO_URL || "http://asset-studio.joymify.local.com").replace(/\/$/, "");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const FETCH_MS = 30000; // every Asset Studio request is bounded
const SHA_RE = /^[0-9a-f]{64}$/;
const bad = (msg) => Object.assign(new Error(msg), { bad: true });

export const isSha = (v) => typeof v === "string" && SHA_RE.test(v);

export function isCached(cacheDir, sha256) {
  if (!isSha(sha256)) return false; // never build a path from an unvalidated sha
  const p = join(cacheDir, `${sha256}.glb`);
  return existsSync(p) && hash(readFileSync(p)) === sha256;
}

export function pullEntries(manifest) {
  return Object.entries(manifest?.entries ?? {})
    .filter(([, e]) => e && typeof e.pull === "object" && e.pull !== null)
    .map(([id, e]) => ({ id, assetId: e.pull.assetStudioAsset, tag: e.pull.tag, sha256: e.pull.sha256 }));
}

export async function fetchAssetRecord(assetId, { token, fetchImpl = fetch, baseUrl = studioUrl() }) {
  const res = await fetchImpl(
    `${baseUrl}/v1/library/assets/${encodeURIComponent(assetId)}?clientId=${STUDIO_CLIENT}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_MS) },
  );
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`studio auth failed (http ${res.status}): Asset Studio refused the token; mint a fresh one (STUDIO_TOKEN or the orbstack dev-token route)`), { http: res.status, auth: true });
  }
  if (!res.ok) throw Object.assign(new Error(`asset ${assetId}: http ${res.status}`), { http: res.status });
  let body;
  try { body = await res.json(); } catch { throw bad("bad record: response is not JSON"); }
  return body.asset ?? body;
}

export async function pullAsset({ assetId, sha256: want, cacheDir, token, fetchImpl = fetch, baseUrl = studioUrl(), record = null }) {
  if (!isSha(want)) return { ok: false, failure: `bad record: manifest sha256 is not 64 lowercase hex (asset ${assetId})` };
  const dest = join(cacheDir, `${want}.glb`);
  if (isCached(cacheDir, want)) return { ok: true, path: dest, cached: true };
  if (!token) {
    return { ok: false, unreachable: true, failure: "no Asset Studio token (STUDIO_TOKEN unset and the kubectl route failed)" };
  }
  let bytes;
  try {
    const rec = record ?? (await fetchAssetRecord(assetId, { token, fetchImpl, baseUrl }));
    if (!isSha(rec?.sha256)) throw bad("bad record: record sha256 is not 64 lowercase hex");
    if (rec.sha256 !== want) {
      return { ok: false, failure: `Asset Studio record sha256 ${rec.sha256} != manifest ${want} (asset ${assetId})` };
    }
    if (typeof rec.mediaUrl !== "string" || !rec.mediaUrl) throw bad("bad record: missing mediaUrl");
    const mediaUrl = new URL(rec.mediaUrl, `${baseUrl}/`);
    if (mediaUrl.origin !== new URL(baseUrl).origin) throw bad("bad record: media url off-origin"); // the bearer token never leaves the studio
    const res = await fetchImpl(mediaUrl.href,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_MS) });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(`studio auth failed (http ${res.status}) on the media route`), { http: res.status, auth: true });
    }
    if (!res.ok) throw Object.assign(new Error(`media http ${res.status}`), { http: res.status });
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    // 401/403: the studio is up and refused us. That is a hard FAIL, never "unreachable".
    if (err.bad) return { ok: false, failure: `asset ${assetId}: ${err.message}` };
    if (err.auth) return { ok: false, failure: err.message };
    // Any other 4xx (404: wrong asset id) is a hard failure too.
    if (err.http && err.http < 500) return { ok: false, failure: `asset ${assetId}: ${err.message}` };
    // Network error, AbortSignal timeout, 5xx: unreachable (exit 2; local Gate 1 still FAILS on it).
    return { ok: false, unreachable: true, failure: `Asset Studio unreachable at ${baseUrl} (${err.message})` };
  }
  const got = hash(bytes);
  if (got !== want) return { ok: false, failure: `sha256: ${got} != recorded ${want} (asset ${assetId}); nothing written` };
  mkdirSync(cacheDir, { recursive: true });
  const tmp = `${dest}.${process.pid}.${randomUUID()}.part`;
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, dest);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* never written */ }
    throw err;
  }
  return { ok: true, path: dest, cached: false };
}
