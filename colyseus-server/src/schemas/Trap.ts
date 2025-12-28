import { type } from '@colyseus/schema'
import { WorldObject } from './WorldObject'

export class Trap extends WorldObject {
  @type('string') ownerId: string
  @type('number') triggerRadius: number = 2
  @type('number') effectValue: number = 0 // Damage amount or duration based on type
  @type('string') effectType: string = 'damage' // 'damage', 'freeze', 'stun'
  @type('boolean') isArmed: boolean = false
  @type('number') armDelay: number = 1000 // Time in ms before trap becomes active
  @type('number') createdAt: number

  constructor(
    id: string,
    x: number,
    y: number,
    ownerId: string,
    effectType: string = 'damage',
    effectValue: number = 10,
    triggerRadius: number = 2,
    armDelay: number = 1000
  ) {
    super(id, x, y, 0, 0, ['trap'])
    this.ownerId = ownerId
    this.effectType = effectType
    this.effectValue = effectValue
    this.triggerRadius = triggerRadius
    this.armDelay = armDelay
    this.createdAt = Date.now()
    this.isArmed = false
  }

  // Check if trap should be armed
  checkArming(): boolean {
    if (this.isArmed) return false
    
    if (Date.now() - this.createdAt >= this.armDelay) {
      this.isArmed = true
      return true
    }
    return false
  }

  // Check if target is within trigger radius
  shouldTrigger(target: { x: number; y: number }): boolean {
    if (!this.isArmed) return false
    
    const dx = this.x - target.x
    const dy = this.y - target.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    return distance <= this.triggerRadius
  }
}
