import { Player } from '../schemas/Player';
import { PLAYER_STATS } from '../config/combatConfig';

/**
 * PlayerCombatSystem
 * Handles attack logic, cooldowns, targeting, and wind-up phases for a Player.
 */
export class PlayerCombatSystem {
    private player: Player;

    constructor(player: Player) {
        this.player = player;
    }

    /**
     * Check if an action is ready (specific cooldown AND global cooldown)
     */
    canPerformAction(actionId: string): boolean {
        const now = Date.now();
        
        // 1. Check Global Cooldown
        if (now < this.player.globalCooldownUntil) {
            return false;
        }
        
        // 2. Check Specific Cooldown
        const readyAt = this.player.cooldowns.get(actionId);
        if (readyAt && now < readyAt) {
            return false;
        }
        
        return true;
    }

    /**
     * Trigger cooldowns for an action
     * @param actionId The specific action ID
     * @param duration The cooldown duration for this specific action (ms)
     * @param gcdDuration Optional Global Cooldown duration (ms)
     */
    performAction(actionId: string, duration: number, gcdDuration: number = 0): void {
        const now = Date.now();
        
        // Set Specific Cooldown
        const readyAt = now + duration;
        this.player.cooldowns.set(actionId, readyAt);
        // console.log(`[CD] SET ${actionId} cooldown to ${duration}ms. ReadyAt: ${readyAt}`)
        
        // Set Global Cooldown
        if (gcdDuration > 0) {
            this.player.globalCooldownUntil = Math.max(this.player.globalCooldownUntil, now + gcdDuration);
        }
    }

    /**
     * Update loop for combat state (wind-up execution)
     */
    update(deltaTime: number, mobs?: Map<string, any>, roomId?: string): void {
        // Check pending attack execution (Wind-up complete)
        if (this.player.pendingAttack && this.player.isAlive) {
            if (Date.now() >= this.player.attackExecuteTime) {
                // Wind-up complete!
                // First, clear casting state so we can execute
                this.player.isCasting = false;
                this.player.pendingAttack = false;
                
                // Execute
                if (mobs && roomId) {
                   this.executeAttack(mobs, roomId);
                }
            }
        }
    }

    /**
     * Process attack input and initiate wind-up
     */
    processAttackInput(mobs: Map<string, any>, roomId: string): boolean {
        // Dead players cannot attack
        if (!this.player.isAlive) return false;
        
        // If in bot mode, AI handles attacks (via BotController)
        if (this.player.isBotMode) {
            return false;
        }

        if (!this.player.input.attack) return false;
        
        return this.attemptAttack(mobs, roomId);
    }

    /**
     * Try to initiate an attack (checked by both Manual and Bot)
     */
    public attemptAttack(mobs: Map<string, any>, roomId: string): boolean {
        if (!this.player.isAlive) return false;

        // Status effect check
        if (this.player.isStunned) return false;
        
        // Casting check - prevent attack while casting
        if (this.player.isCasting) return false;

        if (!this.player.canAttack()) {
            return false;
        }

        // WIND-UP LOGIC: Start "casting" the attack
        const windUpTime = PLAYER_STATS.atkWindUpTime || 0;
        
        // Mark attack start time for cooldown consistency
        // effective start of the "attack cycle"
        this.player.lastAttackTime = performance.now();
        
        // If no wind-up, execute immediately
        if (windUpTime <= 0) {
           return this.executeAttack(mobs, roomId);
        }

        // Start wind-up
        this.player.isCasting = true;
        this.player.castingUntil = Date.now() + windUpTime;
        this.player.castDuration = windUpTime;
        
        this.player.pendingAttack = true;
        this.player.attackExecuteTime = this.player.castingUntil;
        
        // Pre-calculate target
        // NOTE: For bots, they must ensure heading is correct BEFORE calling this
        const target = this.findTargetInDirection(mobs);
        this.player.pendingAttackTargetId = target ? target.id : '';

        console.log(`⚔️ PLAYER ${this.player.id} starting attack wind-up (${windUpTime}ms)`);
        return true;
    }

    /**
     * Execute the actual attack effect (after wind-up or instant)
     */
    executeAttack(mobs: Map<string, any>, roomId: string): boolean {
        const { eventBus, RoomEventType } = require('../events/EventBus');
        
        // Re-acquire target logic
        const target = this.findTargetInDirection(mobs);
        
        if (target) {
          // Emit attack event with target - let BattleManager handle the rest
          const attackData = {
            actorId: this.player.id,
            targetId: target.id,
            damage: this.player.attackDamage,
            range: this.player.attackRange,
            roomId: roomId
          };

          eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData);
          console.log(`⚔️ PLAYER ${this.player.id} attacking ${target.id} in heading direction`);
          return true;
        } else {
          // No target found, but still allow attack (for visual feedback)
          this.player.isAttacking = true;
          this.player.attackAnimationStartTime = performance.now();
          
          // Emit attack event without target
          const attackData = {
            actorId: this.player.id,
            // targetId omitted - no target
            damage: this.player.attackDamage,
            range: this.player.attackRange,
            roomId: roomId
          };

          eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData);
          console.log(`⚔️ PLAYER ${this.player.id} attacking (no target) in heading direction ${this.player.heading.toFixed(2)}`);
          return true;
        }
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
