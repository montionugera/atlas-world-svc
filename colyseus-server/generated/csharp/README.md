# Atlas World C# Client

C# client library for connecting to the Atlas World multiplayer game server.

## Features

- ✅ **WebSocket Connection** - Real-time communication with game server
- ✅ **Event-Driven** - Easy message handling with events
- ✅ **Async/Await** - Modern async programming patterns
- ✅ **Strongly Typed** - Full IntelliSense support
- ✅ **JSON Serialization** - Built-in System.Text.Json support
- ✅ **Nullable Reference Types** - C# 8+ null safety

## Installation

### NuGet Package
```bash
dotnet add package AtlasWorld.Client
```

### Manual Installation
1. Copy `AtlasWorldClient.cs` to your project
2. Add required NuGet packages:
```bash
dotnet add package System.Net.WebSockets.Client
dotnet add package System.Text.Json
```

## Quick Start

```csharp
using AtlasWorld.Client;

var client = new AtlasWorldClient("ws://localhost:2567");

// Set up event handlers
client.OnConnected += () => Console.WriteLine("Connected!");
client.OnWelcome += (welcome) => Console.WriteLine($"Welcome: {welcome.Message}");
client.OnStateChange += (state) => Console.WriteLine($"Tick: {state.Tick}");

// Connect and join game
await client.ConnectAsync();
await client.JoinGameRoomAsync();

// Send player input
await client.SendPlayerInputAsync(new PlayerInput { Vx = 0.5, Vy = -0.3 });

// Clean up
await client.DisconnectAsync();
client.Dispose();
```

## API Reference

### AtlasWorldClient

#### Constructor
```csharp
AtlasWorldClient(string serverUrl = "ws://localhost:2567")
```

#### Methods
```csharp
// Connection
Task ConnectAsync()
Task DisconnectAsync()

// Game Room
Task JoinGameRoomAsync(string mapId = "map-01-sector-a")

// Player Actions
Task SendPlayerInputAsync(PlayerInput input)
Task SendPlayerPositionAsync(PlayerPosition position)
```

#### Events
```csharp
event Action? OnConnected
event Action? OnDisconnected
event Action<string>? OnError
event Action<WelcomeMessage>? OnWelcome
event Action<StateChangeMessage>? OnStateChange
```

### Message Models

#### PlayerInput
```csharp
public class PlayerInput
{
    public double Vx { get; set; }  // Velocity X (-1 to 1)
    public double Vy { get; set; }  // Velocity Y (-1 to 1)
}
```

#### PlayerPosition
```csharp
public class PlayerPosition
{
    public double X { get; set; }   // X coordinate
    public double Y { get; set; }   // Y coordinate
}
```

#### WelcomeMessage
```csharp
public class WelcomeMessage
{
    public string Message { get; set; }   // Welcome message
    public string PlayerId { get; set; }  // Your session ID
    public string MapId { get; set; }     // Current map
}
```

#### StateChangeMessage
```csharp
public class StateChangeMessage
{
    public Dictionary<string, Player> Players { get; set; }  // All players
    public List<Mob> Mobs { get; set; }                     // All mobs
    public int Tick { get; set; }                           // Game tick
    public string MapId { get; set; }                       // Current map
}
```

## Example Usage

See `Example.cs` for a complete working example.

## Requirements

- .NET 6.0 or later
- System.Net.WebSockets.Client
- System.Text.Json

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: [atlasworld/client-csharp](https://github.com/atlasworld/client-csharp)
- Email: team@atlasworld.com
