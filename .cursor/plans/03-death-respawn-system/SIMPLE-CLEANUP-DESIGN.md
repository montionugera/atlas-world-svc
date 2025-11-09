# Simple Mob Cleanup Design

## Goal
Clean, simple system with:
- Trigger mechanism to update mob attributes
- `readyToBeRemoved()` function to check cleanup eligibility
- Update function that automatically cleans based on the check

## Design Principles
1. **Simple**: One function checks if mob should be removed
2. **Flexible**: Attributes can be set via triggers
3. **Automatic**: Update loop handles cleanup
4. **Clean**: No complex state machines

## Core Components

### 1. Mob Attributes (Flags)

```typescript
export class Mob extends WorldLife {
  // Lifecycle attributes (server-only)
  diedAt: number = 0
  cantRespawn: boolean = false  // Flag: this mob cannot be respawned
  readyToRemove: boolean = false  // Flag: trigger immediate removal
  // ... other attributes as needed
}
```

### 2. Helper Functions

```typescript
// Check if mob is ready to be permanently removed
readyToBeRemoved(respawnDelayMs: number): boolean {
  // Immediate removal trigger
  if (this.readyToRemove) return true
  
  // Dead mobs past respawn delay
  if (!this.isAlive && this.diedAt > 0) {
    const timeDead = Date.now() - this.diedAt
    return timeDead >= respawnDelayMs
  }
  
  return false
}

// Check if mob can respawn (for resurrection mechanics)
canRespawn(): boolean {
  return !this.isAlive && !this.cantRespawn && this.diedAt > 0
}
```

### 3. Update/Trigger Mechanism

```typescript
// In MobLifeCycleManager
update(): void {
  // 1. Clean up mobs ready to be removed
  this.cleanupReadyMobs()
  
  // 2. Remove dead mobs (with delay check)
  // ... rest of update logic
}

private cleanupReadyMobs(): void {
  const respawnDelay = this.settings.respawnDelayMs ?? 15000
  const toRemove: string[] = []
  
  for (const [id, mob] of this.state.mobs.entries()) {
    if (mob.readyToBeRemoved(respawnDelay)) {
      toRemove.push(id)
    }
  }
  
  // Remove all mobs marked for cleanup
  for (const id of toRemove) {
    this.removeMob(id)
  }
}
```

## Usage Examples

### Example 1: Normal Death Flow
```typescript
// Mob dies
mob.die()  // Sets diedAt, isAlive = false

// Later, update loop checks:
if (mob.readyToBeRemoved(15000)) {
  // Remove after 15 seconds
}
```

### Example 2: Immediate Removal Trigger
```typescript
// Special case: remove immediately
mob.readyToRemove = true
mob.die()

// Next update cycle:
if (mob.readyToBeRemoved(15000)) {
  // Removed immediately (bypasses delay)
}
```

### Example 3: No Respawn Flag
```typescript
// Boss mob that shouldn't respawn
mob.cantRespawn = true
mob.die()

// Later:
if (mob.readyToBeRemoved(30000)) {
  // Remove after 30 seconds
}

if (mob.canRespawn()) {
  // Returns false (cantRespawn = true)
}
```

### Example 4: Custom Cleanup Triggers
```typescript
// In game logic somewhere:
if (someCondition) {
  mob.readyToRemove = true  // Trigger cleanup next update
}

// Update loop automatically cleans it up
```

## Complete Implementation

### Mob Class

```typescript
export class Mob extends WorldLife {
  // ... existing fields
  
  // Cleanup attributes
  diedAt: number = 0
  cantRespawn: boolean = false
  readyToRemove: boolean = false
  
  // Check if ready for permanent removal
  readyToBeRemoved(respawnDelayMs: number): boolean {
    // Immediate removal flag
    if (this.readyToRemove) return true
    
    // Dead mobs past respawn delay
    if (!this.isAlive && this.diedAt > 0) {
      const timeDead = Date.now() - this.diedAt
      return timeDead >= respawnDelayMs
    }
    
    return false
  }
  
  // Check if can be respawned
  canRespawn(): boolean {
    return !this.isAlive && !this.cantRespawn && this.diedAt > 0
  }
  
  // Override die() to set attributes
  die(): void {
    super.die()  // Sets diedAt, isAlive = false
    // Keep default behavior - can set flags externally
  }
}
```

### MobLifeCycleManager

```typescript
export class MobLifeCycleManager {
  // ... existing code
  
  update(): void {
    // 1. Clean up mobs ready to be removed (NEW)
    this.cleanupReadyMobs()
    
    // 2. Rest of existing logic
    const aliveMobs = this.getAliveMobCount()
    // ... spawn/remove logic
  }
  
  // Clean up mobs that are ready to be removed
  private cleanupReadyMobs(): void {
    const respawnDelay = this.settings.respawnDelayMs ?? 15000
    const toRemove: string[] = []
    
    for (const [id, mob] of this.state.mobs.entries()) {
      if (mob.readyToBeRemoved(respawnDelay)) {
        toRemove.push(id)
      }
    }
    
    // Remove all ready mobs
    for (const id of toRemove) {
      this.removeMob(id)
    }
  }
  
  // Extract removal logic to reusable method
  private removeMob(id: string): void {
    const mob = this.state.mobs.get(id)
    if (!mob) return
    
    // Unregister from AI
    this.state.aiModule.unregisterMob(id)
    
    // Remove from state
    this.state.mobs.delete(id)
    
    // Emit event
    eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_REMOVED, { mob })
  }
  
  // REMOVE old removeDeadMobs() - replaced by cleanupReadyMobs()
}
```

## Benefits

1. **Simple**: One function `readyToBeRemoved()` checks everything
2. **Flexible**: Set flags (`readyToRemove`, `cantRespawn`) anywhere
3. **Automatic**: Update loop handles cleanup
4. **Clean**: Clear separation of concerns
5. **Extensible**: Easy to add more attributes/flags

## Configuration

```typescript
// mobSpawnConfig.ts
{
  respawnDelayMs: 15000,  // Default delay
  // ... other settings
}
```

## State Flow

```
ALIVE
  ↓ die()
DEAD (diedAt set, isAlive = false)
  ↓ [check readyToBeRemoved()]
  ↓ if (timeDead >= respawnDelayMs || readyToRemove)
REMOVED (cleanupReadyMobs() removes it)
```

## Edge Cases

1. **Multiple deaths**: `diedAt` resets each time (delay restarts)
2. **Immediate removal**: Set `readyToRemove = true` to bypass delay
3. **No respawn**: Set `cantRespawn = true` to prevent resurrection
4. **Resurrection**: Call `mob.respawn()` before `readyToBeRemoved()` returns true

## Migration

1. Replace `removeDeadMobs()` with `cleanupReadyMobs()`
2. Replace `canBeRemoved()` with `readyToBeRemoved()`
3. Add flags to Mob class (`cantRespawn`, `readyToRemove`)
4. Update calls to use new function names

