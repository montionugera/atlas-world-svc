# Death & Respawn State System - Implementation Plan

## Status Overview

### ✅ Completed
- [x] Added `diedAt: number` field to WorldLife
- [x] Updated `die()` to set `diedAt = Date.now()`
- [x] Updated `respawn()` to clear `diedAt = 0`
- [x] Added `canBeRemoved(respawnDelayMs)` helper method

### ⏳ Remaining Tasks

#### 1. Configuration
**File**: `src/config/mobSpawnConfig.ts`

Add `respawnDelayMs` to MobSpawnSettings:
```typescript
export interface MobSpawnSettings {
  // ... existing fields
  respawnDelayMs?: number // Delay before removing dead mobs (default: 15000ms)
}

const DEFAULT_SETTINGS: MobSpawnSettings = {
  // ... existing
  respawnDelayMs: 15000, // 15 seconds
}
```

#### 2. Lifecycle Manager Update
**File**: `src/modules/MobLifeCycleManager.ts`

Update `removeDeadMobs()`:
```typescript
private removeDeadMobs(): void {
  const respawnDelay = this.settings.respawnDelayMs ?? 15000
  const deadMobIds: string[] = []
  
  for (const [id, mob] of this.state.mobs.entries()) {
    // Only remove if dead AND past respawn delay
    if (!mob.isAlive && mob.canBeRemoved(respawnDelay)) {
      deadMobIds.push(id)
    }
  }
  
  // ... rest of removal logic
}
```

#### 3. Counting Logic (Already Correct)
The `getAliveMobCount()` already filters by `isAlive`, so dead mobs won't count. ✅

#### 4. Spawn Logic (Already Correct)
Spawn logic uses `getAliveMobCount()`, so it will spawn even if dead mobs exist. ✅

## Data Flow

```
┌─────────┐
│  ALIVE  │
└────┬────┘
     │ mob.die()
     ▼
┌─────────┐
│  DEAD   │ diedAt = Date.now()
│         │ isAlive = false
└────┬────┘
     │ [respawnDelayMs elapsed]
     │ mob.canBeRemoved() = true
     ▼
┌──────────────────┐
│ PERMANENTLY      │
│ REMOVED          │
│ - AI unregister  │
│ - Delete from    │
│   gameState.mobs │
│ - Emit event     │
└──────────────────┘
     │
     ▼
┌─────────┐
│ RESPAWN │ (if below desired count)
│ NEW MOB │
└─────────┘
```

## State Transitions

### Normal Death Flow
1. `mob.die()` → `isAlive = false`, `diedAt = Date.now()`
2. Mob stays in game (dead state)
3. AI/physics skip dead mobs (already implemented)
4. After `respawnDelayMs`:
   - `canBeRemoved()` returns true
   - `removeDeadMobs()` removes from game
   - New mob spawns if below desired count

### Resurrection Flow (Future)
1. Mob is dead (`isAlive = false`, `diedAt > 0`)
2. Before delay expires:
   - `mob.respawn()` → `isAlive = true`, `diedAt = 0`
   - Mob returns to normal gameplay
3. If delay expires before resurrection:
   - Mob is permanently removed

## Edge Cases Handled

1. **Multiple deaths**: Each `die()` call updates `diedAt`, resetting timer
2. **Resurrection timing**: Can resurrect any time before `canBeRemoved()` returns true
3. **Spawn count**: Dead mobs don't count, so spawn happens correctly
4. **Physics/AI**: Dead mobs already skipped (existing code)

## Testing Checklist

- [ ] Dead mobs persist in game for respawn delay period
- [ ] Dead mobs removed after delay expires
- [ ] Dead mobs don't prevent new spawns
- [ ] Resurrection works during delay period
- [ ] Multiple deaths reset timer
- [ ] Per-map respawn delay override works

## Configuration Examples

```typescript
// Quick respawn (5 seconds)
'fast-respawn-map': {
  respawnDelayMs: 5000,
}

// Long respawn (30 seconds - for boss fights)
'boss-arena': {
  respawnDelayMs: 30000,
}

// Instant removal (0 delay - current behavior)
'arena-mode': {
  respawnDelayMs: 0,
}
```

