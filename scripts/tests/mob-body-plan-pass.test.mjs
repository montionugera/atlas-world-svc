// F-167 Task 1: scripts/mob_body_plan_pass.py, one test per requirement R1-R6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "mob_body_plan_pass.py");
const TIERS = ["Monster", "Mini-Boss", "Raid", "MVP"];
// Small numbers so a fixture of a few rows can meet them.
const TARGETS = Object.fromEntries(TIERS.map((t) => [t, { target: 2, min: 2, max: 2 }]));

const clone = (x) => JSON.parse(JSON.stringify(x));

function spawn(npc, name, type, race, badge) {
  return {
    npc_id: npc, name, entity_type: type, level: 10, aggro: "Yes", race_key: race,
    race_badge: badge, hp_multiplier: "1x", protections: [], weaknesses: [],
    spawn_count: 1, respawn_sec: 30, loc_coord: "1:1",
  };
}

// Filler names the way tall_dungeon_expansion.py writes them.
const FILLER = (fid) => ({
  Monster: `Fixture ${fid} Sentinel`,
  "Mini-Boss": `[Mini-Boss] ${fid} Gate Overseer`,
  Raid: `[Raid Boss] ${fid} Seal Warden`,
  MVP: `[MVP] Fixture ${fid} Apostle Sovereign`,
});
const BADGE = {
  Monster: "Normal Mob",
  "Mini-Boss": (fid) => `Mini-Boss · ${fid} Keeper`,
  Raid: "Raid · Rank 3 Warden",
  MVP: "MVP · Rank 2 God-Subordinate",
};

function floor(dungeon, fid, base) {
  const names = FILLER(fid);
  const spawns = TIERS.map((t, i) =>
    spawn(base + i, names[t], t, "robotic", typeof BADGE[t] === "function" ? BADGE[t](fid) : BADGE[t]));
  const stripped = names.MVP.replace(/^\[MVP\] /, "");
  return {
    floor_id: fid, floor_index: 1, name: `${fid} hall`,
    boss_tier_highlight: `${fid} Hall · ${stripped} (MVP)`,
    rooms: [{ room_id: `${dungeon}-${fid}-r1`, name: "Room", key_mobs: [names.Monster, names["Mini-Boss"], names.Raid, names.MVP] }],
    warp_points: [], spawns,
  };
}

function baseAtlas() {
  const dungeons = [
    { dungeon_id: "zone-dungeon-a", floors: [floor("a", "B1", 1000), floor("a", "B2", 1010)] },
    { dungeon_id: "zone-dungeon-b", floors: [floor("b", "B1", 2000), floor("b", "B2", 2010)] },
    { dungeon_id: "zone-dungeon-s", floors: [floor("s", "B1", 3000)] },
  ];
  dungeons[2].floors[0].spawns[0].npc_id = 29001;
  const radar = (id, dungeon, fid) => ({
    boss_id: id, boss_name: FILLER(fid).MVP, boss_category: "MVP", dungeon_id: dungeon, floor_id: fid, level: 10,
  });
  return {
    id: "fixture",
    t_breadth_continents: [
      { continent_id: "c-basin", name: "Hearthbloom Basin" },
      { continent_id: "c-steppe", name: "The Clockwork Steppe (North)" },
    ],
    t_breadth_zone_directory: {
      regular_dungeons: [
        { zone_id: "zone-dungeon-a", continent_id: "c-basin" },
        { zone_id: "zone-dungeon-b", continent_id: "c-basin" },
        { zone_id: "zone-dungeon-s", continent_id: "c-steppe" },
      ],
    },
    multi_floor_dungeons: dungeons,
    world_boss_spawn_radar: [
      radar("r1", "zone-dungeon-a", "B1"),
      radar("r2", "zone-dungeon-b", "B1"),
    ],
    boss_hierarchy_chains: [{ god_id: "g", mvp_apostles: [{ name: "Someone Else", level: 5 }] }],
  };
}

// Picks that satisfy the fixture: dungeon A is tagged, B gets plain races, S keeps robotic.
function basePicks() {
  const entries = [];
  const kinFor = { Monster: "hound_kin", "Mini-Boss": "scale_kin", Raid: "mantis_kin", MVP: "bone_kin" };
  const raceFor = { hound_kin: "beast_animal_brute", scale_kin: "beast_animal_brute", mantis_kin: "insect_arachnia", bone_kin: "undead" };
  for (const fid of ["B1", "B2"]) {
    TIERS.forEach((t, i) => {
      const e = { row: `zone-dungeon-a/${fid}/${i}`, race_key: raceFor[kinFor[t]], body_kin: kinFor[t] };
      if (t !== "Monster") { e.old_name = FILLER(fid)[t]; e.new_name = `${FILLER(fid)[t].match(/^\[[^\]]+\]/)[0]} A ${fid} ${t} Marshal`; }
      entries.push(e);
      if (t !== "Monster") {
        entries.push({
          row: `zone-dungeon-b/${fid}/${i}`, race_key: "plant", old_name: FILLER(fid)[t],
          new_name: `${FILLER(fid)[t].match(/^\[[^\]]+\]/)[0]} B ${fid} ${t} Warden Moss`,
        });
      }
    });
  }
  TIERS.slice(1).forEach((t, j) => {
    entries.push({
      row: `zone-dungeon-s/B1/${j + 1}`, race_key: "robotic", old_name: FILLER("B1")[t],
      new_name: `${FILLER("B1")[t].match(/^\[[^\]]+\]/)[0]} S B1 ${t} Engine`,
    });
  });
  return { keep_robotic: [], entries };
}

function setup(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "mob-pass-"));
  const f = { atlas: clone(baseAtlas()), picks: basePicks(), targets: clone(TARGETS) };
  if (mutate) mutate(f);
  const paths = {
    atlas: join(dir, "atlas.json"), picks: join(dir, "picks.json"), targets: join(dir, "targets.json"),
  };
  writeFileSync(paths.atlas, JSON.stringify(f.atlas, null, 2) + "\n");
  writeFileSync(paths.picks, JSON.stringify(f.picks, null, 2));
  writeFileSync(paths.targets, JSON.stringify(f.targets));
  return paths;
}

function run(paths, extra = []) {
  const r = spawnSync(
    "python3",
    [SCRIPT, "--atlas", paths.atlas, "--picks", paths.picks, "--targets", paths.targets, ...extra],
    { encoding: "utf8" },
  );
  return { code: r.status, err: r.stderr, out: r.stdout };
}

const read = (p) => readFileSync(p, "utf8");
const rowsOf = (atlas, dungeon) =>
  atlas.multi_floor_dungeons.find((d) => d.dungeon_id === dungeon).floors.flatMap((f) => f.spawns);

test("R1: a fixture that meets the scaled targets passes and tags every tier", () => {
  const p = setup();
  const r = run(p);
  assert.equal(r.code, 0, r.err);
  const rows = rowsOf(JSON.parse(read(p.atlas)), "zone-dungeon-a");
  for (const t of TIERS) {
    assert.equal(rows.filter((x) => x.entity_type === t && x.body_plan === "upright_monster").length, 2, t);
  }
  const mini = rows.find((x) => x.entity_type === "Mini-Boss");
  assert.equal(mini.body_kin, "scale_kin");
  assert.equal(mini.race_badge, "Beast · Mini-Boss");
  assert.equal(rows.find((x) => x.entity_type === "Monster").race_badge, "Beast · Normal");
  // tagged rows past the range fail
  const q = setup((f) => { f.targets.MVP = { target: 1, min: 1, max: 1 }; });
  const rq = run(q);
  assert.equal(rq.code, 1);
  assert.match(rq.err, /MVP: 2 tagged rows, range is 1-1/);
});

test("R2: an eligible pool below a tier minimum exits 1 and leaves the atlas byte-identical", () => {
  const p = setup((f) => { f.targets.Raid = { target: 5, min: 5, max: 5 }; });
  const before = read(p.atlas);
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /Raid: eligible pool 4 is below the range minimum 5/);
  assert.equal(read(p.atlas), before);
});

test("R2: the pool ignores Steppe rows, 29001, keep_robotic and robotic rows", () => {
  // Tag only Steppe-hosted... drop dungeon B's picks so B boss rows stay robotic: pool shrinks to dungeon A.
  const p = setup((f) => {
    f.picks.entries = f.picks.entries.filter((e) => !e.row.startsWith("zone-dungeon-b/"));
    f.atlas.multi_floor_dungeons[1].floors.forEach((fl) => fl.spawns.forEach((s, i) => {
      if (i > 0) s.name = `Authored ${fl.floor_id} ${i}`;
    }));
    f.atlas.multi_floor_dungeons[1].floors.forEach((fl) => { fl.boss_tier_highlight = "plain"; fl.rooms[0].key_mobs = []; });
    f.atlas.world_boss_spawn_radar.pop();
    f.targets.Raid = { target: 3, min: 3, max: 3 };
  });
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /Raid: eligible pool 2 is below the range minimum 3/);
});

test("R3: robotic or playable race with body_kin, or a mismatched body_kin, exits 1", () => {
  const cases = [
    ["robotic", "scale_kin"],
    ["ogre_orc", "hound_kin"],
    ["dark_lunar", "bone_kin"],
    ["plant", "scale_kin"],
  ];
  for (const [race, kin] of cases) {
    const p = setup((f) => { Object.assign(f.picks.entries[0], { race_key: race, body_kin: kin }); });
    const before = read(p.atlas);
    const r = run(p);
    assert.equal(r.code, 1, `${race}/${kin}`);
    assert.match(r.err, /zone-dungeon-a\/B1\/0/);
    assert.equal(read(p.atlas), before);
  }
});

test("R4: running twice gives identical bytes", () => {
  const p = setup();
  assert.equal(run(p).code, 0);
  const once = read(p.atlas);
  const r2 = run(p);
  assert.equal(r2.code, 0, r2.err);
  assert.equal(read(p.atlas), once);
  assert.equal(run(p, ["--check"]).code, 0);
});

function leaves(node, path = "", out = new Map()) {
  if (node !== null && typeof node === "object") {
    for (const k of Object.keys(node)) leaves(node[k], `${path}.${k}`, out);
  } else out.set(path, node);
  return out;
}

test("R5: only the listed row fields and old-name strings differ", () => {
  const p = setup();
  const before = JSON.parse(read(p.atlas));
  assert.equal(run(p).code, 0);
  const after = JSON.parse(read(p.atlas));
  const a = leaves(before), b = leaves(after);
  const rowField = /^\.multi_floor_dungeons\.\d+\.floors\.\d+\.spawns\.\d+\.(name|race_key|race_badge|body_plan|body_kin)$/;
  const refString = /^\.multi_floor_dungeons\.\d+\.floors\.\d+\.(boss_tier_highlight|rooms\.\d+\.key_mobs\.\d+)$/;
  const radarName = /^\.world_boss_spawn_radar\.\d+\.boss_name$/;
  let changed = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) === b.get(k)) continue;
    changed++;
    assert.ok(rowField.test(k) || refString.test(k) || radarName.test(k), `unexpected change at ${k}`);
    if (refString.test(k) || radarName.test(k)) {
      // a reference string differs only by a name substring: it still shares its non-name part
      const old = String(a.get(k));
      assert.ok(/Gate Overseer|Seal Warden|Apostle Sovereign|Sentinel/.test(old), `${k}: ${old}`);
    }
  }
  assert.ok(changed > 20);
  // untouched sections are deep-equal
  assert.deepEqual(after.t_breadth_zone_directory, before.t_breadth_zone_directory);
  assert.deepEqual(after.boss_hierarchy_chains, before.boss_hierarchy_chains);
  // npc ids and stats never change
  const idsB = rowsOf(before, "zone-dungeon-a").map((x) => [x.npc_id, x.level, x.hp_multiplier]);
  const idsA = rowsOf(after, "zone-dungeon-a").map((x) => [x.npc_id, x.level, x.hp_multiplier]);
  assert.deepEqual(idsA, idsB);
});

test("R6: a boss_tier_highlight with a filler name no entry covers exits 1", () => {
  const p = setup((f) => {
    f.atlas.multi_floor_dungeons[0].floors[0].boss_tier_highlight = "B1 Hall · B7 Gate Overseer (Mini-Boss)";
  });
  const before = read(p.atlas);
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /boss_tier_highlight: filler name remains/);
  assert.equal(read(p.atlas), before);
});

test("the same filler name in two dungeons gets each dungeon's own new name", () => {
  const p = setup();
  assert.equal(run(p).code, 0);
  const atlas = JSON.parse(read(p.atlas));
  const fa = atlas.multi_floor_dungeons[0].floors[0];
  const fb = atlas.multi_floor_dungeons[1].floors[0];
  assert.equal(fa.spawns[1].name, "[Mini-Boss] A B1 Mini-Boss Marshal");
  assert.equal(fb.spawns[1].name, "[Mini-Boss] B B1 Mini-Boss Warden Moss");
  assert.ok(fa.rooms[0].key_mobs.includes("[Mini-Boss] A B1 Mini-Boss Marshal"));
  assert.ok(fb.rooms[0].key_mobs.includes("[Mini-Boss] B B1 Mini-Boss Warden Moss"));
  assert.ok(!fa.rooms[0].key_mobs.some((n) => n.includes(" B B1 ")));
});

test("a prefix-stripped name in boss_tier_highlight gets the prefix-stripped new name", () => {
  const p = setup((f) => {
    f.atlas.multi_floor_dungeons[0].floors[0].boss_tier_highlight = "Fixture B1 Apostle Sovereign (MVP)";
  });
  assert.equal(run(p).code, 0);
  const fl = JSON.parse(read(p.atlas)).multi_floor_dungeons[0].floors[0];
  assert.equal(fl.boss_tier_highlight, "A B1 MVP Marshal (MVP)");
  // the floor with the "head · name (Tier)" shape keeps its head
  const fb = JSON.parse(read(p.atlas)).multi_floor_dungeons[1].floors[0];
  assert.equal(fb.boss_tier_highlight, "B1 Hall · B B1 MVP Warden Moss (MVP)");
});

test("a world_boss_spawn_radar boss_name is matched by dungeon + floor + old name", () => {
  const p = setup();
  assert.equal(run(p).code, 0);
  const radar = JSON.parse(read(p.atlas)).world_boss_spawn_radar;
  assert.equal(radar[0].boss_name, "[MVP] A B1 MVP Marshal");
  assert.equal(radar[1].boss_name, "[MVP] B B1 MVP Warden Moss");
  // a radar entry for a dungeon with no entry stays filler and fails
  const q = setup((f) => {
    f.atlas.world_boss_spawn_radar.push({
      boss_id: "r3", boss_name: FILLER("B1").MVP, boss_category: "MVP", dungeon_id: "zone-dungeon-zzz", floor_id: "B1",
    });
  });
  const r = run(q);
  assert.equal(r.code, 1);
  assert.match(r.err, /world_boss_spawn_radar\[2\]\.boss_name: filler name remains/);
});

test("an authored name with badge 'Mini-Boss · 1F Overseer' is rebadged and keeps its name", () => {
  const p = setup((f) => {
    f.atlas.multi_floor_dungeons[2].floors[0].spawns.push(
      spawn(3999, "[Mini-Boss] Chief Arc-Engineer", "Mini-Boss", "robotic", "Mini-Boss · 1F Overseer"));
  });
  assert.equal(run(p).code, 0);
  const s = rowsOf(JSON.parse(read(p.atlas)), "zone-dungeon-s").find((x) => x.npc_id === 3999);
  assert.equal(s.name, "[Mini-Boss] Chief Arc-Engineer");
  assert.equal(s.race_badge, "Robotic · Mini-Boss");
});

test("a renamed old name found in boss_hierarchy_chains exits 1", () => {
  const p = setup((f) => {
    f.atlas.boss_hierarchy_chains[0].mvp_apostles[0].name = "Fixture B1 Apostle Sovereign";
  });
  const before = read(p.atlas);
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /boss_hierarchy_chains: holds renamed old name/);
  assert.equal(read(p.atlas), before);
});

test("an entry naming npc_id 29001 exits 1", () => {
  const p = setup((f) => {
    f.picks.entries.push({ row: "zone-dungeon-s/B1/0", race_key: "beast_animal_brute", body_kin: "hound_kin" });
  });
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /zone-dungeon-s\/B1\/0.*29001/);
});

test("a missing picks file exits 1 with a clear message", () => {
  const p = setup();
  p.picks = join(dirname(p.picks), "nope.json");
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /picks file not found/);
});

test("an unknown row and a duplicate row are rejected", () => {
  const p = setup((f) => {
    f.picks.entries.push({ row: "zone-dungeon-a/B9/0", race_key: "plant" });
    f.picks.entries.push({ ...f.picks.entries[0] });
  });
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /unknown row/);
  assert.match(r.err, /duplicate/);
});

test("--check on an un-applied atlas with valid picks exits 0 and writes nothing", () => {
  const p = setup();
  const before = read(p.atlas);
  const r = run(p, ["--check"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(read(p.atlas), before);
  // and --check still runs the validations on the simulated result
  const q = setup((f) => { f.targets.MVP = { target: 1, min: 1, max: 1 }; });
  const rq = run(q, ["--check"]);
  assert.equal(rq.code, 1);
  assert.match(rq.err, /MVP: 2 tagged rows/);
});

test("a boss name that holds ' · ' is renamed in the highlight too", () => {
  const OLD = "[MVP] Rooftop Apex · Fixture B1 Apostle Sovereign";
  const p = setup((f) => {
    const fl = f.atlas.multi_floor_dungeons[0].floors[0];
    fl.spawns[3].name = OLD;
    fl.rooms[0].key_mobs[3] = OLD;
    fl.boss_tier_highlight = "B1 Hall · Rooftop Apex · Fixture B1 Apostle Sovereign (MVP)";
    f.atlas.world_boss_spawn_radar[0].boss_name = OLD;
    f.picks.entries.find((x) => x.row === "zone-dungeon-a/B1/3").old_name = OLD;
  });
  const r = run(p);
  assert.equal(r.code, 0, r.err);
  const fl = JSON.parse(read(p.atlas)).multi_floor_dungeons[0].floors[0];
  assert.equal(fl.boss_tier_highlight, "B1 Hall · A B1 MVP Marshal (MVP)");
  assert.doesNotMatch(JSON.stringify(fl), /Rooftop Apex/);
});

test("a tagged Steppe row exits 1", () => {
  const p = setup((f) => {
    const e = f.picks.entries.find((x) => x.row === "zone-dungeon-s/B1/1");
    Object.assign(e, { race_key: "beast_animal_brute", body_kin: "hound_kin" });
  });
  const before = read(p.atlas);
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /zone-dungeon-s\/B1\/1.*Steppe/);
  assert.equal(read(p.atlas), before);
});

test("the written atlas keeps its original file mode", () => {
  const p = setup();
  chmodSync(p.atlas, 0o644);
  assert.equal(run(p).code, 0);
  assert.equal(statSync(p.atlas).mode & 0o777, 0o644);
});

test("an old filler name left inside a longer string exits 1", () => {
  for (const leftover of ["B1 Gate Overseer × 3", "B1 Gate Overseer, Whispering Bat", "[Mini-Boss] B1 Gate Overseer x2"]) {
    const p = setup((f) => { f.atlas.multi_floor_dungeons[0].floors[0].rooms[0].note = leftover; });
    const before = read(p.atlas);
    const r = run(p);
    assert.equal(r.code, 1, leftover);
    assert.match(r.err, /old name/, leftover);
    assert.equal(read(p.atlas), before);
  }
  // an old name in the radar as part of a longer string is caught too
  const q = setup((f) => { f.atlas.world_boss_spawn_radar[0].boss_name = "B1 Gate Overseer × 3"; });
  assert.equal(run(q).code, 1);
});

test("a new_name entry without old_name exits 1", () => {
  const p = setup((f) => { delete f.picks.entries.find((e) => e.new_name).old_name; });
  const before = read(p.atlas);
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /needs old_name/);
  assert.equal(read(p.atlas), before);
});

test("an old_name that differs from the row's current name exits 1; a second run stays fine", () => {
  const p = setup((f) => { f.picks.entries.find((e) => e.new_name).old_name = "Somebody Else"; });
  const r = run(p);
  assert.equal(r.code, 1);
  assert.match(r.err, /old_name .* does not match/);
  const q = setup();
  assert.equal(run(q).code, 0);
  assert.equal(run(q).code, 0, "row already holds new_name");
});
