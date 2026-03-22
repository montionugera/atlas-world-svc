/**
 * Equipment slot ids for WS/REST snapshots (not Colyseus schema).
 * Extend mapping in buildEquipmentSnapshotFromPlayer as Player gains per-slot state.
 */

export const EQUIPMENT_SLOT_IDS = [
  'head',
  'midHead',
  'lowerHead',
  'body',
  'mainHand',
  'offHand',
  'outerwear',
  'feet',
  'accessory1',
  'accessory2',
] as const

export type EquipmentSlotId = (typeof EQUIPMENT_SLOT_IDS)[number]

export type EquipmentSnapshot = Record<EquipmentSlotId, string>

export function emptyEquipmentSnapshot(): EquipmentSnapshot {
  const snap = {} as EquipmentSnapshot
  for (const id of EQUIPMENT_SLOT_IDS) {
    snap[id] = ''
  }
  return snap
}

export function buildEquipmentSnapshotFromPlayer(player: { equippedWeaponId: string }): EquipmentSnapshot {
  const snap = emptyEquipmentSnapshot()
  snap.mainHand = player.equippedWeaponId ?? ''
  return snap
}
