import { defaultDoc, COLLECTIONS } from '@atlas/contracts';
import { addLoot, equip } from './inventoryHelpers';

describe('addLoot', () => {
  it('merges qty into an existing stackable entry', () => {
    const inv = { ...defaultDoc(COLLECTIONS.inventory), stackables: [{ itemId: 'potion_minor', qty: 2 }] };
    const result = addLoot(inv, { itemId: 'potion_minor', qty: 3, generateInstanceId: () => 'unused' });
    expect(result.stackables).toEqual([{ itemId: 'potion_minor', qty: 5 }]);
  });

  it('adds a new stackable entry when the item is not yet held', () => {
    const inv = defaultDoc(COLLECTIONS.inventory);
    const result = addLoot(inv, { itemId: 'iron_ore', qty: 1, generateInstanceId: () => 'unused' });
    expect(result.stackables).toEqual([{ itemId: 'iron_ore', qty: 1 }]);
  });

  it('grants a unique item with an injected instanceId', () => {
    const inv = defaultDoc(COLLECTIONS.inventory);
    const result = addLoot(inv, { itemId: 'basic_sword', qty: 1, generateInstanceId: () => 'fixed-id-1' });
    expect(result.uniques).toEqual([{ instanceId: 'fixed-id-1', itemId: 'basic_sword' }]);
  });

  it('grants multiple unique instances when qty > 1, one instanceId each', () => {
    const inv = defaultDoc(COLLECTIONS.inventory);
    let n = 0;
    const result = addLoot(inv, { itemId: 'basic_sword', qty: 2, generateInstanceId: () => `id-${n++}` });
    expect(result.uniques).toEqual([
      { instanceId: 'id-0', itemId: 'basic_sword' },
      { instanceId: 'id-1', itemId: 'basic_sword' },
    ]);
  });

  it('rejects unknown itemIds (catalog lookup failure)', () => {
    const inv = defaultDoc(COLLECTIONS.inventory);
    expect(() => addLoot(inv, { itemId: 'nonexistent', qty: 1, generateInstanceId: () => 'x' })).toThrow(
      /unknown itemId/,
    );
  });

  it('does not mutate the input doc', () => {
    const inv = defaultDoc(COLLECTIONS.inventory);
    const before = JSON.parse(JSON.stringify(inv));
    addLoot(inv, { itemId: 'potion_minor', qty: 1, generateInstanceId: () => 'x' });
    expect(inv).toEqual(before);
  });
});

describe('equip', () => {
  it('equips an owned instanceId into the given slot', () => {
    const equipment = defaultDoc(COLLECTIONS.equipment);
    const inventory = { ...defaultDoc(COLLECTIONS.inventory), uniques: [{ instanceId: 'iid-1', itemId: 'iron_sword' }] };
    const result = equip(equipment, inventory, { slot: 'weapon', instanceId: 'iid-1' });
    expect(result.slots.weapon).toBe('iid-1');
  });

  it('rejects an instanceId the player does not own', () => {
    const equipment = defaultDoc(COLLECTIONS.equipment);
    const inventory = defaultDoc(COLLECTIONS.inventory);
    expect(() => equip(equipment, inventory, { slot: 'weapon', instanceId: 'not-owned' })).toThrow(
      /not in the player's inventory/,
    );
  });

  it('does not mutate the input equipment doc', () => {
    const equipment = defaultDoc(COLLECTIONS.equipment);
    const inventory = { ...defaultDoc(COLLECTIONS.inventory), uniques: [{ instanceId: 'iid-1', itemId: 'iron_sword' }] };
    const before = JSON.parse(JSON.stringify(equipment));
    equip(equipment, inventory, { slot: 'weapon', instanceId: 'iid-1' });
    expect(equipment).toEqual(before);
  });
});
