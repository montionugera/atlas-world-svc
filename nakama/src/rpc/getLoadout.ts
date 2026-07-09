import { COLLECTIONS, loadoutSnapshotSchema } from '@atlas/contracts';
import type { ProfileDoc, EquipmentDoc, InventoryDoc, SkillsDoc, QuestsDoc, LoadoutSnapshot } from '@atlas/contracts';
import { readDoc } from '../storage';

/**
 * PURE: assembles the client-facing LoadoutSnapshot from the five raw meta
 * docs. Equipment slots store an instanceId (see rpc/inventoryHelpers.ts
 * equip()), so this resolves each equipped instanceId back to its bare
 * itemId via the inventory doc — a stale/missing instanceId (e.g. an item
 * that got consumed after being equipped) resolves to undefined rather
 * than throwing, since a snapshot should always be assemble-able.
 */
export function assembleLoadout(
  profile: ProfileDoc,
  equipment: EquipmentDoc,
  inventory: InventoryDoc,
  skills: SkillsDoc,
  quests: QuestsDoc,
): LoadoutSnapshot {
  const resolveItemId = (instanceId: string | undefined): string | undefined => {
    if (!instanceId) {
      return undefined;
    }
    return inventory.uniques.find((u) => u.instanceId === instanceId)?.itemId;
  };

  return {
    schemaVersion: 1,
    profile,
    equippedItemIds: {
      weapon: resolveItemId(equipment.slots.weapon),
      armor: resolveItemId(equipment.slots.armor),
      accessory: resolveItemId(equipment.slots.accessory),
    },
    skillLoadout: skills.loadout,
    activeQuestIds: quests.active.map((q) => q.questId),
  };
}

interface GetLoadoutPayload {
  userId: string;
}

function parsePayload(raw: string): GetLoadoutPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('get_loadout: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('get_loadout: payload must be a JSON object');
  }
  const { userId } = parsed as Record<string, unknown>;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('get_loadout: userId must be a non-empty string');
  }
  return { userId };
}

/**
 * get_loadout — S2S only. Called by Colyseus on room join to hydrate a
 * player's server-authoritative stats/equipment/skills/quests in one
 * round-trip. Zod-validates the assembled snapshot before returning it.
 */
export const getLoadout: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (ctx.userId) {
    throw new Error('get_loadout is server-only (S2S http_key) and cannot be called by an authenticated client');
  }
  const { userId } = parsePayload(payload);

  const profile = readDoc(nk, userId, COLLECTIONS.profile).doc;
  const equipment = readDoc(nk, userId, COLLECTIONS.equipment).doc;
  const inventory = readDoc(nk, userId, COLLECTIONS.inventory).doc;
  const skills = readDoc(nk, userId, COLLECTIONS.skills).doc;
  const quests = readDoc(nk, userId, COLLECTIONS.quests).doc;

  const snapshot = assembleLoadout(profile, equipment, inventory, skills, quests);
  loadoutSnapshotSchema.parse(snapshot);
  return JSON.stringify(snapshot);
};
