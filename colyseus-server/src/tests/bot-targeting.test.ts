import { AttackBehavior, ChaseBehavior, AgentEnvironment } from '../ai/behaviors/AgentBehaviors'
import { IAgent } from '../ai/interfaces/IAgent'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { ArraySchema } from '@colyseus/schema'

describe('Bot Targeting Logic', () => {
  let playerBot: Player
  let mob: Mob
  let attackBehavior: AttackBehavior
  let chaseBehavior: ChaseBehavior
  let env: AgentEnvironment

  beforeEach(() => {
    // Setup Player Bot
    playerBot = new Player('p1', 'Bot', 100, 100)
    playerBot.setBotMode(true)
    playerBot.tags = new ArraySchema<string>('player') // Ensure tag is set
    
    // Setup Mob
    mob = new Mob({ id: 'm1', x: 105, y: 100 })
    
    // Setup Behaviors
    attackBehavior = new AttackBehavior()
    chaseBehavior = new ChaseBehavior()
    
    // Setup Environment
    env = {
      nearestPlayer: null, // No other players nearby
      distanceToNearestPlayer: Infinity,
      nearestMob: mob,
      distanceToNearestMob: 5,
      nearBoundary: false,
      worldBounds: { width: 800, height: 600 }
    }
  })

  test('Player Bot should attack Mob when in range', () => {
    // Verify canApply
    expect(attackBehavior.canApply(playerBot, env)).toBe(true)
    
    // Verify decision
    const decision = attackBehavior.getDecision(playerBot, env, 0)
    expect(decision.behavior).toBe('attack')
    expect(decision.currentAttackTarget).toBe(mob.id)
  })

  test('Player Bot should chase Mob when out of attack range but in chase range', () => {
    // Move mob further away
    mob.x = 120 // Distance 20
    env.distanceToNearestMob = 20
    
    // Verify chase applies
    expect(chaseBehavior.canApply(playerBot, env)).toBe(true)
    
    // Verify decision
    const decision = chaseBehavior.getDecision(playerBot, env, 0)
    expect(decision.behavior).toBe('chase')
    expect(decision.currentChaseTarget).toBe(mob.id)
  })

  test('Mob should still target Player', () => {
    // Setup a Mob agent
    const mobAgent = new Mob({ id: 'm2', x: 200, y: 200 })
    mobAgent.tags = new ArraySchema<string>('mob') // Default tag
    
    // Environment for Mob
    const mobEnv: AgentEnvironment = {
      nearestPlayer: playerBot,
      distanceToNearestPlayer: 5,
      nearestMob: null,
      distanceToNearestMob: Infinity,
      nearBoundary: false
    }
    
    // Verify Mob attacks Player
    expect(attackBehavior.canApply(mobAgent, mobEnv)).toBe(true)
    const decision = attackBehavior.getDecision(mobAgent, mobEnv, 0)
    expect(decision.currentAttackTarget).toBe(playerBot.id)
  })
})
