using UnityEngine;
using AtlasWorld.Client;
using AtlasWorld.Models;

namespace AtlasWorld.Client
{
    /// <summary>
    /// Simple Unity Game Manager for Atlas World
    /// Attach this to a GameObject in your scene
    /// </summary>
    public class AtlasWorldGameManager : MonoBehaviour
    {
        [Header("Server Settings")]
        public string serverUrl = "ws://localhost:2567";
        public string mapId = "map-01-sector-a";
        
        [Header("Player Settings")]
        public string playerName = "UnityPlayer";
        
        private AtlasWorldUnityClient? _client;
        private bool _isConnected = false;
        
        void Start()
        {
            Debug.Log("🎮 Atlas World Game Manager Starting...");
            
            // Get or create the client component
            _client = GetComponent<AtlasWorldUnityClient>();
            if (_client == null)
            {
                _client = gameObject.AddComponent<AtlasWorldUnityClient>();
            }
            
            // Configure client
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
            
            try
            {
                _client.SendPlayerInput(new PlayerInput 
                { 
                    vx = vx, 
                    vy = vy 
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
        
        void OnStateChange(GameState state)
        {
            Debug.Log($"🔄 Game State - Tick: {state.tick}, Players: {state.players?.Count ?? 0}, Mobs: {state.mobs?.Count ?? 0}");
            
            // Update UI or game objects based on state
            UpdateGameState(state);
        }
        
        void UpdateGameState(GameState state)
        {
            // Update player positions, mobs, etc.
            // This is where you'd update your Unity game objects
            if (state.players != null)
            {
                foreach (Player player in state.players.Values)
                {
                    Debug.Log($"Player {player.name} at ({player.x}, {player.y})");
                }
            }
            
            if (state.mobs != null)
            {
                foreach (Mob mob in state.mobs.Values)
                {
                    Debug.Log($"Mob {mob.id} at ({mob.x}, {mob.y})");
                }
            }
        }
        
        void OnDestroy()
        {
            if (_client != null)
            {
                _client.DisconnectAsync();
                _client.Dispose();
            }
        }
        
        void OnApplicationQuit()
        {
            if (_client != null)
            {
                _client.DisconnectAsync();
                _client.Dispose();
            }
        }
        
        // Public methods for UI buttons
        public void ConnectToServer()
        {
            if (_client != null)
            {
                _client.ConnectAsync();
            }
        }
        
        public void DisconnectFromServer()
        {
            if (_client != null)
            {
                _client.DisconnectAsync();
            }
        }
    }
}
