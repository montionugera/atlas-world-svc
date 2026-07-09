import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import type { MatchEventType } from "./types";

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
    pAtk: z.number().optional(),
    mAtk: z.number().optional(),
  })
  .strict() satisfies z.ZodType<ItemDef>;

export const skillDefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    maxLevel: z.number(),
    requires: z.array(z.string()),
  })
  .strict() satisfies z.ZodType<SkillDef>;

export const questObjectiveSchema = z
  .object({
    id: z.string(),
    type: z.enum(MATCH_EVENT_TYPES),
    targetId: z.string(),
    required: z.number(),
  })
  .strict() satisfies z.ZodType<QuestObjective>;

export const questDefSchema = z
  .object({
    id: z.string(),
    objectives: z.array(questObjectiveSchema),
    rewards: z
      .object({
        xp: z.number(),
        items: z.array(
          z.object({ itemId: z.string(), qty: z.number() }).strict(),
        ),
      })
      .strict(),
  })
  .strict() satisfies z.ZodType<QuestDef>;

/**
 * Reads and validates a catalog JSON file at import time — throws immediately
 * on malformed content instead of deferring the failure to first use.
 */
function loadCatalog<T>(fileName: string, schema: z.ZodType<T[]>): T[] {
  const filePath = path.join(__dirname, "../../content", fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const json: unknown = JSON.parse(raw);
  return schema.parse(json);
}

export const ITEMS: ItemDef[] = loadCatalog(
  "items.json",
  z.array(itemDefSchema),
);
export const SKILLS: SkillDef[] = loadCatalog(
  "skills.json",
  z.array(skillDefSchema),
);
export const QUESTS: QuestDef[] = loadCatalog(
  "quests.json",
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
