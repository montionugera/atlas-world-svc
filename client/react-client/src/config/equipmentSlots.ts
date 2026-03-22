/** Mirror of server slot ids for WS equipment snapshots (no shared package). */

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

/** Build a full snapshot from server `equipment` payload (unknown keys ignored). */
export function snapshotFromEquipmentPayload(payload: unknown): EquipmentSnapshot {
  const next = emptyEquipmentSnapshot()
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const o = payload as Record<string, unknown>
    for (const id of EQUIPMENT_SLOT_IDS) {
      const v = o[id]
      next[id] = typeof v === 'string' ? v : ''
    }
  }
  return next
}
