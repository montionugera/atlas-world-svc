/**
 * Player weapon ids must match server `WEAPONS` keys in colyseus-server config/combat/weapons.ts
 */
export const PLAYER_WEAPON_OPTIONS = [
  { id: 'basic_sword', label: 'Sword', hotkey: '5' },
  { id: 'magic_staff', label: 'Staff', hotkey: '6' },
  { id: 'great_bow', label: 'Bow', hotkey: '7' },
] as const

export type PlayerWeaponId = (typeof PLAYER_WEAPON_OPTIONS)[number]['id']
