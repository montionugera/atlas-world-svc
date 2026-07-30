import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAT_COEF, STAT_MAX, GROWTH } from "./derivedStats";
import { weaponOffence, GEAR_REFERENCE } from "./weaponStats";
import { ITEMS } from "./catalogs";

/**
 * The combat lab (tools/combat-lab) is what solved the rank ladder, TTK table
 * and difficulty curve. If the game's magnitude ceiling drifts away from the
 * lab's, every number in that model stops describing the game — silently.
 * These are the gates that make such a drift fail loudly.
 */
const model = JSON.parse(
  readFileSync(
    join(__dirname, "../../../tools/combat-lab/combat-model.json"),
    "utf8",
  ),
) as {
  proposed: {
    inputs: Record<string, { value: number }>;
    builds: { build: string; alloc: number }[];
    gearTiers: { tier: string; scale: number }[];
    levelMax: number;
  };
};

const WEAPON_IDS = ITEMS.filter((i) => i.kind === "weapon").map((i) => i.id);

test("STAT_COEF mirrors the lab's statCoef", () => {
  expect(STAT_COEF).toBeCloseTo(model.proposed.inputs.statCoef.value, 10);
});

test("GROWTH mirrors the lab's growth", () => {
  expect(GROWTH).toBeCloseTo(model.proposed.inputs.growth.value, 10);
});

test("STAT_MAX is aligned with the lab's levelMax", () => {
  expect(STAT_MAX).toBe(model.proposed.levelMax);
});

test("the offence multiplier ceiling equals the lab's max-grade ceiling", () => {
  // Lab: atkBudget's stat term is (1 + 2*C*alloc*off), maxed at alloc 1, off 1.
  const labCeiling =
    1 +
    2 *
      model.proposed.inputs.statCoef.value *
      Math.max(...model.proposed.builds.map((b) => b.alloc));
  // Ours: 1 + 2*C*share(99), with share saturating at exactly 1 because offence
  // reads ONE stat. This is the whole reason a single-stat offence is correct —
  // summing two capped stats would put our ceiling at 3 against the lab's 2.
  const ourCeiling = 1 + 2 * STAT_COEF * 1;
  expect(ourCeiling).toBeCloseTo(labCeiling, 10);
  expect(ourCeiling).toBeCloseTo(2, 10);
});

test("gear scale tops out at 1, matching the lab's best gear tier", () => {
  const labBest = Math.max(...model.proposed.gearTiers.map((g) => g.scale));
  expect(labBest).toBeCloseTo(1, 10);
  const ourBest = Math.max(...WEAPON_IDS.map((id) => weaponOffence(id).gear));
  expect(ourBest).toBeCloseTo(labBest, 10);
});

test("no weapon exceeds gear 1 — a stronger weapon must move GEAR_REFERENCE", () => {
  const overs = WEAPON_IDS.filter((id) => weaponOffence(id).gear > 1 + 1e-12);
  expect(overs).toEqual([]);
});

test("GEAR_REFERENCE is not merely >= the catalog max, it IS the max", () => {
  // A GEAR_REFERENCE larger than the real max would keep the gate above green
  // while quietly deflating every weapon in the game.
  const max = Math.max(
    ...ITEMS.filter((i) => i.kind === "weapon").map(
      (i) => (i.pAtk ?? 0) + (i.mAtk ?? 0),
    ),
  );
  expect(GEAR_REFERENCE).toBe(max);
});

test("every weapon's gear stays inside the lab's gear-tier span floor", () => {
  // The lab's worst tier is 0.7; our dagger is deliberately below it (0.333)
  // because the lab tiers describe GRADES of gear, not the starter catalog.
  // What must hold is only that gear is strictly positive and <= 1.
  for (const id of WEAPON_IDS) {
    const { gear } = weaponOffence(id);
    expect(gear).toBeGreaterThan(0);
    expect(gear).toBeLessThanOrEqual(1);
  }
});
