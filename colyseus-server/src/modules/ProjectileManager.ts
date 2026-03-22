import { Projectile } from '../schemas/Projectile'
import { Player } from '../schemas/Player'
import { WorldLife } from '../schemas/WorldLife'
import { BattleModule } from './BattleModule'
import { BattleManager } from './BattleManager'
import { GameState } from '../schemas/GameState'
import { SPEAR_THROWER_STATS, MELEE_PROJECTILE_STATS, PROJECTILE_INTERACTIONS, ProjectileType, WEAPON_TYPES } from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'
import { eventBus, RoomEventType } from '../events/EventBus'

export class ProjectileManager {
  private gameState: GameState
  private battleModule: BattleModule
  private gravity: number = PROJECTILE_GRAVITY
  private maxSpeed: number = 2000 // Raised from 36 to support fast projectiles

  private battleManager?: BattleManager

  constructor(gameState: GameState, battleModule: BattleModule, battleManager?: BattleManager) {
    this.gameState = gameState
    this.battleModule = battleModule
    this.battleManager = battleManager
  }

  /**
   * Create a melee projectile from actor to target
   * Short range, fast speed for near-instant hits
   */
  createMelee(
    actor: WorldLife, 
    targetX: number, 
    targetY: number, 
    damage: number,
    damageType: 'physical' | 'magical' = 'physical',
    maxRange: number = MELEE_PROJECTILE_STATS.meleeMaxRange,
    radius: number = MELEE_PROJECTILE_STATS.projectileRadius,
    speed: number = MELEE_PROJECTILE_STATS.meleeSpeed
  ): Projectile {
    const dx = targetX - actor.x
    const dy = targetY - actor.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Calculate initial velocity components
    const vx = speed * Math.cos(angle)
    const vy = speed * Math.sin(angle)

    // Spawn at edge of actor + small offset
    const spawnOffset = ((actor as any).radius || 1) + 0.5
    const spawnX = actor.x + Math.cos(angle) * spawnOffset
    const spawnY = actor.y + Math.sin(angle) * spawnOffset
    
    // Create projectile with melee stats
    const projectileId = `projectile-melee-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      actor.id,
      damage,
      damageType,
      'melee', // type
      maxRange,
      radius,
      MELEE_PROJECTILE_STATS.projectileLifetime,
      actor.teamId
    )
    
    projectile.piercing = true; // Melee attacks cleave through multiple enemies!
    
    return projectile
  }

  /**
   * Create a spear projectile from attacker to target
   * Calculates trajectory based on configurable physics
   */
  createSpear(
    mob: WorldLife,
    targetX: number, 
    targetY: number, 
    damage: number, 
    damageType: 'physical' | 'magical' = 'physical',
    maxRange: number = SPEAR_THROWER_STATS.spearMaxRange,
    radius: number = SPEAR_THROWER_STATS.projectileRadius,
    speed: number = this.maxSpeed,
    type: ProjectileType = WEAPON_TYPES.SPEAR
  ): Projectile {
    const dx = targetX - mob.x
    const dy = targetY - mob.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Use provided speed
    const maxSpeed = speed
    
    // Calculate initial velocity components
    const vx = maxSpeed * Math.cos(angle)
    const vy = maxSpeed * Math.sin(angle)

    // Spawn at edge of mob
    const spawnOffset = (mob.radius || 1) + 0.5
    const spawnX = mob.x + Math.cos(angle) * spawnOffset
    const spawnY = mob.y + Math.sin(angle) * spawnOffset
    
    // Create projectile with configurable radius
    const projectileId = `projectile-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      mob.id,
      damage,
      damageType,
      type,
      maxRange,
      radius,
      SPEAR_THROWER_STATS.projectileLifetime,
      mob.teamId
    )
    
    return projectile
  }

  /**
   * Update all projectiles: apply gravity, cap speed, track distance
   */
  updateProjectiles(projectiles: Map<string, Projectile>, deltaTime: number, physicsManager: any): void {
    for (const projectile of projectiles.values()) {
      if (projectile.isStuck) continue
      
      // Update physics (gravity, speed cap, distance tracking) - uses configurable values
      physicsManager.updateProjectile(projectile, deltaTime, this.gravity, this.maxSpeed)
      
      // Sync position from physics body
      const body = physicsManager.getBody(projectile.id)
      if (body) {
        const position = body.getPosition()
        projectile.x = position.x
        projectile.y = position.y
      }
    }
  }

  /**
   * Handle projectile collision with living entities (Players or Mobs)
   * Projectiles pierce through (don't stop), but only damage once per target
   */
  handleEntityCollision(projectile: Projectile, target: WorldLife): void {
    if (!projectile.piercing && projectile.hitTargets.size > 0) return // Non-piercing hit its limit
    if (projectile.hitTargets.has(target.id)) return // Already hit this target
    
    // 1. Ignore if target is the owner (shooter)
    if (projectile.ownerId === target.id) return
    
    // 2. Ignore if target is on the same team (and a team is actually set)
    if (projectile.teamId && target.teamId && projectile.teamId === target.teamId) return
    
    // 3. Last-ditch deflection: If the physics tick ran before updatePlayers, a fast spear might hit the body.
    // Allow the target to instantly deflect it if they are actively attacking in the correct direction!
    if (projectile.type === WEAPON_TYPES.SPEAR && this.checkDeflection(projectile, target)) {
        return; // Deflection successful, skip taking damage
    }
    
    const attacker = this.gameState.mobs.get(projectile.ownerId) || this.gameState.players.get(projectile.ownerId)
    
    // Route damage through BattleManager queue if available (throttled)
    if (this.battleManager) {
        // Create attack message
        const message = BattleManager.createAttackMessage(
            projectile.ownerId,
            target.id,
            projectile.damage,
            projectile.radius * 2 // approx range
        )
        
        // Add projectile info to payload
        const payload = message.actionPayload as any
        payload.projectileDetail = {
            id: projectile.id,
            type: projectile.type,
            damage: projectile.damage,
            vx: projectile.vx,
            vy: projectile.vy
        }
        payload.attackType = 'projectile' 
        
        console.log(`📨 PROJECTILE: Queuing hit ${projectile.id} on ${target.id}`)
        this.battleManager.addActionMessage(message)
        
    } else {
        // Fallback: Apply damage directly via BattleModule (legacy/unthrottled)
        if (attacker && attacker.isAlive) {
          // Use BattleModule to apply damage
          const damage = this.battleModule.calculateDamage(
            projectile.damage,
            projectile.damageType,
            target
          )
          const targetDied = this.battleModule.applyDamage(target, damage, { eventId: projectile.id })
          
          // Calculate impulse vector from projectile velocity
          const vx = projectile.vx
          const vy = projectile.vy
          const speedSq = vx * vx + vy * vy
          let nx: number
          let ny: number
          // If vx/vy are effectively zero (stale replication / sensor-collision moment),
          // derive knockback direction from attacker -> target.
          if (speedSq > 0.0001) {
            const speed = Math.sqrt(speedSq) || 1
            nx = vx / speed
            ny = vy / speed
          } else {
            const dx = target.x - attacker.x
            const dy = target.y - attacker.y
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            nx = dx / len
            ny = dy / len
          }
            
          const { GAME_CONFIG } = require('../config/gameConfig')
          const rawImpulse = damage * GAME_CONFIG.attackImpulseMultiplier
          const impulseMagnitude = Math.max(GAME_CONFIG.minImpulse, Math.min(rawImpulse, GAME_CONFIG.maxImpulse))
          
          const impulse = { x: nx * impulseMagnitude, y: ny * impulseMagnitude }

          // Emit battle damage produced event for knockback/FX (same as melee attacks)
          try {
            eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
              attacker,
              taker: target,
              impulse,
            })
          } catch {}
          
          if (targetDied) {
            console.log(`💀 PROJECTILE: ${projectile.id} killed ${target.id}`)
          } else {
            console.log(`⚔️ PROJECTILE: ${projectile.id} hit ${target.id} for ${damage} damage`)
          }
        }
    }
    
    // Track hit to prevent hitting the same target multiple times per swing
    projectile.hitTargets.add(target.id)
  }

  /**
   * Handle projectile collision with another projectile
   * Projectiles from different teams cancel each other out
   */
  handleProjectileCollision(projectileA: Projectile, projectileB: Projectile): void {
    const configA = PROJECTILE_INTERACTIONS[projectileA.type];
    const configB = PROJECTILE_INTERACTIONS[projectileB.type];

    // If a type is undocumented in the new matrix, ignore physical clashes safely
    if (!configA || !configB) return;

    // Check for clean parry/bounce bypass
    // If one weapon acts as a "Deflector" and the other weapon wants to "Bounce", 
    // we purposefully BYPASS the physical clashing here so `checkDeflection` can cleanly bounce it!
    const aBouncesB = configA.canDeflectOthers && configB.canBeDeflected && configB.deflectionBehavior === 'bounce';
    const bBouncesA = configB.canDeflectOthers && configA.canBeDeflected && configA.deflectionBehavior === 'bounce';
    
    if (aBouncesB || bBouncesA) return;

    // Check if either projectile is already "spent" (if not piercing)
    if (!projectileA.piercing && projectileA.hitTargets.size > 0) return
    if (!projectileB.piercing && projectileB.hitTargets.size > 0) return
    
    // Ignore if targets are on the same team
    if (projectileA.teamId && projectileB.teamId && projectileA.teamId === projectileB.teamId) return
    
    // Different teams: they clash and cancel each other out
    projectileA.hitTargets.add('clash')
    projectileB.hitTargets.add('clash')
    
    projectileA.stick()
    projectileB.stick()
    
    // Apply 20% recoil impulse to whoever successfully parried
    this.applyClashKnockback(projectileA, projectileB)
    this.applyClashKnockback(projectileB, projectileA)
    
    console.log(`💥 PROJECTILE CLASH: ${projectileA.id} vs ${projectileB.id}`)
  }

  /**
   * Applies config-driven recoil knockback to the owner of a weapon when it successfully clashes/parries
   */
  private applyClashKnockback(defenderProj: Projectile, attackerProj: Projectile): void {
    const config = PROJECTILE_INTERACTIONS[defenderProj.type];
    if (!config || !config.canDeflectOthers) return; // Only deflection-capable swings feel clash impact
    
    let defender: WorldLife | undefined = this.gameState.players.get(defenderProj.ownerId) 
      || this.gameState.mobs.get(defenderProj.ownerId)
      || this.gameState.npcs.get(defenderProj.ownerId);
      
    if (!defender || !defender.isAlive) return;

    let attacker: WorldLife | undefined = this.gameState.players.get(attackerProj.ownerId) 
      || this.gameState.mobs.get(attackerProj.ownerId)
      || this.gameState.npcs.get(attackerProj.ownerId);

    // Calculate knockback direction: from the incoming projectile, or fallback to attacker->defender pos
    const vx = attackerProj.vx;
    const vy = attackerProj.vy;
    const speedSq = vx * vx + vy * vy;
    let nx: number;
    let ny: number;
    
    if (speedSq > 0.0001) {
      const speed = Math.sqrt(speedSq);
      nx = vx / speed;
      ny = vy / speed;
    } else {
      if (attacker) {
        const dx = defender.x - attacker.x;
        const dy = defender.y - attacker.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = dx / len;
        ny = dy / len;
      } else {
        nx = 0; ny = 0;
      }
    }

    const { GAME_CONFIG } = require('../config/gameConfig');
    const rawImpulse = attackerProj.damage * GAME_CONFIG.attackImpulseMultiplier;
    
    // Cap normal impulse, then multiply by the config's absorption rate (e.g., 20% or 0%)
    const impulseMagnitude = Math.max(GAME_CONFIG.minImpulse, Math.min(rawImpulse, GAME_CONFIG.maxImpulse)) * config.absorbImpulseMultiplier;
    
    if (impulseMagnitude <= 0) return; // Perfect block! No recoil feels.

    const impulse = { x: nx * impulseMagnitude, y: ny * impulseMagnitude };

    try {
      eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
        attacker: attacker || defender,
        taker: defender,
        impulse,
      });
    } catch {}
  }


  /**
   * Handle projectile collision with boundary
   * Projectile sticks and despawns after lifetime
   */
  handleBoundaryCollision(projectile: Projectile): void {
    projectile.stick()
  }

  /**
   * Check if projectile can be deflected by attacker and reflects it using configuration rules
   * Returns true if deflected, false otherwise
   */
  checkDeflection(projectile: Projectile, attacker: WorldLife): boolean {
    const incomingConfig = PROJECTILE_INTERACTIONS[projectile.type];
    if (!incomingConfig || !incomingConfig.canBeDeflected) return false;

    // Resolve the weapon type the attacker is currently swinging
    // By default, assuming generic 'melee' backward compatibility if nothing active is found
    let deflectorWeaponType: ProjectileType = WEAPON_TYPES.MELEE; 
    for (const p of this.gameState.projectiles.values()) {
        if (p.ownerId === attacker.id && PROJECTILE_INTERACTIONS[p.type]?.canDeflectOthers) {
            deflectorWeaponType = p.type;
            break;
        }
    }

    const defenderConfig = PROJECTILE_INTERACTIONS[deflectorWeaponType];
    if (!defenderConfig || !defenderConfig.canDeflectOthers) return false;

    // Can't deflect if already deflected by someone
    if (projectile.deflectedBy) return false
    
    // Attacker must be attacking or in wind-up phase
    if (!attacker.isAttacking && !(attacker as any).pendingAttack) return false

    // Ignore if attacker is the owner (shooter)
    if (projectile.ownerId === attacker.id) return false
    
    // Ignore if on the same team (and a team is actually set)
    if (projectile.teamId && (attacker as any).teamId && projectile.teamId === (attacker as any).teamId) return false
    
    // Check if projectile is in attack range (calculate distance directly)
    const dx = projectile.x - attacker.x
    const dy = projectile.y - attacker.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const effectiveRange = attacker.attackRange + (attacker as any).radius + projectile.radius
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

    // Apply config-driven speed boost and range scaling
    const speedBoost = Math.max(0.1, defenderConfig.deflectPowerMultiplier);
    projectile.vx = newVx * speedBoost;
    projectile.vy = newVy * speedBoost;
    
    projectile.maxRange = Math.max(1, projectile.maxRange * incomingConfig.deflectedRangeMultiplier);
    // Refresh max distance capability since it's practically a new projectile
    if (projectile.maxRange <= projectile.distanceTraveled) {
        // Give it at least some distance if it was already maxed out
        projectile.maxRange += 10;
    }
    projectile.ownerId = attacker.id
    // Make the projectile belong to the deflecting actor's team going forward.
    // This prevents immediate "same-team" filtering issues and keeps collision rules consistent.
    ;(projectile as any).teamId = (attacker as any).teamId ?? projectile.teamId
    projectile.hitTargets.clear() // Can damage again after deflection
    projectile.deflectedBy = attacker.id

    // Reset travel and lifetime-related state so the deflected projectile
    // gets a fresh visible flight phase.
    projectile.distanceTraveled = 0
    projectile.isStuck = false
    projectile.stuckAt = 0

    // Apply recoil impulse to the deflector based on config absorption rate
    const { GAME_CONFIG } = require('../config/gameConfig')
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
      } catch {}
    }

    return true
  }
}

