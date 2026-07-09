export const COLLECTIONS = {
  profile: "profile",
  inventory: "inventory",
  equipment: "equipment",
  skills: "skills",
  quests: "quests",
} as const;

export const STORAGE_KEY = "main" as const;

export const RPC = {
  getLoadout: "get_loadout",
  reportMatchEvents: "report_match_events",
  grantLoot: "grant_loot",
  grantXp: "grant_xp",
  equipItem: "equip_item",
  allocateStats: "allocate_stats",
  setSkillLoadout: "set_skill_loadout",
  acceptQuest: "accept_quest",
  claimQuestReward: "claim_quest_reward",
} as const;
