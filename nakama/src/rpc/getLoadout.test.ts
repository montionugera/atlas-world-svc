import { defaultDoc, COLLECTIONS, DEFAULT_PROFILE, loadoutSnapshotSchema } from '@atlas/contracts';
import { assembleLoadout } from './getLoadout';

describe('assembleLoadout', () => {
  it('assembles a snapshot from four fresh default docs plus a leveled profile', () => {
    const profile = { ...DEFAULT_PROFILE, level: 3 };
    const equipment = defaultDoc(COLLECTIONS.equipment);
    const inventory = defaultDoc(COLLECTIONS.inventory);
    const skills = { ...defaultDoc(COLLECTIONS.skills), loadout: ['fireball'] };
    const quests = {
      ...defaultDoc(COLLECTIONS.quests),
      active: [{ questId: 'q_boar_5', startedAt: 0, objectives: { kill_boars: 2 } }],
    };

    const snapshot = assembleLoadout(profile, equipment, inventory, skills, quests);

    expect(snapshot).toEqual({
      schemaVersion: 1,
      profile,
      equippedItemIds: {},
      skillLoadout: ['fireball'],
      activeQuestIds: ['q_boar_5'],
    });
    expect(() => loadoutSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it('resolves equipped instanceIds to itemIds via the inventory doc', () => {
    const equipment = { ...defaultDoc(COLLECTIONS.equipment), slots: { weapon: 'iid-1', accessory: 'iid-2' } };
    const inventory = {
      ...defaultDoc(COLLECTIONS.inventory),
      uniques: [
        { instanceId: 'iid-1', itemId: 'iron_sword' },
        { instanceId: 'iid-2', itemId: 'lucky_charm' },
      ],
    };
    const skills = defaultDoc(COLLECTIONS.skills);
    const quests = defaultDoc(COLLECTIONS.quests);

    const snapshot = assembleLoadout(DEFAULT_PROFILE, equipment, inventory, skills, quests);

    expect(snapshot.equippedItemIds).toEqual({ weapon: 'iron_sword', accessory: 'lucky_charm' });
  });

  it('resolves a stale/missing equipped instanceId to undefined instead of throwing', () => {
    const equipment = { ...defaultDoc(COLLECTIONS.equipment), slots: { weapon: 'no-longer-owned' } };
    const inventory = defaultDoc(COLLECTIONS.inventory);
    const skills = defaultDoc(COLLECTIONS.skills);
    const quests = defaultDoc(COLLECTIONS.quests);

    const snapshot = assembleLoadout(DEFAULT_PROFILE, equipment, inventory, skills, quests);

    expect(snapshot.equippedItemIds.weapon).toBeUndefined();
  });
});
