import { derivedStats, BASE_ATK } from "./derivedStats";

const ONES = { str: 1, agi: 1, int: 1, vit: 1, dex: 1 };

test("ANCHOR: level 1, all primaries 1, basic_sword reproduces the pre-F018 numbers", () => {
  const r = derivedStats({
    level: 1,
    allocated: ONES,
    weaponItemId: "basic_sword",
  });
  expect(r.maxHealth).toBeCloseTo(110, 6); // was 100 + 10*1 + 5*0
  expect(r.pAtk).toBeCloseTo(22, 6); //      was 10 + 2*1 + 10
  expect(r.pDef).toBeCloseTo(6, 6); //       was 5 + 1
  expect(r.mDef).toBeCloseTo(6, 6); //       D7: mDef == pDef now
  expect(r.maxMoveSpeed).toBeCloseTo(20.2, 6); // unchanged formula
  // INTENDED CHANGE: a blade yields no magical output at all (was 12).
  expect(r.mAtk).toBe(0);
});

test("D6: the attack/defence ratio is level-independent", () => {
  const at = (level: number) =>
    derivedStats({ level, allocated: ONES, weaponItemId: "basic_sword" });
  const ratio = (level: number) => at(level).pAtk / at(level).pDef;
  expect(ratio(50)).toBeCloseTo(ratio(1), 9);
  expect(ratio(99)).toBeCloseTo(ratio(1), 9);
  // ...and it is not level-independent by being flat — magnitudes really do grow
  expect(at(99).pAtk).toBeGreaterThan(at(1).pAtk * 50);
});

test("D7: both defences come off vit alone, so int buys no free mDef", () => {
  const base = derivedStats({ level: 20, allocated: ONES });
  const smart = derivedStats({ level: 20, allocated: { ...ONES, int: 99 } });
  expect(smart.mDef).toBeCloseTo(base.mDef, 9);
  expect(smart.pDef).toBeCloseTo(base.pDef, 9);

  const tanky = derivedStats({ level: 20, allocated: { ...ONES, vit: 99 } });
  expect(tanky.mDef).toBeGreaterThan(base.mDef);
  expect(tanky.pDef).toBeCloseTo(tanky.mDef, 9);
  // vit also drives the HP bar, and by the same magnitude
  expect(tanky.maxHealth / base.maxHealth).toBeCloseTo(
    tanky.pDef / base.pDef,
    9,
  );
});

test("W2: each weapon reads its own stat and ignores the others", () => {
  const L = 20;
  const bow = (a: typeof ONES) =>
    derivedStats({ level: L, allocated: a, weaponItemId: "great_bow" }).pAtk;
  expect(bow({ ...ONES, dex: 99 })).toBeGreaterThan(bow(ONES));
  expect(bow({ ...ONES, str: 99 })).toBeCloseTo(bow(ONES), 9);
  expect(bow({ ...ONES, int: 99 })).toBeCloseTo(bow(ONES), 9);

  const staff = (a: typeof ONES) =>
    derivedStats({ level: L, allocated: a, weaponItemId: "magic_staff" }).mAtk;
  expect(staff({ ...ONES, int: 99 })).toBeGreaterThan(staff(ONES));
  expect(staff({ ...ONES, str: 99 })).toBeCloseTo(staff(ONES), 9);

  const blade = (a: typeof ONES) =>
    derivedStats({ level: L, allocated: a, weaponItemId: "basic_sword" }).pAtk;
  expect(blade({ ...ONES, str: 99 })).toBeGreaterThan(blade(ONES));
  expect(blade({ ...ONES, dex: 99 })).toBeCloseTo(blade(ONES), 9);
});

test("W3: the offence multiplier saturates at exactly 2 at the stat cap", () => {
  const capped = derivedStats({
    level: 1,
    allocated: { ...ONES, str: 99 },
    weaponItemId: "scythe", // gear exactly 1.0, rho exactly 1
  });
  // atk = BASE_ATK * grow(1)=1 * offMagnitude(2.0) * gear(1.0); pAtk = atk * 2 * rho
  expect(capped.pAtk).toBeCloseTo(BASE_ATK * 2 * 2, 6);

  // over-cap allocation is clamped, not extrapolated
  const over = derivedStats({
    level: 1,
    allocated: { ...ONES, str: 500 },
    weaponItemId: "scythe",
  });
  expect(over.pAtk).toBeCloseTo(capped.pAtk, 9);

  // and a negative stat floors at 1 rather than going below the baseline
  const under = derivedStats({
    level: 1,
    allocated: { ...ONES, str: -40 },
    weaponItemId: "scythe",
  });
  expect(under.pAtk).toBeCloseTo(
    derivedStats({ level: 1, allocated: ONES, weaponItemId: "scythe" }).pAtk,
    9,
  );
});

test("total offence is conserved: pAtk + mAtk tracks gear, not the channel split", () => {
  const L = 30;
  const a = { ...ONES, str: 50, int: 50, dex: 50 };
  const sword = derivedStats({
    level: L,
    allocated: a,
    weaponItemId: "basic_sword",
  });
  const scythe = derivedStats({
    level: L,
    allocated: a,
    weaponItemId: "scythe",
  });
  // same stat (str), same rho (1), different gear -> totals differ ONLY by gear
  expect((sword.pAtk + sword.mAtk) / (scythe.pAtk + scythe.mAtk)).toBeCloseTo(
    10 / 18,
    9,
  );
});

test("magic_staff splits its output by the catalog's channel ratio", () => {
  const r = derivedStats({
    level: 1,
    allocated: ONES,
    weaponItemId: "magic_staff",
  });
  expect(r.pAtk / (r.pAtk + r.mAtk)).toBeCloseTo(2 / 17, 9);
  expect(r.mAtk).toBeGreaterThan(r.pAtk);
});

test("unarmed is weaker than the worst weapon but not zero", () => {
  const bare = derivedStats({ level: 10, allocated: ONES });
  const knife = derivedStats({
    level: 10,
    allocated: ONES,
    weaponItemId: "dagger",
  });
  expect(bare.pAtk).toBeGreaterThan(0);
  expect(bare.pAtk).toBeLessThan(knife.pAtk);
  expect(bare.mAtk).toBe(0); // bare hands are physical
});

test("an unknown weaponItemId is treated as unarmed, not as an error", () => {
  const bad = derivedStats({
    level: 10,
    allocated: ONES,
    weaponItemId: "nope",
  });
  expect(bad).toEqual(derivedStats({ level: 10, allocated: ONES }));
});

test("agi drives move speed only, and move speed is level-free", () => {
  const slow = derivedStats({ level: 1, allocated: ONES });
  const fast = derivedStats({ level: 1, allocated: { ...ONES, agi: 99 } });
  expect(fast.maxMoveSpeed).toBeGreaterThan(slow.maxMoveSpeed);
  // D8: agi is R-invisible — it moves no offence or defence number
  expect(fast.pAtk).toBeCloseTo(slow.pAtk, 9);
  expect(fast.pDef).toBeCloseTo(slow.pDef, 9);
  expect(fast.maxHealth).toBeCloseTo(slow.maxHealth, 9);
  // and levelling never changes move speed
  expect(derivedStats({ level: 99, allocated: ONES }).maxMoveSpeed).toBeCloseTo(
    slow.maxMoveSpeed,
    9,
  );
});
