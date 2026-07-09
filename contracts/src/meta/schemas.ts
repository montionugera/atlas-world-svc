import { z } from "zod";
import { COLLECTIONS } from "./ids";
import type {
  ProfileDoc,
  InventoryDoc,
  EquipmentDoc,
  SkillsDoc,
  QuestsDoc,
  MatchEvent,
  MatchEventBatch,
  LoadoutSnapshot,
} from "./types";

const primaryStatsSchema = z
  .object({
    str: z.number(),
    agi: z.number(),
    int: z.number(),
    vit: z.number(),
  })
  .strict();

export const profileDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    level: z.number(),
    xp: z.number(),
    statPoints: z.number(),
    allocated: primaryStatsSchema,
  })
  .strict() satisfies z.ZodType<ProfileDoc>;

export const inventoryDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    stackables: z.array(
      z.object({ itemId: z.string(), qty: z.number() }).strict(),
    ),
    uniques: z.array(
      z.object({ instanceId: z.string(), itemId: z.string() }).strict(),
    ),
  })
  .strict() satisfies z.ZodType<InventoryDoc>;

export const equipmentDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    slots: z
      .object({
        weapon: z.string().optional(),
        armor: z.string().optional(),
        accessory: z.string().optional(),
      })
      .strict(),
  })
  .strict() satisfies z.ZodType<EquipmentDoc>;

export const skillsDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    unlocked: z.array(
      z.object({ skillId: z.string(), level: z.number() }).strict(),
    ),
    loadout: z.array(z.string()).max(4),
  })
  .strict() satisfies z.ZodType<SkillsDoc>;

export const questsDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    active: z.array(
      z
        .object({
          questId: z.string(),
          startedAt: z.number(),
          objectives: z.record(z.string(), z.number()),
        })
        .strict(),
    ),
    completed: z.array(
      z
        .object({
          questId: z.string(),
          completedAt: z.number(),
          claimed: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict() satisfies z.ZodType<QuestsDoc>;

const matchEventSchema = z
  .object({
    type: z.enum(["MOB_KILLED", "ITEM_PICKED_UP", "ZONE_ENTERED"]),
    userId: z.string(),
    targetId: z.string(),
    count: z.number(),
  })
  .strict() satisfies z.ZodType<MatchEvent>;

export const matchEventBatchSchema = z
  .object({
    matchId: z.string(),
    seq: z.number(),
    events: z.array(matchEventSchema),
  })
  .strict() satisfies z.ZodType<MatchEventBatch>;

export const loadoutSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: profileDocSchema,
    equippedItemIds: z
      .object({
        weapon: z.string().optional(),
        armor: z.string().optional(),
        accessory: z.string().optional(),
      })
      .strict(),
    skillLoadout: z.array(z.string()),
    activeQuestIds: z.array(z.string()),
  })
  .strict() satisfies z.ZodType<LoadoutSnapshot>;

type DefaultDocMap = {
  [COLLECTIONS.profile]: ProfileDoc;
  [COLLECTIONS.inventory]: InventoryDoc;
  [COLLECTIONS.equipment]: EquipmentDoc;
  [COLLECTIONS.skills]: SkillsDoc;
  [COLLECTIONS.quests]: QuestsDoc;
};

const DEFAULT_DOC_FACTORIES: {
  [K in keyof DefaultDocMap]: () => DefaultDocMap[K];
} = {
  [COLLECTIONS.profile]: () => ({
    schemaVersion: 1,
    level: 1,
    xp: 0,
    statPoints: 0,
    allocated: { str: 1, agi: 1, int: 1, vit: 1 },
  }),
  [COLLECTIONS.inventory]: () => ({
    schemaVersion: 1,
    stackables: [],
    uniques: [],
  }),
  [COLLECTIONS.equipment]: () => ({ schemaVersion: 1, slots: {} }),
  [COLLECTIONS.skills]: () => ({ schemaVersion: 1, unlocked: [], loadout: [] }),
  [COLLECTIONS.quests]: () => ({ schemaVersion: 1, active: [], completed: [] }),
};

/**
 * Factory returning a fresh default empty doc for any collection. Every call
 * yields a brand-new object graph, so callers can freely mutate the result
 * per-user without aliasing a shared singleton.
 */
export function defaultDoc<K extends keyof DefaultDocMap>(
  collection: K,
): DefaultDocMap[K] {
  return DEFAULT_DOC_FACTORIES[collection]();
}

/** Fresh, mutable default profile (single-path sibling of defaultDoc). */
export function defaultProfile(): ProfileDoc {
  return DEFAULT_DOC_FACTORIES[COLLECTIONS.profile]();
}

/**
 * Deep-frozen canonical default profile — safe to read/compare against, never
 * mutate. To seed a new player's (mutable) profile use defaultProfile() or
 * defaultDoc(COLLECTIONS.profile); mutating this constant throws in strict mode.
 */
export const DEFAULT_PROFILE: ProfileDoc = ((): ProfileDoc => {
  const p = defaultProfile();
  Object.freeze(p.allocated);
  Object.freeze(p);
  return p;
})();
