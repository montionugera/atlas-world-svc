# Death & Respawn State System

## Goal
Separate "dead but respawnable" from "removed from game" states to enable resurrection mechanics and delayed cleanup.

## Current Problem
- When mobs die → immediately removed next tick
- No time for resurrection effects
- No distinction between "dead" and "permanently removed"

## Requirements
1. **Death State**: Mob dies → enters "dead" state (still in game)
2. **Respawn Delay**: Configurable delay (e.g., 15 seconds) before permanent removal
3. **Resurrection Support**: Can revive mobs during delay period
4. **Clean Removal**: After delay, mobs are removed from game entirely

## Design Overview

### State Machine
```
ALIVE → die() → DEAD (diedAt timestamp set)
                     ↓
              [respawn delay elapsed]
                     ↓
            PERMANENTLY_REMOVED
```

### Components

#### 1. WorldLife.diedAt
- **Type**: `number` (timestamp in ms)
- **Default**: `0` (alive)
- **Set on**: `die()` → `Date.now()`
- **Reset on**: `respawn()` → `0`

#### 2. MobSpawnConfig.respawnDelayMs
- **Type**: `number` (milliseconds)
- **Default**: `15000` (15 seconds)
- **Per-map**: Can override per map

#### 3. WorldLife.canBeRemoved(respawnDelayMs)
- **Method**: Check if dead long enough
- **Logic**: `diedAt > 0 && (now - diedAt) >= respawnDelayMs`

#### 4. MobLifeCycleManager.removeDeadMobs()
- **Updated logic**:
  - Only remove mobs where `canBeRemoved()` returns true
  - Dead but not expired → keep in game (for resurrection)

### Flow

1. **Mob dies**:
   ```typescript
   mob.die() → isAlive = false, diedAt = Date.now()
   ```

2. **Each tick**:
   ```typescript
   - Skip dead mobs in AI updates (already done)
   - Skip dead mobs in physics (already done)
   - Check if dead mobs can be removed (new)
   ```

3. **After respawn delay**:
   ```typescript
   - Unregister from AI
   - Remove from game state
   - Emit MOB_REMOVED event
   - Trigger respawn if below desired count
   ```

4. **Resurrection** (future feature):
   ```typescript
   mob.respawn() → isAlive = true, diedAt = 0
   // Mob can continue as normal
   ```

## Implementation Plan

### Phase 1: Core Death State
- [x] Add `diedAt` to WorldLife
- [ ] Add `canBeRemoved()` helper method
- [ ] Update `die()` to set timestamp
- [ ] Update `respawn()` to clear timestamp

### Phase 2: Config & Delay
- [ ] Add `respawnDelayMs` to MobSpawnConfig
- [ ] Set default (15000ms = 15s)
- [ ] Allow per-map override

### Phase 3: Lifecycle Manager
- [ ] Update `removeDeadMobs()` to check delay
- [ ] Only remove mobs past respawn delay
- [ ] Keep dead mobs in game until delay expires

### Phase 4: Counting & Spawning
- [ ] Ensure `getAliveMobCount()` only counts alive
- [ ] Dead mobs don't prevent respawning
- [ ] New mobs spawn when below desired count (even with dead mobs present)

### Phase 5: Testing
- [ ] Test dead mobs persist for delay period
- [ ] Test removal after delay expires
- [ ] Test resurrection during delay
- [ ] Test spawn logic with dead mobs present

## Edge Cases

1. **Mob dies multiple times**: `diedAt` overwritten each time (delay restarts)
2. **Resurrection during delay**: `respawn()` clears `diedAt`, mob becomes alive
3. **Spawn count**: Dead mobs don't count toward desired count
4. **Physics**: Dead mobs still stopped (already handled)

## Configuration Example

```typescript
// mobSpawnConfig.ts
{
  desiredCount: 3,
  respawnDelayMs: 15000, // 15 seconds
  // ... other settings
}
```

## Benefits

1. **Resurrection ready**: Can revive mobs during delay window
2. **Visual feedback**: Dead mobs visible for delay period (corpses)
3. **Flexible**: Per-map respawn delays
4. **Clean separation**: Death vs permanent removal are distinct

