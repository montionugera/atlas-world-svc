import type { AtkStat } from "./types";
import { ITEMS_BY_ID } from "./catalogs";

export type { AtkStat };

/**
 * The highest `pAtk + mAtk` in the item catalog. Weapon power is a
 * multiplicative gear scale normalised so the best weapon reads exactly 1.0,
 * matching the combat lab's `gearTiers` convention (E 0.7 / C 0.85 / A 1.0,
 * scale <= 1). Raise this when a stronger weapon ships or every weapon
 * silently inflates — weaponStats.test.ts gates both halves of that.
 */
export const GEAR_REFERENCE = 18;

/** Bare hands. Below the dagger's 6/18 = 0.333 so any weapon beats none. */
export const UNARMED_GEAR = 0.25;

export interface WeaponOffence {
  /** Which single primary stat this weapon's damage reads. */
  atkStat: AtkStat;
  /** Multiplicative magnitude, 0 < gear <= 1. */
  gear: number;
  /** Physical share of output. 1 = fully physical, 0 = fully magical. */
  rho: number;
}

const UNARMED: WeaponOffence = {
  atkStat: "str",
  gear: UNARMED_GEAR,
  rho: 1,
};

/**
 * Resolves an equipped weapon id to the three things the damage formula needs.
 *
 * Magnitude comes from the weapon's TOTAL power, direction from how that total
 * splits across the two channels, and the stat is declared in the catalog. Every
 * existing catalog number therefore keeps exactly one job, and none of them
 * means "damage" any more.
 *
 * Anything that is not a weapon in the catalog resolves as unarmed: a missing or
 * unknown id is a normal state (nothing equipped), not an error.
 */
export function weaponOffence(weaponItemId: string | undefined): WeaponOffence {
  const item = weaponItemId ? ITEMS_BY_ID[weaponItemId] : undefined;
  if (!item || item.kind !== "weapon" || !item.atkStat) return UNARMED;

  const total = (item.pAtk ?? 0) + (item.mAtk ?? 0);
  // A zero-power weapon still declares its stat, but it cannot define a channel
  // ratio (0/0), so it falls back to the unarmed scale rather than producing NaN.
  if (total <= 0) return { ...UNARMED, atkStat: item.atkStat };

  return {
    atkStat: item.atkStat,
    gear: total / GEAR_REFERENCE,
    rho: (item.pAtk ?? 0) / total,
  };
}
