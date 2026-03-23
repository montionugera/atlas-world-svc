import { type } from '@colyseus/schema'
import { WorldObject } from './WorldObject'
import { SPEAR_THROWER_STATS, ProjectileType } from '../config/combatConfig'
import type { AttackKind } from '../combat/attackDamage'

export class Projectile extends WorldObject {
  // Synced to client
  @type('number') radius: number = SPEAR_THROWER_STATS.projectileRadius
  @type('string') ownerId: string = ''
  @type('boolean') isStuck: boolean = false
  @type('string') type: ProjectileType
  @type('string') teamId: string = ''

  // Server-only properties
  damage: number = 0
  damageType: 'physical' | 'magical' = 'physical'
  /** Server-only: how this hit was classified (not synced). */
  attackKind: AttackKind | '' = ''
  maxRange: number = SPEAR_THROWER_STATS.spearMaxRange
  distanceTraveled: number = 0
  hitTargets: Set<string> = new Set()
  piercing: boolean = false
  stuckAt: number = 0
  lifetime: number = SPEAR_THROWER_STATS.projectileLifetime
  /** If > 0, flying projectile despawns after this many ms from creation (melee flicker). */
  maxAirLifeMs: number = 0
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
    damageType: 'physical' | 'magical' = 'physical',
    type: ProjectileType = 'spear',
    maxRange: number = SPEAR_THROWER_STATS.spearMaxRange,
    radius: number = SPEAR_THROWER_STATS.projectileRadius,
    lifetime: number = SPEAR_THROWER_STATS.projectileLifetime,
    teamId: string = '',
    maxAirLifeMs: number = 0
  ) {
    super(id, x, y, vx, vy, ['projectile'])
    this.ownerId = ownerId
    this.damage = damage
    this.damageType = damageType
    this.type = type
    this.maxRange = maxRange
    this.radius = radius
    this.lifetime = lifetime
    this.maxAirLifeMs = maxAirLifeMs
    this.createdAt = Date.now()
    this.teamId = teamId
  }

  // Check if projectile should be despawned
  shouldDespawn(): boolean {
    if (this.isStuck && this.stuckAt > 0) {
      return Date.now() - this.stuckAt >= this.lifetime
    }
    if (this.maxAirLifeMs > 0 && Date.now() - this.createdAt >= this.maxAirLifeMs) {
      return true
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

