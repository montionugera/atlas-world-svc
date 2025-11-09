# readyToRemove Flag - Who Updates It?

## Current State
**`readyToRemove` is a MANUAL flag** - no automatic updates currently.

## Design Intent
- Manual flag for game logic to trigger immediate removal
- Flexible: can be set anywhere in code
- Automatic cleanup via `cleanupReadyMobs()` once flag is set

## Who SHOULD Update It?

### Option 1: Manual Setting (Current)
```typescript
// In game logic - set manually when needed
if (specialCondition) {
  mob.readyToRemove = true  // Immediate removal next update
}

// In boss fight:
bossMob.readyToRemove = true  // Remove boss immediately when defeated

// In arena mode:
if (arenaRoundEnd) {
  allMobs.forEach(mob => mob.readyToRemove = true)
}
```

### Option 2: Helper Method (Recommended Addition)
```typescript
// Add to Mob class
markForRemoval(): void {
  this.readyToRemove = true
}

// Usage:
mob.markForRemoval()  // Clearer intent than direct assignment
```

### Option 3: Automatic Triggers (Future)
Could add automatic triggers based on conditions:
- Mob health < 0 for X seconds
- Mob out of bounds
- Special game events

## Proposed: Add Helper Method

Add `markForRemoval()` to Mob class for clearer API:

```typescript
export class Mob extends WorldLife {
  // ... existing code
  
  /**
   * Mark mob for immediate removal (bypasses respawn delay)
   * Called by game logic when special removal is needed
   */
  markForRemoval(): void {
    this.readyToRemove = true
  }
  
  /**
   * Clear removal flag (if mob is respawned)
   */
  clearRemovalFlag(): void {
    this.readyToRemove = false
  }
}
```

## Where It's Currently Set

### In Tests
- All test cases set `mob.readyToRemove = true` for immediate removal testing

### In Production Code
- **None currently** - this is intentional
- Mob removal happens automatically after respawn delay
- Flag is available for special cases

## Potential Automatic Updates (Future Enhancement)

Could add automatic triggers:

```typescript
// In MobLifeCycleManager or Mob update
update(): void {
  // Automatic triggers
  if (mob.isAlive && mob.currentHealth <= 0) {
    mob.die()  // Auto-die if health somehow goes negative
  }
  
  if (!mob.isAlive && /* special condition */) {
    mob.markForRemoval()  // Auto-trigger removal
  }
}
```

## Recommendation

1. **Add helper method** `markForRemoval()` for clearer API
2. **Keep it manual** - gives game logic full control
3. **Document** that it's a trigger, not automatically set
4. **Future**: Add optional automatic triggers if needed

