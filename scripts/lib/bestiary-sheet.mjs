// G-BESTIARY-SHEET (F-031) — a character sheet whose `id` is a real bestiary
// design id must mirror that design.
//
// This generalises the single binding test F-030 added for the Thorncrown
// Drake. The join itself needs no new file or schema field: a sheet's `id` IS
// the bestiary design id (and the filename slug, already enforced), and its
// `assetKey` is `mob:<mobTypeId>`. What was missing was anything stopping the
// two drifting apart afterwards.
//
// The four enums are identical vocabularies by construction — character.schema
// .json and the bestiary roster use the same values — so any difference is a
// bug, not a modelling choice.
//
// Element is compared against the RUNTIME config rather than the sheet, because
// the sheet has nowhere to record it: character.schema.json is
// `additionalProperties: false`. The runtime value arrives via the codegen
// artifact's `elements` map (mob-types.json v2), since a .mjs gate cannot
// import TypeScript.
//
// Lives in scripts/lib/ because check_content.mjs ends with a bare main() +
// process.exit(): importing it from a test would run the whole gate and kill
// the test process. Same pattern as lib/story.mjs and lib/season1.mjs.

const MIRRORED_ENUMS = ["archetype", "durability", "speed", "threat"];

/**
 * @param {{id: string, assetKey?: string, stats?: Record<string, string>}} sheet
 *   Parsed frontmatter of a content/characters/*.md file.
 * @param {Record<string, string>} row  The matching bestiary.json record.
 * @param {Record<string, string>} elementByMobType
 *   `elements` from colyseus-server/generated/mob-types.json. A mob ABSENT
 *   from this map is neutral — that is the encoding, not an omission.
 * @param {(msg: string) => void} failFn
 */
export function checkBestiarySheet(sheet, row, elementByMobType, failFn) {
  const label = `characters/${sheet.id}.md`;

  for (const field of MIRRORED_ENUMS) {
    if (sheet.stats?.[field] !== row[field])
      failFn(
        `G-BESTIARY-SHEET: ${label} stats.${field} "${sheet.stats?.[field]}" ` +
          `!= bestiary row "${row[field]}"`,
      );
  }

  // Only mob:* sheets have a MobTypeConfig behind them; npc:* and player:*
  // sheets legitimately do not.
  const mobId = sheet.assetKey?.startsWith("mob:") ? sheet.assetKey.slice(4) : null;
  if (mobId) {
    const runtime = elementByMobType[mobId] ?? "neutral";
    const expected = row.element ?? "neutral";
    if (runtime !== expected)
      failFn(
        `G-BESTIARY-SHEET: ${label} runtime element "${runtime}" != bestiary row element ` +
          `"${expected}" (MobTypeConfig for "${mobId}")`,
      );
  }
}
