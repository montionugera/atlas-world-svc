
import { Schema, type } from '@colyseus/schema'

export class BattleStatus extends Schema {
    @type('string') id: string
    @type('string') type: string
    @type('number') expiresAt: number // Timestamp when it ends
    @type('string') sourceId: string = '' // Entity ID of who applied it
    
    // Value properties (Damage amount, Slow %, etc)
    @type('number') value: number = 0
    
    // DOT/HOT properties
    @type('number') interval: number = 0 // Tick rate in ms (0 = no tick)
    @type('number') lastTick: number = 0 // Timestamp of last tick
    
    constructor(
        id: string,
        type: string,
        duration: number,
        sourceId: string = '',
        value: number = 0,
        interval: number = 0
    ) {
        super()
        this.id = id
        this.type = type
        this.expiresAt = Date.now() + duration
        this.sourceId = sourceId
        this.value = value
        this.interval = interval
        this.lastTick = Date.now() // Initialize lastTick to now so it waits one interval before first tick
    }
}
