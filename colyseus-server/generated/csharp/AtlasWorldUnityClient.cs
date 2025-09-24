using System;
using System.Collections.Generic;
using UnityEngine;
using Colyseus;
using AtlasWorld.Models;

namespace AtlasWorld.Client
{
    /// <summary>
    /// Unity client for Atlas World multiplayer game server using official Colyseus SDK
    /// </summary>
    public class AtlasWorldUnityClient : MonoBehaviour
    {
        [Header("Server Settings")]
        public string serverUrl = "ws://localhost:2567";
        public string mapId = "map-01-sector-a";
        
        [Header("Connection Settings")]
        public float reconnectDelay = 5f;
        public int maxReconnectAttempts = 5;
        
        // Events (Unity-friendly)
        public event Action? OnConnected;
        public event Action? OnDisconnected;
        public event Action<string>? OnError;
        public event Action<WelcomeMessage>? OnWelcome;
        public event Action<GameState>? OnStateChange;
        
        // Private fields
        private ColyseusClient? _client;
        private ColyseusRoom<GameState>? _room;
        private bool _isConnected = false;
        private bool _isConnecting = false;
        private int _reconnectAttempts = 0;
        
        // Unity lifecycle
        void Start()
        {
            ConnectAsync();
        }
        
        void OnDestroy()
        {
            DisconnectAsync();
        }
        
        void OnApplicationPause(bool pauseStatus)
        {
            if (pauseStatus)
            {
                DisconnectAsync();
            }
            else if (!_isConnected && !_isConnecting)
            {
                ConnectAsync();
            }
        }
        
        /// <summary>
        /// Connect to the game server using official Colyseus SDK
        /// </summary>
        public async void ConnectAsync()
        {
            if (_isConnected || _isConnecting) return;
            
            _isConnecting = true;
            
            try
            {
                Debug.Log("🔌 Connecting to Atlas World server...");
                
                // Disconnect any existing connection first
                DisconnectAsync();
                
                // Initialize Colyseus client
                _client = new ColyseusClient(serverUrl);
                
                // Join or create room with options
                var roomOptions = new Dictionary<string, object>
                {
                    ["mapId"] = mapId,
                    ["name"] = "UnityPlayer"
                };
                
                _room = await _client.JoinOrCreate<GameState>("game_room", roomOptions);
                
                // Set up room event handlers
                SetupRoomEventHandlers();
                
                _isConnected = true;
                _isConnecting = false;
                _reconnectAttempts = 0;
                OnConnected?.Invoke();
                Debug.Log("✅ Connected to Atlas World server");
            }
            catch (Exception ex)
            {
                _isConnecting = false;
                Debug.LogError($"❌ Connection failed: {ex.Message}");
                OnError?.Invoke($"Connection failed: {ex.Message}");
                
                // Attempt reconnection
                if (_reconnectAttempts < maxReconnectAttempts)
                {
                    _reconnectAttempts++;
                    Debug.Log($"🔄 Attempting reconnection {_reconnectAttempts}/{maxReconnectAttempts} in {reconnectDelay}s");
                    Invoke(nameof(ConnectAsync), reconnectDelay);
                }
            }
        }

        /// <summary>
        /// Set up room event handlers
        /// </summary>
        private void SetupRoomEventHandlers()
        {
            if (_room == null) return;
            
            // Set up room state change handler
            _room.OnStateChange += (state, isFirstState) => {
                Debug.Log($"🔄 State Update - Players: {state.players?.Count ?? 0}, Mobs: {state.mobs?.Count ?? 0}");
                OnStateChange?.Invoke(state);
            };
            
            // Set up message handlers for Colyseus events
            _room.OnMessage<WelcomeMessage>("welcome", OnWelcomeMessage);
            
            // Set up connection event handlers
            _room.OnLeave += (code) => {
                Debug.Log($"👋 Left room with code: {code}");
                OnDisconnected?.Invoke();
            };
            
            _room.OnError += (code, message) => {
                Debug.LogError($"❌ Room error {code}: {message}");
                OnError?.Invoke($"Room error {code}: {message}");
            };
        }

        /// <summary>
        /// Send player input (velocity)
        /// </summary>
        public void SendPlayerInput(PlayerInput input)
        {
            if (_room == null)
            {
                Debug.LogWarning("Room is not connected");
                return;
            }

            _room.Send("player_input", input);
        }

        /// <summary>
        /// Send player position update
        /// </summary>
        public void SendPlayerPosition(PlayerPosition position)
        {
            if (_room == null)
            {
                Debug.LogWarning("Room is not connected");
                return;
            }

            _room.Send("player_position", position);
        }

        /// <summary>
        /// Disconnect from the server
        /// </summary>
        public async void DisconnectAsync()
        {
            _isConnected = false;
            _isConnecting = false;
            
            if (_room != null)
            {
                await _room.Leave();
                _room = null;
            }
            
            if (_client != null)
            {
                _client = null;
            }
            
            OnDisconnected?.Invoke();
            Debug.Log("👋 Disconnected from server");
        }

        // Message Event Handlers

        private void OnWelcomeMessage(WelcomeMessage message)
        {
            Debug.Log($"🎉 Welcome: {message.message}");
            OnWelcome?.Invoke(message);
        }


        public void Dispose()
        {
            DisconnectAsync();
        }
    }
}