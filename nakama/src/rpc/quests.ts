import { COLLECTIONS, STORAGE_KEY } from '@atlas/contracts';
import { readDoc, writeDoc } from '../storage';
import { findQuestDef } from '../questCatalog';
import { applyXp } from '../leveling';
import { addLoot } from './inventoryHelpers';

function parseQuestIdPayload(raw: string, rpcName: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${rpcName}: payload is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${rpcName}: payload must be a JSON object`);
  }
  const { questId } = parsed as Record<string, unknown>;
  if (typeof questId !== 'string' || questId.length === 0) {
    throw new Error(`${rpcName}: questId must be a non-empty string`);
  }
  return questId;
}

/**
 * accept_quest — client RPC. Adds a quest (looked up in the local quest
 * catalog stub, see questCatalog.ts) to the caller's active list, rejecting
 * quests already active or already completed.
 */
export const acceptQuest: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    throw new Error('accept_quest requires an authenticated client session');
  }
  const questId = parseQuestIdPayload(payload, 'accept_quest');
  const def = findQuestDef(questId);
  if (!def) {
    throw new Error(`accept_quest: unknown questId ${questId}`);
  }

  const { doc, version } = readDoc(nk, ctx.userId, COLLECTIONS.quests);
  if (doc.active.some((q) => q.questId === questId)) {
    throw new Error(`accept_quest: ${questId} is already active`);
  }
  if (doc.completed.some((q) => q.questId === questId)) {
    throw new Error(`accept_quest: ${questId} is already completed`);
  }

  const objectives: Record<string, number> = {};
  for (const obj of def.objectives) {
    objectives[obj.id] = 0;
  }

  const updated = { ...doc, active: [...doc.active, { questId, startedAt: Date.now(), objectives }] };
  writeDoc(nk, ctx.userId, COLLECTIONS.quests, updated, version);
  return JSON.stringify(updated);
};

/**
 * claim_quest_reward — client RPC. Only succeeds when the quest is
 * completed and not yet claimed. Grants XP + item rewards and marks the
 * quest claimed in a single nk.multiUpdate so profile/inventory/quests
 * either all move together or none do (no partial-reward states).
 */
export const claimQuestReward: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    throw new Error('claim_quest_reward requires an authenticated client session');
  }
  const userId = ctx.userId;
  const questId = parseQuestIdPayload(payload, 'claim_quest_reward');
  const def = findQuestDef(questId);
  if (!def) {
    throw new Error(`claim_quest_reward: unknown questId ${questId}`);
  }

  const questsRead = readDoc(nk, userId, COLLECTIONS.quests);
  const entryIndex = questsRead.doc.completed.findIndex((q) => q.questId === questId);
  if (entryIndex === -1) {
    throw new Error(`claim_quest_reward: ${questId} is not completed`);
  }
  if (questsRead.doc.completed[entryIndex].claimed) {
    throw new Error(`claim_quest_reward: ${questId} reward has already been claimed`);
  }

  const profileRead = readDoc(nk, userId, COLLECTIONS.profile);
  const updatedProfile = applyXp(profileRead.doc, def.rewards.xp);

  const inventoryRead = readDoc(nk, userId, COLLECTIONS.inventory);
  let updatedInventory = inventoryRead.doc;
  for (const item of def.rewards.items) {
    updatedInventory = addLoot(updatedInventory, {
      itemId: item.itemId,
      qty: item.qty,
      generateInstanceId: () => nk.uuidv4(),
    });
  }

  const updatedQuests = {
    ...questsRead.doc,
    completed: questsRead.doc.completed.map((q, i) => (i === entryIndex ? { ...q, claimed: true } : q)),
  };

  nk.multiUpdate(
    null,
    [
      {
        collection: COLLECTIONS.profile,
        key: STORAGE_KEY,
        userId,
        value: updatedProfile as unknown as { [key: string]: unknown },
        version: profileRead.version,
        permissionRead: 2,
        permissionWrite: 0,
      },
      {
        collection: COLLECTIONS.inventory,
        key: STORAGE_KEY,
        userId,
        value: updatedInventory as unknown as { [key: string]: unknown },
        version: inventoryRead.version,
        permissionRead: 2,
        permissionWrite: 0,
      },
      {
        collection: COLLECTIONS.quests,
        key: STORAGE_KEY,
        userId,
        value: updatedQuests as unknown as { [key: string]: unknown },
        version: questsRead.version,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ],
    null,
    null,
  );

  return JSON.stringify({ profile: updatedProfile, inventory: updatedInventory, quests: updatedQuests });
};
