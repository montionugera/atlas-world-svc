import { WorldLife } from '../schemas/WorldLife'

export abstract class BaseCombatSystem<T extends WorldLife> {
  protected entity: T

  constructor(entity: T) {
    this.entity = entity
  }

  /**
   * Check if the entity can perform an attack (Generic checks)
   */
  canAttack(): boolean {
      if (!this.entity.isAlive) return false
      if (this.entity.isStunned) return false
      // Additional checks can be added here
      return true
  }

  /**
   * Abstract method to be implemented by specific systems
   */
  abstract update(deltaTime: number, ...args: any[]): void

  /**
   * Helper to measure time consistently
   */
  protected now(): number {
      return performance.now()
  }
}
