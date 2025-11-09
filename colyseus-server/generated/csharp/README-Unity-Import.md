# Unity Import Guide - Atlas World Models

This guide explains how to import and use the Atlas World C# models in your Unity project.

## Quick Start

1. **Copy Models to Unity Project**
   ```bash
   # Copy the models file to your Unity project
   cp AtlasWorldModels.cs /path/to/your/unity/project/Assets/Scripts/AtlasWorld/
   ```

2. **Install Colyseus Unity SDK**
   - Download from: https://github.com/colyseus/colyseus-unity3d
   - Or via Unity Package Manager (if available)
   - Required version: 0.16.4 (matches server version)

3. **Import Models**
   - The models are already compatible with Colyseus Unity SDK
   - No additional setup needed

## Model Structure

The models match exactly what the React client receives from the server:

### WorldObject (Base Class)
- `id`, `x`, `y`, `vx`, `vy` - Position and velocity
- `tags` - Entity tags array
- `physicsBodyId`, `angle`, `angularVelocity`, `isStatic` - Physics properties

### WorldLife (Extends WorldObject)
- `radius` - Entity size
- `maxHealth`, `currentHealth`, `isAlive` - Health system
- `attackDamage`, `attackRange`, `attackDelay`, `lastAttackTime` - Combat
- `defense`, `armor`, `density` - Defense stats
- `isAttacking`, `isMoving`, `lastAttackedTarget` - Combat state
- `heading` - Direction in radians

### Player (Extends WorldLife)
- `sessionId` - Player session identifier
- `name` - Player display name
- `maxLinearSpeed` - Movement speed cap

### Mob (Extends WorldLife)
- `tag` - Current behavior tag (idle, attack, chase, etc.)
- `currentBehavior` - AI behavior state
- `behaviorLockedUntil` - Behavior lock timestamp
- `isWindingUp` - Attack wind-up animation state
- `maxMoveSpeed` - Mob movement speed cap

### Projectile (Extends WorldObject)
- `radius` - Projectile size
- `ownerId` - ID of entity that created it
- `isStuck` - Whether projectile has hit and stuck

### GameState
- `players` - MapSchema<Player> of all players
- `mobs` - MapSchema<Mob> of all mobs
- `projectiles` - MapSchema<Projectile> of all projectiles
- `tick` - Game tick counter
- `mapId` - Current map identifier
- `roomId` - Room identifier
- `width`, `height` - World dimensions

## Usage Example

```csharp
using Colyseus;
using AtlasWorld.Models;

public class GameManager : MonoBehaviour
{
    private ColyseusRoom<GameState> room;

    async void Start()
    {
        // Connect to server
        var client = new ColyseusClient("ws://localhost:2567");
        room = await client.JoinOrCreate<GameState>("game_room", new RoomOptions
        {
            mapId = "map-01-sector-a",
            name = "UnityPlayer"
        });

        // Listen to state changes
        room.OnStateChange += OnStateChange;
    }

    void OnStateChange(GameState state, bool isFirstState)
    {
        // Access players
        foreach (var player in state.players.Values)
        {
            Debug.Log($"Player: {player.name} at ({player.x}, {player.y})");
        }

        // Access mobs
        foreach (var mob in state.mobs.Values)
        {
            Debug.Log($"Mob: {mob.id} behavior: {mob.currentBehavior}");
        }

        // Access projectiles
        if (state.projectiles != null)
        {
            foreach (var projectile in state.projectiles.Values)
            {
                Debug.Log($"Projectile: {projectile.id} stuck: {projectile.isStuck}");
            }
        }
    }

    void Update()
    {
        if (room != null)
        {
            // Send player input
            room.Send("player_input_move", new PlayerInput
            {
                vx = Input.GetAxis("Horizontal"),
                vy = Input.GetAxis("Vertical")
            });
        }
    }
}
```

## Field Alignment

The C# models include **only** fields marked with `@type()` in the server schemas. This ensures:

- ✅ Exact match with what React client receives
- ✅ No server-only fields exposed
- ✅ Proper inheritance hierarchy
- ✅ Type safety with Colyseus Unity SDK

## Verification

To verify models are in sync:

1. Check server schema files for `@type()` decorators
2. Compare with C# model fields
3. Ensure Type indices match (important for Colyseus serialization)

## Troubleshooting

### Models don't match server data
- Regenerate models if server schemas change
- Check Type indices are correct
- Verify Colyseus SDK version matches server (0.16.4)

### Compilation errors
- Ensure Colyseus Unity SDK is installed
- Check namespace matches: `AtlasWorld.Models`
- Verify all base classes are included

### Missing fields
- Check server schema has `@type()` decorator
- Verify field is in inheritance chain
- Ensure Type index doesn't conflict

