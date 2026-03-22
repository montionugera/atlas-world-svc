import {
  EQUIPMENT_SLOT_IDS,
  buildEquipmentSnapshotFromPlayer,
  emptyEquipmentSnapshot,
} from './equipmentSlots'

describe('equipmentSlots', () => {
  it('emptyEquipmentSnapshot has every slot as empty string', () => {
    const snap = emptyEquipmentSnapshot()
    for (const id of EQUIPMENT_SLOT_IDS) {
      expect(snap[id]).toBe('')
    }
    expect(Object.keys(snap).length).toBe(EQUIPMENT_SLOT_IDS.length)
  })

  it('buildEquipmentSnapshotFromPlayer maps weapon to mainHand only', () => {
    const snap = buildEquipmentSnapshotFromPlayer({ equippedWeaponId: 'basic_sword' })
    expect(snap.mainHand).toBe('basic_sword')
    expect(snap.head).toBe('')
    expect(snap.offHand).toBe('')
  })

  it('buildEquipmentSnapshotFromPlayer treats missing as empty mainHand', () => {
    const snap = buildEquipmentSnapshotFromPlayer({ equippedWeaponId: '' })
    expect(snap.mainHand).toBe('')
  })
})
