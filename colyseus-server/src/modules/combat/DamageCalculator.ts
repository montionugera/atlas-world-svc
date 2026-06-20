/**
 * DamageCalculator - pure damage formula (no state)
 * Extracted verbatim from BattleModule.calculateDamage.
 */
import { WorldLife } from '../../schemas/WorldLife'

export class DamageCalculator {
  // Calculate damage with defense calculations
  static calculate(baseDamage: number, damageType: 'physical' | 'magical', target: WorldLife): number {
    const primaryDefense = damageType === 'magical' ? target.mDef : target.pDef
    const totalDefense = primaryDefense + target.armor

    // Cap defense at 80% damage reduction
    const damageReduction = Math.min(totalDefense, baseDamage * 0.8)
    const finalDamage = Math.max(1, baseDamage - damageReduction)

    return Math.floor(finalDamage)
  }
}
