import { Client } from 'colyseus'
import { GameRoom } from '../GameRoom'
import { SKILLS } from '../../config/skills'
import * as planck from 'planck'

export class PlayerInputHandler {
  constructor(private room: GameRoom) {}

  register() {
    this.room.onMessage('player_input_move', this.handleMove.bind(this))
    this.room.onMessage('player_input_action', this.handleAction.bind(this))
    this.room.onMessage('player_toggle_bot', this.handleBotToggle.bind(this))
  }

  private handleMove(client: Client, data: { vx: number; vy: number }) {
    console.log(`🎮 MOVE: ${client.sessionId} ${data?.vx} ${data?.vy}`)
    const player = this.room.state.getPlayer(client.sessionId)
    if (!player) return
    
    // Prevent dead players from moving
    if (!player.isAlive) {
      // Clear input to stop any movement
      this.room.state.updatePlayerInput(client.sessionId, 0, 0)
      return
    }
    // Prevent moving while casting
    if (Date.now() < player.castingUntil) {
        return
    }
    
    const { vx, vy } = data || { vx: 0, vy: 0 }
    this.room.state.updatePlayerInput(client.sessionId, vx, vy)
  }

  private handleAction(client: Client, data: { action: string; pressed: boolean }) {
    const player = this.room.state.getPlayer(client.sessionId)
    if (!player) return
    
    const { action, pressed } = data || { action: '', pressed: false }
    this.room.state.updatePlayerAction(client.sessionId, action, pressed)

    // Handle direct actions (one-shot triggers)
    if (pressed && action === 'useSkill') {
       const inputData = data as any;
       const skillId = inputData.skillId;
       const skill = SKILLS[skillId];

       if (!skill) {
           console.warn(`⚠️ ACTION: Invalid skillId '${skillId}' from player ${player.id}`);
           return;
       }

       // Check Cooldowns (checks all potential blockers like self-CD and GCD)
       if (player.canPerformAction(skill.consideringCooldown)) {
           // Double check: Prevent casting if already casting
           if (Date.now() < player.castingUntil) {
               console.log(`⏳ ACTION: Already casting, ignored ${skill.id} for player ${player.id}`);
               return;
           }

           console.log(`✨ ACTION: Player ${player.id} casting ${skill.name} (${skill.id})`)
           
           // Check for Instant Physics Effects (like Impulse/Dash)
           const impulseEffect = skill.effects.find(e => e.type === 'impulse_caster');
           if (impulseEffect) {
               // Apply Impulse immediately
               const body = this.room.physicsManager.getBody(player.id)
               if (body) {
                   const mass = body.getMass()
                   const impulseMagnitude = mass * impulseEffect.value
                   // Use heading (or input direction if valid?)
                   // For consistency with typical dashes, use facing direction
                   const impulseX = Math.cos(player.heading) * impulseMagnitude
                   const impulseY = Math.sin(player.heading) * impulseMagnitude
                   
                   this.room.physicsManager.applyImpulseToBody(player.id, { x: impulseX, y: impulseY })
                   console.log(`💨 SKILL DASH: Player ${player.id} dashed with impulse ${impulseEffect.value}`)
               }
               
               // Trigger Cooldowns Immediately for instant skills (Apply all cooldown settings)
               player.performAction(skill.cooldownSetting)
               return; // Skip Zone Effect creation for instant self-physics skills
           }

           // Target Position Logic
           let targetX = player.x;
           let targetY = player.y;
           
           if (typeof inputData.x === 'number' && typeof inputData.y === 'number') {
               // Calculate vector from player to target
               const dx = inputData.x - player.x;
               const dy = inputData.y - player.y;
               const dist = Math.sqrt(dx * dx + dy * dy);
               const maxRange = 16;
               
               if (dist <= maxRange) {
                   targetX = inputData.x;
                   targetY = inputData.y;
               } else {
                   // Clamp to max range
                   const ratio = maxRange / dist;
                   targetX = player.x + dx * ratio;
                   targetY = player.y + dy * ratio;
               }
           }
           
           // Create Zone Effect based on Skill Stats
           const zone = this.room.zoneEffectManager.createZoneEffect(
             targetX,
             targetY,
             player.id,
             skill.id,
             skill.effects,
             skill.radius,
             skill.skillCastingTime,
             skill.duration,
             skill.tickRate
           )
            
           // Force stop movement immediately
           this.room.state.updatePlayerInput(client.sessionId, 0, 0)
           
           this.room.state.zoneEffects.set(zone.id, zone)
           
           // Trigger Cooldowns from Skill Stats
           player.performAction(skill.cooldownSetting)
           
           player.castingUntil = Date.now() + skill.skillCastingTime // Lock movement for cast time
           player.castDuration = skill.skillCastingTime // Sync duration to client
       }
    }
  }

  private handleBotToggle(client: Client, data: { enabled: boolean }) {
    const player = this.room.state.getPlayer(client.sessionId)
    if (!player) return
    
    const enabled = data?.enabled ?? false
    console.log(`🤖 PLAYER BOT MODE: ${client.sessionId} set to ${enabled}`)
    player.setBotMode(enabled)

    if (enabled) {
      // Register player with AI module
      this.room.state.aiModule.registerAgent(player, {
        behaviors: ['attack', 'chase', 'wander', 'avoidBoundary'],
        perception: { range: 300 }, // Player has larger perception
        behaviorPriorities: {
          avoidBoundary: 10,
          attack: 8,
          chase: 5,
          wander: 1
        }
      })
    } else {
      // Unregister player from AI module
      this.room.state.aiModule.unregisterAgent(player.id)
    }
  }
}
