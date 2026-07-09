import type { QuestDef } from './questEngine';

/**
 * TODO(I1): replace TEST_QUESTS with the real @atlas/contracts catalog
 * (contracts/content/quests.json + contracts/src/meta/catalogs.ts) once Lane
 * C ships it. Explicit temporary stand-in, same pattern as catalog.ts's
 * TEST_ITEMS.
 */
export const TEST_QUESTS: QuestDef[] = [
  {
    id: 'q_boar_5',
    objectives: [{ id: 'kill_boars', type: 'MOB_KILLED', targetId: 'boar', required: 5 }],
    rewards: { xp: 100, items: [{ itemId: 'health_potion', qty: 1 }] },
  },
];

export function findQuestDef(questId: string): QuestDef | undefined {
  return TEST_QUESTS.find((q) => q.id === questId);
}
