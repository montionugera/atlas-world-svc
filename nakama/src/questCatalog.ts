import { QUESTS_BY_ID } from '@atlas/contracts';
import type { QuestDef } from './questEngine';

/**
 * Real quest catalog, sourced from @atlas/contracts (contracts/content/quests.json,
 * validated at import time via questDefSchema + validateCatalogIntegrity). No
 * local stub — this is the single source of truth shared with colyseus-server
 * and the generated C# client content.
 */
export function findQuestDef(questId: string): QuestDef | undefined {
  return QUESTS_BY_ID[questId];
}
