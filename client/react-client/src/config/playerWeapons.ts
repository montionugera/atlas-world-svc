/**
 * Player weapon ids must match server `WEAPONS` keys in colyseus-server config/combat/weapons.ts
 */
export const PLAYER_WEAPON_OPTIONS = [
  { id: 'basic_sword', label: 'Sword', hotkey: '5' },
  { id: 'magic_staff', label: 'Staff', hotkey: '6' },
  { id: 'great_bow', label: 'Bow', hotkey: '7' },
  { id: 'scythe', label: 'Scythe', hotkey: '8' },
  { id: 'dagger', label: 'Dagger', hotkey: '9' },
] as const

export type PlayerWeaponId = (typeof PLAYER_WEAPON_OPTIONS)[number]['id']
