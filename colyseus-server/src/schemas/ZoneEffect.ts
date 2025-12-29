import { type } from '@colyseus/schema'
import { WorldObject } from './WorldObject'

export class ZoneEffect extends WorldObject {
  @type('string') ownerId: string
  @type('number') radius: number = 2
  @type('string') effectType: string = 'damage' // 'damage', 'freeze', 'stun'
  @type('number') effectValue: number = 0 
  
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
    effectType: string = 'damage',
    effectValue: number = 10,
    radius: number = 2,
    castTime: number = 1000,
    duration: number = 5000,
    tickRate: number = 0
  ) {
    super(id, x, y, 0, 0, ['zone-effect'])
    this.ownerId = ownerId
    this.effectType = effectType
    this.effectValue = effectValue
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
