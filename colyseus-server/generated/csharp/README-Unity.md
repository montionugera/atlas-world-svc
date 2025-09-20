# 🎮 Atlas World Unity Client

C# client library for connecting to the Atlas World multiplayer game server from Unity.

## 🚀 Quick Start

### **Step 1: Import to Unity**

1. **Copy files to your Unity project:**
```bash
# Copy the client files to your Unity project
cp -r /path/to/atlas-world-svc/colyseus-server/generated/csharp/* /path/to/your/unity/project/Assets/Scripts/AtlasWorld/
```

2. **Unity Project Structure:**
```
YourUnityProject/
├── Assets/
│   ├── Scripts/
│   │   └── AtlasWorld/
│   │       ├── AtlasWorldClient.cs          # Standard client
│   │       ├── AtlasWorldUnityClient.cs     # Unity-optimized client
│   │       ├── AtlasWorldExample.cs         # Usage example
│   │       └── README-Unity.md             # This file
│   └── Plugins/
│       └── System.Net.WebSockets.dll       # If needed for older Unity
```

### **Step 2: Add to Scene**

1. **Create an empty GameObject** in your scene
2. **Add the `AtlasWorldUnityClient` component** to it
3. **Configure the settings:**
   - **Server URL:** `ws://localhost:2567`
   - **Map ID:** `map-01-sector-a`
   - **Reconnect Delay:** `5` seconds
   - **Max Reconnect Attempts:** `5`

### **Step 3: Set up Event Handlers**

```csharp
using AtlasWorld.Client;
using UnityEngine;

public class MyGameController : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    
    void Start()
    {
        // Set up event handlers
        client.OnConnected += () => Debug.Log("Connected!");
        client.OnWelcome += (welcome) => Debug.Log($"Welcome: {welcome.Message}");
        client.OnStateChange += (state) => Debug.Log($"Tick: {state.Tick}");
        client.OnError += (error) => Debug.LogError($"Error: {error}");
    }
}
```

## 📋 Unity-Specific Features

### **AtlasWorldUnityClient** (Recommended for Unity)

- ✅ **MonoBehaviour** - Easy to add to GameObjects
- ✅ **Unity Lifecycle** - Handles Start, OnDestroy, OnApplicationPause
- ✅ **Automatic Reconnection** - Reconnects on connection loss
- ✅ **Debug Logging** - Uses Unity's Debug.Log system
- ✅ **Inspector Settings** - Configure in Unity Inspector
- ✅ **Coroutine-Friendly** - Works with Unity's coroutine system

### **AtlasWorldClient** (Standard C#)

- ✅ **Pure C#** - No Unity dependencies
- ✅ **Async/Await** - Modern async patterns
- ✅ **Cross-Platform** - Works outside Unity
- ✅ **Lightweight** - Minimal overhead

## 🎮 Usage Examples

### **Basic Movement**

```csharp
public class PlayerController : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    
    void Update()
    {
        // Get input
        float vx = Input.GetAxis("Horizontal");
        float vy = Input.GetAxis("Vertical");
        
        // Send to server
        if (vx != 0 || vy != 0)
        {
            client.SendPlayerInputAsync(new PlayerInput { Vx = vx, Vy = vy });
        }
    }
}
```

### **Position Updates**

```csharp
public class PlayerPosition : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    
    void Update()
    {
        // Send position to server
        var position = new PlayerPosition 
        { 
            X = transform.position.x, 
            Y = transform.position.y 
        };
        
        client.SendPlayerPositionAsync(position);
    }
}
```

### **Game State Updates**

```csharp
public class GameStateManager : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    public GameObject playerPrefab;
    
    void Start()
    {
        client.OnStateChange += UpdateGameState;
    }
    
    void UpdateGameState(StateChangeMessage state)
    {
        // Update all players
        foreach (var player in state.Players.Values)
        {
            // Find or create player GameObject
            var playerObj = FindPlayerObject(player.Id);
            if (playerObj == null)
            {
                playerObj = Instantiate(playerPrefab);
                playerObj.name = $"Player_{player.Id}";
            }
            
            // Update position
            playerObj.transform.position = new Vector3((float)player.X, (float)player.Y, 0);
        }
        
        // Update mobs
        foreach (var mob in state.Mobs)
        {
            // Update mob positions
            Debug.Log($"Mob {mob.Id} at ({mob.X}, {mob.Y})");
        }
    }
    
    GameObject FindPlayerObject(string playerId)
    {
        return GameObject.Find($"Player_{playerId}");
    }
}
```

## ⚙️ Configuration

### **Inspector Settings**

- **Server URL:** WebSocket server address
- **Map ID:** Game map identifier
- **Reconnect Delay:** Seconds between reconnection attempts
- **Max Reconnect Attempts:** Maximum reconnection attempts

### **Runtime Configuration**

```csharp
public class GameManager : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    
    void Start()
    {
        // Configure at runtime
        client.serverUrl = "ws://your-server.com:2567";
        client.mapId = "map-02-sector-b";
        client.reconnectDelay = 3f;
        client.maxReconnectAttempts = 10;
    }
}
```

## 🔧 Troubleshooting

### **Common Issues**

1. **"WebSocket is not connected"**
   - Check server URL
   - Ensure server is running
   - Check firewall settings

2. **"Connection failed"**
   - Verify server is accessible
   - Check network connectivity
   - Try different server URL

3. **"Error processing message"**
   - Check message format
   - Verify JSON serialization
   - Check server logs

### **Debug Tips**

```csharp
// Enable debug logging
client.OnConnected += () => Debug.Log("✅ Connected");
client.OnDisconnected += () => Debug.Log("❌ Disconnected");
client.OnError += (error) => Debug.LogError($"❌ Error: {error}");

// Check connection status
if (client._isConnected)
{
    Debug.Log("Client is connected");
}
```

## 📦 Dependencies

### **Required Packages**

- **Unity 2021.3+** (for WebSocket support)
- **System.Net.WebSockets** (built-in)
- **System.Text.Json** (built-in)

### **Optional Packages**

- **Newtonsoft.Json** (if you prefer it over System.Text.Json)
- **Unity WebSocket** (alternative WebSocket implementation)

## 🚀 Advanced Usage

### **Custom Message Handling**

```csharp
public class CustomMessageHandler : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    
    void Start()
    {
        client.OnStateChange += HandleCustomState;
    }
    
    void HandleCustomState(StateChangeMessage state)
    {
        // Custom game logic
        UpdateUI(state);
        UpdatePhysics(state);
        UpdateAudio(state);
    }
}
```

### **Multiple Clients**

```csharp
public class MultiClientManager : MonoBehaviour
{
    public AtlasWorldUnityClient[] clients;
    
    void Start()
    {
        foreach (var client in clients)
        {
            client.OnConnected += () => Debug.Log($"Client {client.name} connected");
        }
    }
}
```

## 📚 More Information

- **AsyncAPI Spec:** `asyncapi.yaml`
- **Server Code:** `./src/`
- **C# Client:** `./generated/csharp/`
- **Unity Example:** `AtlasWorldExample.cs`

## 🆘 Support

- **GitHub Issues:** [atlasworld/client-csharp](https://github.com/atlasworld/client-csharp)
- **Email:** team@atlasworld.com
- **Discord:** [Atlas World Community](https://discord.gg/atlasworld)

---

**Happy Gaming! 🎮**
