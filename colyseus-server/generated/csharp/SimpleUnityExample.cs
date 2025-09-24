using UnityEngine;
using AtlasWorld.Models;
using AtlasWorld.Client;

/// <summary>
/// Simple Unity example - NO EXTERNAL DEPENDENCIES
/// Uses only Unity's built-in JsonUtility
/// </summary>
public class SimpleUnityExample : MonoBehaviour
{
    public string serverUrl = "ws://localhost:2567";
    public string mapId = "map-01-sector-a";
    public string playerName = "UnityPlayer";
    
    private AtlasWorldUnityClient? _client;
    private bool _isConnected = false;
    
    void Start()
    {
        Debug.Log("🎮 Atlas World Unity Client Starting...");
        
        // Create client GameObject
        var clientObj = new GameObject("AtlasWorldClient");
        _client = clientObj.AddComponent<AtlasWorldUnityClient>();
        
        // Configure settings
        _client.serverUrl = serverUrl;
        _client.mapId = mapId;
        
        // Set up event handlers
        _client.OnConnected += OnConnected;
        _client.OnDisconnected += OnDisconnected;
        _client.OnError += OnError;
        _client.OnWelcome += OnWelcome;
        _client.OnStateChange += OnStateChange;
        
        // Connect to server
        _client.ConnectAsync();
    }
    
    void Update()
    {
        if (!_isConnected || _client == null) return;
        
        // Handle input
        HandleInput();
    }
    
    void HandleInput()
    {
        float vx = 0f;
        float vy = 0f;
        
        // WASD movement
        if (Input.GetKey(KeyCode.W)) vy = 1f;
        if (Input.GetKey(KeyCode.S)) vy = -1f;
        if (Input.GetKey(KeyCode.A)) vx = -1f;
        if (Input.GetKey(KeyCode.D)) vx = 1f;
        
        // Arrow keys
        if (Input.GetKey(KeyCode.UpArrow)) vy = 1f;
        if (Input.GetKey(KeyCode.DownArrow)) vy = -1f;
        if (Input.GetKey(KeyCode.LeftArrow)) vx = -1f;
        if (Input.GetKey(KeyCode.RightArrow)) vx = 1f;
        
        // Send input if there's movement
        if (vx != 0f || vy != 0f)
        {
            SendPlayerInput(vx, vy);
        }
    }
    
    void SendPlayerInput(float vx, float vy)
    {
        if (_client == null) return;
        
        var input = new PlayerInput
        {
            vx = vx,
            vy = vy
        };
        
        _client.SendPlayerInputAsync(input);
    }
    
    // Event Handlers
    void OnConnected()
    {
        Debug.Log("✅ Connected to Atlas World server!");
        _isConnected = true;
    }
    
    void OnDisconnected()
    {
        Debug.Log("❌ Disconnected from server");
        _isConnected = false;
    }
    
    void OnError(string error)
    {
        Debug.LogError($"❌ Server error: {error}");
    }
    
    void OnWelcome(WelcomeMessage welcome)
    {
        Debug.Log($"🎉 Welcome: {welcome.message}");
        Debug.Log($"🆔 Player ID: {welcome.playerId}");
        Debug.Log($"🗺️ Map: {welcome.mapId}");
    }
    
    void OnStateChange(StateChangeMessage state)
    {
        Debug.Log($"🔄 Game State - Tick: {state.tick}, Players: {state.players.Length}, Mobs: {state.mobs.Length}");
        
        // Update game objects based on state
        UpdateGameState(state);
    }
    
    void UpdateGameState(StateChangeMessage state)
    {
        // Update player positions
        foreach (var player in state.players)
        {
            Debug.Log($"Player {player.name} at ({player.x}, {player.y})");
        }
        
        // Update mobs
        foreach (var mob in state.mobs)
        {
            Debug.Log($"Mob {mob.id} at ({mob.x}, {mob.y})");
        }
    }
    
    void OnDestroy()
    {
        if (_client != null)
        {
            _client.Dispose();
        }
    }
    
    void OnApplicationQuit()
    {
        if (_client != null)
        {
            _client.DisconnectAsync().Wait();
            _client.Dispose();
        }
    }
}
