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

test("two weapon items (basic_sword, magic_staff) carry pAtk/mAtk for derivedStats lookup", () => {
  expect(ITEMS_BY_ID["basic_sword"]).toMatchObject({
    kind: "weapon",
    pAtk: 10,
    mAtk: 0,
  });
  expect(ITEMS_BY_ID["magic_staff"]).toMatchObject({
    kind: "weapon",
    pAtk: 2,
    mAtk: 15,
  });
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
