import { derivedStats } from "./derivedStats";

test("level-1 defaults (allocated all 1, no weapon) match known numbers", () => {
  const result = derivedStats({
    level: 1,
    allocated: { str: 1, agi: 1, int: 1, vit: 1 },
  });
  expect(result).toEqual({
    maxHealth: 110, // 100 + 10*1 + 5*0
    pAtk: 12, // 10 + 2*1 + 0
    mAtk: 12, // 10 + 2*1 + 0
    pDef: 6, // 5 + 1
    mDef: 6, // 5 + 1
    maxMoveSpeed: 20.2, // 20 + 0.2*1
  });
});

test("level-5 str build with a weapon (basic_sword, pAtk 10) matches known numbers", () => {
  const result = derivedStats({
    level: 5,
    allocated: { str: 10, agi: 1, int: 1, vit: 5 },
    weaponItemId: "basic_sword",
  });
  expect(result).toEqual({
    maxHealth: 170, // 100 + 10*5 + 5*4
    pAtk: 40, // 10 + 2*10 + 10 (weapon pAtk)
    mAtk: 12, // 10 + 2*1 + 0 (weapon mAtk)
    pDef: 10, // 5 + 5
    mDef: 6, // 5 + 1
    maxMoveSpeed: 20.2, // 20 + 0.2*1
  });
});

test("unknown weaponItemId falls back to 0 weapon contribution (not an error)", () => {
  const result = derivedStats({
    level: 1,
    allocated: { str: 1, agi: 1, int: 1, vit: 1 },
    weaponItemId: "not_a_real_item",
  });
  expect(result.pAtk).toBe(12);
  expect(result.mAtk).toBe(12);
});

test("magic_staff weapon contributes to mAtk, not pAtk", () => {
  const result = derivedStats({
    level: 1,
    allocated: { str: 1, agi: 1, int: 10, vit: 1 },
    weaponItemId: "magic_staff",
  });
  expect(result.pAtk).toBe(12 + 2); // weapon pAtk 2
  expect(result.mAtk).toBe(10 + 2 * 10 + 15); // weapon mAtk 15
});
