import { z } from "zod";
import { ITEMS, SKILLS, type ItemDef, type SkillDef } from "./catalogs";

export const ELEMENT_TYPES = [
  "Neutral",
  "Water",
  "Earth",
  "Fire",
  "Wind",
  "Poison",
  "Holy",
  "Shadow",
  "Ghost",
  "Undead",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const MOB_RACES = [
  "Formless",
  "Undead",
  "Brute",
  "Plant",
  "Insect",
  "Fish",
  "Demon",
  "DemiHuman",
  "Angel",
  "Dragon",
] as const;
export type MobRace = (typeof MOB_RACES)[number];

export const MOB_SIZES = ["Small", "Medium", "Large"] as const;
export type MobSize = (typeof MOB_SIZES)[number];

export const MOB_RANKS = ["E", "D", "C", "B", "A", "S", "SS", "SSS"] as const;
export type MobRank = (typeof MOB_RANKS)[number];

export const QUEST_CATEGORIES = [
  "main_story",
  "job_change",
  "platinum_skill",
  "side_story",
  "daily_bounty",
  "guild_commission",
] as const;
export type QuestCategory = (typeof QUEST_CATEGORIES)[number];

export const jobDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    tier: z.number().int().min(0).max(3),
    parentJobId: z.string().nullable(),
    minBaseLevel: z.number().int().min(1).max(99),
    maxJobLevel: z.number().int().min(10).max(70),
    jobChangeQuestId: z.string().nullable(),
    primaryStats: z.array(z.enum(["str", "agi", "vit", "int", "dex"])).min(1),
    allowedWeaponKinds: z.array(z.string().min(1)).min(1),
    jobBonusAtMax: z
      .object({
        str: z.number().int().nonnegative(),
        agi: z.number().int().nonnegative(),
        vit: z.number().int().nonnegative(),
        int: z.number().int().nonnegative(),
        dex: z.number().int().nonnegative(),
      })
      .strict(),
    unlockedSkillIds: z.array(z.string().min(1)),
    assetStudioKey: z.string().regex(/^job\.[a-z0-9_]+$/),
  })
  .strict();
export type JobDef = z.infer<typeof jobDefSchema>;

export const cardDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slot: z.enum(["weapon", "armor", "accessory", "headgear"]),
    mobId: z.string().min(1),
    equipStats: z.record(z.string(), z.number().int()),
    handbookDepositStats: z.record(z.string(), z.number().int()),
    assetStudioKey: z.string().regex(/^card\.[a-z0-9_]+$/),
  })
  .strict();
export type CardDef = z.infer<typeof cardDefSchema>;

export const mobDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    level: z.number().int().min(1).max(99),
    rank: z.enum(MOB_RANKS),
    element: z.enum(ELEMENT_TYPES),
    race: z.enum(MOB_RACES),
    size: z.enum(MOB_SIZES),
    isMvp: z.boolean(),
    hp: z.number().int().positive(),
    pAtk: z.number().int().nonnegative(),
    pDef: z.number().int().nonnegative(),
    baseExp: z.number().int().nonnegative(),
    jobExp: z.number().int().nonnegative(),
    aggroRangeM: z.number().nonnegative(),
    leashRangeM: z.number().positive(),
    spawnZones: z.array(z.string().min(1)).min(1),
    drops: z.array(
      z
        .object({
          itemId: z.string().min(1),
          chanceBps: z.number().int().min(1).max(10000),
        })
        .strict(),
    ),
    cardId: z.string().nullable(),
    assetStudioKey: z.string().regex(/^mob\.[a-z0-9_]+$/),
  })
  .strict();
export type MobDef = z.infer<typeof mobDefSchema>;

export const questBoardEntrySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: z.enum(QUEST_CATEGORIES),
    minBaseLevel: z.number().int().min(1).max(99),
    requiredJobId: z.string().nullable(),
    giverNpcId: z.string().min(1),
    zoneId: z.string().min(1),
    repeatable: z.boolean(),
    objectives: z
      .array(
        z
          .object({
            id: z.string().min(1),
            type: z.enum(["MOB_KILLED", "ITEM_PICKED_UP", "ZONE_ENTERED"]),
            targetId: z.string().min(1),
            required: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
    rewards: z
      .object({
        baseXp: z.number().int().nonnegative(),
        jobXp: z.number().int().nonnegative(),
        unlockJobId: z.string().nullable(),
        unlockSkillId: z.string().nullable(),
        reputation: z.number().int().nonnegative(),
        items: z.array(
          z
            .object({
              itemId: z.string().min(1),
              qty: z.number().int().positive(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
export type QuestBoardEntry = z.infer<typeof questBoardEntrySchema>;

export const handbookEntrySchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(["monster_research", "scenic_vista", "card_album"]),
    title: z.string().min(1),
    targetId: z.string().min(1),
    tiers: z
      .array(
        z
          .object({
            requiredCount: z.number().int().positive(),
            unlockNote: z.string().min(1),
            bonusStat: z.string().min(1),
            bonusValue: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type HandbookEntry = z.infer<typeof handbookEntrySchema>;

export const castleDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    hubTownId: z.string().min(1),
    siegeMapId: z.string().min(1),
    siegeDurationMinutes: z.number().int().positive(),
    maxGuildSize: z.number().int().positive(),
    emperium: z
      .object({
        hp: z.number().int().positive(),
        element: z.enum(ELEMENT_TYPES),
        race: z.enum(MOB_RACES),
        size: z.enum(MOB_SIZES),
        onlyNormalAttackDamage: z.boolean(),
      })
      .strict(),
    fortifications: z
      .object({
        outerGateBarricadeCount: z.number().int().nonnegative(),
        innerGateBarricadeCount: z.number().int().nonnegative(),
        guardianStoneCount: z.number().int().nonnegative(),
        barricadeHp: z.number().int().positive(),
      })
      .strict(),
    pvpRules: z
      .object({
        playerDamageScalingPct: z.number().int().min(10).max(100),
        rangedDamageInSiegePct: z.number().int().min(10).max(100),
        knockbackDisabled: z.boolean(),
        consumableCooldownMs: z.number().int().nonnegative(),
      })
      .strict(),
    ownerRewards: z
      .object({
        dailyTreasureChestCount: z.number().int().nonnegative(),
        guildDungeonZoneId: z.string().min(1),
        townTaxShareBps: z.number().int().nonnegative(),
      })
      .strict(),
    assetStudioKey: z.string().regex(/^castle\.[a-z0-9_]+$/),
  })
  .strict();
export type CastleDef = z.infer<typeof castleDefSchema>;

/* eslint-disable @typescript-eslint/no-var-requires */
const jobsJson: unknown = require("../../content/jobs.json");
const cardsJson: unknown = require("../../content/cards.json");
const mobsJson: unknown = require("../../content/mobs.json");
const questBoardJson: unknown = require("../../content/quest_board.json");
const handbookJson: unknown = require("../../content/handbook.json");
const castlesJson: unknown = require("../../content/castles.json");
/* eslint-enable @typescript-eslint/no-var-requires */

export const JOBS: JobDef[] = z.array(jobDefSchema).parse(jobsJson);
export const CARDS: CardDef[] = z.array(cardDefSchema).parse(cardsJson);
export const MOBS: MobDef[] = z.array(mobDefSchema).parse(mobsJson);
export const QUEST_BOARD: QuestBoardEntry[] = z
  .array(questBoardEntrySchema)
  .parse(questBoardJson);
export const HANDBOOK: HandbookEntry[] = z
  .array(handbookEntrySchema)
  .parse(handbookJson);
export const CASTLES: CastleDef[] = z.array(castleDefSchema).parse(castlesJson);

export const JOBS_BY_ID: Record<string, JobDef> = Object.fromEntries(
  JOBS.map((j) => [j.id, j]),
);
export const MOBS_BY_ID: Record<string, MobDef> = Object.fromEntries(
  MOBS.map((m) => [m.id, m]),
);
export const CARDS_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

/**
 * Validates cross-domain referential integrity across all MMORPG catalogs:
 * - Job parentJobId, jobChangeQuestId, unlockedSkillIds, and allowedWeaponKinds
 * - Mob drop itemIds and cardId
 * - Card mobId
 * - QuestBoard requiredJobId, unlockJobId, unlockSkillId, reward itemIds, and MOB_KILLED/ITEM_PICKED_UP targetIds
 * - Handbook monster_research targetIds
 */
export function validateMmorpgCatalogIntegrity(
  items: ItemDef[] = ITEMS,
  skills: SkillDef[] = SKILLS,
  jobs: JobDef[] = JOBS,
  mobs: MobDef[] = MOBS,
  cards: CardDef[] = CARDS,
  questBoard: QuestBoardEntry[] = QUEST_BOARD,
  handbook: HandbookEntry[] = HANDBOOK,
): void {
  const itemIds = new Set(items.map((i) => i.id));
  const skillIds = new Set(skills.map((s) => s.id));
  const jobIds = new Set(jobs.map((j) => j.id));
  const mobIds = new Set(mobs.map((m) => m.id));
  const cardIds = new Set(cards.map((c) => c.id));
  const questIds = new Set(questBoard.map((q) => q.id));

  for (const job of jobs) {
    if (job.parentJobId !== null && !jobIds.has(job.parentJobId)) {
      throw new Error(
        `mmorpgCatalogs: job "${job.id}" references unknown parentJobId "${job.parentJobId}"`,
      );
    }
    if (job.jobChangeQuestId !== null && !questIds.has(job.jobChangeQuestId)) {
      throw new Error(
        `mmorpgCatalogs: job "${job.id}" references unknown jobChangeQuestId "${job.jobChangeQuestId}"`,
      );
    }
    for (const skillId of job.unlockedSkillIds) {
      if (!skillIds.has(skillId)) {
        throw new Error(
          `mmorpgCatalogs: job "${job.id}" references unknown skill "${skillId}"`,
        );
      }
    }
    for (const weaponId of job.allowedWeaponKinds) {
      if (!itemIds.has(weaponId)) {
        throw new Error(
          `mmorpgCatalogs: job "${job.id}" references unknown weapon "${weaponId}"`,
        );
      }
    }
  }

  for (const mob of mobs) {
    for (const drop of mob.drops) {
      if (!itemIds.has(drop.itemId)) {
        throw new Error(
          `mmorpgCatalogs: mob "${mob.id}" drops unknown item "${drop.itemId}"`,
        );
      }
    }
    if (mob.cardId !== null && !cardIds.has(mob.cardId)) {
      throw new Error(
        `mmorpgCatalogs: mob "${mob.id}" references unknown cardId "${mob.cardId}"`,
      );
    }
  }

  for (const card of cards) {
    if (!mobIds.has(card.mobId)) {
      throw new Error(
        `mmorpgCatalogs: card "${card.id}" references unknown mobId "${card.mobId}"`,
      );
    }
  }

  for (const quest of questBoard) {
    if (quest.requiredJobId !== null && !jobIds.has(quest.requiredJobId)) {
      throw new Error(
        `mmorpgCatalogs: quest "${quest.id}" requires unknown job "${quest.requiredJobId}"`,
      );
    }
    if (
      quest.rewards.unlockJobId !== null &&
      !jobIds.has(quest.rewards.unlockJobId)
    ) {
      throw new Error(
        `mmorpgCatalogs: quest "${quest.id}" unlocks unknown job "${quest.rewards.unlockJobId}"`,
      );
    }
    if (
      quest.rewards.unlockSkillId !== null &&
      !skillIds.has(quest.rewards.unlockSkillId)
    ) {
      throw new Error(
        `mmorpgCatalogs: quest "${quest.id}" unlocks unknown skill "${quest.rewards.unlockSkillId}"`,
      );
    }
    for (const rewardItem of quest.rewards.items) {
      if (!itemIds.has(rewardItem.itemId)) {
        throw new Error(
          `mmorpgCatalogs: quest "${quest.id}" rewards unknown item "${rewardItem.itemId}"`,
        );
      }
    }
    for (const obj of quest.objectives) {
      if (obj.type === "MOB_KILLED" && !mobIds.has(obj.targetId)) {
        throw new Error(
          `mmorpgCatalogs: quest "${quest.id}" objective "${obj.id}" targets unknown mob "${obj.targetId}"`,
        );
      }
      if (obj.type === "ITEM_PICKED_UP" && !itemIds.has(obj.targetId)) {
        throw new Error(
          `mmorpgCatalogs: quest "${quest.id}" objective "${obj.id}" targets unknown item "${obj.targetId}"`,
        );
      }
    }
  }

  for (const entry of handbook) {
    if (entry.category === "monster_research" && !mobIds.has(entry.targetId)) {
      throw new Error(
        `mmorpgCatalogs: handbook "${entry.id}" targets unknown mob "${entry.targetId}"`,
      );
    }
  }
}

validateMmorpgCatalogIntegrity();
