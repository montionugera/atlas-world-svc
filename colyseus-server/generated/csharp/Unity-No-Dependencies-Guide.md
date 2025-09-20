# 🎮 Unity Client - NO EXTERNAL DEPENDENCIES

## ✅ **Problem Solved!**

**Issue:** Both `System.Text.Json` and `Newtonsoft.Json` were failing in Unity.

**Solution:** Use Unity's built-in `JsonUtility` - no external packages needed!

## 🚀 **Quick Installation**

### **Step 1: Copy Files to Unity**
```bash
# Copy these files to your Unity project
cp AtlasWorldUnityClient.cs /path/to/your/unity/project/Assets/Scripts/
cp SimpleUnityExample.cs /path/to/your/unity/project/Assets/Scripts/
```

### **Step 2: No Package Installation Needed!**
- ❌ No Newtonsoft.Json
- ❌ No System.Text.Json  
- ❌ No external dependencies
- ✅ Uses Unity's built-in JsonUtility

## 🎮 **How to Use**

### **Method 1: Simple Example (Recommended)**
1. **Add `SimpleUnityExample.cs`** to any GameObject
2. **Configure server URL** in Inspector
3. **Press Play** - it will automatically connect!

### **Method 2: Manual Setup**
1. **Create empty GameObject**
2. **Add `AtlasWorldUnityClient` component**
3. **Set up event handlers** in your script

## 📋 **What Changed**

### **Before (Failed)**
```csharp
// ❌ External dependencies
using System.Text.Json;
using Newtonsoft.Json;

// ❌ Complex serialization
JsonSerializer.Serialize(message)
JsonConvert.SerializeObject(message)
```

### **After (Works)**
```csharp
// ✅ Unity built-in only
// No external using statements

// ✅ Simple serialization
JsonUtility.ToJson(message)
JsonUtility.FromJson<Type>(message)
```

## 🔧 **Key Features**

### **Unity JsonUtility Compatible**
- ✅ `[System.Serializable]` classes
- ✅ Public fields (not properties)
- ✅ Simple data types (float, string, int)
- ✅ Arrays instead of Lists/Dictionaries

### **Message Structure**
```csharp
[System.Serializable]
public class PlayerInput
{
    public float vx;  // Note: lowercase, public field
    public float vy;  // Note: lowercase, public field
}
```

### **Usage Example**
```csharp
// Send player input
var input = new PlayerInput { vx = 0.5f, vy = -0.3f };
client.SendPlayerInputAsync(input);

// Handle state updates
client.OnStateChange += (state) => {
    Debug.Log($"Tick: {state.tick}");
    foreach (var player in state.players) {
        Debug.Log($"Player {player.name} at ({player.x}, {player.y})");
    }
};
```

## 🎯 **Complete Working Example**

```csharp
using UnityEngine;
using AtlasWorld.Client;

public class MyGameController : MonoBehaviour
{
    public AtlasWorldUnityClient client;
    
    void Start()
    {
        // Set up events
        client.OnConnected += () => Debug.Log("Connected!");
        client.OnStateChange += (state) => Debug.Log($"Tick: {state.tick}");
        
        // Connect
        client.ConnectAsync();
    }
    
    void Update()
    {
        // Send movement
        float vx = Input.GetAxis("Horizontal");
        float vy = Input.GetAxis("Vertical");
        
        if (vx != 0 || vy != 0)
        {
            client.SendPlayerInputAsync(new PlayerInput { vx = vx, vy = vy });
        }
    }
}
```

## ✅ **Verification**

After copying the files, you should see:
- ✅ No red errors in Console
- ✅ Successful compilation
- ✅ `AtlasWorldUnityClient` component available
- ✅ `SimpleUnityExample` script available

## 🚀 **Next Steps**

1. **Test Connection** - Add `SimpleUnityExample` to a GameObject
2. **Start Server** - Run your Colyseus server
3. **Press Play** - Should connect automatically
4. **Use WASD/Arrows** - Send movement input
5. **Check Console** - See connection messages

## 📁 **File Structure**
```
YourUnityProject/
├── Assets/
│   └── Scripts/
│       ├── AtlasWorldUnityClient.cs    # Main client
│       └── SimpleUnityExample.cs       # Ready-to-use example
```

## 🎉 **Success!**

**No external dependencies, no package installation, just copy and play!**

Your Unity project should now work perfectly with the Atlas World server! 🚀
