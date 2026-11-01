// F-167 Task 2: G-MOB-SHAPE. The fixture is built here; each test breaks one rule and
// asserts a message with that rule's code that names the row key. The last test reads
// the committed atlas and picks file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMobShape, tierCounts, TIER_RANGES, isFiller } from "../lib/mob-shape.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const clone = (x) => JSON.parse(JSON.stringify(x));
const TARGET = { Monster: 10, "Mini-Boss": 20, Raid: 26, MVP: 33 };
const KINS = [
  ["hound_kin", "beast_animal_brute"],
  ["mantis_kin", "insect_arachnia"],
  ["tide_kin", "fish"],
  ["bark_kin", "plant"],
  ["bone_kin", "undead"],
];
const BADGE_TIER = { Monster: "Normal", "Mini-Boss": "Mini-Boss", Raid: "Raid", MVP: "MVP" };
const PREFIX = { Monster: "", "Mini-Boss": "[Mini-Boss] ", Raid: "[Raid Boss] ", MVP: "[MVP] " };

function row(npc, name, type, race, extra = {}) {
  return {
    npc_id: npc, name, entity_type: type, level: 10, aggro: "Yes", race_key: race,
    race_badge: `${race} · ${BADGE_TIER[type]}`, hp_multiplier: "1x", protections: [], weaknesses: [],
    spawn_count: 1, respawn_sec: 30, loc_coord: "1:1", ...extra,
  };
}

// Returns {atlas, picks}: 89 tagged rows in an off-Steppe dungeon, plus an untagged robotic
// boss on the Steppe, a kept robotic boss off the Steppe, and the frozen 29001 row.
function fixture() {
  const spawns = [];
  const entries = [];
  let n = 0;
  for (const [tier, count] of Object.entries(TARGET)) {
    for (let i = 0; i < count; i++) {
      const [kin, race] = KINS[n % KINS.length];
      const name = `${PREFIX[tier]}Ash ${kin.split("_")[0]} ${tier} ${i}`;
      spawns.push(row(10000 + n, name, tier, race, { body_plan: "upright_monster", body_kin: kin }));
      entries.push({ row: `zone-dungeon-a/B1/${n}`, race_key: race, body_kin: kin });
      n++;
    }
  }
  const kept = spawns.length;
  spawns.push(row(20001, "[Raid Boss] Discarded Kiln-Guardian", "Raid", "robotic"));
  const atlas = {
    t_breadth_continents: [
      { continent_id: "c-basin", name: "Hearthbloom Basin" },
      { continent_id: "c-steppe", name: "The Clockwork Steppe (North)" },
    ],
    t_breadth_zone_directory: {
      regular_dungeons: [
        { zone_id: "zone-dungeon-a", continent_id: "c-basin" },
        { zone_id: "zone-dungeon-s", continent_id: "c-steppe" },
      ],
    },
    multi_floor_dungeons: [
      {
        dungeon_id: "zone-dungeon-a",
        floors: [{
          floor_id: "B1", boss_tier_highlight: "B1 Hall · Ash hound Raid 3 (Raid Boss)",
          rooms: [{ room_id: "r1", key_mobs: [spawns[0].name, spawns[10].name] }], spawns,
        }],
      },
      {
        dungeon_id: "zone-dungeon-s",
        floors: [{
          floor_id: "B1", boss_tier_highlight: "B1 Gear Hall · Cog Marshal (Mini-Boss)",
          rooms: [{ room_id: "s1", key_mobs: ["Cog Marshal"] }],
          spawns: [
            row(29001, "Steppe Sentinel", "Monster", "robotic"),
            row(30001, "[Mini-Boss] Cog Marshal", "Mini-Boss", "robotic"),
          ],
        }],
      },
    ],
    world_boss_spawn_radar: [{ boss_name: "[Raid Boss] Ash hound Raid 3", dungeon_id: "zone-dungeon-a", floor_id: "B1" }],
  };
  const picks = { keep_robotic: [`zone-dungeon-a/B1/${kept}`], entries };
  return { atlas, picks };
}

const firstRow = (atlas, tier) => atlas.multi_floor_dungeons[0].floors[0].spawns.find((r) => r.entity_type === tier);
const keyOf = (atlas, r) => `zone-dungeon-a/B1/${atlas.multi_floor_dungeons[0].floors[0].spawns.indexOf(r)}`;
const has = (problems, code, needle) =>
  problems.some((p) => p.startsWith(`${code}:`) && p.includes(needle));

test("the valid fixture returns no problems and counts 10/20/26/33", () => {
  const { atlas, picks } = fixture();
  assert.deepEqual(checkMobShape(atlas, picks), []);
  assert.deepEqual(tierCounts(atlas), TARGET);
  assert.deepEqual(TIER_RANGES.MVP, [31, 35]);
});

test("a Steppe robotic boss row is allowed without keep_robotic", () => {
  const { atlas, picks } = fixture();
  assert.equal(atlas.multi_floor_dungeons[1].floors[0].spawns[1].race_key, "robotic");
  assert.deepEqual(checkMobShape(atlas, picks), []);
});

test("4. a row that lost body_plan but kept body_kin is caught", () => {
  const { atlas, picks } = fixture();
  delete firstRow(atlas, "MVP").body_plan;
  assert.ok(checkMobShape(atlas, picks).some((p) => p.startsWith("picks-mismatch:")));
  assert.equal(tierCounts(atlas).MVP, 32);
});

test("4. a stray body_kin with no picks entry is caught", () => {
  const { atlas, picks } = fixture();
  const untagged = atlas.multi_floor_dungeons[0].floors[0].spawns.find((s) => s.body_plan === undefined);
  untagged.body_kin = "bone_kin";
  assert.ok(checkMobShape(atlas, picks).some((p) => p.includes("is not an upright_monster row")));
});

test("1. a tier outside its range fails", () => {
  const { atlas, picks } = fixture();
  const r = firstRow(atlas, "MVP");
  delete r.body_plan; delete r.body_kin; // 32 still in range
  assert.equal(checkMobShape(atlas, picks).some((p) => p.startsWith("tier-range:")), false);
  for (const x of atlas.multi_floor_dungeons[0].floors[0].spawns.filter((s) => s.entity_type === "MVP").slice(1, 4)) {
    delete x.body_plan; delete x.body_kin;
  }
  assert.ok(has(checkMobShape(atlas, picks), "tier-range", "MVP has 29 tagged rows, range is 31-35"));
});

test("2. a tagged row with ogre_orc or robotic fails, naming the row", () => {
  for (const race of ["ogre_orc", "robotic"]) {
    const { atlas, picks } = fixture();
    const r = firstRow(atlas, "Raid");
    r.race_key = race;
    assert.ok(has(checkMobShape(atlas, picks), "playable-or-robotic", keyOf(atlas, r)), race);
  }
});

test("3. npc_id 29001 tagged fails", () => {
  const { atlas, picks } = fixture();
  const r = atlas.multi_floor_dungeons[1].floors[0].spawns[0];
  r.body_plan = "upright_monster"; r.body_kin = "bone_kin"; r.race_key = "undead";
  assert.ok(has(checkMobShape(atlas, picks), "frozen-29001", "zone-dungeon-s/B1/0"));
});

test("4. tagged rows that differ from picks fail in both directions", () => {
  const a = fixture();
  const extra = a.atlas.multi_floor_dungeons[1].floors[0].spawns[1];
  Object.assign(extra, { race_key: "undead", body_plan: "upright_monster", body_kin: "bone_kin" });
  assert.ok(has(checkMobShape(a.atlas, a.picks), "picks-mismatch", "zone-dungeon-s/B1/1 is tagged in the atlas"));

  const b = fixture();
  const r = firstRow(b.atlas, "Mini-Boss");
  delete r.body_plan; delete r.body_kin;
  assert.ok(has(checkMobShape(b.atlas, b.picks), "picks-mismatch", `${keyOf(b.atlas, r)} has a tagged picks entry`));

  const c = fixture();
  const k = firstRow(c.atlas, "Monster");
  k.body_kin = "scale_kin"; k.race_key = "beast_animal_brute"; // still valid kin/race, but not the picked one
  assert.ok(has(checkMobShape(c.atlas, c.picks), "picks-mismatch", `${keyOf(c.atlas, k)} differs from picks`));
});

test("5. a tagged name with worm, slime, vine or ooze fails", () => {
  for (const word of ["Worm", "Slime", "Vine", "Ooze"]) {
    const { atlas, picks } = fixture();
    const r = firstRow(atlas, "Monster");
    r.name = `Cave ${word} Lord`;
    assert.ok(has(checkMobShape(atlas, picks), "non-upright-word", keyOf(atlas, r)), word);
  }
  // an untagged row may use the word
  const { atlas, picks } = fixture();
  atlas.multi_floor_dungeons[1].floors[0].spawns[0].name = "Slime Sentinel";
  assert.equal(checkMobShape(atlas, picks).some((p) => p.startsWith("non-upright-word:")), false);
});

test("6. a filler name fails in a row name, key_mobs, the highlight, a badge and the radar", () => {
  const FILL = "[Mini-Boss] B2 Gate Overseer";
  const floorOf = (a) => a.multi_floor_dungeons[0].floors[0];

  let f = fixture();
  const r = firstRow(f.atlas, "Mini-Boss");
  r.name = FILL;
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", `${keyOf(f.atlas, r)} name`));

  f = fixture();
  floorOf(f.atlas).rooms[0].key_mobs.push("[Raid Boss] Regional Seal Warden");
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "zone-dungeon-a/B1 rooms[0].key_mobs[2]"));

  f = fixture(); // the stale-highlight fixture from the spec: the prefix-stripped filler name
  floorOf(f.atlas).boss_tier_highlight = "B1 Hall · Fixture B1 Apostle Sovereign (MVP)";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "boss_tier_highlight"));
  f = fixture();
  floorOf(f.atlas).boss_tier_highlight = "Foo 3F Apostle Sovereign (MVP)";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "boss_tier_highlight"));

  f = fixture();
  const g = firstRow(f.atlas, "Raid");
  g.race_badge = "Mini-Boss · B1 Keeper";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", `${keyOf(f.atlas, g)} race_badge`));

  f = fixture();
  f.atlas.world_boss_spawn_radar[0].boss_name = "[MVP] Apostle Vanguard Manifestation";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "world_boss_spawn_radar[0]"));

  // the authored 'Royal Hive Overseer' is not filler
  assert.equal(isFiller("[Mini-Boss] Royal Hive Overseer"), false);
});

test("7. two boss rows with one name fail", () => {
  const { atlas, picks } = fixture();
  const a = firstRow(atlas, "Raid");
  const b = atlas.multi_floor_dungeons[1].floors[0].spawns[1];
  b.name = a.name;
  assert.ok(has(checkMobShape(atlas, picks), "duplicate-boss-name", `${keyOf(atlas, a)}, zone-dungeon-s/B1/1`));
  // Monster rows may share names
  const f = fixture();
  firstRow(f.atlas, "Monster").name = "Steppe Sentinel";
  assert.equal(checkMobShape(f.atlas, f.picks).some((p) => p.startsWith("duplicate-boss-name:")), false);
});

test("8. an off-Steppe robotic boss row not on keep_robotic fails", () => {
  const { atlas, picks } = fixture();
  picks.keep_robotic = [];
  const key = keyOf(atlas, atlas.multi_floor_dungeons[0].floors[0].spawns.find((s) => s.npc_id === 20001));
  assert.ok(has(checkMobShape(atlas, picks), "robotic-off-steppe", key));
});

test("9. a body_kin that does not match its race_key fails", () => {
  const { atlas, picks } = fixture();
  const r = firstRow(atlas, "Mini-Boss");
  const entry = picks.entries.find((e) => e.row === keyOf(atlas, r));
  assert.equal(r.race_key, "beast_animal_brute");
  r.body_kin = "bone_kin"; // needs undead
  entry.body_kin = "bone_kin"; // keep picks in step so only the table rule objects
  assert.ok(has(checkMobShape(atlas, picks), "kin-race", keyOf(atlas, r)));
});

test("6b. a filler name anywhere under multi_floor_dungeons fails, in a row field, a floor or the dungeon", () => {
  let f = fixture();
  f.atlas.multi_floor_dungeons[0].floors[0].spawns[0].lore = "[Mini-Boss] B2 Gate Overseer";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "zone-dungeon-a/B1/0 lore"));
  f = fixture();
  f.atlas.multi_floor_dungeons[1].floors[0].warp_points = [{ label: "[Raid Boss] Regional Seal Warden" }];
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "zone-dungeon-s/B1 warp_points[0].label"));
  f = fixture();
  f.atlas.multi_floor_dungeons[0].summary = "[MVP] Foo Apostle Sovereign";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "filler-name", "zone-dungeon-a summary"));
  // authored names are not flagged
  f = fixture();
  f.atlas.multi_floor_dungeons[0].floors[0].spawns[0].lore = "Royal Hive Overseer";
  f.atlas.multi_floor_dungeons[0].summary = "[Mini-Boss] Royal Hive Overseer";
  assert.deepEqual(checkMobShape(f.atlas, f.picks), []);
  // a name that itself holds ' · ' is still seen as filler inside a highlight
  assert.equal(isFiller("B1 Hall · B1 Foo · Bar Overseer (Mini-Boss)"), true);
});

test("10. a tagged Steppe row fails", () => {
  const { atlas, picks } = fixture();
  Object.assign(atlas.multi_floor_dungeons[1].floors[0].spawns[1], { race_key: "undead", body_plan: "upright_monster", body_kin: "bone_kin" });
  assert.ok(has(checkMobShape(atlas, picks), "steppe-tagged", "zone-dungeon-s/B1/1"));
});

test("11. an old name left inside a longer string fails when the picks carry old_name", () => {
  let f = fixture();
  f.picks.entries[0].old_name = "[Mini-Boss] B1 Gate Overseer";
  assert.deepEqual(checkMobShape(f.atlas, f.picks), []);
  f.atlas.multi_floor_dungeons[0].floors[0].rooms[0].note = "B1 Gate Overseer × 3";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "old-name-remains", "rooms[0].note"));
  f = fixture();
  f.picks.entries[0].old_name = "[Mini-Boss] B1 Gate Overseer";
  f.atlas.world_boss_spawn_radar[0].boss_name = "B1 Gate Overseer, Whispering Bat";
  assert.ok(has(checkMobShape(f.atlas, f.picks), "old-name-remains", "world_boss_spawn_radar[0]"));
});

test("committed atlas and picks pass G-MOB-SHAPE", () => {
  const atlas = JSON.parse(readFileSync(join(ROOT, "content/studio/t_shaped_world_atlas.json"), "utf8"));
  const picks = JSON.parse(readFileSync(join(ROOT, "content/studio/mob_body_plan_picks.json"), "utf8"));
  assert.deepEqual(checkMobShape(atlas, picks), []);
  assert.deepEqual(tierCounts(atlas), { Monster: 10, "Mini-Boss": 20, Raid: 26, MVP: 33 });
});
