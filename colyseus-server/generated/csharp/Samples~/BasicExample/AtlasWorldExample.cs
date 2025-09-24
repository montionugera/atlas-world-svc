using UnityEngine;
using AtlasWorld.Models;
using System.Threading.Tasks;
using AtlasWorld.Client;

namespace AtlasWorld.Examples
{
    /// <summary>
    /// Unity example showing how to use AtlasWorldClient
    /// </summary>
    public class AtlasWorldExample : MonoBehaviour
    {
    public string serverUrl = "ws://localhost:2567";
    public string mapId = "map-01-sector-a";
    public string playerName = "UnityPlayer";
        
        private AtlasWorldClient? _client;
        private bool _isConnected = false;
        
        void Start()
        {
            Debug.Log("🎮 Atlas World Unity Client Starting...");
            ConnectToServer();
        }
        
        async void ConnectToServer()
        {
            try
            {
                _client = new AtlasWorldClient(serverUrl);
                
                // Set up event handlers
                _client.OnConnected += OnConnected;
                _client.OnDisconnected += OnDisconnected;
                _client.OnError += OnError;
                _client.OnWelcome += OnWelcome;
                _client.OnStateChange += OnStateChange;
                
                // Connect to server
                await _client.ConnectAsync();
                Debug.Log("🔌 Connecting to server...");
                
                // Wait a moment for connection
                await Task.Delay(1000);
                
                // Join game room
                await _client.JoinGameRoomAsync(mapId);
                Debug.Log("🚪 Joining game room...");
                
                _isConnected = true;
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"❌ Connection failed: {ex.Message}");
            }
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
        
        async void SendPlayerInput(float vx, float vy)
        {
            if (_client == null) return;
            
            try
            {
                await _client.SendPlayerInputAsync(new PlayerInput 
                { 
                    Vx = vx, 
                    Vy = vy 
                });
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"❌ Failed to send input: {ex.Message}");
            }
        }
        
        // Event Handlers
        void OnConnected()
        {
            Debug.Log("✅ Connected to Atlas World server!");
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
            Debug.Log($"🎉 Welcome: {welcome.Message}");
            Debug.Log($"🆔 Player ID: {welcome.PlayerId}");
            Debug.Log($"🗺️ Map: {welcome.MapId}");
        }
        
        void OnStateChange(StateChangeMessage state)
        {
            Debug.Log($"🔄 Game State - Tick: {state.Tick}, Players: {state.Players.Count}, Mobs: {state.Mobs.Count}");
            
            // Update UI or game objects based on state
            UpdateGameState(state);
        }
        
        void UpdateGameState(StateChangeMessage state)
        {
            // Update player positions, mobs, etc.
            // This is where you'd update your Unity game objects
            foreach (var player in state.Players.Values)
            {
                Debug.Log($"Player {player.Name} at ({player.X}, {player.Y})");
            }
            
            foreach (var mob in state.Mobs)
            {
                Debug.Log($"Mob {mob.Id} at ({mob.X}, {mob.Y})");
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
}
