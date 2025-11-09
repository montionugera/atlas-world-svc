import { type } from '@colyseus/schema'
import { WorldObject } from './WorldObject'
import { SPEAR_THROWER_STATS } from '../config/combatConfig'

export class Projectile extends WorldObject {
  // Synced to client
  @type('number') radius: number = SPEAR_THROWER_STATS.projectileRadius
  @type('string') ownerId: string = ''
  @type('boolean') isStuck: boolean = false

  // Server-only properties
  damage: number = 0
  maxRange: number = SPEAR_THROWER_STATS.spearMaxRange
  distanceTraveled: number = 0
  hasHit: boolean = false
  stuckAt: number = 0
  lifetime: number = SPEAR_THROWER_STATS.projectileLifetime
  deflectedBy: string = '' // ID of entity that deflected, prevents re-deflection
  createdAt: number = Date.now()

  constructor(
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    ownerId: string,
    damage: number,
    maxRange: number = SPEAR_THROWER_STATS.spearMaxRange,
    radius: number = SPEAR_THROWER_STATS.projectileRadius,
    lifetime: number = SPEAR_THROWER_STATS.projectileLifetime
  ) {
    super(id, x, y, vx, vy, ['projectile'])
    this.ownerId = ownerId
    this.damage = damage
    this.maxRange = maxRange
    this.radius = radius
    this.lifetime = lifetime
    this.createdAt = Date.now()
  }

  // Check if projectile should be despawned
  shouldDespawn(): boolean {
    if (this.isStuck && this.stuckAt > 0) {
      return Date.now() - this.stuckAt >= this.lifetime
    }
    return this.distanceTraveled >= this.maxRange
  }

  // Mark projectile as stuck (hit boundary/wall)
  stick(): void {
    this.isStuck = true
    this.stuckAt = Date.now()
    this.vx = 0
    this.vy = 0
  }
}

