/**
 * TODO(I1): replace TEST_ITEMS with the real @atlas/contracts catalog
 * (contracts/content/items.json + contracts/src/meta/catalogs.ts) once Lane
 * C ships it. This is an explicit, temporary stand-in — not a silent stub —
 * so inventory/equipment RPCs have something to validate itemIds and
 * stackability against in the meantime.
 */
export const TEST_ITEMS: Record<string, { stackable: boolean }> = {
  wooden_sword: { stackable: false },
  iron_sword: { stackable: false },
  leather_armor: { stackable: false },
  health_potion: { stackable: true },
  mana_potion: { stackable: true },
  wolf_pelt: { stackable: true },
};

export function isKnownItem(itemId: string): boolean {
  return Object.prototype.hasOwnProperty.call(TEST_ITEMS, itemId);
}

export function isStackable(itemId: string): boolean {
  const item = TEST_ITEMS[itemId];
  if (!item) {
    throw new Error(`unknown itemId: ${itemId}`);
  }
  return item.stackable;
}
