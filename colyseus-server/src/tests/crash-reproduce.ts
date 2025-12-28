
import { GameState } from '../schemas/GameState'
import { BattleModule } from '../modules/BattleModule'
import { TrapManager } from '../modules/TrapManager'
import { Mob } from '../schemas/Mob'

// Mock dependencies
const state = new GameState('map-test', 'room-test')
const battleModule = new BattleModule(state)
const trapManager = new TrapManager(state, battleModule)

console.log("🚀 Starting crash reproduction...")

try {
    // 1. Initialize State
    console.log("Initializing State...")
    if (!state.traps) {
        console.error("❌ State.traps is undefined!")
    } else {
        console.log("✅ State.traps is defined")
    }

    // 2. Add a trap
    console.log("Adding Trap...")
    const trap = trapManager.createTrap(0, 0, 'player1', 'damage', 10, 1)
    state.traps.set(trap.id, trap)

    // 3. Simulate Update Loop (Trap Manager)
    console.log("Simulating TrapManager Update...")
    trapManager.update(state.traps)
    console.log("✅ TrapManager update passed")
    
    // 4. Simulate Mob Update
    console.log("Adding Mob...")
    const mob = new Mob({ id: 'm1', x: 10, y: 10 })
    state.mobs.set('m1', mob)
    
    console.log("Simulating Mob Update...")
    // @ts-ignore
    state.updateMobs()
    console.log("✅ Mob update passed")

    // 5. Simulate Triggering
    // Add player
    const Player = require('../schemas/Player').Player
    const player = new Player('p1', 'Player 1', 0, 0)
    state.players.set('p1', player)

    trapManager.update(state.traps)
    console.log("✅ TrapManager Trigger update passed")

} catch (e) {
    console.error("🔥 CRASH CAUGHT:", e)
}

console.log("🚀 Starting crash reproduction...")

try {
    // 1. Initialize State
    console.log("Initializing State...")
    if (!state.traps) {
        console.error("❌ State.traps is undefined!")
    } else {
        console.log("✅ State.traps is defined")
    }

    // 2. Add a trap
    console.log("Adding Trap...")
    const trap = trapManager.createTrap(0, 0, 'player1', 'damage', 10, 1)
    state.traps.set(trap.id, trap)

    // 3. Simulate Update Loop
    console.log("Simulating Update Loop...")
    trapManager.update(state.traps)
    console.log("✅ Update 1 passed")

    // 4. Simulate Triggering
    // Add player
    const Player = require('../schemas/Player').Player
    const player = new Player('p1', 'Player 1', 0, 0)
    state.players.set('p1', player)

    trapManager.update(state.traps)
    console.log("✅ Update 2 (Trigger) passed")

} catch (e) {
    console.error("🔥 CRASH CAUGHT:", e)
}
