using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using Colyseus;
using AtlasWorld.Models;

namespace AtlasWorld.Client
{
    /// <summary>
    /// C# client for Atlas World multiplayer game server using official Colyseus SDK
    /// Generated from AsyncAPI specification
    /// </summary>
    public class AtlasWorldClient : IDisposable
    {
        private ColyseusClient? _client;
        private ColyseusRoom<GameState>? _room;
        private bool _disposed = false;
        
        // Events
        public event Action? OnConnected;
        public event Action? OnDisconnected;
        public event Action<string>? OnError;
        public event Action<WelcomeMessage>? OnWelcome;
        public event Action<GameState>? OnStateChange;
        
        /// <summary>
        /// Initialize the client with server URL
        /// </summary>
        /// <param name="serverUrl">WebSocket server URL (e.g., "ws://localhost:2567")</param>
        public AtlasWorldClient(string serverUrl)
        {
            _client = new ColyseusClient(serverUrl);
        }
        
        /// <summary>
        /// Connect to the server and join a game room
        /// </summary>
        /// <param name="mapId">Map identifier to join</param>
        /// <returns>Task representing the connection operation</returns>
        public async Task ConnectAsync(string mapId = "map-01-sector-a")
        {
            if (_client == null) throw new InvalidOperationException("Client not initialized");
            
            try
            {
                // Join or create room with options
                var roomOptions = new Dictionary<string, object>
                {
                    ["mapId"] = mapId,
                    ["name"] = "CSharpClient"
                };
                
                _room = await _client.JoinOrCreate<GameState>("game_room", roomOptions);
                
                // Set up room event handlers
                SetupRoomEventHandlers();
                
                OnConnected?.Invoke();
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Connection failed: {ex.Message}");
                throw;
            }
        }
        
        /// <summary>
        /// Join a specific game room
        /// </summary>
        /// <param name="mapId">Map identifier</param>
        /// <returns>Task representing the join operation</returns>
        public async Task JoinGameRoomAsync(string mapId = "map-01-sector-a")
        {
            if (_room == null) throw new InvalidOperationException("Not connected to server");
            
            // Room is already joined in ConnectAsync, this is for compatibility
            Debug.Log($"Already joined game room with map: {mapId}");
        }
        
        /// <summary>
        /// Send player input (velocity)
        /// </summary>
        /// <param name="input">Player input data</param>
        public void SendPlayerInput(PlayerInput input)
        {
            if (_room == null)
            {
                throw new InvalidOperationException("Not connected to server");
            }
            
            _room.Send("player_input", input);
        }
        
        /// <summary>
        /// Send player position update
        /// </summary>
        /// <param name="position">Player position data</param>
        public void SendPlayerPosition(PlayerPosition position)
        {
            if (_room == null)
            {
                throw new InvalidOperationException("Not connected to server");
            }
            
            _room.Send("player_position", position);
        }
        
        /// <summary>
        /// Disconnect from the server
        /// </summary>
        /// <returns>Task representing the disconnection operation</returns>
        public async Task DisconnectAsync()
        {
            if (_room != null)
            {
                await _room.Leave();
                _room = null;
            }
            
            OnDisconnected?.Invoke();
        }
        
        /// <summary>
        /// Disconnect from the server (synchronous version)
        /// </summary>
        public void Disconnect()
        {
            if (_room != null)
            {
                _room.Leave().Wait();
                _room = null;
            }
            
            OnDisconnected?.Invoke();
        }
        
        /// <summary>
        /// Set up room event handlers
        /// </summary>
        private void SetupRoomEventHandlers()
        {
            if (_room == null) return;
            
            // Set up room state change handler
            _room.OnStateChange += (state, isFirstState) => {
                OnStateChange?.Invoke(state);
            };
            
            // Set up message handlers for Colyseus events
            _room.OnMessage<WelcomeMessage>("welcome", OnWelcomeMessage);
            _room.OnMessage<StateChangeMessage>("state_change", OnStateChangeMessage);
            
            // Set up connection event handlers
            _room.OnLeave += (code) => {
                OnDisconnected?.Invoke();
            };
            
            _room.OnError += (code, message) => {
                OnError?.Invoke($"Room error {code}: {message}");
            };
        }
        
        // Message Event Handlers
        
        private void OnWelcomeMessage(WelcomeMessage message)
        {
            Debug.Log($"🎉 Welcome: {message.message}");
            OnWelcome?.Invoke(message);
        }
        
        private void OnStateChangeMessage(StateChangeMessage message)
        {
            Debug.Log($"🔄 State change message - Players: {message.players?.Length ?? 0}, Mobs: {message.mobs?.Length ?? 0}");
            // Note: State changes are now handled by OnStateChange event above
        }
        
        /// <summary>
        /// Dispose of resources
        /// </summary>
        public void Dispose()
        {
            if (!_disposed)
            {
                Disconnect();
                _client = null;
                _disposed = true;
            }
        }
    }
}