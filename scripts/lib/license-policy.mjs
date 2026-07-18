// Tiered license policy for the asset drift-gate (F-A).
// CC0 and CC-BY-4.0 are the only accepted licenses; CC-BY additionally
// requires attribution (non-empty source + author) so a credits screen
// can be generated mechanically later. Empty license is NOT this module's
// concern — the render-spec `require` list already fails an empty license.
const ALLOWED = new Set(["CC0", "CC-BY-4.0"]);

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export function checkLicensePolicy(id, entry, failures) {
  const lic = typeof entry.license === "string" ? entry.license.trim() : "";
  if (lic === "") return; // presence is enforced elsewhere
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
