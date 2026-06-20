import { Projectile } from '../../schemas/Projectile'
import { WorldLife } from '../../schemas/WorldLife'
import { BattleModule } from '../BattleModule'
import { BattleManager } from '../BattleManager'
import { GameState } from '../../schemas/GameState'
import { PROJECTILE_INTERACTIONS } from '../../config/combatConfig'
import { eventBus, RoomEventType } from '../../events/EventBus'
import { GAME_CONFIG } from '../../config/gameConfig'
import { DeflectionResolver } from './DeflectionResolver'

export class ProjectileCollisionResolver {
  private gameState: GameState
  private battleModule: BattleModule
  private battleManager?: BattleManager
  private deflectionResolver: DeflectionResolver

  constructor(
    gameState: GameState,
    battleModule: BattleModule,
    battleManager: BattleManager | undefined,
    deflectionResolver: DeflectionResolver
  ) {
    this.gameState = gameState
    this.battleModule = battleModule
    this.battleManager = battleManager
    this.deflectionResolver = deflectionResolver
  }

  /**
   * Handle projectile collision with living entities (Players or Mobs)
   * Piercing: keeps flying; can damage multiple targets (melee cleave).
   * Non-piercing: damages once per target cap, then `stick()` — stops at hit, despawn after `lifetime`.
   */
  handleEntityCollision(projectile: Projectile, target: WorldLife): void {
    if (!projectile.piercing && projectile.hitTargets.size > 0) return // Non-piercing hit its limit
    if (projectile.hitTargets.has(target.id)) return // Already hit this target

    // 1. Ignore if target is the owner (shooter)
    if (projectile.ownerId === target.id) return

    // 2. Ignore if target is on the same team (and a team is actually set)
    if (projectile.teamId && target.teamId && projectile.teamId === target.teamId) return

    // 3. Last-ditch deflection: same rules as tick scan — any deflectable incoming type, one code path.
    const incomingCfg = PROJECTILE_INTERACTIONS[projectile.type]
    if (incomingCfg?.canBeDeflected && this.deflectionResolver.checkDeflection(projectile, target)) {
      return
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
          } catch (err) {
            console.warn(`⚠️ PROJECTILE: failed to emit BATTLE_DAMAGE_PRODUCED (hit): ${err instanceof Error ? err.message : String(err)}`)
          }

          if (targetDied) {
            console.log(`💀 PROJECTILE: ${projectile.id} killed ${target.id}`)
          } else {
            console.log(`⚔️ PROJECTILE: ${projectile.id} hit ${target.id} for ${damage} damage`)
          }
        }
    }

    // Track hit to prevent hitting the same target multiple times per swing
    projectile.hitTargets.add(target.id)

    if (!projectile.piercing) {
      projectile.stick()
    }
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
    } catch (err) {
      console.warn(`⚠️ PROJECTILE: failed to emit BATTLE_DAMAGE_PRODUCED (clash): ${err instanceof Error ? err.message : String(err)}`)
    }
  }


  /**
   * Handle projectile collision with boundary
   * Projectile sticks and despawns after lifetime
   */
  handleBoundaryCollision(projectile: Projectile): void {
    projectile.stick()
  }
}
