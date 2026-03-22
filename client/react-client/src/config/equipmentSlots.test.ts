import {
  EQUIPMENT_SLOT_IDS,
  emptyEquipmentSnapshot,
  snapshotFromEquipmentPayload,
} from './equipmentSlots'

describe('equipmentSlots (client)', () => {
  it('snapshotFromEquipmentPayload fills known slots from object', () => {
    const snap = snapshotFromEquipmentPayload({
      mainHand: 'axe',
      head: 'helm',
      bogusKey: 'ignore',
    })
    expect(snap.mainHand).toBe('axe')
    expect(snap.head).toBe('helm')
    expect(snap.body).toBe('')
  })

  it('snapshotFromEquipmentPayload coerces non-strings to empty', () => {
    const snap = snapshotFromEquipmentPayload({
      mainHand: 123 as unknown as string,
      offHand: null as unknown as string,
    })
    expect(snap.mainHand).toBe('')
    expect(snap.offHand).toBe('')
  })

  it('snapshotFromEquipmentPayload returns empty snapshot for non-object', () => {
    expect(snapshotFromEquipmentPayload(null)).toEqual(emptyEquipmentSnapshot())
    expect(snapshotFromEquipmentPayload([])).toEqual(emptyEquipmentSnapshot())
    expect(snapshotFromEquipmentPayload('x')).toEqual(emptyEquipmentSnapshot())
  })

  it('emptyEquipmentSnapshot matches slot list length', () => {
    const snap = emptyEquipmentSnapshot()
    expect(Object.keys(snap).length).toBe(EQUIPMENT_SLOT_IDS.length)
  })
})
