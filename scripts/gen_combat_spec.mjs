#!/usr/bin/env node
// Fills the generated blocks in the combat stat model spec.
//
// The spec's PROSE is written by hand — reasoning, trade-offs, and why an
// alternative was rejected are not derivable from the numbers. Every TABLE is
// generated from the live model, because a hand-pasted table is stale the
// moment anything moves, and a spec that disagrees with the model is worse than
// no spec: it looks authoritative while being wrong.
//
// The spec is the third consumer of the same source of truth:
//
//   scripts/gen_combat_model.mjs  ->  combat-model.json  ->  index.html (lab)
//                                                        ->  verify.mjs (gates)
//                                                        ->  this (spec tables)
//
// Blocks are delimited by <!-- GEN:name --> ... <!-- /GEN:name -->. Anything
// between them is replaced; anything outside is left alone.
//
//   node scripts/gen_combat_spec.mjs           write the blocks
//   node scripts/gen_combat_spec.mjs --check   exit 1 if the spec is stale
//
// The --check form is what verify.mjs runs, so the spec cannot silently rot.
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "docs/superpowers/specs/2026-07-30-combat-stat-model-design.md");
const LAB = join(ROOT, "tools/combat-lab/index.html");
const MODEL = join(ROOT, "tools/combat-lab/combat-model.json");

const html = readFileSync(LAB, "utf8");
const data = JSON.parse(readFileSync(MODEL, "utf8"));
const d = data.proposed;

// Same bootstrap the lab and verify.mjs use: evaluate the page's model region
// with DATA and P injected. Reimplementing the formulas here would create a
// fourth place they live, which is the problem this script exists to solve.
const P = { levelMax: d.levelMax };
for (const [k, v] of Object.entries(d.inputs)) P[k] = v.value;
const a = html.indexOf("const grow = (L)");
const b = html.indexOf(
  "// ============================================================= render ==",
);
if (a < 0 || b < 0) {
  console.error("gen_combat_spec: could not find the model region in the lab");
  process.exit(1);
}
const M = new Function(
  "DATA",
  "P",
  `${html.slice(a, b)}; return { player, mob, hit, ttk, R, rankSustain, economy, midLevel, mobLevel };`,
)(data, P);

const n0 = (v) => Math.round(v).toLocaleString("en-US");
const secs = (t) => (t < 100 ? `${t.toFixed(1)}s` : `${t.toFixed(0)}s`);
const tbl = (head, rows) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

// Rank rows are computed at each rank's own level, which for a boss is its
// authored level and for a pack is its band midpoint.
const atRank = (rk) => {
  const L = M.midLevel(rk);
  const p = M.player(L, "max");
  const m = M.mob(M.mobLevel(L), rk.rank);
  return { L, p, m, theirs: M.hit(m, p, L), T: M.ttk(L, rk.rank, "max") };
};

const blocks = {
  constants: () =>
    tbl(
      ["constant", "value", "what it sets"],
      [
        ["`growth`", P.growth, `${((P.growth - 1) * 100).toFixed(1)}%/level — everything compounds at this`],
        ["`k`", P.k, `an even fight is ${(1 / P.k).toFixed(0)} hits`],
        [
          "`baseHp` / `baseAtk` / `baseDef`",
          `${P.baseHp} / ${P.baseAtk} / ${P.baseDef}`,
          "scale only; `baseDef` is set so a mirror match is exactly even",
        ],
        ["`aspd`", `${P.aspd} /s`, `one swing every ${(1 / P.aspd).toFixed(0)} seconds`],
        [
          "`statCoef`",
          P.statCoef,
          `stat points are ${((P.statCoef / (1 + P.statCoef)) * 100).toFixed(0)}% of total power at full spend`,
        ],
        [
          "`gapWeight`",
          P.gapWeight,
          `level difference counts at ${((Math.pow(P.growth, 2 * P.gapWeight) - 1) * 100).toFixed(1)}%/level`,
        ],
      ],
    ),

  ladder: () =>
    tbl(
      ["rank", "levels", "n", "shape", "R", "swings to kill you", "fight", "sustain"],
      d.ladder.map((rk) => {
        const s = M.rankSustain(rk);
        return [
          rk.rank,
          rk.level ? `**L${rk.level}**` : `${rk.from}–${rk.to}`,
          rk.n,
          rk.shape,
          rk.r.toFixed(2),
          rk.swings,
          secs(atRank(rk).T),
          s > 0 ? `${(s * 100).toFixed(1)}%` : "—",
        ];
      }),
    ),

  mobstats: () =>
    tbl(
      ["rank", "mob atk", "mob def", "mob HP", "its damage per hit"],
      d.ladder.map((rk) => {
        const { p, m, theirs } = atRank(rk);
        return [
          rk.rank,
          n0(m.atk),
          n0(m.def),
          n0(m.hp),
          `${((theirs / p.hp) * 100).toFixed(1)}% of your bar`,
        ];
      }),
    ),

  tiers: () => {
    const L = P.exampleLevel;
    const top = M.player(L, "max");
    return tbl(
      ["tier", "gear", "points spent", `HP @L${L}`, "atk", "def", "CS", "strength"],
      [...d.grades].reverse().map((g) => {
        const p = M.player(L, g.grade);
        const gear = d.gearTiers.find((x) => x.tier === g.gear);
        const build = d.builds.find((x) => x.build === g.build);
        return [
          g.grade,
          `${g.gear} (${gear.scale.toFixed(2)})`,
          `${(build.alloc * 100).toFixed(0)}%`,
          n0(p.hp),
          n0(p.atk),
          n0(p.def),
          n0(p.cs),
          `${((p.cs / top.cs) * 100).toFixed(0)}%`,
        ];
      }),
    );
  },

  curve: () =>
    tbl(
      ["level", "CS", "atk", "def", "HP"],
      [1, 20, 60, 99].map((L) => {
        const p = M.player(L, "max");
        return [L, n0(p.cs), n0(p.atk), n0(p.def), n0(p.hp)];
      }),
    ),

  economy: () =>
    tbl(
      ["rank", "party", "demand", "pool", "regen", "potions", "supply", "healer share", "funded"],
      d.ladder
        .filter((rk) => M.rankSustain(rk) > 0)
        .map((rk) => {
          const e = M.economy(rk);
          return [
            rk.rank,
            `${e.dps} dps + ${e.healers} heal`,
            e.demand.toFixed(1),
            e.pool.toFixed(0),
            e.regen.toFixed(0),
            e.potions.toFixed(1),
            e.supply.toFixed(0),
            `${(e.healerShareOfSupply * 100).toFixed(0)}%`,
            `${(e.supply / e.demand).toFixed(2)}×`,
          ];
        }),
    ),

  // Tier gating rule: a tier unlocks once it heals at most 30% of a bar.
  potiontiers: () => {
    const bar = (L) => M.player(L, "max").hp;
    const lvlFor = (hp) => {
      for (let L = 1; L <= P.levelMax; L++) if (bar(L) >= hp) return L;
      return P.levelMax;
    };
    const top = d.ladder[d.ladder.length - 1];
    const endL = M.midLevel(top);
    return tbl(
      ["tier", "total", "unlocks", "% of bar there", `% at L${endL}`],
      [10, 30, 60, 140].map((t) => {
        const heal = t * P.potionSeconds;
        const L = lvlFor(heal / 0.3);
        return [
          `${t} HP/s`,
          `${heal} HP`,
          `L${L}`,
          `${((heal / bar(L)) * 100).toFixed(1)}%`,
          `${((heal / bar(endL)) * 100).toFixed(1)}%`,
        ];
      }),
    );
  },

  decisions: () =>
    tbl(
      ["#", "decision", "consequence"],
      d.decisions.map((x) => [
        `**${x.id}**`,
        x.title,
        // First sentence of the consequence, which is the part worth carrying.
        x.consequence.split(/(?<=\.)\s/)[0],
      ]),
    ),

  // Rest speed vs the glass-cannon farming edge (D1). Both builds lose the same
  // FRACTION of their bar per fight, so both rest the same; only fight length
  // differs, and rest dwarfs it.
  restladder: () => {
    const KILL_DPS = 4.5,
      KILL_TANK = 9.0,
      loss = 0.28,
      floor = 0.16;
    const fights = Math.floor((1 - floor) / loss);
    const row = (label, rate) => {
      const rest = rate === null ? 0 : ((1 - floor) * 100) / rate + P.restDelay;
      const kpm = (t) => fights / ((fights * t + rest) / 60);
      return `${label.padEnd(12)} DPS farms ${(kpm(KILL_DPS) / kpm(KILL_TANK)).toFixed(2)}× faster`;
    };
    return [
      "```",
      row("no rest", null),
      row("4%/s", 4),
      `${row(`${P.restRate}%/s`, P.restRate)}   ← current`,
      row("1%/s", 1),
      "```",
    ].join("\n");
  },

};

// Counting gates by running verify.mjs would be circular (verify runs this in
// --check mode), so count the PASS lines from a plain source scan instead.
const verifySrc = readFileSync(join(ROOT, "tools/combat-lab/verify.mjs"), "utf8");
const gateCalls = (verifySrc.match(/\bgate\(/g) || []).length;
const checkCalls = (verifySrc.match(/\bcheck\(/g) || []).length;
blocks.gatecount = () => `${gateCalls + checkCalls} assertion sites`;
blocks.gatecount2 = () => `${gateCalls + checkCalls} assertion sites`;

let spec = readFileSync(SPEC, "utf8");
let filled = 0;
for (const [name, fn] of Object.entries(blocks)) {
  const re = new RegExp(
    `(<!-- GEN:${name} -->)[\\s\\S]*?(<!-- /GEN:${name} -->)`,
    "g",
  );
  if (!re.test(spec)) continue;
  re.lastIndex = 0;
  const body = fn();
  spec = spec.replace(re, `$1\n\n${body}\n\n$2`);
  filled++;
}

const check = process.argv.includes("--check");
const current = readFileSync(SPEC, "utf8");
if (check) {
  if (current !== spec) {
    console.error(
      "gen_combat_spec: SPEC IS STALE — its generated tables no longer match the model.\n" +
        "  fix:  node scripts/gen_combat_spec.mjs",
    );
    process.exit(1);
  }
  console.log(`gen_combat_spec: spec is current (${filled} generated blocks)`);
} else {
  writeFileSync(SPEC, spec);
  console.log(`gen_combat_spec: wrote ${filled} generated blocks to`);
  console.log(`  ${SPEC.replace(ROOT + "/", "")}`);
}
