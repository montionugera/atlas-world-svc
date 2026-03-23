import { Player } from '../schemas/Player';
import { PLAYER_STATS, WEAPON_TYPES } from '../config/combatConfig';
import { resolveWeaponBasicProjectileParams } from '../combat/attackDamage';
import { resolvePlayerMeleeAttackTiming } from '../combat/meleeAttackSpeed';
import { ScheduledAttack, processAttackQueue } from './attackQueue';

/**
 * PlayerCombatSystem
 * Handles attack logic, cooldowns, targeting, and wind-up via shared attack queue.
 */
export class PlayerCombatSystem {
    private player: Player;
    private attackQueue: ScheduledAttack[] = [];

    constructor(player: Player) {
        this.player = player;
    }

    /**
     * Check if an action is ready (checks ALL specified cooldown keys)
     * @param cooldownKeys Array of cooldown keys to check (e.g. ['skill_1', 'global_magic_cd'])
     * @returns true if ALL keys are ready (not on cooldown)
     */
    canPerformAction(cooldownKeys: string[]): boolean {
        const now = Date.now();
        
        // Check all keys in the list
        for (const key of cooldownKeys) {
            const readyAt = this.player.cooldowns.get(key);
            if (readyAt && now < readyAt) {
                // If ANY key is on cooldown, action cannot be performed
                return false;
            }
        }
        
        return true;
    }

    /**
     * Trigger cooldowns for an action
     * @param settings Map of cooldown keys to duration (ms) (e.g. { 'skill_dash': 500, 'global_cd': 1000 })
     */
    performAction(settings: Record<string, number>): void {
        const now = Date.now();
        
        for (const [key, duration] of Object.entries(settings)) {
            const readyAt = now + duration;
            // Key logic: We only EXTEND the cooldown. If it's already on a longer cooldown, keep it.
            // (Standard MMO behavior for shared cooldowns, though usually setting a fresh CD overwrites.
            // Let's overwrite for responsiveness, trusting the config is correct).
            this.player.cooldowns.set(key, readyAt);
        }
    }

    /**
     * Update loop: process attack queue (shared pipeline), then sync casting state for client.
     */
    update(deltaTime: number, context?: any): void {
        const now = Date.now();
        if (this.player.isAlive && context) {
            processAttackQueue(
                this.attackQueue,
                now,
                (item) => item.executeTime,
                () => this.executeAttack(context)
            );
        }
        this.syncCastingStateFromQueue(now);
    }

    private syncCastingStateFromQueue(now: number): void {
        const next = this.attackQueue[0];
        if (next && next.executeTime > now) {
            this.player.isCasting = true;
            this.player.castingUntil = next.executeTime;
            this.player.castDuration = next.executeTime - now;
            this.player.pendingAttack = true;
            this.player.attackExecuteTime = next.executeTime;
            this.player.pendingAttackTargetId = next.targetId ?? '';
        } else {
            this.player.isCasting = false;
            this.player.pendingAttack = false;
            this.player.attackExecuteTime = 0;
            this.player.pendingAttackTargetId = '';
        }
    }

    /**
     * Process attack input and initiate wind-up
     */
    processAttackInput(context: any): boolean {
        // Dead players cannot attack
        if (!this.player.isAlive) return false;
        
        // If in bot mode, AI handles attacks (via BotController)
        if (this.player.isBotMode) {
            return false;
        }

        if (!this.player.input.attack) return false;
        
        return this.attemptAttack(context);
    }

    /**
     * Try to initiate an attack (checked by both Manual and Bot)
     */
    public attemptAttack(context: any): boolean {
        if (!this.player.isAlive) return false;

        // Status effect check
        if (this.player.isStunned) return false;
        
        // Casting check - prevent attack while casting
        if (this.player.isCasting) return false;

        if (!this.player.canAttack()) {
            return false;
        }

        const meleeTiming = resolvePlayerMeleeAttackTiming(this.player);
        const windUpTime = meleeTiming?.windUpMs ?? (PLAYER_STATS.atkWindUpTime || 0);
        this.player.lastAttackTime = performance.now();

        const target = this.findTargetInDirection(context?.mobs || new Map());
        const targetId = target ? target.id : '';

        if (windUpTime <= 0) {
            return this.executeAttack(context);
        }

        const executeTime = Date.now() + windUpTime;
        this.attackQueue.push({
            executeTime,
            targetId,
            kind: 'melee',
        });
        this.syncCastingStateFromQueue(Date.now());

        console.log(`⚔️ PLAYER ${this.player.id} starting attack wind-up (${windUpTime}ms)`);
        return true;
    }

    /**
     * Execute the actual attack effect (after wind-up or instant)
     */
    executeAttack(context: any): boolean {
        const { eventBus, RoomEventType } = require('../events/EventBus');
        const roomId = context?.roomId;
        const projectileManager = context?.projectileManager;
        const gameState = context?.gameState;
        
        // Spawn melee / weapon projectile (params from central resolver)
        if (projectileManager && gameState && roomId) {
            const w = resolveWeaponBasicProjectileParams(this.player);
            const { projectileType, damage, damageType, atkRange, pRadius, atkSpeed, attackKind, meleeLifetimeMs } = w;

            const targetX = this.player.x + Math.cos(this.player.heading) * atkRange;
            const targetY = this.player.y + Math.sin(this.player.heading) * atkRange;

            let projectile;
            if (projectileType === WEAPON_TYPES.MELEE || projectileType === WEAPON_TYPES.SMALL_MELEE || projectileType === WEAPON_TYPES.LARGE_MELEE) {
                projectile = projectileManager.createMelee(
                    this.player, targetX, targetY, damage, damageType, pRadius, atkSpeed, projectileType, meleeLifetimeMs
                );
            } else {
                projectile = projectileManager.createSpear(
                    this.player, targetX, targetY, damage, damageType, atkRange, pRadius, atkSpeed, projectileType
                );
            }
            projectile.attackKind = attackKind;

            gameState.projectiles.set(projectile.id, projectile);
        }

        // Emit BATTLE_ATTACK for client animation (no specific target needed anymore)
        const attackData = {
          actorId: this.player.id,
          targetId: '', // Cleaving hitboxes don't have a single explicit target upfront
          damage: this.player.pAtk, // just for visual numbers/logs
          range: this.player.attackRange,
          roomId: roomId
        };

        this.player.isAttacking = true;
        this.player.attackAnimationStartTime = performance.now();
        
        if (roomId) {
            eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData);
        }
        
        console.log(`⚔️ PLAYER ${this.player.id} attacking (melee projectile) in heading direction ${this.player.heading.toFixed(2)}`);
        return true;
    }

    /**
     * Find target in attack direction (heading-based)
     */
    public findTargetInDirection(mobs: Map<string, any>): any | null {
        // Removed canAttack check - this method is a spatial query and shouldn't enforce cooldowns
        // (Cooldowns are checked before calling this or during input processing)

        // Block targeting if stunned
        if (this.player.isStunned) return null;

        const attackCone = Math.PI / 4; // 45-degree attack cone
        const maxRange = this.player.attackRange + this.player.radius;
        let nearestTarget: any = null;
        let nearestDistance = Infinity;

        for (const mob of mobs.values()) {
          if (!mob.isAlive) continue;

          const distance = this.player.getDistanceTo(mob);
          if (distance > maxRange + mob.radius) continue;

          // Calculate angle between player heading and direction to mob
          const dx = mob.x - this.player.x;
          const dy = mob.y - this.player.y;
          const angleToMob = Math.atan2(dy, dx);
          const angleDiff = Math.abs(this.player.heading - angleToMob);

          // Check if mob is within attack cone (handle angle wrapping)
          const normalizedAngleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
          if (normalizedAngleDiff <= attackCone) {
            if (distance < nearestDistance) {
              nearestTarget = mob;
              nearestDistance = distance;
            }
          }
        }

        return nearestTarget;
    }
}
