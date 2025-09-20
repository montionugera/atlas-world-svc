# 🎮 Unity Installation Guide - Fixed Version

## ✅ **Fixed Compilation Errors**

The original client had these issues:
- ❌ `System.Text.Json` not available in Unity
- ❌ Namespace resolution errors
- ❌ Missing dependencies

## 🚀 **Quick Fix**

### **Step 1: Install Newtonsoft.Json**

1. **Open Unity Package Manager** (Window → Package Manager)
2. **Switch to "Unity Registry"**
3. **Search for "Newtonsoft Json"**
4. **Install "Newtonsoft Json for Unity"** (version 3.0.2 or later)

### **Step 2: Copy Fixed Files**

Replace your existing files with these **fixed versions**:

```bash
# Copy the fixed files to your Unity project
cp -r /path/to/atlas-world-svc/colyseus-server/generated/csharp/* /path/to/your/unity/project/Assets/Scripts/AtlasWorld/
```

### **Step 3: Verify Installation**

1. **Check Console** - No more red errors
2. **Test Compilation** - Build should succeed
3. **Add to Scene** - Drag `AtlasWorldUnityClient` to a GameObject

## 🔧 **What Was Fixed**

### **1. JSON Serialization**
```csharp
// ❌ Before (System.Text.Json - not available in Unity)
using System.Text.Json;
JsonSerializer.Serialize(message)

// ✅ After (Newtonsoft.Json - Unity compatible)
using Newtonsoft.Json;
JsonConvert.SerializeObject(message)
```

### **2. Message Parsing**
```csharp
// ❌ Before (System.Text.Json)
using var doc = JsonDocument.Parse(message);
var root = doc.RootElement;
if (root.TryGetProperty("type", out var typeElement))

// ✅ After (Newtonsoft.Json)
var messageObj = JsonConvert.DeserializeObject<dynamic>(message);
string messageType = messageObj.type;
```

### **3. Dependencies**
- ✅ **Newtonsoft.Json** - Added to package.json
- ✅ **Unity 2021.3+** - Specified minimum version
- ✅ **WebSocket Support** - Built into Unity 2021.3+

## 🎮 **Usage in Unity**

### **1. Add to Scene**
1. Create empty GameObject
2. Add `AtlasWorldUnityClient` component
3. Configure server URL: `ws://localhost:2567`

### **2. Basic Script**
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
        client.OnStateChange += (state) => Debug.Log($"Tick: {state.Tick}");
    }
    
    void Update()
    {
        // Send movement input
        float vx = Input.GetAxis("Horizontal");
        float vy = Input.GetAxis("Vertical");
        
        if (vx != 0 || vy != 0)
        {
            client.SendPlayerInputAsync(new PlayerInput { Vx = vx, Vy = vy });
        }
    }
}
```

## 📦 **Package Dependencies**

### **Required Packages**
- **Unity 2021.3+** (for WebSocket support)
- **Newtonsoft Json for Unity** (3.0.2+)

### **Install via Package Manager**
1. Window → Package Manager
2. Unity Registry → Search "Newtonsoft"
3. Install "Newtonsoft Json for Unity"

## 🐛 **Troubleshooting**

### **Still Getting Errors?**

1. **Clear Console** - Clear all errors
2. **Reimport Assets** - Right-click Assets → Reimport All
3. **Restart Unity** - Close and reopen Unity
4. **Check Package Manager** - Ensure Newtonsoft.Json is installed

### **Common Issues**

1. **"Newtonsoft.Json not found"**
   - Install via Package Manager
   - Check package is enabled

2. **"Namespace not found"**
   - Ensure files are in correct location
   - Check using statements

3. **"WebSocket not supported"**
   - Upgrade to Unity 2021.3+
   - Check .NET version

## ✅ **Verification**

After installation, you should see:
- ✅ No red errors in Console
- ✅ Successful compilation
- ✅ `AtlasWorldUnityClient` component available
- ✅ Inspector shows server settings

## 🚀 **Next Steps**

1. **Test Connection** - Add to scene and test
2. **Customize Settings** - Configure server URL
3. **Add Game Logic** - Handle player movement
4. **Build & Deploy** - Test on target platform

---

**Your Unity project should now compile without errors!** 🎉
