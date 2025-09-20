# Client Code Generation

This document explains how to generate client code for different languages from the AsyncAPI specification.

## Available Commands

```bash
# Generate C# client
npm run client:csharp

# Generate TypeScript client  
npm run client:typescript

# Generate all clients
npm run client:all

# Generate HTML documentation
npm run docs:generate
npm run docs:serve
```

## Generated C# Client

### What Gets Generated

The C# client generation creates:

- **Models**: `Player.cs`, `Mob.cs`, `GameState.cs`
- **Client Interface**: `IAtlasWorldClient.cs`
- **Client Implementation**: `AtlasWorldClient.cs`
- **Message Handlers**: For all WebSocket messages
- **Project File**: `AtlasWorld.Client.csproj`

### Using the Generated C# Client

```csharp
using AtlasWorld.Client;
using System;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        var client = new AtlasWorldClient("ws://localhost:2567");
        
        // Connect to game room
        await client.ConnectToGameRoomAsync();
        
        // Send player input
        await client.SendPlayerInputAsync(new PlayerInput 
        { 
            Vx = 0.5, 
            Vy = -0.3 
        });
        
        // Handle incoming messages
        client.OnStateChange += (state) => {
            Console.WriteLine($"Game tick: {state.Tick}");
            Console.WriteLine($"Players: {state.Players.Count}");
        };
        
        client.OnWelcome += (welcome) => {
            Console.WriteLine($"Welcome: {welcome.Message}");
        };
        
        // Keep connection alive
        Console.WriteLine("Press any key to exit...");
        Console.ReadKey();
        
        await client.DisconnectAsync();
    }
}
```

### C# Client Features

- ✅ **Strongly Typed Models** - All game objects as C# classes
- ✅ **Async/Await Support** - Modern async patterns
- ✅ **Event Handlers** - Easy message handling
- ✅ **WebSocket Management** - Automatic connection handling
- ✅ **JSON Serialization** - System.Text.Json support
- ✅ **Nullable Reference Types** - C# 8+ null safety

### Dependencies

The generated C# client requires:

```xml
<PackageReference Include="System.Net.WebSockets.Client" Version="4.3.2" />
<PackageReference Include="System.Text.Json" Version="7.0.0" />
<PackageReference Include="Microsoft.Extensions.Logging" Version="7.0.0" />
```

## Generated TypeScript Client

### What Gets Generated

- **Models**: `Player.ts`, `Mob.ts`, `GameState.ts`
- **Client Class**: `AtlasWorldClient.ts`
- **Type Definitions**: Full TypeScript support
- **Package.json**: Ready to publish as npm package

### Using the Generated TypeScript Client

```typescript
import { AtlasWorldClient, PlayerInput } from './generated/typescript';

const client = new AtlasWorldClient('ws://localhost:2567');

// Connect to game room
await client.connectToGameRoom();

// Send player input
await client.sendPlayerInput({ vx: 0.5, vy: -0.3 });

// Handle messages
client.onStateChange((state) => {
    console.log(`Game tick: ${state.tick}`);
    console.log(`Players: ${Object.keys(state.players).length}`);
});

client.onWelcome((welcome) => {
    console.log(`Welcome: ${welcome.message}`);
});
```

## Customization

### C# Configuration

Edit `csharp-config.json` to customize:

- **Namespace**: `AtlasWorld.Client`
- **Package Name**: `AtlasWorld.Client`
- **Target Framework**: `net6.0`, `net7.0`, `net8.0`
- **JSON Library**: `System.Text.Json` or `Newtonsoft.Json`

### TypeScript Configuration

Edit `typescript-config.json` to customize:

- **Package Name**: `@atlasworld/client`
- **Target**: `ES2020`, `ES2022`
- **Module System**: `CommonJS`, `ESModules`

## Integration with Colyseus

The generated clients are designed to work with your Colyseus server:

1. **Connect** to `ws://localhost:2567`
2. **Join** the `game_room` room
3. **Send** `player_input` and `player_position` messages
4. **Receive** `welcome` and `state_change` messages

## Next Steps

1. **Generate clients**: `npm run client:all`
2. **Test connection**: Use generated clients to connect
3. **Customize**: Modify config files as needed
4. **Integrate**: Add to your game projects
5. **Publish**: Publish as NuGet/npm packages

## Troubleshooting

### C# Generation Issues

- Ensure .NET 6+ is installed
- Check `csharp-config.json` syntax
- Verify AsyncAPI spec is valid

### TypeScript Generation Issues

- Ensure Node.js 16+ is installed
- Check TypeScript configuration
- Verify all dependencies are installed

### Connection Issues

- Verify Colyseus server is running
- Check WebSocket URL format
- Ensure firewall allows connections
