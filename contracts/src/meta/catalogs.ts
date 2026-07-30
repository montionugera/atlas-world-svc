import { z } from "zod";
import type { AtkStat, MatchEventType } from "./types";

// Reuses the AtkStat union from ./types as the single source of truth for which
// primary stat a weapon's damage reads; `satisfies` keeps this array in sync.
const ATK_STATS = ["str", "dex", "int"] as const satisfies readonly AtkStat[];

// Reuses the MatchEventType union from ./types as the single source of truth for
// objective event types; `satisfies` keeps this array in sync at compile time.
const MATCH_EVENT_TYPES = [
  "MOB_KILLED",
  "ITEM_PICKED_UP",
  "ZONE_ENTERED",
] as const satisfies readonly MatchEventType[];

export interface ItemDef {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "accessory" | "consumable" | "material";
  stackable: boolean;
  /** Weapon physical attack contribution. Only meaningful for kind: "weapon". */
  pAtk?: number;
  /** Weapon magic attack contribution. Only meaningful for kind: "weapon". */
  mAtk?: number;
  /**
   * Which single primary stat this weapon's damage reads. Only meaningful for
   * kind: "weapon", and required for every weapon (gated in weaponStats.test.ts).
   * Mirrors the `projectileType` recorded in
   * colyseus-server/src/config/combat/weapons.ts — MELEE/SMALL_MELEE/LARGE_MELEE
   * are "str", ARROW is "dex", MAGIC_SPEAR is "int". Nothing dedups those two
   * catalogs, so a test gates them against each other instead.
   */
  atkStat?: AtkStat;
}

export interface SkillDef {
  id: string;
  name: string;
  maxLevel: number;
  /** Skill ids that must be unlocked first. Reserved for a future skill tree. */
  requires: string[];
}

export interface QuestObjective {
  id: string;
  type: MatchEventType;
  targetId: string;
  required: number;
}

export interface QuestReward {
  xp: number;
  items: { itemId: string; qty: number }[];
}

export interface QuestDef {
  id: string;
  objectives: QuestObjective[];
  rewards: QuestReward;
}

export const itemDefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["weapon", "armor", "accessory", "consumable", "material"]),
    stackable: z.boolean(),
    pAtk: z.number().int().nonnegative().optional(),
    mAtk: z.number().int().nonnegative().optional(),
    atkStat: z.enum(ATK_STATS).optional(),
  })
  .strict() satisfies z.ZodType<ItemDef>;

export const skillDefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    maxLevel: z.number().int().positive(),
    requires: z.array(z.string()),
  })
  .strict() satisfies z.ZodType<SkillDef>;

export const questObjectiveSchema = z
  .object({
    id: z.string(),
    type: z.enum(MATCH_EVENT_TYPES),
    targetId: z.string(),
    required: z.number().int().positive(),
  })
  .strict() satisfies z.ZodType<QuestObjective>;

export const questDefSchema = z
  .object({
    id: z.string(),
    objectives: z.array(questObjectiveSchema),
    rewards: z
      .object({
        xp: z.number().int().nonnegative(),
        items: z.array(
          z
            .object({ itemId: z.string(), qty: z.number().int().positive() })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict() satisfies z.ZodType<QuestDef>;

/**
 * Catalog JSON is pulled in via plain `require(...)` (NOT an `import`
 * statement) so that neither `fs` nor `path` ever appears in this module.
 * That matters beyond Node: this package is also bundled straight into the
 * Nakama runtime (goja via esbuild), which has no `fs` — a top-level
 * `import ... from "fs"` here would crash Nakama's InitModule at load time
 * the moment ANY file imports anything from "@atlas/contracts" (this module
 * is eagerly evaluated by the package's barrel `export *`). A relative
 * `require("*.json")` is resolved by Node natively at runtime and inlined
 * as a plain object by esbuild's built-in JSON loader when bundled — no
 * `fs`/`path` involved either way. Using `require` (not `import ... from
 * ".json"`) also sidesteps tsc's `rootDir` restriction, since
 * `contracts/content/` sits outside `rootDir: "./src"`.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const itemsJson: unknown = require("../../content/items.json");
const skillsJson: unknown = require("../../content/skills.json");
const questsJson: unknown = require("../../content/quests.json");
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * Validates already-loaded catalog JSON — throws immediately on malformed
 * content instead of deferring the failure to first use.
 */
function loadCatalog<T>(json: unknown, schema: z.ZodType<T[]>): T[] {
  return schema.parse(json);
}

export const ITEMS: ItemDef[] = loadCatalog(itemsJson, z.array(itemDefSchema));
export const SKILLS: SkillDef[] = loadCatalog(
  skillsJson,
  z.array(skillDefSchema),
);
export const QUESTS: QuestDef[] = loadCatalog(
  questsJson,
  z.array(questDefSchema),
);

export const ITEMS_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ITEMS.map((item) => [item.id, item]),
);
export const SKILLS_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  SKILLS.map((skill) => [skill.id, skill]),
);
export const QUESTS_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((quest) => [quest.id, quest]),
);

/**
 * Cross-catalog referential-integrity checks that a per-file zod schema can't
 * express on its own (a quest's reward itemId must exist in the item
 * catalog, a skill's prerequisites must be real skill ids, an objective's
 * targetId must be non-empty). Throws a clear error naming the offending id
 * on the first violation found. Exported so tests can exercise it directly
 * against synthetic bad data without needing a bad file on disk.
 */
export function validateCatalogIntegrity(
  items: ItemDef[],
  skills: SkillDef[],
  quests: QuestDef[],
): void {
  const itemIds = new Set(items.map((item) => item.id));
  const skillIds = new Set(skills.map((skill) => skill.id));

  for (const skill of skills) {
    for (const requiredSkillId of skill.requires) {
      if (!skillIds.has(requiredSkillId)) {
        throw new Error(
          `catalogs: skill "${skill.id}" requires unknown skill id "${requiredSkillId}"`,
        );
      }
    }
  }

  for (const quest of quests) {
    for (const rewardItem of quest.rewards.items) {
      if (!itemIds.has(rewardItem.itemId)) {
        throw new Error(
          `catalogs: quest "${quest.id}" rewards unknown item id "${rewardItem.itemId}"`,
        );
      }
    }
    for (const objective of quest.objectives) {
      if (objective.targetId.trim().length === 0) {
        throw new Error(
          `catalogs: quest "${quest.id}" objective "${objective.id}" has an empty targetId`,
        );
      }
    }
  }
}

// Enforced at import time, matching loadCatalog's own "throws immediately on
// malformed content" intent — a broken cross-reference must fail the module
// load, not silently pass until some later runtime lookup returns undefined.
validateCatalogIntegrity(ITEMS, SKILLS, QUESTS);
