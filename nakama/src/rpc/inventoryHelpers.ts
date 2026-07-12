import type { InventoryDoc, EquipmentDoc } from '@atlas/contracts';
import { isStackable } from '../catalog';

export interface AddLootParams {
  itemId: string;
  qty: number;
  /** Injected rather than called internally, so addLoot stays pure/testable. */
  generateInstanceId: () => string;
}

/**
 * PURE: merges loot into an inventory doc. Stackable items (per
 * catalog.isStackable) merge into the matching `stackables` entry (or add a
 * new one); non-stackable items push `qty` fresh unique entries, each
 * getting its own instanceId via the injected generator. Never mutates the
 * input doc.
 */
export function addLoot(doc: InventoryDoc, params: AddLootParams): InventoryDoc {
  const { itemId, qty, generateInstanceId } = params;
  if (qty <= 0) {
    throw new Error('addLoot: qty must be a positive integer');
  }

  if (isStackable(itemId)) {
    const existing = doc.stackables.find((s) => s.itemId === itemId);
    const stackables = existing
      ? doc.stackables.map((s) => (s.itemId === itemId ? { ...s, qty: s.qty + qty } : s))
      : [...doc.stackables, { itemId, qty }];
    return { ...doc, stackables };
  }

  const newUniques = Array.from({ length: qty }, () => ({
    instanceId: generateInstanceId(),
    itemId,
  }));
  return { ...doc, uniques: [...doc.uniques, ...newUniques] };
}

export interface EquipParams {
  slot: keyof EquipmentDoc['slots'];
  instanceId: string;
}

/**
 * PURE: equips a unique inventory item (by instanceId) into an equipment
 * slot. Rejects instanceIds the player doesn't actually own. Never mutates
 * the input doc.
 *
 * Stores the instanceId (not the bare itemId) in the slot — a player can
 * own two copies of the same itemId (e.g. two "iron_sword" uniques) and
 * equip one specific instance; getLoadout (A5) resolves instanceId ->
 * itemId via the inventory doc when it assembles LoadoutSnapshot.
 */
export function equip(equipmentDoc: EquipmentDoc, inventoryDoc: InventoryDoc, params: EquipParams): EquipmentDoc {
  const { slot, instanceId } = params;
  const owned = inventoryDoc.uniques.some((u) => u.instanceId === instanceId);
  if (!owned) {
    throw new Error(`equip: instanceId ${instanceId} is not in the player's inventory`);
  }
  return { ...equipmentDoc, slots: { ...equipmentDoc.slots, [slot]: instanceId } };
}
