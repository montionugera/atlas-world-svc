import { weaponOffence, GEAR_REFERENCE, UNARMED_GEAR } from "./weaponStats";
import { ITEMS } from "./catalogs";

test("GEAR_REFERENCE is the best weapon total in the catalog, so gear tops out at 1", () => {
  const best = Math.max(
    ...ITEMS.filter((i) => i.kind === "weapon").map(
      (i) => (i.pAtk ?? 0) + (i.mAtk ?? 0),
    ),
  );
  expect(GEAR_REFERENCE).toBe(best);
  expect(weaponOffence("scythe").gear).toBeCloseTo(1, 10);
});

test.each([
  ["basic_sword", "str", 10 / 18, 1],
  ["dagger", "str", 6 / 18, 1],
  ["scythe", "str", 18 / 18, 1],
  ["great_bow", "dex", 16 / 18, 1],
  ["magic_staff", "int", 17 / 18, 2 / 17],
])("%s resolves to (%s, gear, rho)", (id, atkStat, gear, rho) => {
  const r = weaponOffence(id as string);
  expect(r.atkStat).toBe(atkStat);
  expect(r.gear).toBeCloseTo(gear as number, 10);
  expect(r.rho).toBeCloseTo(rho as number, 10);
});

test("unarmed is str, fully physical, and strictly worse than the worst weapon", () => {
  const bare = weaponOffence(undefined);
  expect(bare).toEqual({ atkStat: "str", gear: UNARMED_GEAR, rho: 1 });
  expect(bare.gear).toBeLessThan(weaponOffence("dagger").gear);
});

test("an unknown weapon id resolves as unarmed rather than throwing", () => {
  expect(weaponOffence("not_a_real_item")).toEqual(weaponOffence(undefined));
});

test("a non-weapon item resolves as unarmed", () => {
  expect(weaponOffence("leather_armor")).toEqual(weaponOffence(undefined));
});

test("every weapon in the catalog declares an atkStat", () => {
  const missing = ITEMS.filter((i) => i.kind === "weapon" && !i.atkStat).map(
    (i) => i.id,
  );
  expect(missing).toEqual([]);
});

test("no weapon exceeds gear 1 — a stronger weapon must move GEAR_REFERENCE", () => {
  const overs = ITEMS.filter((i) => i.kind === "weapon")
    .filter((i) => weaponOffence(i.id).gear > 1 + 1e-12)
    .map((i) => i.id);
  expect(overs).toEqual([]);
});
