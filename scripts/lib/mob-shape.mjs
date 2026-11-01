// F-167 G-MOB-SHAPE: the rules for "upright monster" rows and boss-name filler.
// Pure: no file reads. `atlas` is the parsed t_shaped_world_atlas.json, `picks`
// the parsed content/studio/mob_body_plan_picks.json. Each problem is one string
// that starts with a rule code and names the row key (`dungeon_id/floor_id/index`).
// Each rule sits between RULE n / END RULE n markers so a mutation run can
// delete one block at a time and see its own test fail.

export const TIER_RANGES = {
  Monster: [8, 12],
  "Mini-Boss": [18, 22],
  Raid: [24, 28],
  MVP: [31, 35],
};
const TIERS = Object.keys(TIER_RANGES);

export const PLAYABLE_RACES = ["human_demi_human", "lunar", "ogre_orc", "dwarf", "dark_lunar", "furral"];
export const BODY_KIN_RACE = {
  scale_kin: "beast_animal_brute",
  hound_kin: "beast_animal_brute",
  boar_kin: "beast_animal_brute",
  mantis_kin: "insect_arachnia",
  beetle_kin: "insect_arachnia",
  tide_kin: "fish",
  bark_kin: "plant",
  bone_kin: "undead",
};
export const NPC_FROZEN = 29001;
const NON_UPRIGHT_RE = /\b(worm|slime|vine|ooze)s?\b/i;

// Identical to FILLER_RE_SOURCE in scripts/mob_body_plan_pass.py (59 / 61 / 60 boss rows today).
export const FILLER_RE = new RegExp(
  String.raw`^(?:\[Mini-Boss\] )?(?:B\d+|\d+F) .+ Overseer$` +
    String.raw`|^(?:\[Raid Boss\] )?(?:.+ )?Seal Warden$` +
    String.raw`|^(?:\[MVP\] )?(?:.+ Apostle Sovereign|Apostle Vanguard Manifestation)$` +
    String.raw`|^Mini-Boss · (?:B\d+|\d+F) (?:Keeper|Overseer)$`,
  "s",
);
const TAIL_RE = / \([^()]*\)$/;
const PREFIX_RE = /^\[[^\]]+\] /;
const stripPrefix = (n) => n.replace(PREFIX_RE, "");

/** Every boss-name reading of a highlight "head · name (Tier)"; a name may itself hold " · ". */
function highlightNames(s) {
  const t = TAIL_RE.exec(s);
  const body = t ? s.slice(0, t.index) : s;
  const cuts = [0];
  for (let i = body.indexOf(" · "); i !== -1; i = body.indexOf(" · ", i + 1)) cuts.push(i + 3);
  return cuts.map((c) => body.slice(c)).filter(Boolean);
}

export function tierOf(row) {
  if (row.entity_type === "RaidBoss") return "Raid";
  return TIERS.includes(row.entity_type) ? row.entity_type : null;
}

export function isTagged(row) {
  return row.body_plan === "upright_monster";
}

/** Filler test for a string, also looking inside a floor highlight's "head · name (Tier)". */
export function isFiller(s) {
  if (typeof s !== "string") return false;
  if (FILLER_RE.test(s)) return true;
  return highlightNames(s).some((n) => n !== s && FILLER_RE.test(n));
}

function* dungeonRows(atlas) {
  for (const d of atlas.multi_floor_dungeons ?? []) {
    for (const f of d.floors ?? []) {
      for (const [i, row] of (f.spawns ?? []).entries()) {
        yield { key: `${d.dungeon_id}/${f.floor_id}/${i}`, dungeon: d.dungeon_id, floor: f, row };
      }
    }
  }
}

function* walkStrings(node, path = "") {
  if (typeof node === "string") yield [path, node];
  else if (Array.isArray(node)) for (const [i, v] of node.entries()) yield* walkStrings(v, `${path}[${i}]`);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) yield* walkStrings(v, path ? `${path}.${k}` : k);
}

function steppeDungeons(atlas) {
  const steppe = new Set(
    (atlas.t_breadth_continents ?? [])
      .filter((c) => String(c.name ?? "").startsWith("The Clockwork Steppe"))
      .map((c) => c.continent_id),
  );
  const zoneContinent = new Map();
  for (const group of Object.values(atlas.t_breadth_zone_directory ?? {})) {
    if (Array.isArray(group)) for (const z of group) zoneContinent.set(z.zone_id, z.continent_id);
  }
  return new Set((atlas.multi_floor_dungeons ?? []).map((d) => d.dungeon_id).filter((id) => steppe.has(zoneContinent.get(id))));
}

/** Tagged rows per tier. */
export function tierCounts(atlas) {
  const counts = { Monster: 0, "Mini-Boss": 0, Raid: 0, MVP: 0 };
  for (const { row } of dungeonRows(atlas)) {
    const t = tierOf(row);
    if (t && isTagged(row)) counts[t] += 1;
  }
  return counts;
}

export function checkMobShape(atlas, picks) {
  const problems = [];
  const rows = [...dungeonRows(atlas)];
  const steppe = steppeDungeons(atlas);
  const keepRobotic = new Set(picks?.keep_robotic ?? []);

  // RULE 1 tier-range
  const counts = tierCounts(atlas);
  for (const t of TIERS) {
    const [lo, hi] = TIER_RANGES[t];
    if (counts[t] < lo || counts[t] > hi) {
      problems.push(`tier-range: ${t} has ${counts[t]} tagged rows, range is ${lo}-${hi}`);
    }
  }
  // END RULE 1

  // RULE 2 playable-or-robotic
  for (const { key, row } of rows) {
    if (isTagged(row) && (PLAYABLE_RACES.includes(row.race_key) || row.race_key === "robotic")) {
      problems.push(`playable-or-robotic: ${key} is tagged but race_key is ${row.race_key}`);
    }
  }
  // END RULE 2

  // RULE 3 frozen-29001
  for (const { key, row } of rows) {
    if (isTagged(row) && row.npc_id === NPC_FROZEN) {
      problems.push(`frozen-29001: ${key} has npc_id ${NPC_FROZEN} and must not be tagged`);
    }
  }
  // END RULE 3

  // RULE 4 picks-mismatch
  {
    const pickTags = new Map((picks?.entries ?? []).filter((e) => e.body_kin).map((e) => [e.row, e]));
    const seen = new Set();
    for (const { key, row } of rows) {
      seen.add(key);
      const p = pickTags.get(key);
      if (isTagged(row) && !p) {
        problems.push(`picks-mismatch: ${key} is tagged in the atlas but has no tagged picks entry`);
      } else if (!isTagged(row) && p) {
        problems.push(`picks-mismatch: ${key} has a tagged picks entry but is not tagged in the atlas`);
      } else if (!isTagged(row) && (row.body_plan !== undefined || row.body_kin !== undefined)) {
        problems.push(`picks-mismatch: ${key} has shape fields but is not an upright_monster row`);
      } else if (p && (p.body_kin !== row.body_kin || p.race_key !== row.race_key)) {
        problems.push(`picks-mismatch: ${key} differs from picks (${row.race_key}/${row.body_kin} vs ${p.race_key}/${p.body_kin})`);
      }
    }
    for (const k of pickTags.keys()) {
      if (!seen.has(k)) problems.push(`picks-mismatch: ${k} is in picks but is not a row in the atlas`);
    }
  }
  // END RULE 4

  // RULE 5 non-upright-word
  for (const { key, row } of rows) {
    if (isTagged(row) && NON_UPRIGHT_RE.test(row.name ?? "")) {
      problems.push(`non-upright-word: ${key} is tagged but its name "${row.name}" is not an upright shape`);
    }
  }
  // END RULE 5

  // RULE 6 filler-name
  for (const d of atlas.multi_floor_dungeons ?? []) {
    const { floors, ...dungeonRest } = d;
    for (const [path, str] of walkStrings(dungeonRest)) {
      if (isFiller(str)) problems.push(`filler-name: ${d.dungeon_id} ${path} is filler: ${str}`);
    }
    for (const f of floors ?? []) {
      const { spawns, ...rest } = f;
      for (const [path, str] of walkStrings(rest)) {
        if (isFiller(str)) problems.push(`filler-name: ${d.dungeon_id}/${f.floor_id} ${path} is filler: ${str}`);
      }
      for (const [i, row] of (spawns ?? []).entries()) {
        for (const [path, str] of walkStrings(row)) {
          if (isFiller(str)) problems.push(`filler-name: ${d.dungeon_id}/${f.floor_id}/${i} ${path} is filler: ${str}`);
        }
      }
    }
  }
  for (const [i, b] of (atlas.world_boss_spawn_radar ?? []).entries()) {
    if (isFiller(b.boss_name)) {
      problems.push(`filler-name: world_boss_spawn_radar[${i}] (${b.dungeon_id}/${b.floor_id}) boss_name is filler: ${b.boss_name}`);
    }
  }
  // END RULE 6

  // RULE 7 duplicate-boss-name
  {
    const byName = new Map();
    for (const { key, row } of rows) {
      const t = tierOf(row);
      if (t && t !== "Monster") byName.set(row.name, [...(byName.get(row.name) ?? []), key]);
    }
    for (const [name, keys] of byName) {
      if (keys.length > 1) problems.push(`duplicate-boss-name: "${name}" is shared by ${keys.join(", ")}`);
    }
  }
  // END RULE 7

  // RULE 8 robotic-off-steppe
  for (const { key, dungeon, row } of rows) {
    const t = tierOf(row);
    if (t && t !== "Monster" && row.race_key === "robotic" && !steppe.has(dungeon) && !keepRobotic.has(key)) {
      problems.push(`robotic-off-steppe: ${key} is a robotic boss row off the Steppe and not on keep_robotic`);
    }
  }
  // END RULE 8

  // RULE 9 kin-race
  for (const { key, row } of rows) {
    if (row.body_kin !== undefined && BODY_KIN_RACE[row.body_kin] !== row.race_key) {
      problems.push(`kin-race: ${key} body_kin ${row.body_kin} needs race_key ${BODY_KIN_RACE[row.body_kin] ?? "(unknown kin)"}, got ${row.race_key}`);
    }
  }
  // END RULE 9

  // RULE 10 steppe-tagged
  for (const { key, dungeon, row } of rows) {
    if (isTagged(row) && steppe.has(dungeon)) {
      problems.push(`steppe-tagged: ${key} is a Steppe row and must keep robotic, untagged`);
    }
  }
  // END RULE 10

  // RULE 11 old-name-remains: picks entries may carry old_name, the name the row had before the pass.
  {
    const scan = [];
    for (const d of atlas.multi_floor_dungeons ?? []) {
      for (const [path, str] of walkStrings(d, d.dungeon_id)) scan.push([path, str]);
    }
    for (const [i, b] of (atlas.world_boss_spawn_radar ?? []).entries()) {
      if (typeof b.boss_name === "string") scan.push([`world_boss_spawn_radar[${i}].boss_name`, b.boss_name]);
    }
    const olds = new Set();
    for (const e of picks?.entries ?? []) {
      if (typeof e.old_name === "string" && e.old_name) {
        olds.add(e.old_name);
        if (stripPrefix(e.old_name)) olds.add(stripPrefix(e.old_name));
      }
    }
    for (const old of olds) {
      for (const [path, str] of scan) {
        if (str.includes(old)) problems.push(`old-name-remains: ${path} still holds renamed old name "${old}": ${str}`);
      }
    }
  }
  // END RULE 11

  return problems;
}
