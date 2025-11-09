# Spear-Throwing Mob System - Validated Plan

## Key Corrections from Initial Plan

### 1. **Projectile Piercing Behavior** ✅
- Projectiles pierce through targets (don't stop on player hit)
- Only apply damage once per target (hasHit flag)
- Continue flying after hit until hitting boundary/wall
- Only stop when hitting boundary/floor

### 2. **Physics Sensor Mode** ✅
- Use `sensor: true` for projectile fixture (no physics bounce/collision response)
- Detect collisions but don't affect physics bodies
- Manual velocity control via ProjectileManager

### 3. **Wind-up State Management** ✅
- Add `isWindingUp: boolean` synced field to Mob
- Add `windUpStartTime: number` server-only field
- 500ms delay between wind-up start and projectile release

### 4. **Deflection Enhancement** ✅
- Add `deflectedBy: string` to prevent re-deflection
- Boost deflected speed by 20%: `vx *= -1.2`, `vy *= -1.2`
- Check attack cone (±45° of heading)
- Reset `hasHit = false` when deflected

### 5. **Projectile Schema Fields** ✅
- Synced: `id, x, y, vx, vy, radius, ownerId, isStuck`
- Server-only: `damage, maxRange, distanceTraveled, hasHit, stuckAt, lifetime, deflectedBy, createdAt`

## Implementation Plan

[Full implementation details remain the same as original plan, with corrections applied to:]
- Phase 1.1: Projectile Schema (split synced/server-only fields)
- Phase 1.3: Physics Integration (add sensor mode)
- Phase 2.3: Collision Handling (piercing behavior)
- Phase 3.3 & 3.4: Wind-up state management
- Phase 5.1: Deflection logic (deflectedBy, speed boost)

## Validated Design Decisions

1. **Sensor-based collision**: No physics bounce, manual velocity control
2. **Piercing mechanic**: Hit-scan first target, continue flying
3. **Sticking behavior**: Only on boundary/wall, not on player
4. **Wind-up feedback**: 500ms synced state for client animation
5. **Deflection one-time**: `deflectedBy` prevents chain deflections

## Risk Mitigation

- **Performance**: Projectile count limited by mob spawn rate
- **Sync overhead**: Only 7 synced fields per projectile
- **Physics complexity**: Sensor mode simplifies collision handling
- **State management**: Clear separation of wind-up vs attacking states

