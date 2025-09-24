# 🎮 Unity Setup Guide for Atlas World

## ✅ **Fixed Issues**
- **Protocol Mismatch**: Updated Unity client to use proper Colyseus handshake protocol
- **Connection Flow**: Now uses HTTP join request + WebSocket connection
- **Message Handling**: Added support for Colyseus binary messages

## 🚀 **Quick Setup**

### 1. **Import Scripts**
Copy these files to your Unity project:
- `AtlasWorldUnityClient.cs` - Core client component
- `AtlasWorldGameManager.cs` - Simple game manager script

### 2. **Setup in Unity**
1. Create an empty GameObject in your scene
2. Add the `AtlasWorldGameManager` script to it
3. Configure the server settings in the inspector:
   - **Server URL**: `http://localhost:2567`
   - **Map ID**: `map-01-sector-a`
   - **Player Name**: `UnityPlayer`

### 3. **Start the Server**
```bash
cd colyseus-server
npm start
```

### 4. **Test in Unity**
1. Press Play in Unity
2. Check the Console for connection logs
3. Use WASD or Arrow keys to move (sends input to server)

## 🔧 **What Was Fixed**

### **Before (❌ Broken)**
- Direct WebSocket connection to `ws://localhost:2567`
- Raw JSON messages
- No Colyseus protocol handshake

### **After (✅ Working)**
- Direct WebSocket connection to `ws://localhost:2567/game_room`
- Proper Colyseus room joining protocol
- Binary and text message handling

## 📋 **Expected Logs**
```
🔌 Connecting to Atlas World server...
🔗 Connecting to Colyseus room: ws://localhost:2567/game_room
✅ WebSocket connected to: ws://localhost:2567/game_room
🚪 Sent join message for map: map-01-sector-a
✅ Connected to Atlas World server
🎉 Welcome: Welcome to map-01-sector-a!
```

## 🎯 **Controls**
- **WASD** or **Arrow Keys**: Move player
- **Console**: Check connection status and game state updates

## 🐛 **Troubleshooting**
- Make sure the Colyseus server is running on port 2567
- Check Unity Console for error messages
- Verify server URL is correct (http://localhost:2567)
