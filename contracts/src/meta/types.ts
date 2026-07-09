export interface PrimaryStats {
  str: number
  agi: number
  int: number
  vit: number
}

export interface ProfileDoc {
  schemaVersion: 1
  level: number
  xp: number
  statPoints: number
  allocated: PrimaryStats
}

export interface InventoryDoc {
  schemaVersion: 1
  stackables: { itemId: string; qty: number }[]
  uniques: { instanceId: string; itemId: string }[]
}

export interface EquipmentDoc {
  schemaVersion: 1
  slots: { weapon?: string; armor?: string; accessory?: string }
}

export interface SkillsDoc {
  schemaVersion: 1
  unlocked: { skillId: string; level: number }[]
  loadout: string[]
}

export interface QuestsDoc {
  schemaVersion: 1
  active: { questId: string; startedAt: number; objectives: Record<string, number> }[]
  completed: { questId: string; completedAt: number; claimed: boolean }[]
}

export type MatchEventType = 'MOB_KILLED' | 'ITEM_PICKED_UP' | 'ZONE_ENTERED'

export interface MatchEvent {
  type: MatchEventType
  userId: string
  targetId: string
  count: number
}

export interface MatchEventBatch {
  matchId: string
  seq: number
  events: MatchEvent[]
}

export interface LoadoutSnapshot {
  schemaVersion: 1
  profile: ProfileDoc
  equippedItemIds: { weapon?: string; armor?: string; accessory?: string }
  skillLoadout: string[]
  activeQuestIds: string[]
}
