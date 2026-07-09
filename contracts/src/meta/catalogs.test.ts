import {
  ITEMS,
  SKILLS,
  QUESTS,
  ITEMS_BY_ID,
  itemDefSchema,
  skillDefSchema,
  questDefSchema,
} from "./catalogs";

test("items.json parses against itemDefSchema and has at least 5 entries", () => {
  expect(ITEMS.length).toBeGreaterThanOrEqual(5);
  for (const item of ITEMS) {
    expect(itemDefSchema.parse(item)).toEqual(item);
  }
});

test("skills.json parses against skillDefSchema and has at least 4 entries", () => {
  expect(SKILLS.length).toBeGreaterThanOrEqual(4);
  for (const skill of SKILLS) {
    expect(skillDefSchema.parse(skill)).toEqual(skill);
  }
});

test("quests.json parses against questDefSchema and has at least 3 entries", () => {
  expect(QUESTS.length).toBeGreaterThanOrEqual(3);
  for (const quest of QUESTS) {
    expect(questDefSchema.parse(quest)).toEqual(quest);
  }
});

test("every quest reward itemId exists in items.json", () => {
  for (const quest of QUESTS) {
    for (const rewardItem of quest.rewards.items) {
      expect(ITEMS_BY_ID[rewardItem.itemId]).toBeDefined();
    }
  }
});

test("every quest objective targetId is non-empty", () => {
  for (const quest of QUESTS) {
    for (const objective of quest.objectives) {
      expect(objective.targetId.length).toBeGreaterThan(0);
    }
  }
});

test("q_boar_5 exists: kill 5 boars -> 100 xp + a potion", () => {
  const quest = QUESTS.find((q) => q.id === "q_boar_5");
  expect(quest).toBeDefined();
  expect(quest?.objectives).toEqual([
    { id: "kill_boars", type: "MOB_KILLED", targetId: "boar", required: 5 },
  ]);
  expect(quest?.rewards.xp).toBe(100);
  expect(quest?.rewards.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ itemId: "potion_minor" }),
    ]),
  );
});

// Source of truth for these stats: colyseus-server/src/config/combat/weapons.ts
// (the WEAPONS map). Cross-package import into this test was avoided (separate
// tsconfig/jest project); keep this list in sync by hand whenever weapons.ts
// changes. This directly guards derivedStats()'s ITEMS_BY_ID weapon lookup —
// a weapon id missing here (or present but with wrong pAtk/mAtk) silently
// contributes 0 to a player's derived pAtk/mAtk instead of erroring.
const EXPECTED_WEAPONS: Record<string, { pAtk: number; mAtk: number }> = {
  basic_sword: { pAtk: 10, mAtk: 0 },
  magic_staff: { pAtk: 2, mAtk: 15 },
  great_bow: { pAtk: 16, mAtk: 0 },
  dagger: { pAtk: 6, mAtk: 0 },
  scythe: { pAtk: 18, mAtk: 0 },
};

test("every equippable weapon in weapons.ts exists in items.json with matching pAtk/mAtk", () => {
  for (const [id, stats] of Object.entries(EXPECTED_WEAPONS)) {
    expect(ITEMS_BY_ID[id]).toMatchObject({
      kind: "weapon",
      pAtk: stats.pAtk,
      mAtk: stats.mAtk,
    });
  }
});

test("loaders throw on bad data (strict schema rejects unknown/malformed shape)", () => {
  expect(() => itemDefSchema.parse({ id: "x", name: "X" })).toThrow(); // missing kind/stackable
  expect(() =>
    itemDefSchema.parse({
      id: "x",
      name: "X",
      kind: "weapon",
      stackable: false,
      hax: 1,
    }),
  ).toThrow(); // unknown key rejected (strict)
  expect(() =>
    questDefSchema.parse({
      id: "q",
      objectives: [
        { id: "o", type: "NOT_A_REAL_EVENT", targetId: "t", required: 1 },
      ],
      rewards: { xp: 0, items: [] },
    }),
  ).toThrow(); // objective type must be a valid MatchEventType
});
