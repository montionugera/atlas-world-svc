
import { type, Schema, ArraySchema } from '@colyseus/schema'
import { WorldObject } from './WorldObject'

export class ZoneEffectEffect extends Schema {
    @type('string') type: string = 'damage'
    @type('number') value: number = 0
    @type('number') chance: number = 1.0 // Default 100% chance
    @type('number') interval: number = 0 // Tick interval for DOTs (0 = no DOT)
    @type('number') duration: number = 0 // Duration of status effect (ms)
}

export class ZoneEffect extends WorldObject {
  @type('string') ownerId: string
  @type('string') skillId: string = ""
  @type('number') radius: number = 2
  
  // Multiple effects support
  @type([ZoneEffectEffect]) effects = new ArraySchema<ZoneEffectEffect>()
  
  // Timing properties
  @type('number') castTime: number = 1000 // Time before activation (ms)
  @type('number') duration: number = 5000 // Time it stays active (ms), -1 for infinite
  @type('number') tickRate: number = 0 // Frequency of effect (ms), 0 for continuous/one-shot
  
  // State properties
  @type('boolean') isActive: boolean = false
  @type('number') createdAt: number
  @type('number') activatedAt: number = 0
  
  // Server-only (not synced)
  lastTickTime: number = 0

  constructor(
    id: string,
    x: number,
    y: number,
    ownerId: string,
    effects: { type: string, value: number, chance?: number, interval?: number, duration?: number }[] = [],
    radius: number = 2,
    castTime: number = 1000,
    duration: number = 5000,
    tickRate: number = 0
  ) {
    super(id, x, y, 0, 0, ['zone-effect'])
    this.ownerId = ownerId
    
    // Initialize effects schema array
    effects.forEach(eff => {
        const effectSchema = new ZoneEffectEffect();
        effectSchema.type = eff.type;
        effectSchema.value = eff.value;
        effectSchema.chance = eff.chance ?? 1.0;
        effectSchema.interval = eff.interval ?? 0;
        effectSchema.duration = eff.duration ?? 0;
        this.effects.push(effectSchema);
    });

    this.radius = radius
    
    this.castTime = castTime
    this.duration = duration
    this.tickRate = tickRate
    
    this.createdAt = Date.now()
    this.isActive = false // Starts in casting state
  }

  // Check if target is within trigger radius (edge-to-edge)
  shouldTrigger(target: { x: number; y: number; radius?: number }): boolean {
    if (!this.isActive) return false
    
    const dx = this.x - target.x
    const dy = this.y - target.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Check if distance is less than sum of radii (edge-to-edge collision)
    const targetRadius = target.radius || 0
    return distance <= (this.radius + targetRadius)
  }
}
