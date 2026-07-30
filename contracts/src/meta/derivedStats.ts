import type { PrimaryStats } from "./types";
import { weaponOffence } from "./weaponStats";

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

/** Per-level growth. Mirrors `P.growth` in tools/combat-lab. */
export const GROWTH = 1.045;
/** Stat coefficient C. Mirrors `P.statCoef` in tools/combat-lab. */
export const STAT_COEF = 0.5;
/** PRIMARY_MAX in colyseus-server/src/config/combat/combatStats.ts. */
export const STAT_MAX = 99;

// Solved from an ANCHOR, not chosen: at level 1 with every primary at 1 and
// basic_sword equipped (DEFAULT_PLAYER_WEAPON_ID), this formula must reproduce
// the pre-F018 numbers exactly. derivedStats.test.ts pins that anchor, so
// changing a constant without re-deriving it turns the anchor test red.
export const BASE_HP = 108.9; // 110 * 99/100
export const BASE_ATK = 19.602; // 22 * 891/1000
export const BASE_DEF = 5.94; // 6 * 99/100

/**
 * Single source of truth for derived combat stats.
 *
 * Multiplicative by design: `grow(level)` enters `atk`, `def` and `maxHealth` as
 * exactly ONE factor, so it cancels out of the attack/defence ratio and
 * difficulty stops drifting with level. That cancellation is what the old
 * additive constants (100, 10, 5, and the flat weapon addend) broke, and it is
 * the whole reason for this shape.
 *
 *   share(p)     = clamp(p, 1, 99) / 99         saturates at 1, like the lab's alloc
 *   offMagnitude = 1 + 2*C*share(allocated[weapon.atkStat])  ONE stat, chosen by weapon
 *   defMagnitude = 1 + 2*C*share(vit)           vit alone, so int buys no free mDef
 *
 *   atk = BASE_ATK * grow(L) * offMagnitude * weapon.gear
 *   def = BASE_DEF * grow(L) * defMagnitude
 *
 *   maxHealth   = BASE_HP * grow(L) * defMagnitude
 *   pAtk        = atk * 2 * rho          rho + (1-rho) sums to 1, so the two
 *   mAtk        = atk * 2 * (1 - rho)    multipliers sum to 2 and total offence
 *   pDef = mDef = def                    is conserved across any channel split
 *
 * A blade has `rho = 1`, so it yields `mAtk` of exactly 0. That is intended:
 * magical output requires a magical weapon. Any code path that sources `mAtk`
 * while a blade is equipped therefore deals ZERO, not wrong-channel damage.
 *
 * `maxMoveSpeed` keeps its additive form on purpose — it appears on neither side
 * of the attack/defence ratio, so it already cancels, and rewriting it
 * multiplicatively would invent a constant for no gain. `agi` stays R-invisible
 * (D8).
 *
 * Tune the exported constants above; never the shape. `tools/combat-lab` owns
 * the shape and gates it (see labParity.test.ts).
 */
export function derivedStats({
  level,
  allocated,
  weaponItemId,
}: DerivedStatsInput): DerivedStats {
  const { agi, vit } = allocated;
  const weapon = weaponOffence(weaponItemId);

  const grow = Math.pow(GROWTH, level - 1);
  const share = (p: number) => Math.min(STAT_MAX, Math.max(1, p)) / STAT_MAX;

  const offMagnitude = 1 + 2 * STAT_COEF * share(allocated[weapon.atkStat]);
  const defMagnitude = 1 + 2 * STAT_COEF * share(vit);

  const atk = BASE_ATK * grow * offMagnitude * weapon.gear;
  const def = BASE_DEF * grow * defMagnitude;

  return {
    maxHealth: BASE_HP * grow * defMagnitude,
    pAtk: atk * 2 * weapon.rho,
    mAtk: atk * 2 * (1 - weapon.rho),
    pDef: def,
    mDef: def,
    maxMoveSpeed: 20 + 0.2 * agi,
  };
}
