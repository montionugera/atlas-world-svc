// Tiered license policy for the asset drift-gate (F-A).
// Accepted licenses: CC0 and CC-BY (3.0 or 4.0). Any CC-BY additionally
// requires attribution (non-empty source + author) so a credits screen
// can be generated mechanically later. CC-BY-3.0 was added when the CC0-only
// 3D character supply proved too thin (Poly Pizza's fantasy humanoids are
// overwhelmingly CC-BY-3.0 Google-Poly imports). Empty license is NOT this
// module's concern — the render-spec `require` list already fails an empty
// license. Non-commercial / share-alike variants (CC-BY-NC, CC-BY-SA) and
// anything else remain a hard failure. `studio-private` (F-174) is pull-only.
import { hasPullBlock, isPullOnly } from "./pull-entry.mjs";

const ALLOWED = new Set(["CC0", "CC-BY-4.0", "CC-BY-3.0"]);

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export function checkLicensePolicy(id, entry, failures) {
  const raw = entry.license;
  if (raw === undefined || raw === null) return; // absent — presence enforced elsewhere
  if (typeof raw !== "string") {
    failures.push(`entry "${id}": license must be a string (got ${typeof raw})`);
    return;
  }
  const lic = raw.trim();
  if (lic === "") return; // blank string — presence enforced elsewhere
  // F-174: an owner-generated Asset Studio asset is not CC0. It is "studio-private" and may only
  // appear on a pull-only entry, whose bytes are never committed to this public repo.
  // Two-way: a pull-only entry (any entry with a pull block) MUST be studio-private, never CC0/CC-BY.
  if (hasPullBlock(entry) && lic !== "studio-private") {
    failures.push(`entry "${id}": a pull-only entry must have license studio-private (got "${lic}") — an owner-generated asset is never public, never CC0`);
    return;
  }
  if (lic === "studio-private") {
    if (!isPullOnly(entry)) {
      failures.push(`entry "${id}": license studio-private is allowed only for pull-only entries (pull{assetStudioAsset, tag, sha256} + scene res://studio-cache/<sha256>.glb)`);
    }
    return;
  }
  if (!ALLOWED.has(lic)) {
    failures.push(
      `entry "${id}": license "${lic}" not allowed — must be one of ${[...ALLOWED].join(", ")}`,
    );
    return;
  }
  if (lic.startsWith("CC-BY")) {
    for (const f of ["source", "author"]) {
      if (isEmpty(entry[f])) {
        failures.push(`entry "${id}": CC-BY requires non-empty "${f}"`);
      }
    }
  }
}
