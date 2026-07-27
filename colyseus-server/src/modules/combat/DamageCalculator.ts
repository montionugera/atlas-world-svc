/**
 * DamageCalculator - pure damage formula (no state).
 *
 * Defense reduction is the original Phase 0 formula, untouched. The element
 * multiplier is applied AFTER it, so an elemental advantage exactly doubles the
 * number the player sees (World Wisdom / F-017).
 */
import { WorldLife } from '../../schemas/WorldLife'
import {
  DEFAULT_ELEMENT,
  getElementMultiplier,
  isElement,
  type Element,
} from '../../config/combat/elements'

export interface DamageCalculationOptions {
  baseDamage: number
  damageType: 'physical' | 'magical'
  /** Element of the incoming attack. */
  attackElement: Element
  target: WorldLife
}

export class DamageCalculator {
  static calculate(opts: DamageCalculationOptions): number {
    const { baseDamage, damageType, attackElement, target } = opts

    const primaryDefense = damageType === 'magical' ? target.mDef : target.pDef
    const totalDefense = primaryDefense + target.armor

    // Cap defense at 80% damage reduction
    const damageReduction = Math.min(totalDefense, baseDamage * 0.8)
    const afterDefense = Math.max(1, baseDamage - damageReduction)

    // Fallback for entities deserialised or constructed outside the schema constructor.
    const defenseElement = isElement(target.element) ? target.element : DEFAULT_ELEMENT
    const multiplier = getElementMultiplier(attackElement, defenseElement)

    // Clamp again after the multiplier so a resisted hit still lands for 1.
    return Math.max(1, Math.floor(afterDefense * multiplier))
  }
}
