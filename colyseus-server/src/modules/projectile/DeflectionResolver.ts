import { Projectile } from '../../schemas/Projectile'
import { Player } from '../../schemas/Player'
import { WorldLife } from '../../schemas/WorldLife'
import { GameState } from '../../schemas/GameState'
import {
  SPEAR_THROWER_STATS,
  PROJECTILE_INTERACTIONS,
  PROJECTILE_MIN_MAX_RANGE,
  ProjectileType,
  WEAPON_TYPES,
} from '../../config/combatConfig'
import { eventBus, RoomEventType } from '../../events/EventBus'
import { resolveWeaponBasicProjectileParams } from '../../combat/attackDamage'
import { GAME_CONFIG } from '../../config/gameConfig'

export class DeflectionResolver {
  private gameState: GameState

  constructor(gameState: GameState) {
    this.gameState = gameState
  }

  /** Defender parry row: players use equipped weapon projectile type; others default to generic melee. */
  private resolveDeflectorWeaponType(attacker: WorldLife): ProjectileType {
    if (attacker instanceof Player) {
      return resolveWeaponBasicProjectileParams(attacker).projectileType
    }
    return WEAPON_TYPES.MELEE
  }

  /**
   * Check if projectile can be deflected by attacker and reflects it using configuration rules
   * Returns true if deflected, false otherwise
   */
  checkDeflection(projectile: Projectile, attacker: WorldLife): boolean {
    const incomingConfig = PROJECTILE_INTERACTIONS[projectile.type];
    if (!incomingConfig || !incomingConfig.canBeDeflected) return false;

    const deflectorWeaponType = this.resolveDeflectorWeaponType(attacker)

    const defenderConfig = PROJECTILE_INTERACTIONS[deflectorWeaponType];
    if (!defenderConfig || !defenderConfig.canDeflectOthers) return false;

    // Can't deflect if already deflected by someone
    if (projectile.deflectedBy) return false

    // Attacker must be attacking or in wind-up phase.
    // pendingAttack only exists on Player; for other WorldLife subclasses it is absent (treated as false).
    const hasPendingAttack = 'pendingAttack' in attacker && (attacker as Player).pendingAttack
    if (!attacker.isAttacking && !hasPendingAttack) return false

    // Ignore if attacker is the owner (shooter)
    if (projectile.ownerId === attacker.id) return false

    // Ignore if on the same team (and a team is actually set)
    if (projectile.teamId && attacker.teamId && projectile.teamId === attacker.teamId) return false

    // Check if projectile is in attack range (calculate distance directly)
    const dx = projectile.x - attacker.x
    const dy = projectile.y - attacker.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const effectiveRange = attacker.attackRange + attacker.radius + projectile.radius
    if (distance > effectiveRange) return false

    // Check if projectile is in attack cone (configurable angle)
    const angleToProjectile = Math.atan2(dy, dx)
    const headingDiff = Math.abs(angleToProjectile - attacker.heading)
    const normalizedDiff = Math.min(headingDiff, 2 * Math.PI - headingDiff)
    const coneAngle = SPEAR_THROWER_STATS.deflectionConeAngle

    if (normalizedDiff > coneAngle) return false

    // Calculate contact point normal (outward from player to projectile)
    const nx = distance > 0 ? dx / distance : 1
    const ny = distance > 0 ? dy / distance : 0

    // Dot product to determine if incoming or outgoing
    const dot = projectile.vx * nx + projectile.vy * ny

    let newVx = projectile.vx
    let newVy = projectile.vy

    if (dot < 0) {
      // Incoming projectile: true geometric reflection across the normal
      newVx = projectile.vx - 2 * dot * nx
      newVy = projectile.vy - 2 * dot * ny
    } else {
      // Outgoing projectile: push it radially outward if hit from behind
      const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
      newVx = nx * speed
      newVy = ny * speed
    }

    const speedBefore = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
    const reflectedLen = Math.sqrt(newVx * newVx + newVy * newVy)
    if (reflectedLen > 1e-6 && speedBefore > 1e-6) {
      const scale = speedBefore / reflectedLen
      newVx *= scale
      newVy *= scale
    }
    projectile.vx = newVx
    projectile.vy = newVy

    projectile.maxRange = Math.max(
      PROJECTILE_MIN_MAX_RANGE,
      projectile.maxRange * incomingConfig.deflectedRangeMultiplier
    )

    // Post-parry damage: incoming deflectedDamageMultiplier × defender deflectPowerMultiplier (not velocity).
    const dmgMult =
      incomingConfig.deflectedDamageMultiplier * Math.max(0.1, defenderConfig.deflectPowerMultiplier)
    projectile.damage = Math.max(1, Math.floor(projectile.damage * dmgMult))

    // Refresh max distance capability since it's practically a new projectile
    if (projectile.maxRange <= projectile.distanceTraveled) {
        // Give it at least some distance if it was already maxed out
        projectile.maxRange += 10;
    }
    projectile.ownerId = attacker.id
    // Make the projectile belong to the deflecting actor's team going forward.
    // This prevents immediate "same-team" filtering issues and keeps collision rules consistent.
    projectile.teamId = attacker.teamId ?? projectile.teamId
    projectile.hitTargets.clear() // Can damage again after deflection
    projectile.deflectedBy = attacker.id

    // Reset travel and lifetime-related state so the deflected projectile
    // gets a fresh visible flight phase.
    projectile.distanceTraveled = 0
    projectile.isStuck = false
    projectile.stuckAt = 0

    // Apply recoil impulse to the deflector based on config absorption rate
    const rawImpulse = projectile.damage * GAME_CONFIG.attackImpulseMultiplier
    const impulseMagnitude = Math.max(GAME_CONFIG.minImpulse, Math.min(rawImpulse, GAME_CONFIG.maxImpulse)) * defenderConfig.absorbImpulseMultiplier

    if (impulseMagnitude > 0) {
      // Knockback direction is AWAY from the impact normal (pushing the player backward)
      const impulse = { x: -nx * impulseMagnitude, y: -ny * impulseMagnitude }

      try {
        eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
          attacker: this.gameState.mobs.get(projectile.ownerId) || this.gameState.players.get(projectile.ownerId) || attacker,
          taker: attacker,
          impulse,
        })
      } catch (err) {
        console.warn(`⚠️ PROJECTILE: failed to emit BATTLE_DAMAGE_PRODUCED (deflect recoil): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return true
  }
}
