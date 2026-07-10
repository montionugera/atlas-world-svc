import { ITEMS_BY_ID } from '@atlas/contracts';

/**
 * Real item catalog, sourced from @atlas/contracts (contracts/content/items.json,
 * validated at import time via itemDefSchema + validateCatalogIntegrity). No
 * local stub — this is the single source of truth shared with colyseus-server
 * and the generated C# client content.
 */
export function isKnownItem(itemId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEMS_BY_ID, itemId);
}

export function isStackable(itemId: string): boolean {
  const item = ITEMS_BY_ID[itemId];
  if (!item) {
    throw new Error(`unknown itemId: ${itemId}`);
  }
  return item.stackable;
}
