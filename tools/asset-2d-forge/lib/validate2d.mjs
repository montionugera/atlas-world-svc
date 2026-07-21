// Render-spec-driven validator for the 2D-asset intake tool.
//
// This is deliberately NOT tools/asset-forge/validate.mjs — that validator is
// gltf/glb-only (it opens the binary, walks meshes/skins/animations, enforces
// bone/height rules). A 2D PNG has none of that structure. What a 2D intake
// MUST instead guarantee is that the CALL supplies every field the chosen
// render-type declares in render-spec.json AND satisfies the same license +
// file-extension rules the gate enforces, so the entry it lands satisfies the
// SAME contract scripts/check_asset_manifest.mjs enforces on the committed
// manifest. If a call passes here, the standing gate accepts the resulting
// entry — the two can never disagree because they read the same render-spec
// AND reuse the gate's own license checker (checkLicensePolicy).
//
// Guards (all driven entirely by render-spec.json — no hard-coded field list):
//   (1) render must exist in spec.renderers.
//   (2) render must be one of the 2D PNG renderers this tool handles
//       (SUBDIRS keys) — a model3d/audio/font call is refused.
//   (3) every field in renderers[render].require must be non-empty on the
//       assembled entry (e.g. tileset → tileSize, ninepatch → patchMargins).
//   (4) `oneOf` field-groups (spritesheet: frame+frames | atlas |
//       frame+animations) — exactly one group must be fully present.
//   (5) the path field's extension must be in renderers[render].exts —
//       mirrors the gate's guard (B) ext check.
//   (6) tiered license policy — REUSES the gate's own checkLicensePolicy so a
//       disallowed license (e.g. "MIT") or a CC-BY missing attribution fails
//       here exactly as it would at the gate. No duplicated CC0/CC-BY logic.

import { checkLicensePolicy } from "../../../scripts/lib/license-policy.mjs";

// Subdir under game-client/assets/ each 2D render-type lands in. The KEY SET
// here is also the tool's allowlist of "real 2D renderers" — anything not
// listed is refused by guard (2).
export const SUBDIRS = Object.freeze({
  image: "icons",
  ninepatch: "ui",
  tileset: "tiles",
  spritesheet: "vfx",
});

// A field counts as empty for require/oneOf purposes if it is missing, blank,
// or an empty object/array. Mirrors isEmptyField in check_asset_manifest.mjs
// so the intake and the gate agree on "present".
export function isEmptyField(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/**
 * Validate that `entry` satisfies render-spec's contract for `render`.
 * @param {{render: string, spec: object, entry: object, key?: string}} args
 * @returns {{failures: string[]}}
 */
export function validate2d({ render, spec, entry, key = entry?.scene }) {
  const failures = [];

  // (2) 2D-renderer allowlist — refuse non-2D render types up front.
  if (!(render in SUBDIRS)) {
    failures.push(
      `render "${render}" is not a 2D renderer handled by this tool ` +
        `(expected one of: ${Object.keys(SUBDIRS).join(", ")})`,
    );
    return { failures };
  }

  // (1) render must be a real renderer in the spec.
  const r = spec.renderers?.[render];
  if (!r) {
    failures.push(`render "${render}" not found in render-spec.json renderers`);
    return { failures };
  }

  // (3) required fields.
  for (const f of r.require ?? []) {
    if (isEmptyField(entry[f])) {
      failures.push(`render "${render}": required field "${f}" is missing/empty`);
    }
  }

  // (4) oneOf field-groups — exactly one group fully present.
  for (const groups of r.oneOf ? [r.oneOf] : []) {
    const present = groups.filter((g) => g.every((k) => !isEmptyField(entry[k])));
    if (present.length !== 1) {
      failures.push(
        `render "${render}": needs exactly one of ${JSON.stringify(groups)} ` +
          `(got ${present.length})`,
      );
    }
  }

  // (5) file-extension allowlist — mirror the gate's guard (B). The path field
  // (scene) carries the source basename, so its extension is the src file's
  // extension. A .gif for render=image (or any ext ∉ r.exts) fails here just
  // as it would at the gate, instead of being caught only after the copy.
  const pathVal = entry[r.pathField];
  if (typeof pathVal === "string" && Array.isArray(r.exts)) {
    const dot = pathVal.lastIndexOf(".");
    const ext = dot === -1 ? "" : pathVal.slice(dot).toLowerCase();
    if (!r.exts.includes(ext)) {
      failures.push(
        `render "${render}": extension "${ext || "(none)"}" not allowed — ` +
          `allowed: ${JSON.stringify(r.exts)}`,
      );
    }
  }

  // (6) tiered license policy — REUSE the gate's own checker (same allowed set
  // + CC-BY attribution rule). Never duplicate the CC0/CC-BY logic here.
  checkLicensePolicy(key, entry, failures);

  return { failures };
}
