# Mob State System Design

## Current State Tracking

### Existing Fields
- `isAlive: boolean` - Synced to client
- `currentBehavior: string` - AI behavior ('idle', 'attack', 'chase', 'wander', 'avoidBoundary')
- `tag: string` - Synced to client for UI/debugging
- `diedAt: number` - Server-only timestamp

### Problem
- `isAlive` is boolean → only 2 states
- No explicit "dead but respawning" state
- Client can't distinguish: alive vs dead vs respawning
- Behavior state mixed with lifecycle state

## Proposed State System

### Option 1: Explicit State Enum (Recommended)

```typescript
// Mob lifecycle state (separate from behavior)
enum MobLifecycleState {
  ALIVE = 'alive',
  DEAD = 'dead',           // Dead, waiting for respawn delay
  RESPAWNING = 'respawning', // Respawning animation/state
  REMOVED = 'removed'      // Permanently removed (not in game)
}

// Mob behavior (when alive)
enum MobBehavior {
  IDLE = 'idle',
  WANDER = 'wander',
  CHASE = 'chase',
  ATTACK = 'attack',
  AVOID_BOUNDARY = 'avoidBoundary'
}
```

### Option 2: Combined State String (Simpler)

```typescript
enum MobState {
  // Lifecycle states
  ALIVE = 'alive',
  DEAD = 'dead',
  RESPAWNING = 'respawning',
  
  // Behavior states (only when alive)
  ALIVE_IDLE = 'alive:idle',
  ALIVE_WANDER = 'alive:wander',
  ALIVE_CHASE = 'alive:chase',
  ALIVE_ATTACK = 'alive:attack',
  ALIVE_AVOID_BOUNDARY = 'alive:avoidBoundary'
}
```

### Option 3: Separate Lifecycle + Behavior (Hybrid)

Keep `currentBehavior` for AI, add `lifecycleState` for lifecycle:

```typescript
@type('string') lifecycleState: MobLifecycleState = 'alive'
@type('string') currentBehavior: MobBehavior = 'idle'  // Only relevant when alive
```

## Recommended: Option 3 (Hybrid)

### Why?
- **Clear separation**: Lifecycle vs behavior
- **Client visibility**: `lifecycleState` synced to client for rendering
- **Backward compatible**: `currentBehavior` stays for AI logic
- **Simple**: Minimal changes to existing code

## Implementation

### Mob Class Changes

```typescript
export enum MobLifecycleState {
  ALIVE = 'alive',
  DEAD = 'dead',
  RESPAWNING = 'respawning',
}

export class Mob extends WorldLife {
  @type('string') lifecycleState: MobLifecycleState = MobLifecycleState.ALIVE
  @type('string') currentBehavior: string = 'idle'  // Existing field
  @type('string') tag: string = 'idle'  // Deprecated? Or keep for backward compat
  
  // Server-only
  diedAt: number = 0
  
  // Helper methods
  isDead(): boolean {
    return this.lifecycleState === MobLifecycleState.DEAD
  }
  
  isRespawning(): boolean {
    return this.lifecycleState === MobLifecycleState.RESPAWNING
  }
}
```

### State Transitions

```
ALIVE → die() → DEAD (diedAt set)
               ↓
        [respawn delay elapsed]
               ↓
        RESPAWNING (optional animation state)
               ↓
        REMOVED (deleted from game)
               OR
        respawn() → ALIVE (diedAt cleared)
```

### Updated die() Method

```typescript
die(): void {
  this.isAlive = false  // Keep for backward compat
  this.lifecycleState = MobLifecycleState.DEAD
  this.currentHealth = 0
  this.currentBehavior = 'idle'  // Clear behavior when dead
  this.diedAt = Date.now()
  // ... rest of cleanup
}
```

### Updated respawn() Method

```typescript
respawn(x?: number, y?: number): void {
  this.lifecycleState = MobLifecycleState.ALIVE
  this.isAlive = true  // Keep for backward compat
  this.currentHealth = this.maxHealth
  this.currentBehavior = 'idle'  // Start fresh
  this.diedAt = 0
  // ... rest of respawn
}
```

### Client Rendering

```typescript
// Client can check lifecycleState to render:
switch (mob.lifecycleState) {
  case 'alive':
    renderMob(mob, mob.currentBehavior)  // Normal rendering
    break
  case 'dead':
    renderCorpse(mob)  // Dead body, grayed out
    break
  case 'respawning':
    renderRespawnAnimation(mob)  // Respawn effect
    break
}
```

## Integration Points

### 1. MobLifeCycleManager
- Check `lifecycleState === 'dead'` instead of `!isAlive`
- Use `canBeRemoved()` to check delay
- Transition to removed state

### 2. MobAIModule
- Skip mobs where `lifecycleState !== 'alive'`
- Only process alive mobs

### 3. Physics Manager
- Stop mobs where `lifecycleState === 'dead'`
- Only process alive mobs

### 4. GameState.updateMobs()
- Skip mobs where `lifecycleState !== 'alive'`
- Only update alive mobs

## Backward Compatibility

Keep `isAlive` for:
- Existing code that checks `isAlive`
- Type compatibility
- Gradual migration

Derive from `lifecycleState`:
```typescript
get isAlive(): boolean {
  return this.lifecycleState === MobLifecycleState.ALIVE
}
```

Or keep both and sync:
- When `lifecycleState` changes → update `isAlive`
- When `isAlive` set → update `lifecycleState`

## Configuration Example

```typescript
// mobSpawnConfig.ts
{
  respawnDelayMs: 15000,
  enableRespawnAnimation: true,  // Future: respawn state
}
```

## Benefits

1. **Clear state**: Explicit lifecycle vs behavior separation
2. **Client visibility**: Can render corpses, respawn effects
3. **Extensible**: Easy to add more states (stunned, frozen, etc.)
4. **Debugging**: State clearly visible in logs/debugger
5. **Type safety**: Enum prevents invalid state strings

## Migration Path

1. Add `lifecycleState` field (defaults to ALIVE)
2. Update `die()` to set DEAD state
3. Update `respawn()` to set ALIVE state
4. Keep `isAlive` synced with `lifecycleState`
5. Gradually migrate checks from `isAlive` to `lifecycleState`

