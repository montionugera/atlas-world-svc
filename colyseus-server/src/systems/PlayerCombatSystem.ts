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
