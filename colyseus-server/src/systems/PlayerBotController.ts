import { Player } from '../schemas/Player';
import { PlayerCombatSystem } from './PlayerCombatSystem';

/**
 * PlayerBotController
 * Handles AI decisions and bot execution for a Player.
 */
export class PlayerBotController {
    private player: Player;
    private combatSystem: PlayerCombatSystem;

    constructor(player: Player, combatSystem: PlayerCombatSystem) {
        this.player = player;
        this.combatSystem = combatSystem;
    }

    /**
     * Update loop for bot behavior
     */
    update(deltaTime: number, mobs?: Map<string, any>, roomId?: string): void {
        if (!this.player.isBotMode) return;

        // Update heading based on movement (from AI desired velocity)
        if (Math.abs(this.player.desiredVx) > 0.1 || Math.abs(this.player.desiredVy) > 0.1) {
            this.player.heading = Math.atan2(this.player.desiredVy, this.player.desiredVx);
        }

        // Handle Bot Attack
        if (this.player.currentBehavior === 'attack' && mobs && roomId) {
            this.executeBotAttack(mobs, roomId);
        }
    }

    /**
     * Execute attack for bot mode
     */
    executeBotAttack(mobs: Map<string, any>, roomId: string): void {
        const { eventBus, RoomEventType } = require('../events/EventBus');
        
        // 1. Try to get target from AI decision
        let target = this.player.currentAttackTarget ? mobs.get(this.player.currentAttackTarget) : null;
        
        // 2. Face the target if we have one
        if (target && target.isAlive) {
            const dx = target.x - this.player.x;
            const dy = target.y - this.player.y;
            this.player.heading = Math.atan2(dy, dx);
        }
        
        // 3. Attempt attack via shared combat system (Wait for Wind-Up, use Cooldowns, emit events)
        this.combatSystem.attemptAttack(mobs, roomId);
    }
}
