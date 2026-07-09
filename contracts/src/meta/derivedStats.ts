import type { PrimaryStats } from "./types";
import { ITEMS_BY_ID } from "./catalogs";

export interface DerivedStatsInput {
  level: number;
  allocated: PrimaryStats;
  weaponItemId?: string;
}

export interface DerivedStats {
  maxHealth: number;
  pAtk: number;
  mAtk: number;
  pDef: number;
  mDef: number;
  maxMoveSpeed: number;
}

/**
 * PINNED formula — single source of truth for derived combat stats. Colyseus
 * sim, Nakama display RPCs, and the Flutter client all compute off this
 * function; do not "improve" the numbers here, tune in one place later.
 *
 *   maxHealth    = 100 + 10*vit + 5*(level-1)
 *   pAtk         = 10 + 2*str + weapon.pAtk   (weapon.pAtk = 0 when no weapon
 *                                               / weaponItemId not in catalog)
 *   mAtk         = 10 + 2*int + weapon.mAtk
 *   pDef         = 5 + vit
 *   mDef         = 5 + int
 *   maxMoveSpeed = 20 + 0.2*agi
 */
export function derivedStats({
  level,
  allocated,
  weaponItemId,
}: DerivedStatsInput): DerivedStats {
  const weapon = weaponItemId ? ITEMS_BY_ID[weaponItemId] : undefined;
  const weaponPAtk = weapon?.pAtk ?? 0;
  const weaponMAtk = weapon?.mAtk ?? 0;
  const { str, agi, int, vit } = allocated;

  return {
    maxHealth: 100 + 10 * vit + 5 * (level - 1),
    pAtk: 10 + 2 * str + weaponPAtk,
    mAtk: 10 + 2 * int + weaponMAtk,
    pDef: 5 + vit,
    mDef: 5 + int,
    maxMoveSpeed: 20 + 0.2 * agi,
  };
}
