/**
 * Player equipment: weapon stats and default loadout (ids server-only unless you sync them).
 */
import type { ProjectileType } from './projectileInteractions'
import { WEAPON_TYPES } from './projectileInteractions'

export interface WeaponConfig {
  id: string
  name: string
  pAtk: number
  mAtk: number
  projectileType: ProjectileType
  range: number // weapon's effective range override
}

export const DEFAULT_PLAYER_WEAPON_ID = 'basic_sword' as const

export function isValidPlayerWeaponId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && WEAPONS[id] !== undefined
}

export const WEAPONS: Record<string, WeaponConfig> = {
  'basic_sword': {
    id: 'basic_sword',
    name: 'Basic Sword',
    pAtk: 10,
    mAtk: 0,
    projectileType: WEAPON_TYPES.MELEE,
    range: 3,
  },
  'magic_staff': {
    id: 'magic_staff',
    name: 'Magic Staff',
    pAtk: 2,
    mAtk: 15,
    projectileType: WEAPON_TYPES.MAGIC_SPEAR,
    range: 15,
  },
  'great_bow': {
    id: 'great_bow',
    name: 'Great Bow',
    pAtk: 16,
    mAtk: 0,
    projectileType: WEAPON_TYPES.ARROW,
    range: 22,
  },
}
