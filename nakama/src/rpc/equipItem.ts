import { COLLECTIONS } from '@atlas/contracts';
import { readDoc, writeDoc } from '../storage';
import { equip } from './inventoryHelpers';

const VALID_SLOTS = ['weapon', 'armor', 'accessory'] as const;
type Slot = (typeof VALID_SLOTS)[number];

interface EquipItemPayload {
  slot: Slot;
  instanceId: string;
}

function parsePayload(raw: string): EquipItemPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('equip_item: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('equip_item: payload must be a JSON object');
  }
  const { slot, instanceId } = parsed as Record<string, unknown>;
  if (typeof slot !== 'string' || !(VALID_SLOTS as readonly string[]).includes(slot)) {
    throw new Error(`equip_item: slot must be one of ${VALID_SLOTS.join(', ')}`);
  }
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    throw new Error('equip_item: instanceId must be a non-empty string');
  }
  return { slot: slot as Slot, instanceId };
}

/**
 * equip_item — client RPC. Requires an authenticated session (ctx.userId).
 * Equips a unique inventory item the caller already owns into a slot.
 */
export const equipItem: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    throw new Error('equip_item requires an authenticated client session');
  }
  const { slot, instanceId } = parsePayload(payload);

  const inventory = readDoc(nk, ctx.userId, COLLECTIONS.inventory);
  const equipment = readDoc(nk, ctx.userId, COLLECTIONS.equipment);
  const updated = equip(equipment.doc, inventory.doc, { slot, instanceId });
  writeDoc(nk, ctx.userId, COLLECTIONS.equipment, updated, equipment.version);
  return JSON.stringify(updated);
};
