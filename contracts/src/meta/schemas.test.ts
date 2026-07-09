import {
  profileDocSchema,
  inventoryDocSchema,
  equipmentDocSchema,
  skillsDocSchema,
  questsDocSchema,
  matchEventBatchSchema,
  DEFAULT_PROFILE,
  defaultDoc,
  defaultProfile,
} from "./schemas";
import { COLLECTIONS } from "./ids";

test("DEFAULT_PROFILE validates", () => {
  expect(profileDocSchema.parse(DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE);
});

test("unknown keys are rejected (strict)", () => {
  expect(() =>
    profileDocSchema.parse({ ...DEFAULT_PROFILE, hax: 1 }),
  ).toThrow();
});

test("batch requires monotonic-friendly shape", () => {
  const b = {
    matchId: "m1",
    seq: 0,
    events: [{ type: "MOB_KILLED", userId: "u1", targetId: "boar", count: 1 }],
  };
  expect(matchEventBatchSchema.parse(b)).toEqual(b);
});

test("defaultDoc(inventory) validates against inventoryDocSchema", () => {
  const doc = defaultDoc(COLLECTIONS.inventory);
  expect(inventoryDocSchema.parse(doc)).toEqual(doc);
});

test("defaultDoc(equipment) validates against equipmentDocSchema", () => {
  const doc = defaultDoc(COLLECTIONS.equipment);
  expect(equipmentDocSchema.parse(doc)).toEqual(doc);
});

test("defaultDoc(skills) validates against skillsDocSchema", () => {
  const doc = defaultDoc(COLLECTIONS.skills);
  expect(skillsDocSchema.parse(doc)).toEqual(doc);
});

test("defaultDoc(quests) validates against questsDocSchema", () => {
  const doc = defaultDoc(COLLECTIONS.quests);
  expect(questsDocSchema.parse(doc)).toEqual(doc);
});

test("defaultDoc(profile) validates and is a fresh mutable object each call", () => {
  const a = defaultDoc(COLLECTIONS.profile);
  const b = defaultDoc(COLLECTIONS.profile);
  expect(profileDocSchema.parse(a)).toEqual(a);
  expect(a).not.toBe(b);
  expect(a.allocated).not.toBe(b.allocated); // nested graph is fresh, not aliased
  a.allocated.str = 99;
  expect(b.allocated.str).toBe(1); // mutating one must not corrupt the next default
});

test("defaultProfile() equals DEFAULT_PROFILE by value but is a distinct instance", () => {
  const p = defaultProfile();
  expect(p).toEqual(DEFAULT_PROFILE);
  expect(p).not.toBe(DEFAULT_PROFILE);
});

test("DEFAULT_PROFILE is deep-frozen (mutation throws in strict mode)", () => {
  expect(Object.isFrozen(DEFAULT_PROFILE)).toBe(true);
  expect(Object.isFrozen(DEFAULT_PROFILE.allocated)).toBe(true);
  expect(() => {
    (DEFAULT_PROFILE.allocated as { str: number }).str = 99;
  }).toThrow();
});

// HIGH-2 guard: the schema/type "cannot drift" claim rests on nested .strict().
// `satisfies z.ZodType<Interface>` does NOT catch a dropped nested .strict(),
// so assert unknown-key rejection on every nested object explicitly.
test("nested objects reject unknown keys (strict end-to-end)", () => {
  // profile.allocated
  expect(() =>
    profileDocSchema.parse({
      ...defaultProfile(),
      allocated: { str: 1, agi: 1, int: 1, vit: 1, hax: 1 },
    }),
  ).toThrow();
  // equipment.slots
  expect(() =>
    equipmentDocSchema.parse({
      schemaVersion: 1,
      slots: { weapon: "w", hax: 1 },
    }),
  ).toThrow();
  // inventory.stackables[] and uniques[]
  expect(() =>
    inventoryDocSchema.parse({
      schemaVersion: 1,
      stackables: [{ itemId: "i", qty: 1, hax: 1 }],
      uniques: [],
    }),
  ).toThrow();
  expect(() =>
    inventoryDocSchema.parse({
      schemaVersion: 1,
      stackables: [],
      uniques: [{ instanceId: "x", itemId: "i", hax: 1 }],
    }),
  ).toThrow();
  // skills.unlocked[]
  expect(() =>
    skillsDocSchema.parse({
      schemaVersion: 1,
      unlocked: [{ skillId: "s", level: 1, hax: 1 }],
      loadout: [],
    }),
  ).toThrow();
  // quests.active[] and completed[]
  expect(() =>
    questsDocSchema.parse({
      schemaVersion: 1,
      active: [{ questId: "q", startedAt: 0, objectives: {}, hax: 1 }],
      completed: [],
    }),
  ).toThrow();
  expect(() =>
    questsDocSchema.parse({
      schemaVersion: 1,
      active: [],
      completed: [{ questId: "q", completedAt: 0, claimed: false, hax: 1 }],
    }),
  ).toThrow();
});

test("skills loadout is capped at 4 (runtime refinement)", () => {
  expect(() =>
    skillsDocSchema.parse({
      schemaVersion: 1,
      unlocked: [],
      loadout: ["a", "b", "c", "d", "e"],
    }),
  ).toThrow();
});
